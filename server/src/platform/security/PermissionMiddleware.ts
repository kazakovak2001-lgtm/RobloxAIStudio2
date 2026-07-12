/**
 * PermissionMiddleware — Authorization checks for routes.
 */

import type { UserRole } from "../auth/AuthTypes";
import { ROLE_PERMISSIONS, type Permission } from "../auth/AuthTypes";
import { SaaSProjectRepository } from "../projects/SaaSProjectRepository";
import type { StorageProvider } from "../storage/StorageProvider";

export class PermissionMiddleware {
  private projectRepo: SaaSProjectRepository;

  constructor(storage: StorageProvider) {
    this.projectRepo = new SaaSProjectRepository(storage);
  }

  requireAuthentication(userId: string | null): {
    allowed: boolean;
    error?: string;
  } {
    if (!userId) return { allowed: false, error: "Authentication required" };
    return { allowed: true };
  }

  requireRole(
    userRole: UserRole,
    requiredRole: UserRole,
  ): { allowed: boolean; error?: string } {
    const hierarchy: UserRole[] = [
      "guest",
      "creator",
      "premium",
      "studio",
      "administrator",
    ];
    const userLevel = hierarchy.indexOf(userRole);
    const requiredLevel = hierarchy.indexOf(requiredRole);
    if (userLevel < requiredLevel) {
      return {
        allowed: false,
        error: `Role '${requiredRole}' required, have '${userRole}'`,
      };
    }
    return { allowed: true };
  }

  requirePermission(
    userRole: UserRole,
    permission: Permission,
  ): { allowed: boolean; error?: string } {
    const permissions = ROLE_PERMISSIONS[userRole] ?? [];
    if (!permissions.includes(permission)) {
      return {
        allowed: false,
        error: `Permission '${permission}' not granted for role '${userRole}'`,
      };
    }
    return { allowed: true };
  }

  checkOwnership(
    projectId: string,
    userId: string,
  ): { allowed: boolean; error?: string } {
    const isOwner = this.projectRepo.verifyOwnership(projectId, userId);
    if (!isOwner)
      return { allowed: false, error: "Access denied: not project owner" };
    return { allowed: true };
  }
}
