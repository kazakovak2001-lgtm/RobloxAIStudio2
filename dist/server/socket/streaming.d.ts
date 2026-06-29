import type { Response } from "express";
import type { PipelineEvent } from "../execution/pipelineTypes";
/**
 * Server-Sent Events (SSE) Handler
 * Streams pipeline execution updates to clients in real-time
 */
export declare class StreamingUpdateHandler {
    private clients;
    private eventBuffer;
    private maxBufferSize;
    /**
     * Register a client connection
     */
    registerClient(clientId: string, res: Response): void;
    /**
     * Send an event to a specific client
     */
    sendEvent(clientId: string, event: PipelineEvent): void;
    /**
     * Send event to multiple clients (broadcast)
     */
    broadcastEvent(event: PipelineEvent, _filterPipelineId?: string): void;
    /**
     * Send a heartbeat/ping to keep connection alive
     */
    private sendHeartbeat;
    /**
     * Check if a client is connected
     */
    isClientConnected(clientId: string): boolean;
    /**
     * Get active client count
     */
    getActiveClientCount(): number;
    /**
     * Close a specific client connection
     */
    closeClient(clientId: string): void;
    /**
     * Close all connections
     */
    closeAll(): void;
    /**
     * Get handler statistics
     */
    getStats(): {
        activeClients: number;
        bufferedEvents: number;
        totalBufferedEventCount: number;
    };
}
/**
 * Event Emitter for pipeline execution
 * Integrates with StreamingUpdateHandler to emit events
 */
export declare class PipelineEventEmitter {
    private handlers;
    private streamHandler?;
    setStreamingHandler(handler: StreamingUpdateHandler): void;
    onEvent(handler: (event: PipelineEvent) => Promise<void>): void;
    emit(event: PipelineEvent): Promise<void>;
    emitStepStarted(pipelineId: string, stepId: string, stepName: string): Promise<void>;
    emitStepCompleted(pipelineId: string, stepId: string, output?: unknown): Promise<void>;
    emitStepFailed(pipelineId: string, stepId: string, error: string): Promise<void>;
    emitPipelineStarted(pipelineId: string): Promise<void>;
    emitPipelineCompleted(pipelineId: string, outputs?: Record<string, unknown>): Promise<void>;
    emitPipelineFailed(pipelineId: string, error: string): Promise<void>;
}
