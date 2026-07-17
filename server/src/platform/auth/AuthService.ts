/**
 * AuthService — Authentication with JWT-like tokens and session management.
 * Uses bcrypt (cost factor 12) for password hashing with automatic salt.
 */

import { randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
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

export class AuthService {
  private credentials: Map<string, AuthCredentials> = new Map(); // email → creds
  private sessions: Map<string, AuthSession> = new Map(); // token → session
  private userRoles: Map<string, UserRole> = new Map(); // userId → role

  register(
    email: string,
    password: string,
    userId: string,
    role: UserRole = "creator",
  ): boolean {
    if (this.credentials.has(email)) return false;
    const passwordHash = bcrypt.hashSync(password, BCRYPT_COST_FACTOR);
    this.credentials.set(email, { email, passwordHash });
    this.userRoles.set(userId, role);
    return true;
  }

  login(email: string, password: string, userId: string): LoginResult {
    const creds = this.credentials.get(email);
    if (!creds) {
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
        creds.passwordHash = bcrypt.hashSync(password, BCRYPT_COST_FACTOR);
      }
    } else {
      // Compare using bcrypt for modern hashes
      passwordValid = bcrypt.compareSync(password, creds.passwordHash);
    }

    if (!passwordValid) {
      return { success: false, error: "Invalid credentials" };
    }

    const role = this.userRoles.get(userId) ?? "creator";
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
    return this.sessions.delete(token);
  }

  validateToken(token: string): AuthSession | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    session.lastActivity = Date.now();
    return session;
  }

  refreshSession(refreshToken: string): LoginResult {
    for (const session of this.sessions.values()) {
      if (
        session.refreshToken === refreshToken &&
        Date.now() < session.expiresAt + REFRESH_EXPIRY_MS
      ) {
        const newSession = this.createSession(session.userId, session.role);
        this.sessions.delete(session.token);
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
    const role = this.userRoles.get(userId) ?? "guest";
    return ROLE_PERMISSIONS[role].includes(permission);
  }

  setRole(userId: string, role: UserRole): void {
    this.userRoles.set(userId, role);
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
    this.sessions.set(session.token, session);
    return session;
  }

  /**
   * Determines if a stored hash is a legacy SHA-256 hash (64 hex characters)
   * vs a bcrypt hash (starts with $2a$ or $2b$).
   */
  private isLegacyHash(hash: string): boolean {
    return /^[a-f0-9]{64}$/.test(hash);
  }
}
