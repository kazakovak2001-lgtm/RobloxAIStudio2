/**
 * User Management Types — Account architecture for productization.
 */

import { randomUUID } from "crypto";

export type AccountTier = "free" | "starter" | "pro" | "enterprise";
export type AccountStatus = "active" | "suspended" | "deactivated";

export interface User {
  id: string;
  email: string;
  displayName: string;
  tier: AccountTier;
  status: AccountStatus;
  createdAt: number;
  lastLoginAt: number;
  usage: UserUsage;
  limits: TierLimits;
}

export interface UserUsage {
  generationsToday: number;
  generationsTotal: number;
  tokensUsedToday: number;
  tokensUsedTotal: number;
  projectCount: number;
  storageUsedBytes: number;
}

export interface TierLimits {
  maxProjects: number;
  maxGenerationsPerDay: number;
  maxTokensPerDay: number;
  maxStorageBytes: number;
  concurrentGenerations: number;
  features: string[];
}

export const TIER_LIMITS: Record<AccountTier, TierLimits> = {
  free: {
    maxProjects: 3,
    maxGenerationsPerDay: 5,
    maxTokensPerDay: 50000,
    maxStorageBytes: 50 * 1024 * 1024,
    concurrentGenerations: 1,
    features: ["basic_generation", "playtest"],
  },
  starter: {
    maxProjects: 10,
    maxGenerationsPerDay: 20,
    maxTokensPerDay: 200000,
    maxStorageBytes: 200 * 1024 * 1024,
    concurrentGenerations: 2,
    features: [
      "basic_generation",
      "playtest",
      "repair",
      "knowledge",
      "studio_sync",
    ],
  },
  pro: {
    maxProjects: 50,
    maxGenerationsPerDay: 100,
    maxTokensPerDay: 1000000,
    maxStorageBytes: 1024 * 1024 * 1024,
    concurrentGenerations: 5,
    features: [
      "basic_generation",
      "playtest",
      "repair",
      "knowledge",
      "studio_sync",
      "multi_agent",
      "domain_intelligence",
      "priority_queue",
    ],
  },
  enterprise: {
    maxProjects: -1,
    maxGenerationsPerDay: -1,
    maxTokensPerDay: -1,
    maxStorageBytes: -1,
    concurrentGenerations: 20,
    features: ["all"],
  },
};

export function createUserId(): string {
  return `user-${randomUUID().slice(0, 10)}`;
}
