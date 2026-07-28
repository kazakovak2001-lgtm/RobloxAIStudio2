/**
 * ArchitecturePolicy.ts
 *
 * Canonical architecture model definition.
 * Single source of truth for all boundary enforcement layers.
 */

import { posix } from "node:path";

export const ARCHITECTURE = {
  backendRoot: "server/src",
  studioPluginRoot: "studio-plugin/src",
  removedFrontendRoot: "src",
  version: "3.0.0",
} as const;

export const BACKEND_RULES = {
  allowedPaths: ["server/src/**"],
  forbiddenImports: [
    "react",
    "react-dom",
    "@/**",
    "../../src/**",
    "../../../src/**",
  ],
  allowedRuntimes: ["node"],
  description:
    "Backend: Node/Express + AI compiler platform. No removed web-client runtime.",
} as const;

export const STUDIO_PLUGIN_RULES = {
  allowedPaths: ["studio-plugin/src/**"],
  forbiddenImports: ["server/src/**", "src/**"],
  allowedRuntimes: ["roblox-luau"],
  description:
    "Roblox Studio plugin: isolated Luau runtime connected through the Studio protocol.",
} as const;

export type BoundaryZone = "backend" | "studio-plugin" | "unknown";

/**
 * Resolve which boundary zone a file path belongs to.
 */
export function resolveBoundary(filePath: string): BoundaryZone {
  const normalized = posix.normalize(filePath.replace(/\\/g, "/"));
  if (
    normalized === ARCHITECTURE.backendRoot ||
    normalized.startsWith(`${ARCHITECTURE.backendRoot}/`)
  ) {
    return "backend";
  }
  if (
    normalized === ARCHITECTURE.studioPluginRoot ||
    normalized.startsWith(`${ARCHITECTURE.studioPluginRoot}/`)
  ) {
    return "studio-plugin";
  }
  return "unknown";
}
