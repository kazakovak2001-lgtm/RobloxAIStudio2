/**
 * Studio Protocol — Defines the communication format between DevKit and Roblox Studio Plugin.
 */

import { randomUUID } from "crypto";

export const PROTOCOL_VERSION = "1.0.0";

export type MessageDirection = "client_to_server" | "server_to_client";

export type ProtocolMessageType =
  | "PING"
  | "PONG"
  | "HELLO"
  | "READY"
  | "STATUS"
  | "GET_PROJECT"
  | "GET_ARTIFACTS"
  | "VALIDATE"
  | "SYNC_REQUEST"
  | "SYNC_RESPONSE"
  | "COMMAND_ACK"
  | "COMMAND_RESULT"
  | "ERROR"
  | "UNKNOWN";

export interface ProtocolMessage {
  protocolVersion: string;
  messageId: string;
  sessionId: string;
  type: ProtocolMessageType;
  command: string;
  timestamp: number;
  direction: MessageDirection;
  payload: Record<string, unknown>;
}

export interface ProtocolResponse {
  protocolVersion: string;
  messageId: string;
  replyTo: string;
  sessionId: string;
  type: ProtocolMessageType;
  status: "ok" | "error";
  timestamp: number;
  payload: Record<string, unknown>;
  error?: string;
}

export interface PluginRegistration {
  pluginVersion: string;
  studioVersion: string;
  projectName: string;
  protocolVersion: string;
}

export interface ProtocolLogEntry {
  messageId: string;
  direction: MessageDirection;
  type: ProtocolMessageType;
  status: "ok" | "error" | "pending";
  timestamp: number;
  roundTripMs?: number;
  payloadSize: number;
  sessionId: string;
}

/**
 * Create a new protocol message.
 */
export function createMessage(
  sessionId: string,
  type: ProtocolMessageType,
  command: string,
  payload: Record<string, unknown>,
  direction: MessageDirection = "client_to_server",
): ProtocolMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: `msg-${randomUUID().slice(0, 12)}`,
    sessionId,
    type,
    command,
    timestamp: Date.now(),
    direction,
    payload,
  };
}

/**
 * Create a protocol response.
 */
export function createResponse(
  message: ProtocolMessage,
  status: "ok" | "error",
  payload: Record<string, unknown>,
  error?: string,
): ProtocolResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId: `res-${randomUUID().slice(0, 12)}`,
    replyTo: message.messageId,
    sessionId: message.sessionId,
    type: message.type,
    status,
    timestamp: Date.now(),
    payload,
    error,
  };
}
