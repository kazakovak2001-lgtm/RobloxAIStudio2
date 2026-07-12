# Roblox AI Studio Plugin — Alpha v1.7

Production-grade Roblox Studio Plugin for connecting to the AI Studio DevKit backend.

## Installation

1. Enable HTTP Requests: Game Settings → Security → Allow HTTP Requests
2. Place plugin files in Roblox Studio plugins folder
3. Ensure backend is running at `http://localhost:5000`
4. Click the "AI Studio" toolbar button

## Architecture

```
studio-plugin/src/
├── Config.lua            — Configuration constants
├── StudioConnector.lua   — Protocol-level HTTP communication
├── ConnectionManager.lua — Lifecycle (heartbeat, reconnect)
├── SyncManager.lua       — Project synchronization
├── ArtifactLoader.lua    — Instance creation from artifacts
├── CommandPanel.lua      — Plugin UI widget
└── ErrorReporter.lua     — Centralized error handling
```

## Message Protocol

Supported messages: HELLO, PING, PONG, STATUS, GET_PROJECT, GET_ARTIFACTS, SYNC_REQUEST, SYNC_RESPONSE, ERROR

All messages follow the format:

```json
{
  "protocolVersion": "1.0.0",
  "messageId": "msg-...",
  "sessionId": "...",
  "type": "HELLO|PING|...",
  "command": "...",
  "timestamp": 1234567890,
  "direction": "client_to_server",
  "payload": {}
}
```

## Connection Flow

1. `POST /api/studio/connect` → receives clientId + sessionId
2. Send `HELLO` message with plugin/protocol version
3. Start heartbeat (every 15s)
4. On heartbeat failure → auto-reconnect (exponential backoff, max 5 attempts)

## Sync Flow

1. Send `GET_PROJECT` → receive artifact manifest
2. Send `GET_ARTIFACTS` with IDs → receive content
3. ArtifactLoader creates Roblox Instances in correct services
