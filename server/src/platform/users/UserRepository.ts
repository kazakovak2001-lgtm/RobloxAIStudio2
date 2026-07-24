/**
 * UserRepository — In-memory user storage with tier management.
 */

import type { User, AccountTier } from "./UserTypes";
import { TIER_LIMITS, createUserId } from "./UserTypes";

export interface CreateUserInput {
  email: string;
  displayName: string;
  tier?: AccountTier;
}

export class UserRepository {
  private users: Map<string, User> = new Map();
  private byEmail: Map<string, string> = new Map();

  create(input: CreateUserInput): User {
    const tier = input.tier ?? "free";
    const user: User = {
      id: createUserId(),
      email: input.email,
      displayName: input.displayName,
      tier,
      status: "active",
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      usage: {
        generationsToday: 0,
        generationsTotal: 0,
        tokensUsedToday: 0,
        tokensUsedTotal: 0,
        projectCount: 0,
        storageUsedBytes: 0,
      },
      limits: TIER_LIMITS[tier],
    };
    this.users.set(user.id, user);
    this.byEmail.set(user.email, user.id);
    return user;
  }

  getById(id: string): User | null {
    return this.users.get(id) ?? null;
  }

  getByEmail(email: string): User | null {
    const id = this.byEmail.get(email);
    return id ? (this.users.get(id) ?? null) : null;
  }

  updateProfile(
    userId: string,
    updates: { email?: string; displayName?: string },
  ): User | null {
    const user = this.users.get(userId);
    if (!user) return null;

    if (updates.email && updates.email !== user.email) {
      if (this.byEmail.has(updates.email)) return null;
      this.byEmail.delete(user.email);
      user.email = updates.email;
      this.byEmail.set(user.email, userId);
    }
    if (updates.displayName?.trim()) {
      user.displayName = updates.displayName.trim();
    }
    return user;
  }

  updateTier(userId: string, tier: AccountTier): User | null {
    const user = this.users.get(userId);
    if (!user) return null;
    user.tier = tier;
    user.limits = TIER_LIMITS[tier];
    return user;
  }

  recordGeneration(userId: string, tokens: number): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    user.usage.generationsToday++;
    user.usage.generationsTotal++;
    user.usage.tokensUsedToday += tokens;
    user.usage.tokensUsedTotal += tokens;
    user.lastLoginAt = Date.now();
    return true;
  }

  checkLimits(userId: string): { allowed: boolean; reason?: string } {
    const user = this.users.get(userId);
    if (!user) return { allowed: false, reason: "User not found" };
    if (user.status !== "active")
      return { allowed: false, reason: "Account not active" };
    const limits = user.limits;
    if (
      limits.maxGenerationsPerDay > 0 &&
      user.usage.generationsToday >= limits.maxGenerationsPerDay
    ) {
      return { allowed: false, reason: "Daily generation limit reached" };
    }
    if (
      limits.maxTokensPerDay > 0 &&
      user.usage.tokensUsedToday >= limits.maxTokensPerDay
    ) {
      return { allowed: false, reason: "Daily token limit reached" };
    }
    return { allowed: true };
  }

  getAll(): User[] {
    return [...this.users.values()];
  }

  count(): number {
    return this.users.size;
  }
}
