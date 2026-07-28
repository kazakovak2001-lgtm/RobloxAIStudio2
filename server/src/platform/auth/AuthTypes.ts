/**
 * Authentication types for storage-backed opaque sessions, roles, and
 * permissions. Access and refresh credentials are random server-side session
 * identifiers, not signed JWTs.
 */

export type UserRole =
  "guest" | "creator" | "premium" | "studio" | "administrator";

export type Permission =
  | "create_project"
  | "delete_project"
  | "generate_game"
  | "publish"
  | "manage_team"
  | "manage_billing"
  | "admin";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  guest: [],
  creator: ["create_project", "generate_game"],
  premium: ["create_project", "delete_project", "generate_game", "publish"],
  studio: [
    "create_project",
    "delete_project",
    "generate_game",
    "publish",
    "manage_team",
  ],
  administrator: [
    "create_project",
    "delete_project",
    "generate_game",
    "publish",
    "manage_team",
    "manage_billing",
    "admin",
  ],
};

export interface AuthSession {
  sessionId: string;
  userId: string;
  role: UserRole;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
}

export interface AuthCredentials {
  email: string;
  passwordHash: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  userId?: string;
  role?: UserRole;
  error?: string;
}
