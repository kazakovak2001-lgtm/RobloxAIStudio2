import type { Response } from "express";
import type {
  PipelineEvent,
  PipelineEventPublisher,
} from "../types/pipeline-events";

type ClientConnection = {
  response: Response;
  projectId: string;
  lastSeenAt: number;
  bufferedBytes: number;
};

/**
 * Server-Sent Events (SSE) Handler
 * Streams pipeline execution updates to clients in real-time
 */
export class StreamingUpdateHandler {
  private clients = new Map<string, ClientConnection>();
  private projectClients = new Map<string, Set<string>>();
  private eventBuffer = new Map<string, PipelineEvent[]>();
  private maxBufferSize = 100;
  private maxBufferedBytes = 256 * 1024;
  private heartbeatIntervalMs = 30_000;
  private idleTimeoutMs = 60_000;

  /**
   * Register a client connection
   */
  registerClient(clientId: string, projectId: string, res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const connection: ClientConnection = {
      response: res,
      projectId,
      lastSeenAt: Date.now(),
      bufferedBytes: 0,
    };

    this.clients.set(clientId, connection);

    const members = this.projectClients.get(projectId) ?? new Set<string>();
    members.add(clientId);
    this.projectClients.set(projectId, members);

    const heartbeatInterval = setInterval(() => {
      const client = this.clients.get(clientId);
      if (!client) {
        clearInterval(heartbeatInterval);
        return;
      }

      if (Date.now() - client.lastSeenAt > this.idleTimeoutMs) {
        this.cleanupClient(clientId);
        clearInterval(heartbeatInterval);
        return;
      }

      this.sendHeartbeat(clientId);
    }, this.heartbeatIntervalMs);

    const buffered = this.eventBuffer.get(clientId) ?? [];
    for (const event of buffered) {
      this.sendEvent(clientId, event);
    }
    if (buffered.length > 0) {
      this.eventBuffer.delete(clientId);
    }

    res.on("close", () => {
      this.cleanupClient(clientId);
      clearInterval(heartbeatInterval);
    });
  }

  /**
   * Send an event to a specific client
   */
  sendEvent(clientId: string, event: PipelineEvent): void {
    const client = this.clients.get(clientId);

    if (client && !client.response.writableEnded) {
      try {
        const eventData = JSON.stringify({
          type: event.type,
          pipelineId: event.pipelineId,
          stepId: event.stepId,
          data: event.data,
          timestamp: event.timestamp.toISOString(),
        });

        client.response.write(`data: ${eventData}\n\n`);
        client.lastSeenAt = Date.now();
      } catch (error) {
        console.error(`Failed to send event to client ${clientId}:`, error);
        this.cleanupClient(clientId);
      }
      return;
    }

    this.bufferEvent(clientId, event);
  }

  /**
   * Buffer event if client is not connected
   */
  private bufferEvent(clientId: string, event: PipelineEvent): void {
    const current = this.eventBuffer.get(clientId) ?? [];
    const next = [...current, event];

    if (next.length > this.maxBufferSize) {
      next.splice(0, next.length - this.maxBufferSize);
    }

    const bufferedBytes = next.reduce((sum, item) => {
      try {
        return sum + JSON.stringify(item).length;
      } catch {
        return sum + 512;
      }
    }, 0);

    if (bufferedBytes > this.maxBufferedBytes) {
      let trimmed = next;
      let totalBytes = bufferedBytes;
      while (trimmed.length > 1 && totalBytes > this.maxBufferedBytes) {
        const removed = trimmed.shift()!;
        totalBytes -= JSON.stringify(removed).length;
      }
      this.eventBuffer.set(clientId, trimmed);
      return;
    }

    this.eventBuffer.set(clientId, next);
  }

  /**
   * Send an event to all clients in the project room
   */
  broadcastEvent(event: PipelineEvent, filterProjectId?: string): void {
    const projectId = filterProjectId ?? event.projectId;
    if (!projectId) return;

    const members = this.projectClients.get(projectId);
    if (!members) return;

    for (const clientId of [...members]) {
      this.sendEvent(clientId, event);
    }
  }

