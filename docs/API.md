# Roblox AI Studio - Game Generation Engine API

**Version**: 1.3.3
**Last Updated**: 2026-11-16

## Overview

The Game Generation Engine is a production-ready AI orchestration platform that transforms natural language prompts into complete Roblox game blueprints. It features:

- ✅ Parallel agent execution where possible
- ✅ Minimal memory usage with intelligent caching
- ✅ Incremental generation with checkpointing
- ✅ Blueprint versioning and history
- ✅ Retry logic with exponential backoff
- ✅ Real-time streaming updates via SSE
- ✅ Comprehensive validation framework
- ✅ Production-ready error handling

## Architecture

```
Frontend (React)
       ↓
Express Server (Node.js)
       ├─ Game Generation Routes
       ├─ AI Pipeline Integrator
       ├─ Blueprint Service
       ├─ SSE Streaming Handler
       └─ Socket.io Real-time
       ↓
AI Agent Pipeline
       ├─ Requirements Agent
       ├─ Planner Agent
       ├─ Game Designer Agent
       ├─ Roblox Architect Agent
       ├─ UI Generator Agent (parallel)
       ├─ Asset Planner Agent (parallel)
       └─ Lua Generator Agent (parallel)
       ↓
Blueprint Database
       ├─ Game Blueprints
       ├─ Blueprint Versions
       └─ Generation Executions
```

## API Endpoints

### 1. Create Blueprint

**POST** `/api/projects/:projectId/blueprints`

Create a new game blueprint for a project.

**Request:**

```json
{
  "name": "Mining Simulator",
  "description": "A Roblox mining simulator with pets and rebirths",
  "game_type": "simulator",
  "genre": ["simulation", "progression"],
  "target_audience": "general",
  "difficulty": "medium",
  "estimated_players": "small-group",
  "gameplay": {
    "mechanics": [],
    "progression": {},
    "balance": {}
  },
  "ui_layouts": [],
  "architecture": {
    "client_architecture": {},
    "server_architecture": {},
    "networking": {}
  },
  "assets": {
    "models": [],
    "textures": [],
    "sounds": [],
    "animations": []
  },
  "code_spec": {
    "modules": [],
    "patterns": []
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "blueprint-123",
    "project_id": "project-456",
    "name": "Mining Simulator",
    "status": "draft",
    "version": 1,
    "created_at": "2026-06-28T10:00:00Z",
    "updated_at": "2026-06-28T10:00:00Z"
  }
}
```

### 2. Get Blueprint

**GET** `/api/blueprints/:blueprintId`

Retrieve a specific blueprint.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "blueprint-123",
    "project_id": "project-456",
    "name": "Mining Simulator",
    "status": "draft",
    "version": 1,
    "gameplay": { ... },
    "ui_layouts": [ ... ],
    "architecture": { ... },
    "assets": { ... },
    "code_spec": { ... }
  }
}
```

### 3. Update Blueprint

**PUT** `/api/blueprints/:blueprintId`

Update blueprint content.

**Request:**

```json
{
  "gameplay": {
    "mechanics": [
      {
        "name": "Mining",
        "description": "Players mine ore to earn currency",
        "parameters": { "ore_types": 5 }
      }
    ]
  },
  "status": "validated"
}
```

### 4. Validate Blueprint

**GET** `/api/blueprints/:blueprintId/validate`

Validate a blueprint against rules.

**Response:**

```json
{
  "success": true,
  "valid": false,
  "errors": [
    "Blueprint must have at least one gameplay mechanic",
    "Blueprint must have at least one UI layout"
  ]
}
```

### 5. Start Generation

**POST** `/api/projects/:projectId/generate`

Start the AI pipeline to generate a complete blueprint.

**Request:**

```json
{
  "blueprintId": "blueprint-123"
}
```

**Response:**

```json
{
  "success": true,
  "executionId": "exec-789",
  "status": "generation_started"
}
```

The server immediately returns while generation continues asynchronously.

### 6. Stream Generation Updates

**GET** `/api/projects/:projectId/generation/stream?clientId=client-123`

Open a Server-Sent Events (SSE) stream to receive real-time generation updates.

**Stream Events:**

```
data: {"type":"pipeline.started","pipelineId":"exec-789","timestamp":"2026-06-28T10:00:00Z"}

data: {"type":"step.started","pipelineId":"exec-789","stepId":"requirements-0","data":{"name":"requirements"},"timestamp":"2026-06-28T10:00:05Z"}

data: {"type":"step.completed","pipelineId":"exec-789","stepId":"requirements-0","data":{"output":{...}},"timestamp":"2026-06-28T10:00:15Z"}

