/**
 * UserService — Business logic layer for user management.
 */

import { createHash } from "crypto";
import { UserRepository } from "./UserRepository";
import type { User, AccountTier } from "./UserTypes";
import type { StorageProvider } from "../storage/StorageProvider";

export class UserService {
  private repo: UserRepository;

  constructor(storage?: StorageProvider) {
    this.repo = new UserRepository();
    // Storage param reserved for future DB-backed repo
    if (storage) {
      /* future: inject into repo */
    }
  }

  createUser(
    email: string,
    displayName: string,
    password: string,
    tier: AccountTier = "free",
  ): { success: boolean; user?: User; error?: string } {
    if (!email || !email.includes("@"))
      return { success: false, error: "Invalid email" };
    if (!displayName || displayName.length < 2)
      return { success: false, error: "Display name too short" };
    if (!password || password.length < 6)
      return { success: false, error: "Password must be 6+ characters" };

    // Check duplicate email
    const existing = this.repo.getByEmail(email);
    if (existing) return { success: false, error: "Email already registered" };

    const user = this.repo.create({ email, displayName, tier });
    return { success: true, user };
  }

  findById(id: string): User | null {
    return this.repo.getById(id);
  }

  findByEmail(email: string): User | null {
    return this.repo.getByEmail(email);
  }

  updateUser(
    id: string,
    updates: Partial<Pick<User, "displayName" | "tier">>,
  ): User | null {
    const user = this.repo.getById(id);
    if (!user) return null;
    if (updates.tier) this.repo.updateTier(id, updates.tier);
    return this.repo.getById(id);
  }

  deactivateUser(id: string): boolean {
    const user = this.repo.getById(id);
    if (!user) return false;
    user.status = "suspended";
    return true;
  }

  validateAccess(id: string): { allowed: boolean; reason?: string } {
    const user = this.repo.getById(id);
    if (!user) return { allowed: false, reason: "User not found" };
    if (user.status !== "active")
      return { allowed: false, reason: "Account is not active" };
    return this.repo.checkLimits(id);
  }

  hashPassword(password: string): string {
    return createHash("sha256")
      .update(password + "_salt_roblox_ai_studio")
      .digest("hex");
  }

  verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  listUsers(): User[] {
    return this.repo.getAll();
  }

  count(): number {
    return this.repo.count();
  }
}
