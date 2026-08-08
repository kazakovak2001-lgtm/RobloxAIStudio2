/**
 * Repair API — real, artifact-applying repair (REPAIR-1A).
 */

import { Router } from "express";
import { RepairEngine } from "../repair";
import type { AgentRegistry } from "../agents/core/AgentRegistry";
import type { IBlueprintRepository } from "../projects/repository/blueprint.repository";
import { ArtifactStore } from "../pipeline/v2";
import type { StudioIntegrationManager } from "../studio/integration/StudioIntegrationManager";
import type { SyncResult } from "../studio/integration/types";
import type { ProjectAccessControl } from "./projects";

/** Strip CR/LF from a request-derived value before it reaches a log sink,
 * so it can't be used to forge fake log entries. */
function sanitizeForLog(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

export function createRepairRouter(
  access: ProjectAccessControl,
  agentRegistry: AgentRegistry,
  blueprintRepository: IBlueprintRepository,
  studioManager: StudioIntegrationManager,
  artifactStore: ArtifactStore = new ArtifactStore(),
): Router {
  const router = Router();
  const engine = new RepairEngine(
    agentRegistry,
    blueprintRepository,
    artifactStore,
  );

  const findStudioSession = (projectId: string, studioId?: string) => {
    if (studioId) {
      const session = studioManager.getSession(studioId);
      return session && session.projectId === projectId ? session : null;
    }
    return (
      studioManager
        .getActiveSessions()
        .find((session) => session.projectId === projectId) ?? null
    );
  };

  // POST /api/repair/run — attempt a real repair against a specific execution
  router.post("/run", async (req, res) => {
    const { projectId, executionId, config } = req.body;

    if (!projectId || !executionId) {
      res
        .status(400)
        .json({ success: false, error: "projectId and executionId required" });
      return;
    }

    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    try {
      const session = await engine.run(projectId, executionId, config);
      res.json({ success: true, data: session });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Repair failed",
      });
    }
  });

  // POST /api/repair/:projectId/deliver — push the latest repaired
  // execution's artifacts to a connected Studio session. The target
  // execution is always resolved server-side from the repair session's own
  // history — never client-supplied.
  router.post("/:projectId/deliver", async (req, res) => {
    const projectId = req.params.projectId;
    if (!(await access.requireProjectAccess(req, res, projectId))) return;

    try {
      const session = await engine.getSession(projectId);

      // Every execution id this project's repair history actually knows
      // about — the allowlist for an explicit rollback target. Never trust
      // a client-supplied executionId that isn't already part of this
      // project's own data.
      const knownExecutionIds = new Set<string>();
      for (const record of session?.history ?? []) {
        knownExecutionIds.add(record.parentExecutionId);
        if (record.newExecutionId) knownExecutionIds.add(record.newExecutionId);
      }

      const { studioId, executionId: requestedExecutionId } = req.body;
      let targetExecutionId: string | undefined;
      let source: "latest-repair" | "explicit-rollback";

      if (requestedExecutionId) {
        if (!knownExecutionIds.has(requestedExecutionId)) {
          res.status(400).json({
            success: false,
            error: "executionId is not a known execution for this project",
          });
          return;
        }
        targetExecutionId = requestedExecutionId;
        source = "explicit-rollback";
      } else {
        targetExecutionId = [...(session?.history ?? [])]
          .reverse()
          .find((record) => record.newExecutionId)?.newExecutionId;
        source = "latest-repair";
      }

      if (!targetExecutionId) {
        res.status(404).json({
          success: false,
          error: "No repaired execution available for this project",
        });
        return;
      }

      const studioSession = findStudioSession(projectId, studioId);
      if (!studioSession) {
        res.status(404).json({
          success: false,
          error: "No connected Studio session available for this project.",
        });
        return;
      }

      let syncResult: SyncResult;
      try {
        syncResult = await studioManager.synchronizeExecution(
          studioSession.studioId,
          projectId,
          targetExecutionId,
        );
      } catch (error) {
        // An audit-write failure here must never mask the real Studio
        // error — log it and still rethrow the original `error`.
        try {
          await engine.recordDelivery(projectId, {
            timestamp: Date.now(),
            executionId: targetExecutionId,
            studioId: studioSession.studioId,
            source,
            success: false,
            error: error instanceof Error ? error.message : "Delivery failed",
          });
        } catch (auditError) {
          console.error(
            "Failed to record delivery audit for project %s",
            sanitizeForLog(projectId),
            auditError,
          );
        }
        throw error;
      }

      // Isolated from the response: an audit-write failure here must not
      // turn an already-successful Studio delivery into an HTTP failure
      // (the client could then retry and deliver twice).
      try {
        await engine.recordDelivery(projectId, {
          timestamp: Date.now(),
          executionId: targetExecutionId,
          studioId: studioSession.studioId,
          source,
          success: syncResult.success,
          error: syncResult.error,
        });
      } catch (auditError) {
        console.error(
          "Failed to record delivery audit for project %s",
          sanitizeForLog(projectId),
          auditError,
        );
      }

      if (!syncResult.success) {
        res.status(502).json({
          success: false,
          error: syncResult.error ?? "Studio delivery failed",
          data: { executionId: targetExecutionId, syncResult },
        });
        return;
      }

      res.json({
        success: true,
        data: { executionId: targetExecutionId, syncResult },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Delivery failed",
      });
    }
  });

  // GET /api/repair/:projectId/deliveries — delivery/rollback audit trail
  // plus the current generic Studio evidence for this project, so a caller
  // can see both "what was attempted" and "what Studio is actually running"
  // in one place.
  router.get("/:projectId/deliveries", async (req, res) => {
    const projectId = req.params.projectId;
    try {
      if (access.hasProjectAccess) {
        if (!(await access.hasProjectAccess(req, projectId))) {
          res
            .status(404)
            .json({ success: false, error: "No repair session found" });
          return;
        }
      } else if (!(await access.requireProjectAccess(req, res, projectId))) {
        return;
      }

      const session = await engine.getSession(projectId);
      const currentStudioState =
        await studioManager.getProjectEvidence(projectId);
      res.json({
        success: true,
        data: { deliveries: session?.deliveries ?? [], currentStudioState },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load delivery history",
      });
    }
  });

  // GET /api/repair/:projectId — get repair session
  router.get("/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const session = await engine.getSession(projectId);
    if (!session) {
      res
        .status(404)
        .json({ success: false, error: "No repair session found" });
      return;
    }
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, projectId))) {
        res
          .status(404)
          .json({ success: false, error: "No repair session found" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    res.json({ success: true, data: session });
  });

  // GET /api/repair/history/:projectId — get repair history
  router.get("/history/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const history = await engine.getHistory(projectId);
    if (access.hasProjectAccess) {
      if (!(await access.hasProjectAccess(req, projectId))) {
        res
          .status(404)
          .json({ success: false, error: "No repair history found" });
        return;
      }
    } else if (!(await access.requireProjectAccess(req, res, projectId))) {
      return;
    }
    res.json({ success: true, data: history });
  });

  return router;
}