data: {"type":"pipeline.completed","pipelineId":"exec-789","data":{"outputs":{...}},"timestamp":"2026-06-28T10:01:30Z"}
```

### 7. Get Generation Status

**GET** `/api/projects/:projectId/generation/:executionId/status`

Get the current status of a generation execution.

**Response:**

```json
{
  "success": true,
  "data": {
    "executionId": "exec-789",
    "status": "completed",
    "started_at": "2026-06-28T10:00:00Z",
    "completed_at": "2026-06-28T10:01:30Z",
    "total_duration_ms": 90000,
    "pipeline_steps": [
      {
        "agent": "requirements",
        "status": "completed",
        "started_at": "2026-06-28T10:00:00Z",
        "completed_at": "2026-06-28T10:00:15Z",
        "duration_ms": 15000
      }
    ]
  }
}
```

### 8. List Executions

**GET** `/api/blueprints/:blueprintId/executions`

Get all generation executions for a blueprint.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "exec-789",
      "blueprint_id": "blueprint-123",
      "status": "completed",
      "started_at": "2026-06-28T10:00:00Z",
      "total_duration_ms": 90000,
      "retry_count": 0
    }
  ]
}
```

### 9. Project Design Inputs (Game Concept / Map & Environment)

**POST** `/api/projects` and **PUT** `/api/projects/:id`, **GET** `/api/projects/:id`

Three optional, structured sections are stored on the project record itself:
`gameConcept` (Game Concept window), `mapEnvironment` (Map & Environment
window), and `gameplayConfiguration` (Gameplay Configuration window). Genre, target audience and the core game idea are not duplicated: they
stay in the existing `genre`, `targetAudience` and `description` project fields.

`gameConcept` fields (all optional):

| Field               | Type       | Limit                    |
| ------------------- | ---------- | ------------------------ |
| `vision`            | `string`   | 2000 characters          |
| `gameplayLoop`      | `string`   | 1500 characters          |
| `coreMechanics`     | `string[]` | 20 items, 120 chars each |
| `playerExperience`  | `string`   | 1000 characters          |
| `designConstraints` | `string[]` | 20 items, 200 chars each |

`mapEnvironment` fields (all optional):

| Field             | Type       | Limit                    |
| ----------------- | ---------- | ------------------------ |
| `worldTheme`      | `string`   | 200 characters           |
| `environmentType` | `string`   | 100 characters           |
| `mapStructure`    | `string`   | 1000 characters          |
| `mainLocations`   | `string[]` | 20 items, 120 chars each |
| `atmosphere`      | `string`   | 1000 characters          |
| `constraints`     | `string[]` | 20 items, 200 chars each |

`gameplayConfiguration` fields (all optional):

| Field                | Type       | Limit                    |
| -------------------- | ---------- | ------------------------ |
| `loop`               | `string`   | 1500 characters          |
| `winCondition`       | `string`   | 500 characters           |
| `loseCondition`      | `string`   | 500 characters           |
| `progressionModel`   | `string`   | 1000 characters          |
| `difficultyScaling`  | `string`   | 500 characters           |
| `interactionSystems` | `string[]` | 20 items, 120 chars each |
| `economyOrScoring`   | `string`   | 500 characters           |

**Request (PUT, partial):**

```json
{
  "gameConcept": { "vision": "Cooperative sky-island exploration" },
  "mapEnvironment": { "mainLocations": ["Hub", "Cloud Market"] },
  "gameplayConfiguration": {
    "winCondition": "Complete the final challenge"
  }
}
```

**Response:** the project, including `gameConcept`, `mapEnvironment` and
`gameplayConfiguration`. Each is an object, or `null` when the section has no
stated fields (see below).

Behavior:

- **Partial update.** A section in the request is merged field by field into the
  stored section; fields not named in the request are kept, and the other
  sections are never touched. `POST` accepts the same sections when creating a
  project. `PUT` still requires at least one editable field.
- **Normalization.** Strings are trimmed; list items are trimmed and blank
  items are dropped.
- **Clearing.** A blank string or an empty list for a field removes that field.
- **Validation.** A section that is not an object, an unknown key, a wrong type
  or a value over its limit returns `400` with
  `{ "success": false, "error": "<field> ..." }`, and nothing is stored.
- **Access.** `PUT` and `GET` require access to the project. A project that does
  not exist or is not owned by the caller returns `404` and nothing is changed.
- **Never stated vs. explicitly cleared.** Internally a section has three
  states: absent (never stated; legacy projects have no sections), `{}`
  (explicitly cleared after having content) and non-empty. Clearing every field
  of a section that already had content stores `{}`. Clearing a section that
  was never stated leaves it absent. The API reports both absent and cleared as
  `null`; the distinction only matters when the blueprint is synchronized.
