import type { ArtifactStore } from "./ArtifactStore";

/**
 * NOVELTY-2 — which executions this one descends from through repair.
 *
 * Read from durable lineage, never from the execution id. `RepairEngine` names
 * a repaired execution `${parentExecutionId}-repair-${n}`, and parsing that
 * would make ancestry depend on a naming convention that nothing enforces: a
 * renamed scheme would silently start reporting repaired runs as unrelated
 * duplicates of their own parents.
 *
 * The durable signal is an artifact edge. `ARTIFACT_DEPENDENCY_RULES` permits
 * `LUA_GENERATION` as an upstream stage of `LUA_GENERATION`, and
 * `GenerationArtifactRecorder` passes no `dependsOn` for that stage, so a Lua
 * artifact naming another execution's Lua exists only where `RepairEngine` put
 * it.
 */

export interface RepairAncestry {
  /** Execution ids this one descends from, nearest ancestor first. */
  readonly ancestors: ReadonlySet<string>;
  /**
   * `false` when the chain could not be followed.
   *
   * `RepairEngine` records the edge only when the parent's Lua carries a
   * content hash, which artifacts written before ARTIFACT-CONTRACT-2 do not.
   * An empty set therefore means "no repair parent" only when this is `true`;
   * otherwise it means nobody can tell.
   */
  readonly resolved: boolean;
}

/** Guards a lineage cycle. Durable data is not required to be acyclic. */
const MAX_ANCESTRY_DEPTH = 64;

export function resolveRepairAncestry(
  store: ArtifactStore,
  executionId: string,
): RepairAncestry {
  const ancestors = new Set<string>();
  let current = executionId;

  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth++) {
    // Every Lua artifact for this execution, newest first. `store` permits
    // more than one under a single pipeline id — a re-record produces exactly
    // that — so reading only the first would miss a repair edge written by a
    // later one and report a repaired run as an unrelated duplicate. Newest
    // wins, the same policy the DNA comparison uses for a re-recorded prior.
    const luaArtifacts = store
      .getByPipeline(current)
      .filter((artifact) => artifact.stage === "LUA_GENERATION")
      .sort((left, right) => right.createdAt - left.createdAt);
    if (luaArtifacts.length === 0) {
      // No Lua for this execution at all. Nothing was repaired into it and
      // nothing can be, so the chain ends here and it ended truthfully.
      return { ancestors, resolved: true };
    }

    const parentEdge = luaArtifacts
      .flatMap((artifact) => artifact.dependencies ?? [])
      .find((dependency) => dependency.stage === "LUA_GENERATION");
    if (!parentEdge) return { ancestors, resolved: true };

    const parentLua = store.getById(parentEdge.artifactId);
    if (!parentLua) {
      // The edge names an artifact this store cannot resolve. There *is* a
      // parent and we cannot say which, so the chain is reported unresolved
      // rather than as though it had ended.
      return { ancestors, resolved: false };
    }

    if (
      parentLua.pipelineId === current ||
      ancestors.has(parentLua.pipelineId)
    ) {
      return { ancestors, resolved: false };
    }

    ancestors.add(parentLua.pipelineId);
    current = parentLua.pipelineId;
  }

  // Depth exhausted. Everything found so far is real, but the chain may go
  // further, so this is not a complete answer and must not read as one.
  return { ancestors, resolved: false };
}
