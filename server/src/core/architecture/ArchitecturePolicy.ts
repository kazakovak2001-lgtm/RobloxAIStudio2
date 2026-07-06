/**
 * ArchitecturePolicy.ts
 *
 * Canonical architecture model definition.
 * Single source of truth for all boundary enforcement layers.
 */

export const ARCHITECTURE = {
  frontendRoot: "src",
  backendRoot: "server/src",
  sharedRoot: "shared",
  version: "2.0.0",
} as const;

export const FRONTEND_RULES = {
  allowedPaths: ["src/**"],
  forbiddenImports: ["server/src/**", "node:*", "express", "socket.io"],
  allowedRuntimes: ["browser", "web"],
  description: "Frontend: React SPA (Vite). No Node.js runtime access.",
} as const;

export const BACKEND_RULES = {
  allowedPaths: ["server/src/**"],
  forbiddenImports: ["react", "react-dom", "../../src/**", "../../../src/**"],
  allowedRuntimes: ["node"],
  description:
    "Backend: Node/Express + AI compiler platform. No browser runtime.",
} as const;

export const SHARED_RULES = {
  allowedPaths: ["shared/**"],
  forbiddenContent: ["class ", "import {", "require("],
  allowedContent: ["export type", "export interface", "export const"],
  description: "Shared: Only types, DTOs, contracts. No business logic.",
} as const;

export type BoundaryZone = "frontend" | "backend" | "shared" | "unknown";

/**
 * Resolve which boundary zone a file path belongs to.
 */
export function resolveBoundary(filePath: string): BoundaryZone {
  const normalized = filePath.replace(/\\/g, "/");
  if (
    normalized.startsWith("server/src/") ||
    normalized.startsWith("server\\src\\")
  )
    return "backend";
  if (normalized.startsWith("src/") || normalized.startsWith("src\\"))
    return "frontend";
  if (normalized.startsWith("shared/") || normalized.startsWith("shared\\"))
    return "shared";
  return "unknown";
}
