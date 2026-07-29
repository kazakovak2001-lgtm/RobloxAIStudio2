/**
 * AuthService — Authentication with storage-backed opaque sessions.
 * Uses bcrypt (cost factor 12) for password hashing with automatic salt and
 * stores only SHA-256 digests of high-entropy refresh credentials.
 */

import { randomBytes, randomUUID, createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import {
  DurableStorageConflictError,
  InMemoryStorageProvider,
  type DurableMutation,
  type StorageProvider,
} from "../storage/StorageProvider";
import type {
  AuthSession,
  AuthCredentials,
  LoginResult,
  UserRole,
  Permission,
} from "./AuthTypes";
import { ROLE_PERMISSIONS } from "./AuthTypes";

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const BCRYPT_COST_FACTOR = 12;
const CREDENTIALS_COLLECTION = "auth_credentials";
const SESSIONS_COLLECTION = "auth_sessions";
const REFRESH_CREDENTIALS_COLLECTION = "auth_refresh_credentials";
const ROLES_COLLECTION = "auth_roles";

interface StoredCredentials extends AuthCredentials {
  userId: string;
}

interface StoredAuthSession extends AuthSession {
  refreshTokenDigest?: string;
  /** Pre-HARDEN-2A compatibility field, removed during startup migration. */
  refreshToken?: string;
}

interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
}

interface PreparedSession {
  issued: IssuedSession;
  storedSession: StoredAuthSession;
  refreshTokenDigest: string;
  refreshCredential: RefreshCredentialRecord;
  mutations: DurableMutation[];
}

interface RefreshCredentialRecord {
  sessionToken: string;
  expiresAt: number;
}

export class AuthService {
  constructor(
    private readonly storage: StorageProvider = new InMemoryStorageProvider(),
  ) {
    // In-memory and already-hydrated providers migrate immediately. PostgreSQL
    // is migrated a second time after its cache is hydrated during bootstrap.
    this.migrateLegacyRefreshCredentials();
  }

  register(
    email: string,
    password: string,
    userId: string,
    role: UserRole = "creator",
  ): boolean {
    const normalizedEmail = this.normalizeEmail(email);
    if (
      this.storage.get<StoredCredentials>(
        CREDENTIALS_COLLECTION,
        normalizedEmail,
      )
    ) {
      return false;
    }
    const passwordHash = bcrypt.hashSync(password, BCRYPT_COST_FACTOR);
    this.storage.set<StoredCredentials>(
      CREDENTIALS_COLLECTION,
      normalizedEmail,
      {
        email: normalizedEmail,
        passwordHash,
        userId,
      },
    );
    this.storage.set<UserRole>(ROLES_COLLECTION, userId, role);
    return true;
  }

  login(email: string, password: string, userId: string): LoginResult {
    const normalizedEmail = this.normalizeEmail(email);
    const creds = this.storage.get<StoredCredentials>(
      CREDENTIALS_COLLECTION,
      normalizedEmail,
    );
    if (!creds) {
      return { success: false, error: "Invalid credentials" };
    }
    if (creds.userId !== userId) {
      return { success: false, error: "Invalid credentials" };
    }

    // Migration path: if stored hash is legacy SHA-256 (64 hex chars, no bcrypt prefix)
    const isLegacySha256 = this.isLegacyHash(creds.passwordHash);

    let passwordValid = false;
    if (isLegacySha256) {
      // Compare using SHA-256 for legacy hashes
      const sha256Hash = createHash("sha256").update(password).digest("hex");
      passwordValid = sha256Hash === creds.passwordHash;
      if (passwordValid) {
        // Transparent upgrade: re-hash with bcrypt
        this.storage.set<StoredCredentials>(
          CREDENTIALS_COLLECTION,
          normalizedEmail,
          {
            ...creds,
            passwordHash: bcrypt.hashSync(password, BCRYPT_COST_FACTOR),
          },
        );
      }
    } else {
      // Compare using bcrypt for modern hashes
      passwordValid = bcrypt.compareSync(password, creds.passwordHash);
    }

    if (!passwordValid) {
      return { success: false, error: "Invalid credentials" };
    }

    const role =
      this.storage.get<UserRole>(ROLES_COLLECTION, userId) ?? "creator";
    const issued = this.createSession(userId, role);
    return this.toLoginResult(issued, userId, role);
  }

