/**
 * ProtocolDispatcher — Routes incoming protocol messages to handlers.
 */

import {
  type ProtocolMessage,
  type ProtocolResponse,
  type ProtocolMessageType,
  type ProtocolLogEntry,
  createResponse,
  PROTOCOL_VERSION,
} from "./StudioProtocol";
import { ProtocolValidator } from "./ProtocolValidator";

export type MessageHandler = (
  message: ProtocolMessage,
) => ProtocolResponse | Promise<ProtocolResponse>;

export class ProtocolDispatcher {
  private handlers: Map<ProtocolMessageType, MessageHandler> = new Map();
  private messageLog: ProtocolLogEntry[] = [];
  private processedIds: Set<string> = new Set();
  private validator: ProtocolValidator;

  constructor() {
    this.validator = new ProtocolValidator();
    this.registerDefaults();
  }

  /**
   * Register a handler for a message type.
   */
  register(type: ProtocolMessageType, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Dispatch a message and return the response.
   */
  async dispatch(message: ProtocolMessage): Promise<ProtocolResponse> {
    const startTime = Date.now();

    // Validate message
    const validationError = this.validator.validate(message);
    if (validationError) {
      const errorResponse = createResponse(
        message,
        "error",
        {},
        validationError,
      );
      this.log(message, "error", startTime);
      return errorResponse;
    }

    // Check duplicate
    if (this.processedIds.has(message.messageId)) {
      const dupResponse = createResponse(
        message,
        "error",
        {},
        "Duplicate messageId",
      );
      this.log(message, "error", startTime);
      return dupResponse;
    }
    this.processedIds.add(message.messageId);

    // Keep processed IDs bounded
    if (this.processedIds.size > 10000) {
      const arr = [...this.processedIds];
      this.processedIds = new Set(arr.slice(-5000));
    }

    // Find handler
    const handler = this.handlers.get(message.type);
    if (!handler) {
      const unknownResponse = createResponse(
        message,
        "error",
        {},
        `Unknown message type: ${message.type}`,
      );
      this.log(message, "error", startTime);
      return unknownResponse;
    }

    // Execute handler
    try {
      const response = await handler(message);
      this.log(message, response.status, startTime);
      return response;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Handler error";
      const errorResponse = createResponse(message, "error", {}, errMsg);
      this.log(message, "error", startTime);
      return errorResponse;
    }
  }

  /**
   * Get message log (last N entries).
   */
  getLog(limit = 50): ProtocolLogEntry[] {
    return this.messageLog.slice(-limit);
  }

  /**
   * Get supported command types.
   */
  getSupportedTypes(): ProtocolMessageType[] {
    return [...this.handlers.keys()];
  }

  private log(
    message: ProtocolMessage,
    status: "ok" | "error",
    startTime: number,
  ): void {
    const entry: ProtocolLogEntry = {
      messageId: message.messageId,
      direction: message.direction,
      type: message.type,
      status,
      timestamp: message.timestamp,
      roundTripMs: Date.now() - startTime,
      payloadSize: JSON.stringify(message.payload).length,
      sessionId: message.sessionId,
    };
    this.messageLog.push(entry);
    // Keep bounded
    if (this.messageLog.length > 500) {
      this.messageLog = this.messageLog.slice(-250);
    }
  }

  private registerDefaults(): void {
    this.register("PING", (msg) =>
      createResponse(msg, "ok", { pong: true, serverTime: Date.now() }),
    );

    this.register("PONG", (msg) =>
      createResponse(msg, "ok", { acknowledged: true }),
    );

    this.register("HELLO", (msg) => {
      const { pluginVersion, studioVersion, protocolVersion } = msg.payload;
      const compatible = protocolVersion === PROTOCOL_VERSION;
      return createResponse(
        msg,
        compatible ? "ok" : "error",
        {
          serverProtocol: PROTOCOL_VERSION,
          compatible,
          pluginVersion,
          studioVersion,
        },
        compatible
          ? undefined
          : `Incompatible protocol: expected ${PROTOCOL_VERSION}, got ${protocolVersion}`,
      );
    });

    this.register("READY", (msg) =>
      createResponse(msg, "ok", { ready: true, serverTime: Date.now() }),
    );

    this.register("STATUS", (msg) =>
      createResponse(msg, "ok", {
        status: "active",
        protocolVersion: PROTOCOL_VERSION,
        uptime: process.uptime(),
        supportedCommands: this.getSupportedTypes(),
      }),
    );
  }
}
