/**
 * UserRepository — Storage-backed user management with tier limits.
 */

import type { User, AccountTier } from "./UserTypes";
import { TIER_LIMITS, createUserId } from "./UserTypes";
import {
  InMemoryStorageProvider,
  type StorageProvider,
} from "../storage/StorageProvider";

export interface CreateUserInput {
  email: string;
  displayName: string;
  tier?: AccountTier;
}

export class UserRepository {
  private readonly collection = "users";
  private readonly generationMutationQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly storage: StorageProvider = new InMemoryStorageProvider(),
  ) {}

  create(input: CreateUserInput): User {
    const user = this.buildUser(input);
    this.storage.set(this.collection, user.id, user);
    return user;
  }

  async createDurable(input: CreateUserInput): Promise<User> {
    const user = this.buildUser(input);
    await this.storage.setDurable(this.collection, user.id, user);
    return user;
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

  async updateProfileDurable(
    userId: string,
    updates: { email?: string; displayName?: string },
  ): Promise<User | null> {
    const user = this.getById(userId);
    if (!user) return null;

    let email = user.email;
    if (updates.email && this.normalizeEmail(updates.email) !== user.email) {
      const existing = this.getByEmail(updates.email);
      if (existing && existing.id !== userId) return null;
      email = this.normalizeEmail(updates.email);
    }
    const updated: User = {
      ...user,
      email,
      ...(updates.displayName?.trim()
        ? { displayName: updates.displayName.trim() }
        : {}),
    };
    await this.storage.setDurable(this.collection, userId, updated);
    return updated;
  }

  async updateTierDurable(
    userId: string,
    tier: AccountTier,
  ): Promise<User | null> {
    const user = this.getById(userId);
    if (!user) return null;
    const updated: User = { ...user, tier, limits: TIER_LIMITS[tier] };
    await this.storage.setDurable(this.collection, userId, updated);
    return updated;
  }

  async updateStatusDurable(
    userId: string,
    status: User["status"],
  ): Promise<User | null> {
    const user = this.getById(userId);
    if (!user) return null;
    const updated: User = { ...user, status };
    await this.storage.setDurable(this.collection, userId, updated);
    return updated;
  }

  recordGenerationDurable(userId: string, tokens: number): Promise<boolean> {
    return this.enqueueGenerationMutation(userId, async () => {
      const user = this.getById(userId);
      if (!user) return false;
      const updated: User = {
        ...user,
        lastLoginAt: Date.now(),
        usage: {
          ...user.usage,
          generationsToday: user.usage.generationsToday + 1,
          generationsTotal: user.usage.generationsTotal + 1,
          tokensUsedToday: user.usage.tokensUsedToday + tokens,
          tokensUsedTotal: user.usage.tokensUsedTotal + tokens,
        },
      };
      await this.storage.setDurable(this.collection, userId, updated);
      return true;
    });
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

  private enqueueGenerationMutation<T>(
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.generationMutationQueues.get(userId) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.generationMutationQueues.set(userId, tail);

    return result.finally(() => {
      if (this.generationMutationQueues.get(userId) === tail) {
        this.generationMutationQueues.delete(userId);
      }
    });
  }

  private buildUser(input: CreateUserInput): User {
    const tier = input.tier ?? "free";
    return {
      id: createUserId(),
      email: this.normalizeEmail(input.email),
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
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
