/**
 * Studio integration types.
 */

import { randomUUID } from "crypto";

export type ConnectionStatus = "connected" | "disconnected" | "error";

export interface StudioClient {
  clientId: string;
  studioVersion: string;
  projectId?: string;
  connectedAt: number;
  lastHeartbeat: number;
  status: ConnectionStatus;
}

export type StudioCommandType =
  | "CREATE_PROJECT"
  | "CREATE_SCRIPT"
  | "UPDATE_SCRIPT"
  | "CREATE_MODEL"
  | "INSERT_ASSET"
  | "RUN_TEST"
  | "EXPORT_PROJECT";
export type CommandStatus =
  | "pending"
  | "sent"
  | "acknowledged"
  | "completed"
  | "failed";

export interface StudioArtifactReceipt {
  artifactId: string;
  hash: string;
  instancePath?: string;
}

export interface StudioCommandResult {
  status: "completed" | "failed";
  executionId: string;
  artifacts: StudioArtifactReceipt[];
  error?: string;
  reportedAt?: number;
  receivedAt: number;
}

export interface StudioCommand {
  id: string;
  type: StudioCommandType;
  payload: Record<string, unknown>;
  timestamp: number;
  status: CommandStatus;
  clientId: string;
  deliveredAt?: number;
  acknowledgedAt?: number;
  completedAt?: number;
  result?: StudioCommandResult;
  error?: string;
}

export type StudioEventType =
  | "studio.connected"
  | "studio.disconnected"
  | "project.created"
  | "script.generated"
  | "asset.imported"
  | "export.started"
  | "export.completed"
  | "export.failed";

export interface StudioEventData {
  type: StudioEventType;
  clientId: string;
  projectId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export function createCommandId(): string {
  return `cmd-${randomUUID().slice(0, 10)}`;
}
export function createClientId(): string {
  return `studio-${randomUUID().slice(0, 8)}`;
}
