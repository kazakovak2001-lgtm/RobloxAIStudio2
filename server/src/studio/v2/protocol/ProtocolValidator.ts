/**
 * ProtocolValidator — Validates incoming protocol messages.
 */

import {
  PROTOCOL_VERSION,
  type ProtocolMessage,
  type ProtocolMessageType,
} from "./StudioProtocol";

const VALID_TYPES: ProtocolMessageType[] = [
  "PING",
  "PONG",
  "HELLO",
  "READY",
  "STATUS",
  "GET_PROJECT",
  "GET_ARTIFACTS",
  "VALIDATE",
  "SYNC_REQUEST",
  "SYNC_RESPONSE",
  "ERROR",
  "UNKNOWN",
];

const MAX_PAYLOAD_SIZE = 1_048_576; // 1MB
const MESSAGE_TIMEOUT_MS = 30_000; // 30s

export class ProtocolValidator {
  /**
   * Validate a protocol message. Returns error string or null if valid.
   */
  validate(message: ProtocolMessage): string | null {
    // Required fields
    if (!message.protocolVersion) {
      return "Missing protocolVersion";
    }
    if (!message.messageId) {
      return "Missing messageId";
    }
    if (!message.sessionId) {
      return "Missing sessionId";
    }
    if (!message.type) {
      return "Missing type";
    }
    if (!message.timestamp || typeof message.timestamp !== "number") {
      return "Missing or invalid timestamp";
    }

    // Protocol version compatibility
    const [major] = message.protocolVersion.split(".");
    const [expectedMajor] = PROTOCOL_VERSION.split(".");
    if (major !== expectedMajor) {
      return `Incompatible protocol major version: ${message.protocolVersion} (expected ${PROTOCOL_VERSION})`;
    }

    // Valid message type
    if (!VALID_TYPES.includes(message.type)) {
      return `Unknown message type: ${message.type}`;
    }

    // Timestamp freshness (reject messages older than 30s)
    const age = Date.now() - message.timestamp;
    if (age > MESSAGE_TIMEOUT_MS) {
      return `Message expired (age: ${Math.round(age / 1000)}s, max: ${MESSAGE_TIMEOUT_MS / 1000}s)`;
    }

    // Payload size
    if (message.payload) {
      const size = JSON.stringify(message.payload).length;
      if (size > MAX_PAYLOAD_SIZE) {
        return `Payload too large: ${size} bytes (max: ${MAX_PAYLOAD_SIZE})`;
      }
    }

    return null;
  }

  /**
   * Validate a plugin registration payload.
   */
  validateRegistration(payload: Record<string, unknown>): string | null {
    if (!payload.pluginVersion || typeof payload.pluginVersion !== "string") {
      return "Missing pluginVersion";
    }
    if (!payload.studioVersion || typeof payload.studioVersion !== "string") {
      return "Missing studioVersion";
    }
    if (
      !payload.protocolVersion ||
      typeof payload.protocolVersion !== "string"
    ) {
      return "Missing protocolVersion";
    }

    const [major] = (payload.protocolVersion as string).split(".");
    const [expectedMajor] = PROTOCOL_VERSION.split(".");
    if (major !== expectedMajor) {
      return `Incompatible protocol: ${payload.protocolVersion}`;
    }

    return null;
  }
}
