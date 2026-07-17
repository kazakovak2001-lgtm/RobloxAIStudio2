# Quick Reference - Roblox AI Studio Game Generation Engine

## Getting Started

### 1. Install & Build

```bash
npm install
npm run build  # Verify everything compiles
```

### 2. Start Backend Server

```bash
npm run dev:server  # Runs on port 5000
```

### 3. Create a Blueprint

```bash
curl -X POST http://localhost:5000/api/projects/project-123/blueprints \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Game",
    "description": "A mining simulator",
    "game_type": "simulator",
    "genre": ["simulation"],
    "target_audience": "general",
    "difficulty": "medium",
    "estimated_players": "small-group",
    "gameplay": {"mechanics": [], "progression": {}, "balance": {}},
    "ui_layouts": [],
    "architecture": {"client_architecture": {}, "server_architecture": {}, "networking": {}},
    "assets": {"models": [], "textures": [], "sounds": [], "animations": []},
    "code_spec": {"modules": [], "patterns": []}
  }'
```

### 4. Start Generation

```bash
curl -X POST http://localhost:5000/api/projects/project-123/generate \
  -H "Content-Type: application/json"
```

### 5. Stream Updates

```javascript
// In browser console
const eventSource = new EventSource(
  "http://localhost:5000/api/projects/project-123/generation/stream?clientId=my-client",
);
eventSource.addEventListener("message", (e) => {
  console.log("Update:", JSON.parse(e.data));
});
```

## Core Components

### 1. GameBlueprint

The complete game design model that contains:

- Requirements (functional, non-functional)
- Gameplay (mechanics, progression, balance)
- UI Layouts (HUD, menus, dialogs)
- Architecture (client, server, networking)
- Assets (models, textures, sounds, animations)
- Code Spec (modules, patterns, standards)

```typescript
import { GameBlueprint } from "./types/blueprint";

const blueprint: GameBlueprint = {
  id: "bp-123",
  project_id: "proj-456",
  name: "My Game",
  // ... other fields
};
```

### 2. GameGenerationService

Main service orchestrating the generation pipeline.

```typescript
import { GameGenerationService } from "./projects/services/game-generation.service";
import { InMemoryBlueprintRepository } from "./projects/repository/blueprint.repository";

const service = new GameGenerationService(new InMemoryBlueprintRepository());

// Create blueprint
const blueprint = await service.createBlueprint(userId, projectId, input);

// Start generation
const execution = await service.startGeneration(blueprint.id, userId);

// Get status
const exec = await service.getExecution(execution.id);
```

### 3. AIPipelineIntegrator

Orchestrates the 7-stage pipeline execution.

```typescript
import { AIPipelineIntegrator } from "./execution/aiPipelineIntegrator";

const integrator = new AIPipelineIntegrator(eventEmitter);

// Execute pipeline
const outputs = await integrator.executePipeline(
  blueprint,
  agentExecutor, // (agent, input) => Promise<output>
  executionId,
  "hybrid", // sequential, parallel, or hybrid
);
```

### 4. IncrementalGenerator

Supports resumable generation with checkpoints.

```typescript
import { IncrementalGenerator } from "./execution/incrementalGenerator";

const generator = new IncrementalGenerator(eventEmitter);

// Generate with checkpoint support
const result = await generator.generateIncremental(
  blueprint,
  agentExecutor,
  executionId,
  "hybrid",
);

// Resume from checkpoint
const resumed = await generator.resumeFromCheckpoint(
  blueprint,
  agentExecutor,
  executionId,
  "hybrid",
);
```

### 5. BlueprintValidator

Validates blueprints against comprehensive rules.

```typescript
import { BlueprintValidator } from "./projects/services/blueprint.validator";

const validator = new BlueprintValidator();

// Validate
const validation = validator.validate(blueprint);
if (!validation.valid) {
  console.log("Errors:", validation.errors);
}

// Validate for generation
const genValidation = validator.validateForGeneration(blueprint);

// Validate for export
const exportValidation = validator.validateForExport(blueprint);
```

### 6. BlueprintCache

In-memory cache for fast blueprint access.

```typescript
import { BlueprintCache } from "./projects/cache/blueprint.cache";

const cache = new BlueprintCache(5 * 60 * 1000); // 5-minute TTL

// Set
cache.set(blueprint);

// Get by ID
const bp = cache.get(blueprintId);

// Get by project
const bp2 = cache.getByProjectId(projectId);

// Invalidate
cache.invalidate(blueprintId);

// Get stats
console.log(cache.getStats());
```

### 7. StreamingUpdateHandler

Streams real-time updates via Server-Sent Events.

```typescript
import { StreamingUpdateHandler } from './socket/streaming';

const streamHandler = new StreamingUpdateHandler();

// Register client
app.get('/stream', (req, res) => {
  streamHandler.registerClient(req.query.clientId, res);
});

// Send event to all clients
streamHandler.broadcastEvent({
  type: 'pipeline.completed',
  pipelineId: 'exec-123',
  data: { outputs: {...} },
  timestamp: new Date()
});
```

## Common Tasks

### Task: Create and Generate a Blueprint