  /**
   * Send a heartbeat/ping to keep connection alive
   */
  private sendHeartbeat(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client && !client.response.writableEnded) {
      try {
        client.response.write(": heartbeat\n\n");
        client.lastSeenAt = Date.now();
      } catch (error) {
        console.error(`Failed to send heartbeat to client ${clientId}:`, error);
        this.cleanupClient(clientId);
      }
    }
  }

  /**
   * Check if a client is connected
   */
  isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client !== undefined && !client.response.writableEnded;
  }

  /**
   * Get active client count
   */
  getActiveClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close a specific client connection
   */
  closeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client && !client.response.writableEnded) {
      client.response.end();
    }
    this.cleanupClient(clientId);
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    for (const client of this.clients.values()) {
      if (!client.response.writableEnded) {
        client.response.end();
      }
    }
    this.clients.clear();
    this.projectClients.clear();
    this.eventBuffer.clear();
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      activeClients: this.clients.size,
      bufferedEvents: this.eventBuffer.size,
      totalBufferedEventCount: Array.from(this.eventBuffer.values()).reduce(
        (sum, buf) => sum + buf.length,
        0,
      ),
    };
  }

  private cleanupClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      this.eventBuffer.delete(clientId);
      return;
    }

    this.clients.delete(clientId);
    this.eventBuffer.delete(clientId);

    const room = this.projectClients.get(client.projectId);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.projectClients.delete(client.projectId);
      }
    }
  }
}

/**
 * Event Emitter for pipeline execution
 * Integrates with StreamingUpdateHandler to emit events
 */
export class PipelineEventEmitter implements PipelineEventPublisher {
  private handlers: Array<(event: PipelineEvent) => Promise<void>> = [];
  private streamHandler?: StreamingUpdateHandler;

  setStreamingHandler(handler: StreamingUpdateHandler): void {
    this.streamHandler = handler;
  }

  onEvent(handler: (event: PipelineEvent) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async emit(event: PipelineEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error("Error in pipeline event handler:", error);
      }
    }

    if (this.streamHandler) {
      this.streamHandler.broadcastEvent(event);
    }
  }

  async emitStepStarted(
    pipelineId: string,
    stepId: string,
    stepName: string,
    projectId?: string,
  ): Promise<void> {
    await this.emit({
      type: "step.started",
      pipelineId,
      projectId,
      stepId,
      data: { name: stepName },
      timestamp: new Date(),
    });
  }

  async emitStepCompleted(
    pipelineId: string,
    stepId: string,
    stepName: string,
    output?: unknown,
    projectId?: string,
  ): Promise<void> {
    await this.emit({
      type: "step.completed",
      pipelineId,
      projectId,
      stepId,
      data: { name: stepName, output },
      timestamp: new Date(),
    });
  }

  async emitStepFailed(
    pipelineId: string,
    stepId: string,
    stepName: string,
    error: string,
    projectId?: string,
  ): Promise<void> {
    await this.emit({
      type: "step.failed",
      pipelineId,
      projectId,
      stepId,
      data: { name: stepName, error },
      timestamp: new Date(),
    });
  }

  async emitPipelineStarted(
    pipelineId: string,
    projectId?: string,
  ): Promise<void> {
    await this.emit({
      type: "pipeline.started",
      pipelineId,
      projectId,
      timestamp: new Date(),
    });
  }

  async emitPipelineCompleted(
    pipelineId: string,
    outputs?: Record<string, unknown>,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit({
      type: "pipeline.completed",
      pipelineId,
      projectId,
      data: { outputs, ...metadata },
      timestamp: new Date(),
    });
  }

  async emitPipelineFailed(
    pipelineId: string,
    error: string,
    projectId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit({
      type: "pipeline.failed",
      pipelineId,
      projectId,
      data: { error, ...metadata },
      timestamp: new Date(),
    });
  }
}
