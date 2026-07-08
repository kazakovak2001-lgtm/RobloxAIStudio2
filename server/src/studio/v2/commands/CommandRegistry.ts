/**
 * CommandRegistry + CommandExecutor — Studio command system.
 */

import type { StudioCommand, StudioCommandType } from "../StudioTypes";
import { createCommandId } from "../StudioTypes";
import { StudioBridge } from "../StudioBridge";

export class CommandRegistry {
  private bridge: StudioBridge;

  constructor(bridge: StudioBridge) {
    this.bridge = bridge;
  }

  /**
   * Create and queue a command for a connected client.
   */
  execute(
    clientId: string,
    type: StudioCommandType,
    payload: Record<string, unknown>,
  ): StudioCommand | null {
    const client = this.bridge.getClient(clientId);
    if (!client || client.status !== "connected") return null;

    const command: StudioCommand = {
      id: createCommandId(),
      type,
      payload,
      timestamp: Date.now(),
      status: "pending",
      clientId,
    };
    this.bridge.sendCommand(clientId, command);
    return command;
  }

  /**
   * Execute a command for the first available connected client.
   */
  executeForAny(
    type: StudioCommandType,
    payload: Record<string, unknown>,
  ): StudioCommand | null {
    const clients = this.bridge.getConnectedClients();
    if (clients.length === 0) return null;
    return this.execute(clients[0].clientId, type, payload);
  }
}
