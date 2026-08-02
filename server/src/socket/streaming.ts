import type { Response } from "express";
import type {
  PipelineEvent,
  PipelineEventPublisher,
} from "../types/pipeline-events";

/**
 * Server-Sent Events (SSE) Handler
 * Streams pipeline execution updates to clients in real-time
 */
export class StreamingUpdateHandler {
  private clients = new Map<
    string,
    { response: Response; projectId: string }
  >();
  private eventBuffer = new Map<string, PipelineEvent[]>();
  private maxBufferSize = 100;

  /**
   * Register a client connection
   */
  registerClient(clientId: string, projectId: string, res: Response): void {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    this.clients.set(clientId, { response: res, projectId });

    // Send heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!this.clients.has(clientId)) {
        clearInterval(heartbeatInterval);
        return;
      }
      this.sendHeartbeat(clientId);
    }, 30000); // Every 30 seconds

    // Send buffered events
    const buffered = this.eventBuffer.get(clientId) || [];
    for (const event of buffered) {
      this.sendEvent(clientId, event);
    }
    if (buffered.length > 0) {
      this.eventBuffer.set(clientId, []);
    }

    // Cleanup on disconnect
    res.on("close", () => {
      this.clients.delete(clientId);
      clearInterval(heartbeatInterval);
    });
  }

  /**
   * Send an event to a specific client
   */
  sendEvent(clientId: string, event: PipelineEvent): void {
    const client = this.clients.get(clientId)?.response;

    if (client && !client.writableEnded) {
      try {
        const eventData = JSON.stringify({
          type: event.type,
          pipelineId: event.pipelineId,
          stepId: event.stepId,
          data: event.data,
          timestamp: event.timestamp.toISOString(),
        });

        client.write(`data: ${eventData}\n\n`);
      } catch (error) {
        console.error(`Failed to send event to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    } else {
      // Buffer event if client is not connected
      const buffer = this.eventBuffer.get(clientId) || [];
      if (buffer.length < this.maxBufferSize) {
        buffer.push(event);
        this.eventBuffer.set(clientId, buffer);
      }
    }
  }

  /**
   * Send event to multiple clients (broadcast)
   */
  broadcastEvent(event: PipelineEvent, filterProjectId?: string): void {
    const projectId = filterProjectId ?? event.projectId;
    if (!projectId) return;
    for (const [clientId, client] of this.clients.entries()) {
      if (client.projectId === projectId) this.sendEvent(clientId, event);
    }
  }

  /**
   * Send a heartbeat/ping to keep connection alive
   */
  private sendHeartbeat(clientId: string): void {
    const client = this.clients.get(clientId)?.response;
    if (client && !client.writableEnded) {
      try {
        client.write(": heartbeat\n\n");
      } catch (error) {
        console.error(`Failed to send heartbeat to client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Check if a client is connected
   */
  isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId)?.response;
    return client !== undefined && !client.writableEnded;
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
    const client = this.clients.get(clientId)?.response;
    if (client && !client.writableEnded) {
      client.end();
    }
    this.clients.delete(clientId);
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
    // Call all handlers
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error("Error in pipeline event handler:", error);
      }
    }

    // Stream to clients
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
