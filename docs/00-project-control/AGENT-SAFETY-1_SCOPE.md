<!-- prettier-ignore-start -->

# AGENT-SAFETY-1 — Observe / Plan / Propose / Execute

**Status:** ✅ Complete — backend PR #221. Backend-only; no Roblox Studio evidence is required or claimed.
**Depends on:** `AGENT-CONTRACT-1` (versioned definitions), `PIPELINE-1A` (server-owned pipeline).
**First implementation slice** taken from the `ROADMAP-EXTENSION-1` set, chosen because its prerequisite was already complete and it governs every other extension.

## Audit findings

### What authority an agent actually holds

Read from the implementations, not assumed.

**No agent can cause a durable side effect.** Agents are pure input to output. Nothing under `server/src/agents/**` imports the artifact store, a storage provider, the Studio runtime or the database. The recorder, the executor and the services decide what is persisted or delivered. `ArchitectureControllerAgent` and `DuplicationDetectionAgent` read this repository's own structure and report; they mutate nothing.

The platform was therefore already operating at `propose` throughout, without saying so. This slice names it.

### The one real escalation path

`OrchestratorAgent` holds a registry reference through `setRegistry`, and in coordination mode runs:

```ts
const pipeline = input.pipeline as AgentType[];
for (const agentType of pipeline) { await this.registry.executeAgent(agentType, currentInput); }
```

**The agents to run come straight from the agent's own input, unvalidated.** Whoever shapes that input chose which agents ran. `PIPELINE-1A` made the *generation* pipeline server-owned and validated; this was the remaining path where the set of agents to run was taken on trust.

Concretely reachable through it: the three development-tooling agents, which analyse *this repository* rather than a generated game.

## The model

`AgentDefinition` gains `authority { tier, mayDelegate }`.

| Tier | Meaning | Agents |
|---|---|---|
| `observe` | Reads state and reports; produces no candidate content | `tester`, `performance`, `documentation`, `debugger`, `architecture_controller`, `code_review_controller`, `duplication_detector` |
| `plan` | Describes work to be done | `requirements`, `planner`, `database_designer` |
| `propose` | Produces candidate content the platform may persist after validation | `game_designer`, `roblox_architect`, `lua_generator`, `ui_generator`, `asset_planner`, `orchestrator` |
| `execute` | May cause a durable side effect directly | **none** |

### Every definition version moved to 2

`authority` is a new policy dimension, so the contract version is bumped for
all sixteen definitions rather than only the orchestrator's. A consumer
reading `agent_version: 1` cannot know whether an authority tier was declared,
and `pipeline_steps[].agent_version` rows from either side of this change have
to stay distinguishable. The version's own doc comment now names authority as a
trigger, so the next change to it is not missed the same way.

### `execute` is named and refused

No runtime path grants it, so `validateAgentDefinitions` **rejects any definition that claims it**. The tier cannot be granted by editing a table; a later slice that introduces a real execute path has to remove that guard deliberately. This is the same reasoning `SECURITY-REVIEW-B` gets: naming a capability is not the same as having it.

### Delegation

`mayDelegate` is `true` for exactly one agent — `orchestrator` — because it is the only implementation holding a registry reference. A test asserts that set, so an agent that gains one has to justify it.

`delegationRefusal(callerId, calleeId)` is evaluated in `AgentRegistry.executeAgent` whenever a call names `onBehalfOf`, **before the callee runs and before any provider is reached**. It does *not* prevent construction: the registry builds all sixteen agents in its own constructor, so every callee already exists by the time a call arrives. What the guard stops is execution and the provider call — a stronger claim would hide constructor-time work added later. It refuses:

- a caller with no definition;
- a caller whose definition does not permit delegation;
- a callee with no definition;
- a callee that is not `pipeline`-reachable — the rule that closes the escalation above;
- a callee holding more authority than the caller.

**The platform's own calls are unrestricted.** Only delegation is bounded, because only delegation is an agent choosing what runs. That asymmetry is the point: the platform holds authority, agents hold a bounded grant.

## Known limitations

- The tier ladder is enforced at delegation only. It is not consulted when the *platform* selects an agent, because the platform is the authority the model exists to protect.
- `mayDelegateAcrossTiers` has **no violator in the current table** — every delegating agent already sits at the top of the ladder that exists. It is evaluated on every delegated call and tested directly rather than through a stand-in, which is honest about a rule that is enforced but has nothing to refuse yet.
- `OrchestratorAgent` still reads its pipeline from input. This slice bounds what that input can reach; making the coordination pipeline server-owned the way `PIPELINE-1A` did for generation is separate work.
- Nothing here constrains what an agent may *read*. `observe` describes output, not input scope.

## Out of scope

A real execute path, human approval flows, per-request authority grants, revocation, audit of delegated calls beyond the existing failure record, `REMOTE-OPS-1`, and every other `ROADMAP-EXTENSION-1` item.

<!-- prettier-ignore-end -->
