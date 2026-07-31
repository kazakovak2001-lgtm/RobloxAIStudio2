/**
 * StudioBridge — Manages connections between DevKit and Roblox Studio plugins.
 */

import type {
  StudioClient,
  StudioCommand,
  StudioCommandResult,
} from "./StudioTypes";
import { createClientId } from "./StudioTypes";
import { StudioEvents } from "./StudioEvents";

export type CommandTransitionResult =
  | { success: true; command: StudioCommand }
  | {
      success: false;
      reason: "command_not_found" | "client_mismatch" | "invalid_status";
      message: string;
    };

export class StudioBridge {
  private clients: Map<string, StudioClient> = new Map();
  private commandQueue: Map<string, StudioCommand[]> = new Map();
  private commands: Map<string, StudioCommand> = new Map();
  readonly events: StudioEvents;

  constructor() {
    this.events = new StudioEvents();
  }

  /**
   * Register a new Studio client connection.
   */
  connect(
    studioVersion: string,
    projectId?: string,
    requestedClientId?: string,
  ): StudioClient {
    const client: StudioClient = {
      clientId: requestedClientId ?? createClientId(),
      studioVersion,
      projectId,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: "connected",
    };
    this.clients.set(client.clientId, client);
    this.commandQueue.set(client.clientId, []);
    this.events.emit({
      type: "studio.connected",
      clientId: client.clientId,
      projectId,
      timestamp: Date.now(),
    });
    return client;
  }

  /**
   * Disconnect a Studio client.
   */
  disconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = "disconnected";
    }
    this.events.emit({
      type: "studio.disconnected",
      clientId,
      timestamp: Date.now(),
    });
  }

  /**
   * Record heartbeat from client.
   */
  heartbeat(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.lastHeartbeat = Date.now();
    return true;
  }

  /**
   * Queue a command for a connected client and retain its lifecycle record.
   */
  sendCommand(clientId: string, command: StudioCommand): boolean {
    const client = this.clients.get(clientId);
    const queue = this.commandQueue.get(clientId);
    if (!client || client.status !== "connected" || !queue) return false;
    command.status = "sent";
    queue.push(command);
    this.commands.set(command.id, command);
    return true;
  }

  canSendCommand(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return Boolean(
      client &&
      client.status === "connected" &&
      this.commandQueue.has(clientId),
    );
  }

  /** Publish an already acknowledged durable snapshot into this live process. */
  publishCommand(command: StudioCommand, enqueue = false): void {
    const snapshot = structuredClone(command);
    this.commands.set(snapshot.id, snapshot);
    if (enqueue) {
      const queue = this.commandQueue.get(snapshot.clientId);
      if (queue && !queue.some((queued) => queued.id === snapshot.id)) {
        queue.push(snapshot);
      }
    }
  }

  peekCommands(clientId: string): StudioCommand[] {
    return structuredClone(this.commandQueue.get(clientId) ?? []);
  }

  removeQueuedCommand(clientId: string, commandId: string): void {
    const queue = this.commandQueue.get(clientId);
    if (!queue) return;
    this.commandQueue.set(
      clientId,
      queue.filter((command) => command.id !== commandId),
    );
  }

  /**
   * Get pending commands for a client (polling).
   */
  getCommands(clientId: string): StudioCommand[] {
    const queue = this.commandQueue.get(clientId) ?? [];
    this.commandQueue.set(clientId, []);
    return queue;
  }

  getPendingCommandCount(clientId: string): number {
    return this.commandQueue.get(clientId)?.length ?? 0;
  }

  getCommand(commandId: string): StudioCommand | null {
    const command = this.commands.get(commandId);
    return command ? structuredClone(command) : null;
  }

  markCommandDelivered(
    clientId: string,
    commandId: string,
  ): CommandTransitionResult {
    const command = this.resolveOwnedCommand(clientId, commandId);
    if (!command.success) return command;
    if (command.command.status !== "sent") {
      return this.invalidStatus(command.command, "delivered");
    }
    command.command.deliveredAt ??= Date.now();
    return command;
  }

  acknowledgeCommand(
    clientId: string,
    commandId: string,
  ): CommandTransitionResult {
    const command = this.resolveOwnedCommand(clientId, commandId);
    if (!command.success) return command;
    if (command.command.status === "acknowledged") return command;
    if (command.command.status !== "sent") {
      return this.invalidStatus(command.command, "acknowledged");
    }
    command.command.status = "acknowledged";
    command.command.acknowledgedAt = Date.now();
    return command;
  }

  completeCommand(
    clientId: string,
    commandId: string,
    result: StudioCommandResult,
  ): CommandTransitionResult {
    return this.finishCommand(clientId, commandId, result, "completed");
  }

  failCommand(
    clientId: string,
    commandId: string,
    result: StudioCommandResult,
  ): CommandTransitionResult {
    return this.finishCommand(clientId, commandId, result, "failed");
  }

  /**
   * Get a connected client.
   */
  getClient(clientId: string): StudioClient | null {
    return this.clients.get(clientId) ?? null;
  }

  /**
   * Get all connected clients.
   */
  getConnectedClients(): StudioClient[] {
    return [...this.clients.values()].filter((c) => c.status === "connected");
  }

  get clientCount(): number {
    return this.clients.size;
  }

  private finishCommand(
    clientId: string,
    commandId: string,
    result: StudioCommandResult,
    targetStatus: "completed" | "failed",
  ): CommandTransitionResult {
    const command = this.resolveOwnedCommand(clientId, commandId);
    if (!command.success) return command;
    if (command.command.status !== "acknowledged") {
      return this.invalidStatus(command.command, targetStatus);
    }
    command.command.status = targetStatus;
    command.command.completedAt = Date.now();
    command.command.result = result;
    command.command.error = result.error;
    return command;
  }

  private resolveOwnedCommand(
    clientId: string,
    commandId: string,
  ): CommandTransitionResult {
    const command = this.commands.get(commandId);
    if (!command) {
      return {
        success: false,
        reason: "command_not_found",
        message: "Studio command was not found.",
      };
    }
    if (command.clientId !== clientId) {
      return {
        success: false,
        reason: "client_mismatch",
        message: "Studio command belongs to a different client.",
      };
    }
    return { success: true, command };
  }

  private invalidStatus(
    command: StudioCommand,
    target: string,
  ): CommandTransitionResult {
    return {
      success: false,
      reason: "invalid_status",
      message: `Cannot mark command ${target} from status ${command.status}.`,
    };
  }
}
