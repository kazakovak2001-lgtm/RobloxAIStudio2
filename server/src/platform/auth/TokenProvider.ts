/**
 * TokenProvider — Generates and validates access tokens.
 * Abstraction layer for future JWT/OAuth integration.
 */

import { randomUUID, createHash } from "crypto";

export interface TokenPayload {
  userId: string;
  sessionId: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
}

export class TokenProvider {
  private tokens: Map<string, TokenPayload> = new Map();
  private tokenTTL: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.tokenTTL = ttlMs;
  }

  issue(userId: string, sessionId: string, role: string): string {
    const token = `tok_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32)}`;
    const payload: TokenPayload = {
      userId,
      sessionId,
      role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.tokenTTL,
    };
    this.tokens.set(token, payload);
    return token;
  }

  validate(token: string): TokenPayload | null {
    const payload = this.tokens.get(token);
    if (!payload) return null;
    if (Date.now() > payload.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return payload;
  }

  revoke(token: string): boolean {
    return this.tokens.delete(token);
  }

  revokeAllForUser(userId: string): number {
    let count = 0;
    for (const [token, payload] of this.tokens) {
      if (payload.userId === userId) {
        this.tokens.delete(token);
        count++;
      }
    }
    return count;
  }
}