  async loginDurable(
    email: string,
    password: string,
    userId: string,
  ): Promise<LoginResult> {
    const normalizedEmail = this.normalizeEmail(email);
    const creds = this.storage.get<StoredCredentials>(
      CREDENTIALS_COLLECTION,
      normalizedEmail,
    );
    if (!creds || creds.userId !== userId) {
      return { success: false, error: "Invalid credentials" };
    }

    const mutations: DurableMutation[] = [];
    let passwordValid = false;
    if (this.isLegacyHash(creds.passwordHash)) {
      const sha256Hash = createHash("sha256").update(password).digest("hex");
      passwordValid = sha256Hash === creds.passwordHash;
      if (passwordValid) {
        mutations.push({
          type: "set",
          collection: CREDENTIALS_COLLECTION,
          id: normalizedEmail,
          data: {
            ...creds,
            passwordHash: bcrypt.hashSync(password, BCRYPT_COST_FACTOR),
          } satisfies StoredCredentials,
        });
      }
    } else {
      passwordValid = bcrypt.compareSync(password, creds.passwordHash);
    }

    if (!passwordValid) {
      return { success: false, error: "Invalid credentials" };
    }

    const role =
      this.storage.get<UserRole>(ROLES_COLLECTION, userId) ?? "creator";
    const prepared = this.prepareSession(userId, role);
    mutations.push(...prepared.mutations);
    await this.storage.mutateDurably(mutations);
    return this.toLoginResult(prepared.issued, userId, role);
  }

  logout(token: string): boolean {
    const session = this.storage.get<StoredAuthSession>(
      SESSIONS_COLLECTION,
      token,
    );
    if (!session) return false;
    return this.deleteSession(session);
  }

  async logoutDurable(token: string): Promise<boolean> {
    const session = this.storage.get<StoredAuthSession>(
      SESSIONS_COLLECTION,
      token,
    );
    if (!session) return false;

    const mutations: DurableMutation[] = [];
    if (this.isRefreshDigest(session.refreshTokenDigest)) {
      mutations.push({
        type: "delete",
        collection: REFRESH_CREDENTIALS_COLLECTION,
        id: session.refreshTokenDigest,
      });
    }
    mutations.push({
      type: "delete",
      collection: SESSIONS_COLLECTION,
      id: session.token,
    });
    await this.storage.mutateDurably(mutations);
    return true;
  }