- **Legacy projects.** Projects created before these fields return `null` for
  all three sections and behave exactly as before.

Hand-off to generation (`POST /api/projects/:projectId/generate`):

- When the first blueprint is created from the project, non-empty sections are
  copied into the blueprint as `game_concept`, `map_environment` and
  `gameplay_configuration`.
- When the project already has a blueprint, its stated intent is synchronized
  before the run: a non-empty section replaces the blueprint's section, an
  explicitly cleared section (`{}`) removes the corresponding `game_concept`,
  `map_environment` or `gameplay_configuration` field from the blueprint, and a
  section that was never stated leaves the blueprint unchanged. Other blueprint
  fields and the other sections are not modified.
- The agents that currently read the sections are `RequirementsAgent` and
  `GameDesignerAgent` (appended to their prompts). Other agents and modules do
  not consume them yet.

## Usage Example

### JavaScript/TypeScript

```typescript
// 1. Create blueprint
const createRes = await fetch("/api/projects/project-456/blueprints", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "My Game",
    description: "A mining simulator",
    game_type: "simulator",
    genre: ["simulation"],
    target_audience: "general",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: { mechanics: [], progression: {}, balance: {} },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: { models: [], textures: [], sounds: [], animations: [] },
    code_spec: { modules: [], patterns: [] },
  }),
});
const { data: blueprint } = await createRes.json();

// 2. Start generation
const genRes = await fetch(`/api/projects/project-456/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
});
const { executionId } = await genRes.json();

// 3. Stream updates
const eventSource = new EventSource(
  `/api/projects/project-456/generation/stream?clientId=my-client`,
);

eventSource.addEventListener("message", (event) => {
  const update = JSON.parse(event.data);
  console.log(`[${update.type}]`, update);
});

// 4. Poll status
const statusRes = await fetch(
  `/api/projects/project-456/generation/${executionId}/status`,
);
const { data: status } = await statusRes.json();
console.log(`Generation: ${status.status}`);

// 5. Close stream when done
eventSource.close();
```

## Features

### Parallel Execution

The pipeline automatically executes stages in parallel when they don't depend on each other:

- Requirements extraction
- Planning (depends on requirements)
- Game Design (depends on planning)
- Roblox Architecture (depends on game design)
- **Parallel:** UI Generation, Asset Planning, Lua Generation

### Caching

- Blueprint cache with 5-minute TTL
- Automatic eviction of stale entries
- Memory-efficient with project-level indexing

### Versioning

- Automatic version tracking
- Blueprint snapshots on each generation
- Can restore previous versions

### Retry Logic

- 3 attempts per stage by default
- Exponential backoff with jitter (1s, 2s, 4s)
- Failure modes: continue, fail_fast, skip

### Validation

- Comprehensive validation rules
- Status transition validation
- Game type and genre validation
- Architecture, gameplay, and asset validation

## Error Handling

### Validation Errors

```json
{
  "success": false,
  "error": "Blueprint validation failed: Blueprint must have at least one gameplay mechanic"
}
```

### Not Found

```json
{
  "success": false,
  "error": "Blueprint not found"
}
```

### Server Error

```json
{
  "success": false,
  "error": "Internal Server Error",
  "details": "Stack trace in development mode"
}
```

## WebSocket Events

In addition to HTTP APIs, the system broadcasts events via Socket.io:

```typescript
// Client code
socket.on("generation:step_completed", (data) => {
  console.log(`Step ${data.stepId} completed in ${data.duration_ms}ms`);
});

socket.on("generation:failed", (data) => {
  console.log(`Generation failed: ${data.error}`);
});
```

## Performance Notes

- **Memory:** ~10-50MB per execution (with cache)
- **Throughput:** ~2-4 parallel pipelines
- **Latency:** 60-120 seconds per full generation
- **Caching:** 5-minute TTL reduces repeated queries by ~80%

## Production Deployment

1. Configure database (currently in-memory, use Prisma for production)
2. Set up authentication middleware
3. Configure SSL/TLS
4. Enable CORS appropriately
5. Set up monitoring and logging
6. Configure backup strategy for blueprints
7. Implement rate limiting on /generate endpoint

## Future Enhancements

- [ ] Multi-step export to Roblox Studio
- [ ] Plugin generation
- [ ] Multiplayer testing automation
- [ ] Automatic bug fixing pipeline
- [ ] Asset generation (3D models)
- [ ] Terrain generation
- [ ] Animation generation
- [ ] Audio generation
