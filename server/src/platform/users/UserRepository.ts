/**
 * UserRepository — Storage-backed user management with tier limits.
 */

import type { User, AccountTier } from "./UserTypes";
import { TIER_LIMITS, createUserId } from "./UserTypes";
import {
  InMemoryStorageProvider,
  type DurableMutation,
  type StorageProvider,
} from "../storage/StorageProvider";

export interface CreateUserInput {
  email: string;
  displayName: string;
  tier?: AccountTier;
}

export interface PreparedUserCreate {
  user: User;
  mutation: DurableMutation;
}

export class UserRepository {
  private readonly collection = "users";

  constructor(
    private readonly storage: StorageProvider = new InMemoryStorageProvider(),
  ) {}

  create(input: CreateUserInput): User {
    const user = this.buildUser(input);
    this.storage.set(this.collection, user.id, user);
    return user;
  }

  async createDurable(input: CreateUserInput): Promise<User> {
    const prepared = this.prepareCreate(input);
    await this.storage.mutateDurably([prepared.mutation]);
    return prepared.user;
  }

  prepareCreate(input: CreateUserInput): PreparedUserCreate {
    const user = this.buildUser(input);
    return {
      user,
      mutation: {
        type: "set",
        collection: this.collection,
        id: user.id,
        data: user,
        requireAbsent: true,
      },
    };
  }

  getById(id: string): User | null {
    return this.storage.get<User>(this.collection, id);
  }

  getByEmail(email: string): User | null {
    const normalizedEmail = this.normalizeEmail(email);
    return (
      this.storage
        .list<User>(this.collection)
        .find((user) => this.normalizeEmail(user.email) === normalizedEmail) ??
      null
    );
  }

  updateProfile(
    userId: string,
    updates: { email?: string; displayName?: string },
  ): User | null {
    const updated = this.prepareProfileUpdate(userId, updates);
    if (!updated) return null;
    this.storage.set(this.collection, userId, updated);
    return updated;
  }

  async updateProfileDurable(
    userId: string,
    updates: { email?: string; displayName?: string },
  ): Promise<User | null> {
    const updated = this.prepareProfileUpdate(userId, updates);
    if (!updated) return null;
    await this.storage.setDurable(this.collection, userId, updated);
    return updated;
  }

  updateTier(userId: string, tier: AccountTier): User | null {
    const user = this.getById(userId);
    if (!user) return null;
    const updated = { ...user, tier, limits: TIER_LIMITS[tier] };
    this.storage.set(this.collection, userId, updated);
    return updated;
  }

  updateStatus(userId: string, status: User["status"]): User | null {
    const user = this.getById(userId);
    if (!user) return null;
    const updated = { ...user, status };
    this.storage.set(this.collection, userId, updated);
    return updated;
  }

  recordGeneration(userId: string, tokens: number): boolean {
    const user = this.getById(userId);
    if (!user) return false;
    this.storage.set(this.collection, userId, {
      ...user,
      lastLoginAt: Date.now(),
      usage: {
        ...user.usage,
        generationsToday: user.usage.generationsToday + 1,
        generationsTotal: user.usage.generationsTotal + 1,
        tokensUsedToday: user.usage.tokensUsedToday + tokens,
        tokensUsedTotal: user.usage.tokensUsedTotal + tokens,
      },
    });
    return true;
  }

  checkLimits(userId: string): { allowed: boolean; reason?: string } {
    const user = this.getById(userId);
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
    return this.storage.list<User>(this.collection);
  }

  count(): number {
    return this.storage.count(this.collection);
  }

  private buildUser(input: CreateUserInput): User {
    const tier = input.tier ?? "free";
    const email = this.normalizeEmail(input.email);
    return {
      id: createUserId(),
      email,
      displayName: input.displayName.trim(),
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
  }

  private prepareProfileUpdate(
    userId: string,
    updates: { email?: string; displayName?: string },
  ): User | null {
    const user = this.getById(userId);
    if (!user) return null;

    let email = user.email;
    if (updates.email && this.normalizeEmail(updates.email) !== user.email) {
      const existing = this.getByEmail(updates.email);
      if (existing && existing.id !== userId) return null;
      email = this.normalizeEmail(updates.email);
    }

    return {
      ...user,
      email,
      ...(updates.displayName?.trim()
        ? { displayName: updates.displayName.trim() }
        : {}),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