  validateToken(token: string): AuthSession | null {
    const session = this.storage.get<StoredAuthSession>(
      SESSIONS_COLLECTION,
      token,
    );
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.deleteSession(session);
      return null;
    }
    const updated = { ...session, lastActivity: Date.now() };
    this.storage.set(SESSIONS_COLLECTION, token, updated);
    return this.toPublicSession(updated);
  }

  refreshSession(refreshToken: string): LoginResult {
    const now = Date.now();
    const refreshTokenDigest = this.digestRefreshToken(refreshToken);
    const credential = this.storage.get<RefreshCredentialRecord>(
      REFRESH_CREDENTIALS_COLLECTION,
      refreshTokenDigest,
    );
    if (!credential) {
      return { success: false, error: "Invalid refresh token" };
    }

    const session = this.storage.get<StoredAuthSession>(
      SESSIONS_COLLECTION,
      credential.sessionToken,
    );
    if (
      !session ||
      !this.matchesRefreshCredential(
        session.refreshTokenDigest,
        refreshToken,
      ) ||
      now >= credential.expiresAt
    ) {
      this.storage.delete(REFRESH_CREDENTIALS_COLLECTION, refreshTokenDigest);
      if (session && now >= credential.expiresAt) {
        this.deleteSession(session);
      }
      return { success: false, error: "Invalid refresh token" };
    }

    // Compatibility path retained for non-request callers. Production HTTP
    // refresh uses refreshSessionDurable so consume-and-rotate is transactional.
    if (
      !this.storage.delete(
        REFRESH_CREDENTIALS_COLLECTION,
        refreshTokenDigest,
      ) ||
      !this.storage.delete(SESSIONS_COLLECTION, session.token)
    ) {
      return { success: false, error: "Invalid refresh token" };
    }
    const issued = this.createSession(session.userId, session.role);
    return this.toLoginResult(issued, session.userId, session.role);
  }

  async refreshSessionDurable(refreshToken: string): Promise<LoginResult> {
    const now = Date.now();
    const refreshTokenDigest = this.digestRefreshToken(refreshToken);
    const credential = this.storage.get<RefreshCredentialRecord>(
      REFRESH_CREDENTIALS_COLLECTION,
      refreshTokenDigest,
    );
    if (!credential) {
      return { success: false, error: "Invalid refresh token" };
    }

    const session = this.storage.get<StoredAuthSession>(
      SESSIONS_COLLECTION,
      credential.sessionToken,
    );
    if (
      !session ||
      !this.matchesRefreshCredential(
        session.refreshTokenDigest,
        refreshToken,
      ) ||
      now >= credential.expiresAt
    ) {
      return { success: false, error: "Invalid refresh token" };
    }

    const prepared = this.prepareSession(session.userId, session.role);
    try {
      await this.storage.mutateDurably([
        {
          type: "delete",
          collection: REFRESH_CREDENTIALS_COLLECTION,
          id: refreshTokenDigest,
          requireExisting: true,
        },
        {
          type: "delete",
          collection: SESSIONS_COLLECTION,
          id: session.token,
          requireExisting: true,
        },
        ...prepared.mutations,
      ]);
    } catch (error) {
      if (error instanceof DurableStorageConflictError) {
        return { success: false, error: "Invalid refresh token" };
      }
      throw error;
    }

    return this.toLoginResult(prepared.issued, session.userId, session.role);
  }

  /**
   * Rewrites pre-HARDEN-2A plaintext refresh credentials as digests. Call this
   * after a durable provider hydrates its cache and before accepting traffic.
   */
  migrateLegacyRefreshCredentials(): number {
    let migrated = 0;
    for (const session of this.storage.list<StoredAuthSession>(
      SESSIONS_COLLECTION,
    )) {
      const plaintext =
        typeof session.refreshToken === "string"
          ? session.refreshToken
          : undefined;
      const digest = this.isRefreshDigest(session.refreshTokenDigest)
        ? session.refreshTokenDigest
        : plaintext === undefined
          ? undefined
          : this.digestRefreshToken(plaintext);
      const existingIndex = digest
        ? this.storage.get<RefreshCredentialRecord>(
            REFRESH_CREDENTIALS_COLLECTION,
            digest,
          )
        : null;
      const refreshExpiresAt =
        existingIndex?.expiresAt ??
        (digest ? session.expiresAt + REFRESH_EXPIRY_MS : undefined);

      const sessionChanged =
        plaintext !== undefined || digest !== session.refreshTokenDigest;
      const migratedSession: StoredAuthSession = {
        ...this.toPublicSession(session),
        ...(digest ? { refreshTokenDigest: digest } : {}),
      };
      if (sessionChanged) {
        this.storage.set(
          SESSIONS_COLLECTION,
          migratedSession.token,
          migratedSession,
        );
      }

      let indexChanged = false;
      if (digest && refreshExpiresAt) {
        if (
          existingIndex?.sessionToken !== migratedSession.token ||
          existingIndex.expiresAt !== refreshExpiresAt
        ) {
          this.storage.set<RefreshCredentialRecord>(
            REFRESH_CREDENTIALS_COLLECTION,
            digest,
            {
              sessionToken: migratedSession.token,
              expiresAt: refreshExpiresAt,
            },
          );
          indexChanged = true;
        }
      }
      if (sessionChanged || indexChanged) migrated += 1;
    }
    return migrated;
  }

  hasPermission(userId: string, permission: Permission): boolean {
    const role =
      this.storage.get<UserRole>(ROLES_COLLECTION, userId) ?? "guest";
    return ROLE_PERMISSIONS[role].includes(permission);
  }

  setRole(userId: string, role: UserRole): void {
    this.storage.set<UserRole>(ROLES_COLLECTION, userId, role);
  }

  private createSession(userId: string, role: UserRole): IssuedSession {
    const prepared = this.prepareSession(userId, role);
    this.storage.set<StoredAuthSession>(
      SESSIONS_COLLECTION,
      prepared.storedSession.token,
      prepared.storedSession,
    );
    this.storage.set<RefreshCredentialRecord>(
      REFRESH_CREDENTIALS_COLLECTION,
      prepared.refreshTokenDigest,
      prepared.refreshCredential,
    );
    return prepared.issued;
  }

  private prepareSession(userId: string, role: UserRole): PreparedSession {
    const now = Date.now();
    const refreshToken = `ref_${randomBytes(32).toString("hex")}`;
    const refreshTokenDigest = this.digestRefreshToken(refreshToken);
    const refreshCredential: RefreshCredentialRecord = {
      sessionToken: "",
      expiresAt: now + REFRESH_EXPIRY_MS,
    };
    const storedSession: StoredAuthSession = {
      sessionId: randomUUID().slice(0, 12),
      userId,
      role,
      token: `tok_${randomUUID().replace(/-/g, "")}`,
      refreshTokenDigest,
      createdAt: now,
      expiresAt: now + TOKEN_EXPIRY_MS,
      lastActivity: now,
    };
    refreshCredential.sessionToken = storedSession.token;
    const issued: IssuedSession = {
      session: this.toPublicSession(storedSession),
      refreshToken,
    };
    return {
      issued,
      storedSession,
      refreshTokenDigest,
      refreshCredential,
      mutations: [
        {
          type: "set",
          collection: SESSIONS_COLLECTION,
          id: storedSession.token,
          data: storedSession,
        },
        {
          type: "set",
          collection: REFRESH_CREDENTIALS_COLLECTION,
          id: refreshTokenDigest,
          data: refreshCredential,
        },
      ],
    };
  }

  private toLoginResult(
    issued: IssuedSession,
    userId: string,
    role: UserRole,
  ): LoginResult {
    return {
      success: true,
      token: issued.session.token,
      refreshToken: issued.refreshToken,
      userId,
      role,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Determines if a stored hash is a legacy SHA-256 hash (64 hex characters)
   * vs a bcrypt hash (starts with $2a$ or $2b$).
   */
  private isLegacyHash(hash: string): boolean {
    return /^[a-f0-9]{64}$/.test(hash);
  }

  private digestRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  private isRefreshDigest(value: string | undefined): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  private matchesRefreshCredential(
    storedDigest: string | undefined,
    refreshToken: string,
  ): boolean {
    if (!this.isRefreshDigest(storedDigest)) return false;
    const expected = Buffer.from(storedDigest, "hex");
    const candidate = Buffer.from(this.digestRefreshToken(refreshToken), "hex");
    return (
      expected.length === candidate.length &&
      timingSafeEqual(expected, candidate)
    );
  }

  private toPublicSession(session: StoredAuthSession): AuthSession {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      token: session.token,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
    };
  }

  private deleteSession(session: StoredAuthSession): boolean {
    if (this.isRefreshDigest(session.refreshTokenDigest)) {
      this.storage.delete(
        REFRESH_CREDENTIALS_COLLECTION,
        session.refreshTokenDigest,
      );
    }
    return this.storage.delete(SESSIONS_COLLECTION, session.token);
  }
}
