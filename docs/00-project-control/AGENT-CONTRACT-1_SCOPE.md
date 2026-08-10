<!-- prettier-ignore-start -->

# AGENT-CONTRACT-1 — Versioned Agent Definitions

**Status:** ✅ Complete — backend PR #212 merged `ddfa10453d9e2f48bc9e57045d40a8792d3cc297`. Contract tested; backend-only, so no Roblox Studio evidence is required or claimed.
**Depends on:** `PIPELINE-1A` (the pipeline as validated data), `PROVIDER-1B` (fallback provenance).

## Objective

Give every runtime agent one authoritative, versioned, server-owned definition, so the platform stops relying on undocumented knowledge about what an agent produces, whether it may fall back, and how hard it retries.

## Audit findings

### Agent architecture as found

`AgentRegistry` constructs 16 agents in its constructor and keys them by string. `executeAgent` resolved a name, ran it, and mapped the result; an unknown name returned `{ _skipped: true }`. Nothing anywhere stated what any agent produces.

| Classification | Agents |
|---|---|
| **Canonical runtime** (named by the pipeline, run on every generation) | `requirements`, `planner`, `game_designer`, `roblox_architect`, `lua_generator`, `ui_generator`, `asset_planner`, `orchestrator` |
| **Registered but unreachable** (callable, no pipeline node references them) | `tester`, `performance`, `documentation`, `database_designer`, `debugger` |
| **Development tooling** (reviews this repository, never a game) | `architecture_controller`, `code_review_controller`, `duplication_detector` |
| **Parallel / dead** (not built on) | `providers/ai/**` and `ai/router.ts` (zero importers), `agents/orchestrator/**` (only `PlatformIntegrationManager`), `PlanningRegistry` |

`AgentDecisionEngine` **is** on the canonical path — `PlanExecutor` constructs it and calls `selectAgent` before every node — but its substitution is inert in practice: the generation path passes `maxRetries: 1`, so `requestFallback` never runs, and `selectAgent` preserves the planner's assignment unless the same task type already has evidence for the assigned agent. This slice builds nothing on it, and adds no substitution.

### Execution policy as found

- `BaseAgent.maxRetries` — **real**, drives the `execute` loop. It defaults to 3, but is a constructor option and `LuaGeneratorAgent` lowers itself to 1, so the default is not the contract.
- `BaseAgent.timeout = 30000` — **assigned and never read**. No timeout is enforced anywhere on the agent path.
- `PlanExecutor` has its own node-level `maxRetries`, default 1 — a second, unrelated retry dimension.
- Per-agent `maxTokens` at each `generateWithRetry` call site — **real**, passed to the provider.

### Output contracts as found

Every agent declares an `outputSchema` that nothing validates, and passes a `requiredKeys` list to `generateWithRetry` that is genuinely enforced by the parser. `lua_generator` alone is checked again afterwards, by `assertPlayableLuaScripts`, which can reject content the parser accepted.

### Cost accounting as found

`estimateCost(model, totalTokens)` exists in `providerFactory` and is **never called** on the generation path; token usage is not captured. Monetary cost is therefore unmeasurable today.

## The contract

`server/src/agents/contract/agentContract.ts`. Pure, versioned, and deliberately small:

```
AgentDefinition {
  id, version, title
  capabilities[]        // 14 general capabilities, no genre names
  reachability          // pipeline | registered-only | development-tool
  output  { class, requiredKeys[], validatedBy? }
  execution { maxAttempts, maxOutputTokens }
  model { requiresModel, fallback }
}
```

**Every field is consulted by something.** `requiresModel` and `fallback` are enforced in `AgentRegistry.executeAgent`; `reachability` is enforced by pipeline validation; `maxOutputTokens` is the ceiling passed to the provider call that already exists; `maxAttempts` is reconciled against `AgentRegistry.attemptCeilings()`, the ceiling each constructed agent actually loops, so an agent that overrides the default cannot leave its definition claiming attempts the runtime never makes; `output` is asserted against the real parser call sites.

`validateAgentDefinitions(definitions, registeredIds, attemptsById)` runs outside the test suite: `npm run validate` invokes [validate-agent-contract.ts](../../scripts/validate-agent-contract.ts), which fails on a definition with no implementation, an implementation with no definition, or any declared attempt count the implementation does not loop.

### Deliberately absent

| Dimension | Why not |
|---|---|
| Wall-clock timeout | `BaseAgent.timeout` is assigned and never read. A contract field would imply a guarantee the runtime does not make. |
| Monetary cost ceiling | Token usage is not captured and `estimateCost` is never called. Recorded as unsupported rather than invented. |
| Input token ceiling | Not measured. |
| Per-agent provider or model | One provider is wired process-wide by `setLLM`. A per-agent `allowedProviders` could not be enforced, so it is a documented gap rather than a field. |

## Versioning

`id` is stable identity; `version` is an integer bumped when capabilities, output contract, execution or model policy change. **A class name is not a version** — renaming `PlannerAgent` changes nothing, changing what it must return changes everything.

Provenance lands on `pipeline_steps[].agent_version`, recorded at commit time for every step whose agent ran. A node blocked by an upstream failure records none, because no definition governed work that never started. Steps written before this slice carry no version; their definition is genuinely unknown and must not be assumed to be the current one. Nothing rewrites historical rows.

## Server ownership

Definitions live in server code. Clients already may only *narrow* the pipeline (PIPELINE-1A), and cannot name an agent outside it. They cannot invent an agent, expand a budget, choose a model, or change fallback policy, because none of those are request-shaped inputs anywhere.

## Registry ownership

One registry, not three. `AgentRegistry` remains the only thing that constructs agents; the contract is the only thing that describes them; `validateAgentDefinitions` reconciles the two and fails on either direction of mismatch. `PlanningRegistry` is untouched dead code and is not reconciled here — that would be unrelated cleanup.

## Known gaps

- Per-agent provider and model selection is not expressible, because the provider is process-wide.
- The hardcoded `llama3` auto-detect default is untouched; it does not block this contract.
- `AgentDecisionEngine` may still, in principle, substitute an agent whose definition differs from the planned node's. It cannot today (see above), and constraining it belongs to orchestration work.
- `outputSchema` on each agent class is now redundant with the definition; leaving both is duplication, and removing it is unrelated cleanup.

## Out of scope

Dynamic orchestration, conditional branching, automatic substitution, new agents, model routing, cost optimisation, provider benchmarking, `WORLD-1C`, `SECURITY-REVIEW-B`, the wider artifact envelope, and registry cleanup beyond the reconciliation above.

<!-- prettier-ignore-end -->