```typescript
// 1. Create blueprint
const blueprint = await gameGenService.createBlueprint(userId, projectId, {
  name: "Mining Simulator",
  description: "A game where players mine ore",
  game_type: "simulator",
  genre: ["simulation", "progression"],
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
});

// 2. Validate
const validation = gameGenService.validateBlueprint(blueprint);
if (!validation.valid) {
  throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
}

// 3. Start generation
const execution = await gameGenService.startGeneration(blueprint.id, userId);

// 4. Execute pipeline (in background)
const result = await generator.generateIncremental(
  blueprint,
  async (agent, input) => {
    // Call actual AI agent here
    return await orchestrator.runAgent(agent, input);
  },
  execution.id,
  "hybrid",
);

// 5. Update blueprint with results
const assembled = await gameGenService.updateBlueprint(
  blueprint.id,
  result.blueprint,
);

// 6. Complete generation
await gameGenService.completeGeneration(execution.id, true);
```

### Task: Resume Failed Generation

```typescript
// Get checkpoint
const checkpoint = generator.getCheckpoint(executionId);

if (checkpoint) {
  // Resume from where it failed
  const result = await generator.resumeFromCheckpoint(
    blueprint,
    agentExecutor,
    executionId,
    "hybrid",
  );

  // Update blueprint
  await gameGenService.updateBlueprint(blueprint.id, result.blueprint);
  await gameGenService.completeGeneration(executionId, true);
}
```

### Task: Export Blueprint

```typescript
// Get blueprint
const blueprint = await gameGenService.getBlueprint(blueprintId);

// Check status
if (blueprint.status !== "ready_for_export") {
  throw new Error("Blueprint not ready for export");
}

// Export to JSON
const json = JSON.stringify(blueprint, null, 2);

// Or export to Roblox format (future enhancement)
const robloxProject = await exportToRobloxStudio(blueprint);
```

### Task: Query Generation History

```typescript
// Get all executions for a blueprint
const executions = await gameGenService.getExecutions(blueprintId);

executions.forEach((exec) => {
  console.log(`Execution: ${exec.id}`);
  console.log(`Status: ${exec.status}`);
  console.log(`Duration: ${exec.total_duration_ms}ms`);
  console.log(`Retry count: ${exec.retry_count}`);
});
```

### Task: Monitor Cache Performance

```typescript
const stats = gameGenService.getCacheStats();
console.log(`Cache size: ${stats.size} blueprints`);
console.log(`Project mappings: ${stats.projectMappings}`);
```

## API Response Examples

### Successful Blueprint Creation

```json
{
  "success": true,
  "data": {
    "id": "bp-e7a2f9c",
    "project_id": "proj-456",
    "user_id": "user-789",
    "name": "Mining Simulator",
    "status": "draft",
    "version": 1,
    "created_at": "2026-06-28T10:00:00Z",
    "updated_at": "2026-06-28T10:00:00Z"
  }
}
```

### Generation Execution

```json
{
  "success": true,
  "executionId": "exec-e7a2f9c",
  "status": "generation_started"
}
```

### Generation Status

```json
{
  "success": true,
  "data": {
    "executionId": "exec-e7a2f9c",
    "status": "completed",
    "started_at": "2026-06-28T10:00:00Z",
    "completed_at": "2026-06-28T10:01:30Z",
    "total_duration_ms": 90000,
    "pipeline_steps": [
      {
        "agent": "requirements",
        "status": "completed",
        "duration_ms": 15000
      },
      {
        "agent": "planner",
        "status": "completed",
        "duration_ms": 20000
      }
    ]
  }
}
```

### SSE Stream Event

```
data: {"type":"pipeline.started","pipelineId":"exec-e7a2f9c","timestamp":"2026-06-28T10:00:00Z"}

data: {"type":"step.started","pipelineId":"exec-e7a2f9c","stepId":"requirements-0","data":{"name":"requirements"},"timestamp":"2026-06-28T10:00:01Z"}

data: {"type":"step.completed","pipelineId":"exec-e7a2f9c","stepId":"requirements-0","data":{"output":{...}},"timestamp":"2026-06-28T10:00:16Z"}
```

## Debugging

### Enable Logging

```typescript
// Add to event emitter
eventEmitter.onEvent(async (event) => {
  console.log(`[${event.type}] ${event.pipelineId} - ${event.stepId}`);
  if (event.data) {
    console.log("Data:", event.data);
  }
});
```

### Check Cache Stats

```bash
curl http://localhost:5000/api/system/cache-stats
```

### Get Execution Details

```bash
curl http://localhost:5000/api/projects/:projectId/generation/:executionId/status
```

### Validate Blueprint

```bash
curl http://localhost:5000/api/blueprints/:blueprintId/validate
```

## Performance Tips

1. **Use Hybrid Execution Mode** - Best balance of speed and resource usage
2. **Enable Caching** - Reduces repeated queries by ~80%
3. **Use Checkpoints** - Enables recovery from failures
4. **Cleanup Old Checkpoints** - Call `generator.cleanupOldCheckpoints()` regularly
5. **Monitor Memory** - Watch cache size with `cache.getStats()`

## Troubleshooting

### "Blueprint validation failed"

- Check all required fields are present
- Verify game_type is valid
- Ensure at least one genre is specified

### "Generation timeout"

- Increase timeout in PipelineStep
- Check AI provider health
- Verify network connectivity

### "Out of memory"

- Reduce cache TTL
- Increase cleanup frequency
- Use smaller batch sizes

### "Generation never completes"

- Check for infinite loops in agents
- Verify all agents return successfully
- Monitor event emitter for stuck events

## Documentation References

- **Full API Docs:** `docs/API.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md`

## Next Steps

1. Configure database (Prisma)
2. Add authentication middleware
3. Setup monitoring
4. Deploy to production
5. Implement Lua code generation
6. Add Roblox Studio export
