/**
 * Server-Sent Events (SSE) Handler
 * Streams pipeline execution updates to clients in real-time
 */
export class StreamingUpdateHandler {
    constructor() {
        this.clients = new Map();
        this.eventBuffer = new Map();
        this.maxBufferSize = 100;
    }
    /**
     * Register a client connection
     */
    registerClient(clientId, res) {
        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        this.clients.set(clientId, res);
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
    sendEvent(clientId, event) {
        const client = this.clients.get(clientId);
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
            }
            catch (error) {
                console.error(`Failed to send event to client ${clientId}:`, error);
                this.clients.delete(clientId);
            }
        }
        else {
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
    broadcastEvent(event, _filterPipelineId) {
        for (const clientId of this.clients.keys()) {
            this.sendEvent(clientId, event);
        }
    }
    /**
     * Send a heartbeat/ping to keep connection alive
     */
    sendHeartbeat(clientId) {
        const client = this.clients.get(clientId);
        if (client && !client.writableEnded) {
            try {
                client.write(": heartbeat\n\n");
            }
            catch (error) {
                console.error(`Failed to send heartbeat to client ${clientId}:`, error);
                this.clients.delete(clientId);
            }
        }
    }
    /**
     * Check if a client is connected
     */
    isClientConnected(clientId) {
        const client = this.clients.get(clientId);
        return client !== undefined && !client.writableEnded;
    }
    /**
     * Get active client count
     */
    getActiveClientCount() {
        return this.clients.size;
    }
    /**
     * Close a specific client connection
     */
    closeClient(clientId) {
        const client = this.clients.get(clientId);
        if (client && !client.writableEnded) {
            client.end();
        }
        this.clients.delete(clientId);
    }
    /**
     * Close all connections
     */
    closeAll() {
        for (const client of this.clients.values()) {
            if (!client.writableEnded) {
                client.end();
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
            totalBufferedEventCount: Array.from(this.eventBuffer.values()).reduce((sum, buf) => sum + buf.length, 0),
        };
    }
}
/**
 * Event Emitter for pipeline execution
 * Integrates with StreamingUpdateHandler to emit events
 */
export class PipelineEventEmitter {
    constructor() {
        this.handlers = [];
    }
    setStreamingHandler(handler) {
        this.streamHandler = handler;
    }
    onEvent(handler) {
        this.handlers.push(handler);
    }
    async emit(event) {
        // Call all handlers
        for (const handler of this.handlers) {
            try {
                await handler(event);
            }
            catch (error) {
                console.error("Error in pipeline event handler:", error);
            }
        }
        // Stream to clients
        if (this.streamHandler) {
            this.streamHandler.broadcastEvent(event);
        }
    }
    async emitStepStarted(pipelineId, stepId, stepName) {
        await this.emit({
            type: "step.started",
            pipelineId,
            stepId,
            data: { name: stepName },
            timestamp: new Date(),
        });
    }
    async emitStepCompleted(pipelineId, stepId, output) {
        await this.emit({
            type: "step.completed",
            pipelineId,
            stepId,
            data: { output },
            timestamp: new Date(),
        });
    }
    async emitStepFailed(pipelineId, stepId, error) {
        await this.emit({
            type: "step.failed",
            pipelineId,
            stepId,
            data: { error },
            timestamp: new Date(),
        });
    }
    async emitPipelineStarted(pipelineId) {
        await this.emit({
            type: "pipeline.started",
            pipelineId,
            timestamp: new Date(),
        });
    }
    async emitPipelineCompleted(pipelineId, outputs) {
        await this.emit({
            type: "pipeline.completed",
            pipelineId,
            data: { outputs },
            timestamp: new Date(),
        });
    }
    async emitPipelineFailed(pipelineId, error) {
        await this.emit({
            type: "pipeline.failed",
            pipelineId,
            data: { error },
            timestamp: new Date(),
        });
    }
}
