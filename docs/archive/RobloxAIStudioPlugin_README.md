# Roblox AI Studio Plugin

Client plugin for Roblox Studio that connects to the Roblox AI Studio DevKit backend.

## Installation

1. Copy the `plugin.lua` file into your Roblox Studio plugins folder:
   - Windows: `%LOCALAPPDATA%/Roblox/Plugins/`
   - Or install via Roblox Plugin marketplace (future)

2. Configure the backend URL in `plugin.lua`:

   ```lua
   local BACKEND_URL = "http://localhost:5000"
   ```

3. Restart Roblox Studio. The "Roblox AI Studio" toolbar button will appear.

## Features

- Connect to AI Studio backend
- Heartbeat keep-alive (15s interval)
- Sync generated Lua scripts into workspace
- Receive project artifacts
- Session management with auto-reconnect

## API Compatibility

Requires Roblox AI Studio DevKit backend v1.6+ running at the configured URL.

### Endpoints Used

- `POST /api/studio/connect`
- `POST /api/studio/heartbeat`
- `POST /api/studio/disconnect`
- `GET /api/studio/status`
- `POST /api/studio/sync/project`
- `POST /api/studio/sync/artifacts`

## Security

- API key authentication (configured in plugin settings)
- Session tokens for each connection
- All requests include `X-Studio-Session` header

## Structure

```
RobloxAIStudioPlugin/
├── plugin.lua          — Entry point (toolbar, lifecycle)
├── src/
│   ├── ApiClient.lua       — HTTP communication layer
│   ├── ConnectionManager.lua — Connection lifecycle
│   ├── SyncManager.lua     — Project synchronization
│   ├── UI.lua              — Plugin widget UI
│   └── Events.lua          — Event handling
└── README.md
```
