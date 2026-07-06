/**
 * shared/types.ts
 *
 * Shared contract types between frontend and backend.
 * This module contains ONLY:
 *  - Type definitions
 *  - Interface declarations
 *  - DTO shapes
 *  - Enum-like const objects
 *
 * NO business logic, NO class implementations, NO side effects.
 */

/** API response wrapper used by both frontend fetch and backend routes. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Generation execution status — shared between UI and backend. */
export type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

/** Pipeline step status — displayed in UI, produced by backend. */
export type StepStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";

/** LLM provider mode — shown in health UI, set by backend. */
export type LLMMode = "openai" | "anthropic" | "ollama" | "none";

/** Project status — used in project list UI and backend service. */
export type ProjectStatus = "active" | "archived" | "disabled";
