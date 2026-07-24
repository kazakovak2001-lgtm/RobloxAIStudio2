/**
 * AI Project Controller API — Architecture, code review, and duplication detection.
 *
 * Follows existing route pattern (see knowledge.ts, autonomous.ts).
 * Uses agents registered in AgentRegistry for execution.
 */

import { Router } from "express";
import type { AgentRegistry } from "../agents/core/AgentRegistry";
import { CodebaseKnowledge } from "../knowledge/CodebaseKnowledge";
import { DecisionMemory } from "../knowledge/DecisionMemory";
import { ControllerSecretStatusService } from "../projects/services/controller-secret-status.service";

export function createControllerRouter(agentRegistry: AgentRegistry): Router {
  const router = Router();
  const codebaseKnowledge = new CodebaseKnowledge();
  const decisionMemory = new DecisionMemory();
  const secretStatus = new ControllerSecretStatusService();

  // Fix #2: Index at startup (not lazily on first request) to avoid blocking event loop.
  codebaseKnowledge.indexSourceTree();
  decisionMemory.initialize();

  // Fix #1: Share the indexed instance with DuplicationDetectionAgent to avoid double-indexing.
  const dupAgent = agentRegistry.getAgent("duplication_detector");
  if (dupAgent && "setKnowledge" in dupAgent) {
    (dupAgent as any).setKnowledge(codebaseKnowledge);
  }

  const ensureIndexed = () => {
    // No-op — indexing now happens at startup. Kept for API compatibility.
  };

  // GET /api/controller/health — Controller status
  router.get("/health", (_req, res) => {
    const agents = agentRegistry.registeredTypes();
    const controllerAgents = agents.filter((a) =>
      [
        "architecture_controller",
        "code_review_controller",
        "duplication_detector",
      ].includes(a),
    );
    res.json({
      success: true,
      data: {
        status: "operational",
        agents: controllerAgents,
        secretProvider: secretStatus.getStatus(),
        indexed: true,
      },
    });
  });

  // POST /api/controller/architecture/scan — Run architecture validation
  router.post("/architecture/scan", async (req, res) => {
    const { action, file } = req.body;
    const result = await agentRegistry.executeAgent("architecture_controller", {
      action: action ?? "scan",
      file,
    });
    res.json({ success: true, data: result });
  });

  // POST /api/controller/review — Code review
  router.post("/review", async (req, res) => {
    const { code, filePath, diff } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: "code is required" });
      return;
    }
    // Fix #3: Input size limits to prevent abuse and protect LLM context window.
    const MAX_CODE = 50_000;
    const MAX_DIFF = 20_000;
    if (typeof code === "string" && code.length > MAX_CODE) {
      res
        .status(400)
        .json({ success: false, error: `code exceeds ${MAX_CODE} char limit` });
      return;
    }
    if (diff && typeof diff === "string" && diff.length > MAX_DIFF) {
      res
        .status(400)
        .json({ success: false, error: `diff exceeds ${MAX_DIFF} char limit` });
      return;
    }
    const result = await agentRegistry.executeAgent("code_review_controller", {
      code,
      filePath,
      diff,
    });
    res.json({ success: true, data: result });
  });

  // POST /api/controller/duplicates/check — Check for existing similar implementations
  router.post("/duplicates/check", async (req, res) => {
    const { name, description, exports, category } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: "name is required" });
      return;
    }
    const result = await agentRegistry.executeAgent("duplication_detector", {
      name,
      description,
      exports,
      category,
    });
    res.json({ success: true, data: result });
  });

  // GET /api/controller/knowledge/query — Query codebase knowledge
  router.get("/knowledge/query", (req, res) => {
    ensureIndexed();
    const query = req.query.q as string | undefined;
    const category = req.query.category as string | undefined;

    if (!query) {
      res
        .status(400)
        .json({ success: false, error: "q query parameter required" });
      return;
    }

    const results = codebaseKnowledge.search(query, category as any);
    res.json({
      success: true,
      data: {
        results: results.map((r) => ({
          path: r.file.path,
          name: r.file.name,
          category: r.file.category,
          relevance: r.relevance,
          reason: r.matchReason,
          exports: r.file.exports.slice(0, 10),
          description: r.file.description,
        })),
        stats: codebaseKnowledge.getStats(),
      },
    });
  });

  // GET /api/controller/knowledge/stats — Codebase statistics
  router.get("/knowledge/stats", (_req, res) => {
    ensureIndexed();
    res.json({ success: true, data: codebaseKnowledge.getStats() });
  });

  // GET /api/controller/secrets/status — Secret provider status (no secret values exposed)
  router.get("/secrets/status", (_req, res) => {
    res.json({ success: true, data: secretStatus.getStatus() });
  });

  // ─── Architecture Graph Queries ────────────────────────────────────────────

  // GET /api/controller/graph/dependents?file=... — "What depends on this?"
  router.get("/graph/dependents", (req, res) => {
    ensureIndexed();
    const file = req.query.file as string | undefined;
    if (!file) {
      res
        .status(400)
        .json({ success: false, error: "file query param required" });
      return;
    }
    const dependents = codebaseKnowledge.getDependents(file);
    res.json({
      success: true,
      data: { file, dependents, count: dependents.length },
    });
  });

  // GET /api/controller/graph/dependencies?file=... — "What does this depend on?"
  router.get("/graph/dependencies", (req, res) => {
    ensureIndexed();
    const file = req.query.file as string | undefined;
    if (!file) {
      res
        .status(400)
        .json({ success: false, error: "file query param required" });
      return;
    }
    const dependencies = codebaseKnowledge.getDependencies(file);
    res.json({
      success: true,
      data: { file, dependencies, count: dependencies.length },
    });
  });

  // GET /api/controller/graph/impact?file=... — "What will this change affect?"
  router.get("/graph/impact", (req, res) => {
    ensureIndexed();
    const file = req.query.file as string | undefined;
    if (!file) {
      res
        .status(400)
        .json({ success: false, error: "file query param required" });
      return;
    }
    const impact = codebaseKnowledge.getImpact(file);
    res.json({ success: true, data: impact });
  });

  // GET /api/controller/graph/suggest-location?category=...&deps=... — "Where should this go?"
  router.get("/graph/suggest-location", (req, res) => {
    ensureIndexed();
    const category = req.query.category as string | undefined;
    const deps = req.query.deps ? (req.query.deps as string).split(",") : [];
    if (!category) {
      res
        .status(400)
        .json({ success: false, error: "category query param required" });
      return;
    }
    const suggestions = codebaseKnowledge.suggestLocation(
      deps,
      category as any,
    );
    res.json({ success: true, data: suggestions });
  });

  // GET /api/controller/graph/stats — Graph statistics
  router.get("/graph/stats", (_req, res) => {
    ensureIndexed();
    res.json({ success: true, data: codebaseKnowledge.getGraphStats() });
  });

  // ─── Pre-Implementation Check ──────────────────────────────────────────────

  /**
   * POST /api/controller/pre-check
   *
   * AI Pre-Implementation Check workflow.
   * Before creating any new component/service/module, this endpoint:
   *   1. Searches for existing implementations (DuplicationDetectionAgent)
   *   2. Checks architecture impact (ArchitectureControllerAgent)
   *   3. Returns ALLOW / WARN / BLOCK recommendation
   *
   * Input: { intent: string, name?: string, type?: string, exports?: string[] }
   * Output: { decision, existingSolutions, architectureImpact, recommendation }
   */
  router.post("/pre-check", async (req, res) => {
    const { intent, name, type, exports: proposedExports, files } = req.body;

    if (!intent || typeof intent !== "string") {
      res.status(400).json({
        success: false,
        error: "intent is required (describe what you want to create)",
      });
      return;
    }

    ensureIndexed();

    // Step 1: Duplication check
    const dupResult = await agentRegistry.executeAgent("duplication_detector", {
      name: name ?? extractNameFromIntent(intent),
      description: intent,
      exports: proposedExports ?? [],
      category: type,
    });

    // Step 1b: If files provided, check impact of those specific files
    const fileImpacts: Array<{
      file: string;
      dependents: number;
      dependencies: number;
    }> = [];
    if (Array.isArray(files)) {
      for (const f of (files as string[]).slice(0, 5)) {
        const impact = codebaseKnowledge.getImpact(f);
        fileImpacts.push({
          file: f,
          dependents: impact.directDependents.length,
          dependencies: impact.directDependencies.length,
        });
      }
    }

    // Step 2: Architecture impact analysis
    const archResult = await agentRegistry.executeAgent(
      "architecture_controller",
      { action: "recommend", file: name },
    );

    // Step 3: Direct codebase search for broader matches
    const searchTerm = name ?? intent.split(" ").slice(0, 3).join(" ");
    const directMatches = codebaseKnowledge.search(searchTerm, type as any);

    // Step 4: Impact analysis — if duplicates found, show what depends on them
    const impactData: Array<{ file: string; dependents: number }> = [];
    const dupMatches = (dupResult.duplication as Record<string, unknown>)
      ?.matches as Array<Record<string, unknown>> | undefined;
    if (dupMatches) {
      for (const match of dupMatches.slice(0, 3)) {
        const matchPath = match.path as string;
        if (matchPath) {
          const impact = codebaseKnowledge.getImpact(matchPath);
          impactData.push({
            file: matchPath,
            dependents: impact.directDependents.length,
          });
        }
      }
    }

    // Step 5: Decision Memory — check prior architectural decisions
    const priorDecisionCheck = decisionMemory.findPriorDecisions(intent);

    // Step 6: Generate decision
    const duplication = dupResult.duplication as
      Record<string, unknown> | undefined;
    const architecture = archResult.architecture as
      Record<string, unknown> | undefined;

    const hasDuplicate = duplication?.hasDuplicate === true;
    const confidence = (duplication?.confidence as number) ?? 0;
    const violations =
      ((architecture as any)?.violations as unknown[])?.length ?? 0;

    let decision: "ALLOW" | "WARN" | "BLOCK";
    let reason: string;

    if (hasDuplicate && confidence >= 80) {
      decision = "BLOCK";
      reason = `High-confidence duplicate detected (${confidence}%). Existing implementation should be reused.`;
    } else if (hasDuplicate && confidence >= 40) {
      decision = "WARN";
      reason = `Potential duplicate found (${confidence}% confidence). Review existing implementations before creating.`;
    } else if (violations > 0) {
      decision = "WARN";
      reason = `No duplicates but ${violations} architecture violation(s) in current state. Proceed with caution.`;
    } else {
      decision = "ALLOW";
      reason = "No duplicates found. Architecture is clean. Safe to create.";
    }

    res.json({
      success: true,
      data: {
        decision,
        reason,
        intent,
        existingSolutions: {
          duplicateDetected: hasDuplicate,
          confidence,
          matches: (duplication?.matches as unknown[])?.slice(0, 5) ?? [],
        },
        directSearchResults: directMatches.slice(0, 5).map((r) => ({
          path: r.file.path,
          name: r.file.name,
          category: r.file.category,
          relevance: r.relevance,
          reason: r.matchReason,
        })),
        architectureImpact: {
          currentViolations: violations,
          recommendations: (architecture as any)?.recommendations ?? [],
          existingDependents: impactData,
          fileImpacts,
        },
        recommendation:
          decision === "BLOCK"
            ? `REUSE existing: ${(duplication?.matches as any[])?.[0]?.path ?? "see matches"}`
            : decision === "WARN"
              ? "Review existing implementations before proceeding"
              : "Proceed with implementation",
        decisionMemory: {
          priorDecisions: priorDecisionCheck.priorDecisions
            .slice(0, 3)
            .map((d) => ({
              title: d.decision.title,
              date: d.decision.date,
              decision: d.decision.decision.slice(0, 150),
              relevance: d.relevance,
            })),
          applicableRules: priorDecisionCheck.applicableRules
            .slice(0, 3)
            .map((r) => ({
              id: r.id,
              rule: r.rule.slice(0, 100),
              category: r.category,
            })),
          recommendation: priorDecisionCheck.recommendation,
        },
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ─── Decision Memory Endpoints ─────────────────────────────────────────────

  // GET /api/controller/decisions/search?q=... — Search architectural decisions
  router.get("/decisions/search", (req, res) => {
    ensureIndexed();
    const q = req.query.q as string | undefined;
    if (!q) {
      res.status(400).json({ success: false, error: "q query param required" });
      return;
    }
    const results = decisionMemory.search(q);
    res.json({
      success: true,
      data: results.map((r) => ({
        title: r.decision.title,
        date: r.decision.date,
        decision: r.decision.decision,
        reason: r.decision.reason,
        source: r.decision.source,
        relevance: r.relevance,
        matchReason: r.matchReason,
      })),
    });
  });

  // GET /api/controller/decisions/rules — Get all governance rules
  router.get("/decisions/rules", (_req, res) => {
    ensureIndexed();
    res.json({ success: true, data: decisionMemory.getRules() });
  });

  // GET /api/controller/decisions/stats — Decision memory statistics
  router.get("/decisions/stats", (_req, res) => {
    ensureIndexed();
    res.json({ success: true, data: decisionMemory.getStats() });
  });

  // GET /api/controller/decisions/for-module?path=... — Decisions affecting a module
  router.get("/decisions/for-module", (req, res) => {
    ensureIndexed();
    const path = req.query.path as string | undefined;
    if (!path) {
      res
        .status(400)
        .json({ success: false, error: "path query param required" });
      return;
    }
    const decisions = decisionMemory.getDecisionsForModule(path);
    res.json({ success: true, data: decisions });
  });

  return router;
}

/**
 * Extract a likely component/service name from a natural language intent.
 * Example: "I want to create a new Analytics module" → "Analytics"
 */
function extractNameFromIntent(intent: string): string {
  // Remove common prefixes
  const cleaned = intent
    .replace(/^(i want to |create |build |implement |add |make |new )/i, "")
    .replace(/\s+(module|component|service|agent|system|layer|class)$/i, "")
    .trim();

  // Take the last capitalized word or the whole phrase
  const words = cleaned.split(/\s+/);
  const capitalized = words.filter((w) => w[0] === w[0]?.toUpperCase());
  return capitalized.length > 0
    ? capitalized.join("")
    : words.slice(0, 2).join("");
}
