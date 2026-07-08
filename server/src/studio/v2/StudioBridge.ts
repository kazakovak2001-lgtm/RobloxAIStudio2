/**
 * StudioBridge — Manages connections between DevKit and Roblox Studio plugins.
 */

import type { StudioClient, StudioCommand } from "./StudioTypes";
import { createClientId } from "./StudioTypes";
import { StudioEvents } from "./StudioEvents";

export class StudioBridge {
  private clients: Map<string, StudioClient> = new Map();
  private commandQueue: Map<string, StudioCommand[]> = new Map();
  readonly events: StudioEvents;

  constructor() {
    this.events = new StudioEvents();
  }

  /**
   * Register a new Studio client connection.
   */
  connect(studioVersion: string, projectId?: string): StudioClient {
    const client: StudioClient = {
      clientId: createClientId(),
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
   * Queue a command for a client.
   */
  sendCommand(clientId: string, command: StudioCommand): void {
    const queue = this.commandQueue.get(clientId);
    if (queue) {
      queue.push(command);
      command.status = "sent";
    }
  }

  /**
   * Get pending commands for a client (polling).
   */
  getCommands(clientId: string): StudioCommand[] {
    const queue = this.commandQueue.get(clientId) ?? [];
    this.commandQueue.set(clientId, []);
    return queue;
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
}
