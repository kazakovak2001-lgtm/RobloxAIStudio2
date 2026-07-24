/**
 * AuthService — Authentication with JWT-like tokens and session management.
 * Uses bcrypt (cost factor 12) for password hashing with automatic salt.
 */

import { randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import {
  InMemoryStorageProvider,
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
const ROLES_COLLECTION = "auth_roles";

interface StoredCredentials extends AuthCredentials {
  userId: string;
}

export class AuthService {
  constructor(
    private readonly storage: StorageProvider = new InMemoryStorageProvider(),
  ) {}

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
    const session = this.createSession(userId, role);
    return {
      success: true,
      token: session.token,
      refreshToken: session.refreshToken,
      userId,
      role,
    };
  }

  logout(token: string): boolean {
    return this.storage.delete(SESSIONS_COLLECTION, token);
  }

  validateToken(token: string): AuthSession | null {
    const session = this.storage.get<AuthSession>(SESSIONS_COLLECTION, token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.storage.delete(SESSIONS_COLLECTION, token);
      return null;
    }
    const updated = { ...session, lastActivity: Date.now() };
    this.storage.set(SESSIONS_COLLECTION, token, updated);
    return updated;
  }

  refreshSession(refreshToken: string): LoginResult {
    for (const session of this.storage.list<AuthSession>(SESSIONS_COLLECTION)) {
      if (
        session.refreshToken === refreshToken &&
        Date.now() < session.expiresAt + REFRESH_EXPIRY_MS
      ) {
        const newSession = this.createSession(session.userId, session.role);
        this.storage.delete(SESSIONS_COLLECTION, session.token);
        return {
          success: true,
          token: newSession.token,
          refreshToken: newSession.refreshToken,
          userId: session.userId,
          role: session.role,
        };
      }
    }
    return { success: false, error: "Invalid refresh token" };
  }

  hasPermission(userId: string, permission: Permission): boolean {
    const role =
      this.storage.get<UserRole>(ROLES_COLLECTION, userId) ?? "guest";
    return ROLE_PERMISSIONS[role].includes(permission);
  }

  setRole(userId: string, role: UserRole): void {
    this.storage.set<UserRole>(ROLES_COLLECTION, userId, role);
  }

  private createSession(userId: string, role: UserRole): AuthSession {
    const session: AuthSession = {
      sessionId: randomUUID().slice(0, 12),
      userId,
      role,
      token: `tok_${randomUUID().replace(/-/g, "")}`,
      refreshToken: `ref_${randomUUID().replace(/-/g, "")}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
      lastActivity: Date.now(),
    };
    this.storage.set<AuthSession>(SESSIONS_COLLECTION, session.token, session);
    return session;
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
}
