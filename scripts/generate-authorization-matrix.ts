import fs from "node:fs";
import path from "node:path";

interface MatrixOperation {
  transport: "rest" | "socket";
  source: string;
  operation: string;
  classification: string;
  principal: string;
  capability: string;
  resourceScope: string;
  positiveEvidence: string;
  negativeEvidence: string;
  /**
   * Whether the identifier the caller was authorized for is the same thing the
   * operation acts on. `resourceScope` records where the resource identifier
   * comes from; this records whether the gap between the two is closed.
   *
   * - `path-scoped` — the authorized identifier is the path identifier; there
   *   is no second object to bind.
   * - `indirect-verified` — the object is resolved from storage and the handler
   *   or a route-level resolver asserts that the object's project equals the
   *   authorized project. Verified by reading the code.
   * - `body-supplied-object` — the operation acts on an object taken from the
   *   request body that is never resolved from storage, and authorizes against
   *   an identifier inside that same body. There is no cross-tenant escape,
   *   because the identifier must still resolve to a project the caller can
   *   reach, but nothing binds the payload to stored state.
   * - `indirect-unreviewed` — the identifier is indirect and the handler was
   *   not read in this pass. Not a statement that it is safe.
   * - `not-resource-scoped` — global or operator runtime scope with no
   *   per-resource binding to make.
   */
  resourceBinding: string;
  /**
   * Evidence that a caller authorized for one tenant is actually denied another
   * tenant's resource. Either a test path, or:
   *
   * - `static-source-only` — the only evidence asserts strings in the handler
   *   source, which cannot show that a cross-owner request is refused.
   * - `none-recorded` — no such evidence was found. Recorded as a gap rather
   *   than filled in with a weaker test that happens to exist.
   */
  crossTenantEvidence: string;
  /**
   * Where the operation sits in the MAR-001 scope, which is a different
   * question from either field above.
   *
   * `resourceBinding` says whether the mechanism is right. `crossTenantEvidence`
   * says whether anyone has executed a request against it. Neither answers
   * "does MAR-001 still owe this operation anything", and reading the two
   * together produced a count that mixed unrelated things: a metadata route
   * with no resource to bind was indistinguishable from a child-resource
   * handler nobody had checked.
   *
   * - `verified-correct` — the mechanism resolves the resource and authorizes
   *   its own project. Nothing is owed but evidence, and often not even that.
   * - `not-resource-bound` — no per-resource authorization to make. Metadata,
   *   registries, echoes of the request, and the caller's own session.
   * - `direct-project` — the authorized identifier is itself the thing the
   *   operation acts on, so an authorization-target mismatch cannot be
   *   written. The degenerate case of the canonical rule.
   * - `mechanism-gap` — a resource is parented to something, and nothing
   *   canonical protects it. This is the only category MAR-001 still owes.
   */
  mar001Category: string;
}

/**
 * An outbound server emission. These are not authorization operations: nothing
 * authenticates a broadcast, so they carry no principal or capability. They are
 * recorded separately because the matrix otherwise models only inbound
 * authorization, and a globally broadcast payload reaches every connected
 * socket regardless of how well the inbound side is guarded.
 */
interface MatrixBroadcast {
  event: string;
  source: string;
  /**
   * - `project-room` — addressed to one project's room.
   * - `project-room-with-global-fallback` — scoped when a project is known and
   *   broadcast to everyone when it is not.
   * - `global-bypassing-available-scope` — broadcast to everyone from a site
   *   where the project is in scope and a project-room emitter already exists.
   * - `global-no-project-context` — broadcast to everyone from a site with no
   *   project in scope, so scoping needs context plumbed in first.
   * - `global-unreviewed` — discovered but not yet classified.
   */
  targeting: string;
  /** Test proving a foreign socket does not receive the payload, or a gap marker. */
  tenancyEvidence: string;
}

interface AuthorizationMatrix {
  version: number;
  controlId: string;
  operations: MatrixOperation[];
  broadcasts: MatrixBroadcast[];
}

const repositoryRoot = process.cwd();
const serverRoot = path.join(repositoryRoot, "server/src");
const matrixPath = path.join(
  repositoryRoot,
  "config/security/authorization-matrix.json",
);

function listTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return listTypeScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [absolutePath] : [];
  });
}

function relativeSource(absolutePath: string): string {
  return path.relative(repositoryRoot, absolutePath).replaceAll(path.sep, "/");
}

function operationKey(
  operation: Pick<MatrixOperation, "transport" | "source" | "operation">,
): string {
  return `${operation.transport}|${operation.source}|${operation.operation}`;
}

function discoverOperations(): Array<
  Pick<MatrixOperation, "transport" | "source" | "operation">
> {
  const discovered = new Map<
    string,
    Pick<MatrixOperation, "transport" | "source" | "operation">
  >();
  const restPattern =
    /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  const socketPattern = /\bsocket\.on\(\s*["'`]([^"'`]+)["'`]/g;

  for (const file of listTypeScriptFiles(serverRoot)) {
    const source = relativeSource(file);
    const content = fs.readFileSync(file, "utf8");

    for (const match of content.matchAll(restPattern)) {
      const operation = {
        transport: "rest" as const,
        source,
        operation: `${match[1].toUpperCase()} ${match[2]}`,
      };
      discovered.set(operationKey(operation), operation);
    }

    for (const match of content.matchAll(socketPattern)) {
      if (match[1] === "disconnect") continue;
      const operation = {
        transport: "socket" as const,
        source,
        operation: match[1],
      };
      discovered.set(operationKey(operation), operation);
    }
  }

  return [...discovered.values()].sort((left, right) =>
    operationKey(left).localeCompare(operationKey(right)),
  );
}

function classified(
  classification: string,
  principal: string,
  capability: string,
  resourceScope: string,
  positiveEvidence: string,
  negativeEvidence: string,
): Omit<MatrixOperation, "transport" | "source" | "operation"> {
  return {
    classification,
    principal,
    capability,
    resourceScope,
    positiveEvidence,
    negativeEvidence,
  };
}

const publicEvidence =
  "server/src/__tests__/security2gE.authorization-domains.test.ts";
const userSelfEvidence = publicEvidence;
const projectEvidence = "server/src/routes/__tests__/projects.runtime.test.ts";
const projectRoutesEvidence =
  "server/src/__tests__/security2gE.projects-routes.test.ts";
const studioParityEvidence =
  "server/src/__tests__/security2gE.studio-project-parity.test.ts";
const studioClientScopeEvidence =
  "server/src/__tests__/security2gE.studio-client-scope.test.ts";
const studioProtocolScopeEvidence =
  "server/src/__tests__/security2gE.studio-protocol-scope.test.ts";
const controllerOperatorEvidence =
  "server/src/__tests__/security2gE.controller-operator-boundary.test.ts";
const analyticsOperatorEvidence =
  "server/src/__tests__/security2gE.analytics-operator-boundary.test.ts";
const debugOperatorEvidence =
  "server/src/__tests__/security2gE.debug-operator-boundary.test.ts";
const distributedScopeEvidence =
  "server/src/__tests__/security2gE.distributed-scope.test.ts";
const apiV1ScopeEvidence =
  "server/src/__tests__/security2gE.api-v1-scope.test.ts";
const apiV2ScopeEvidence =
  "server/src/__tests__/security2gE.api-v2-scope.test.ts";
const agentCollaborationScopeEvidence =
  "server/src/__tests__/security2gE.agent-collaboration-scope.test.ts";
const autonomousHealthScopeEvidence =
  "server/src/__tests__/security2gE.autonomous-health-scope.test.ts";
const aiChatSessionEvidence =
  "server/src/__tests__/security2gE.ai-chat-session-boundary.test.ts";
const domainScopeEvidence =
  "server/src/__tests__/security2gE.domain-scope.test.ts";
const economyScopeEvidence =
  "server/src/__tests__/security2gE.economy-scope.test.ts";
const evaluationOperatorEvidence =
  "server/src/__tests__/security2gE.evaluation-operator-boundary.test.ts";
const worldScopeEvidence =
  "server/src/__tests__/security2gE.world-scope.test.ts";
const lifecycleScopeEvidence =
  "server/src/__tests__/security2gE.lifecycle-scope.test.ts";
const memoryScopeEvidence =
  "server/src/__tests__/security2gE.memory-scope.test.ts";
const planningScopeEvidence =
  "server/src/__tests__/security2gE.planning-scope.test.ts";
const systemMetadataScopeEvidence =
  "server/src/__tests__/security2gE.system-metadata-scope.test.ts";
const compileScopeEvidence =
  "server/src/__tests__/security2gE.compile-scope.test.ts";
const simulationScopeEvidence =
  "server/src/__tests__/security2gE.simulation-scope.test.ts";
const generationV2ScopeEvidence =
  "server/src/__tests__/security2gE.generation-v2-scope.test.ts";
const luaGenerationScopeEvidence =
  "server/src/__tests__/security2gE.lua-generation-scope.test.ts";
const playtestScopeEvidence =
  "server/src/__tests__/security2gE.playtest-scope.test.ts";
const repairScopeEvidence =
  "server/src/__tests__/security2gE.repair-scope.test.ts";
const knowledgeScopeEvidence =
  "server/src/__tests__/security2gE.knowledge-scope.test.ts";
const gameArchitectScopeEvidence =
  "server/src/__tests__/security2gE.game-architect-scope.test.ts";
const chatPersistenceScopeEvidence =
  "server/src/__tests__/security2gE.chat-persistence-scope.test.ts";
const platformRemainingScopeEvidence =
  "server/src/__tests__/security2gE.platform-remaining-scope.test.ts";
const conceptEntryScopeEvidence =
  "server/src/__tests__/security2gE.concept-entry-scope.test.ts";
const autonomousRunScopeEvidence =
  "server/src/__tests__/security2gE.autonomous-run-scope.test.ts";
const gameGenerationFinalScopeEvidence =
  "server/src/__tests__/security2gE.game-generation-final-scope.test.ts";
const blueprintProposalEvidence =
  "server/src/__tests__/definechat1.proposal-routes.test.ts";
const socketLeaveParityEvidence =
  "server/src/__tests__/security2gE.socket-leave-parity.test.ts";
const directProjectRouteEvidence =
  "server/src/__tests__/security2gE.project-routes.test.ts";
const indirectBlueprintEvidence =
  "server/src/__tests__/security2gE.indirect-blueprint-routes.test.ts";
const indirectSessionEvidence =
  "server/src/__tests__/security2gE.indirect-session-routes.test.ts";
const conceptResolverEvidence =
  "server/src/__tests__/security2gE.concept-resource-resolvers.test.ts";
const conceptHistoryEvidence =
  "server/src/__tests__/security2gE.concept-matrix-history.test.ts";

const overrides = new Map<
  string,
  Omit<MatrixOperation, "transport" | "source" | "operation">
>([
  [
    "rest|server/src/index.ts|GET /health",
    classified(
      "public",
      "anonymous",
      "system.health.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/index.ts|GET /",
    classified(
      "public",
      "anonymous",
      "system.root.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/routes/system.ts|GET /status",
    classified(
      "public",
      "anonymous",
      "system.status.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  [
    "rest|server/src/routes/system.ts|GET /agents",
    classified(
      "public",
      "anonymous",
      "system.agents.read",
      "system",
      publicEvidence,
      "not-applicable-public",
    ),
  ],
  ...[
    "POST /auth/register",
    "POST /auth/login",
    "POST /auth/logout",
    "POST /auth/refresh",
    "POST /auth/forgot-password",
  ].map(
    (operation) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "public",
          "anonymous",
          `auth.${operation.split("/").at(-1)!.replace("-", ".")}`,
          "authentication",
          publicEvidence,
          "not-applicable-public",
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/platform.ts|GET /auth/me",
    classified(
      "authenticated",
      "user-session",
      "user.self.read",
      "current-user",
      userSelfEvidence,
      userSelfEvidence,
    ),
  ],
  ...[
    ["GET /users/:id", "user.self.read"],
    ["PATCH /users/:id", "user.self.update"],
    ["GET /users/:id/preferences", "user.preferences.read"],
    ["PUT /users/:id/preferences", "user.preferences.update"],
    ["GET /users/:id/limits", "user.limits.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "user-self",
          "user-session",
          capability,
          "path-user",
          userSelfEvidence,
          userSelfEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /versions/:projectId", "project.versions.read"],
    ["POST /versions/:projectId", "project.versions.create"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "path-project",
          projectEvidence,
          projectEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /:projectId/generate", "project.generation.start"],
    ["POST /:projectId/blueprints", "project.blueprint.create"],
    [
      "GET /:projectId/generation/:executionId/status",
      "project.generation.read",
    ],
    ["GET /:projectId/studio/status", "project.studio.status.read"],
    ["POST /:projectId/studio/sync", "project.studio.sync"],
    ["GET /:projectId/export", "project.export.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/game-generation.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "path-project",
          directProjectRouteEvidence,
          directProjectRouteEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /blueprints/:blueprintId", "project.blueprint.read"],
    ["GET /blueprints/:blueprintId/validate", "project.blueprint.validate"],
    ["GET /blueprints/:blueprintId/executions", "project.execution.list"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/game-generation.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "resolved-blueprint-project",
          indirectBlueprintEvidence,
          indirectBlueprintEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /status/:sessionId", "project.autonomous.session.read"],
    ["GET /capabilities/:sessionId", "project.autonomous.capabilities.read"],
    ["POST /pause/:sessionId", "project.autonomous.pause"],
    ["POST /resume/:sessionId", "project.autonomous.resume"],
    ["POST /recover/:sessionId", "project.autonomous.recover"],
    ["POST /cancel/:sessionId", "project.autonomous.cancel"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/autonomous.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "resolved-session-project",
          indirectSessionEvidence,
          indirectSessionEvidence,
        ),
      ] as const,
  ),
  ...[
    [
      "GET /experience/status/:pipelineId",
      "project.pipeline.read",
      "resolved-pipeline-project",
    ],
    [
      "POST /experience/:pipelineId/pause",
      "project.pipeline.pause",
      "resolved-pipeline-project",
    ],
    [
      "POST /experience/:pipelineId/resume",
      "project.pipeline.resume",
      "resolved-pipeline-project",
    ],
    [
      "POST /experience/:pipelineId/cancel",
      "project.pipeline.cancel",
      "resolved-pipeline-project",
    ],
    [
      "POST /experience/:pipelineId/retry",
      "project.pipeline.retry",
      "resolved-pipeline-project",
    ],
    [
      "POST /experience/:pipelineId/stage/:stage/retry",
      "project.pipeline.stage.retry",
      "resolved-pipeline-project",
    ],
    [
      "GET /experience/:pipelineId/artifacts",
      "project.artifact.list",
      "resolved-pipeline-project",
    ],
    [
      "GET /experience/:pipelineId/review",
      "project.review.read",
      "resolved-pipeline-project",
    ],
    [
      "GET /experience/:pipelineId/metrics",
      "project.metrics.read",
      "resolved-pipeline-project",
    ],
    [
      "GET /experience/:pipelineId/audit",
      "project.audit.read",
      "resolved-pipeline-project",
    ],
    [
      "GET /experience/artifact/:artifactId",
      "project.artifact.read",
      "resolved-artifact-project",
    ],
    [
      "POST /experience/artifact/:artifactId/approve",
      "project.artifact.approve",
      "resolved-artifact-project",
    ],
    [
      "POST /experience/artifact/:artifactId/reject",
      "project.artifact.reject",
      "resolved-artifact-project",
    ],
    [
      "POST /experience/artifact/:artifactId/comment",
      "project.artifact.comment",
      "resolved-artifact-project",
    ],
    [
      "POST /experience/artifact/:artifactId/edit",
      "project.artifact.edit",
      "resolved-artifact-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/concept.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          conceptResolverEvidence,
          conceptResolverEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/concept.ts|GET /experience/history",
    classified(
      "project-owner-filtered",
      "user-session",
      "project.pipeline.history.read",
      "filtered-project-set",
      conceptHistoryEvidence,
      conceptHistoryEvidence,
    ),
  ],
  ...[
    ["GET /", "user.projects.list", "owner-project-set", "authenticated"],
    ["POST /", "user.projects.create", "current-user", "authenticated"],
    ["GET /:id", "project.read", "path-project", "project-owner"],
    [
      "GET /:id/history",
      "project.history.read",
      "path-project",
      "project-owner",
    ],
    ["PUT /:id", "project.update", "path-project", "project-owner"],
    ["DELETE /:id", "project.delete", "path-project", "project-owner"],
  ].map(
    ([operation, capability, scope, classification]) =>
      [
        `rest|server/src/routes/projects.ts|${operation}`,
        classified(
          classification,
          "user-session",
          capability,
          scope,
          projectRoutesEvidence,
          projectRoutesEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /connect", "project.studio.connect", "body-project"],
    ["POST /sync/project", "project.studio.snapshot.read", "body-project"],
    ["GET /sync/status", "project.studio.sync.status.read", "query-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/studio.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          studioParityEvidence,
          studioParityEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /status", "project.studio.clients.read", "authorized-project-set"],
    [
      "POST /disconnect",
      "project.studio.client.disconnect",
      "resolved-client-project",
    ],
    [
      "POST /heartbeat",
      "project.studio.client.heartbeat",
      "resolved-client-project",
    ],
    [
      "GET /session",
      "project.studio.sessions.read",
      "authorized-project-set-or-client",
    ],
    [
      "GET /commands",
      "project.studio.commands.poll",
      "resolved-client-project",
    ],
    [
      "GET /commands/:commandId",
      "project.studio.command.read",
      "resolved-client-project",
    ],
    [
      "POST /commands/:commandId/acknowledge",
      "project.studio.command.acknowledge",
      "resolved-client-project",
    ],
    [
      "POST /commands/:commandId/result",
      "project.studio.command.report",
      "resolved-client-project",
    ],
    ["GET /events", "project.studio.events.read", "authorized-project-set"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/studio.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          studioClientScopeEvidence,
          studioClientScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    [
      "POST /protocol/message",
      "project.studio.protocol.message.dispatch",
      "resolved-message-project",
    ],
    [
      "POST /protocol/register",
      "project.studio.protocol.register",
      "body-project",
    ],
    [
      "GET /protocol/log",
      "project.studio.protocol.log.read",
      "resolved-client-session",
    ],
    [
      "POST /sync/artifacts",
      "project.studio.artifacts.transfer",
      "body-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/studio.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          studioProtocolScopeEvidence,
          studioProtocolScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/studio.ts|GET /protocol/info",
    classified(
      "authenticated",
      "user-session",
      "system.studio.protocol.info.read",
      "static-system-metadata",
      studioProtocolScopeEvidence,
      studioProtocolScopeEvidence,
    ),
  ],
  ...[
    ["GET /health", "system.controller.health.read"],
    ["POST /architecture/scan", "system.controller.architecture.scan"],
    ["POST /review", "system.controller.code.review"],
    ["POST /duplicates/check", "system.controller.duplicates.check"],
    ["GET /knowledge/query", "system.controller.knowledge.query"],
    ["GET /knowledge/stats", "system.controller.knowledge.stats.read"],
    ["GET /secrets/status", "system.controller.secrets.status.read"],
    ["GET /graph/dependents", "system.controller.graph.dependents.read"],
    ["GET /graph/dependencies", "system.controller.graph.dependencies.read"],
    ["GET /graph/impact", "system.controller.graph.impact.read"],
    ["GET /graph/suggest-location", "system.controller.graph.location.suggest"],
    ["GET /graph/stats", "system.controller.graph.stats.read"],
    ["POST /pre-check", "system.controller.precheck.execute"],
    ["GET /decisions/search", "system.controller.decisions.search"],
    ["GET /decisions/rules", "system.controller.decisions.rules.read"],
    ["GET /decisions/stats", "system.controller.decisions.stats.read"],
    ["GET /decisions/for-module", "system.controller.decisions.module.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/controller.ts|${operation}`,
        classified(
          "controller-operator",
          "user-session",
          capability,
          "global-controller-runtime",
          controllerOperatorEvidence,
          controllerOperatorEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /system", "system.analytics.health.read"],
    ["GET /agents", "system.analytics.agents.read"],
    ["GET /agent/:name", "system.analytics.agent.read"],
    ["GET /execution/:id", "system.analytics.execution.read"],
    ["GET /patterns", "system.analytics.patterns.read"],
    ["GET /signals", "system.analytics.signals.read"],
    ["GET /suggestions", "system.analytics.suggestions.read"],
    ["POST /cycle", "system.analytics.cycle.execute"],
    ["GET /slowest", "system.analytics.rankings.slowest.read"],
    ["GET /lowest-scores", "system.analytics.rankings.lowest.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/analytics.ts|${operation}`,
        classified(
          "analytics-operator",
          "user-session",
          capability,
          "global-analytics-runtime",
          analyticsOperatorEvidence,
          analyticsOperatorEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /executions", "system.debug.executions.list"],
    ["GET /execution/:id", "system.debug.execution.read"],
    ["GET /trace/:id", "system.debug.trace.read"],
    ["GET /graph/:id", "system.debug.graph.read"],
    ["GET /replay/:id", "system.debug.replay.read"],
    ["GET /compare/:idA/:idB", "system.debug.execution.compare"],
    ["GET /timeline/:id", "system.debug.timeline.read"],
    ["DELETE /execution/:id", "system.debug.execution.delete"],
    ["GET /export/:id", "system.debug.trace.export"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/debug.ts|${operation}`,
        classified(
          "debug-operator",
          "user-session",
          capability,
          "global-debug-trace-store",
          debugOperatorEvidence,
          debugOperatorEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /submit", "project.distributed.job.submit", "body-project"],
    ["GET /job/:id", "project.distributed.job.read", "resolved-job-project"],
    [
      "GET /dead-letter",
      "project.distributed.dead-letter.list",
      "owner-project-set",
    ],
    [
      "POST /retry/:id",
      "project.distributed.dead-letter.retry",
      "resolved-job-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/distributed.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          distributedScopeEvidence,
          distributedScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /cluster", "system.distributed.cluster.read"],
    ["GET /queue", "system.distributed.queue.read"],
    ["GET /workers", "system.distributed.workers.read"],
    ["POST /scale", "system.distributed.scale.execute"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/distributed.ts|${operation}`,
        classified(
          "distributed-operator",
          "user-session",
          capability,
          "global-distributed-runtime",
          distributedScopeEvidence,
          distributedScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /compile", "project.api.v1.compile", "body-project"],
    ["POST /plan/create", "project.api.v1.plan.create", "body-project"],
    [
      "POST /plan/execute",
      "project.api.v1.plan.execute",
      "resolved-plan-project",
    ],
    ["GET /plan/:id", "project.api.v1.plan.read", "resolved-plan-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/api/v1/index.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          apiV1ScopeEvidence,
          apiV1ScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /status", "system.api.v1.status.read"],
    ["GET /contracts", "system.api.v1.contracts.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/api/v1/index.ts|${operation}`,
        classified(
          "authenticated",
          "user-session",
          capability,
          "api-v1-metadata",
          apiV1ScopeEvidence,
          apiV1ScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /compile/stream", "project.api.v2.compile.stream"],
    ["POST /plan/dag", "project.api.v2.plan.dag.create"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/api/v2/index.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "body-project",
          apiV2ScopeEvidence,
          apiV2ScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/api/v2/index.ts|GET /status",
    classified(
      "authenticated",
      "user-session",
      "system.api.v2.status.read",
      "api-v2-metadata",
      apiV2ScopeEvidence,
      apiV2ScopeEvidence,
    ),
  ],
  [
    "rest|server/src/routes/agentCollaboration.ts|POST /run",
    classified(
      "project-owner",
      "user-session",
      "project.agent-collaboration.run",
      "body-project",
      agentCollaborationScopeEvidence,
      agentCollaborationScopeEvidence,
    ),
  ],
  ...[
    ["GET /status", "system.agent-collaboration.status.read"],
    ["GET /messages", "system.agent-collaboration.messages.read"],
    ["GET /metrics", "system.agent-collaboration.metrics.read"],
    ["GET /consensus", "system.agent-collaboration.consensus.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/agentCollaboration.ts|${operation}`,
        classified(
          "collaboration-operator",
          "user-session",
          capability,
          "global-agent-collaboration-runtime",
          agentCollaborationScopeEvidence,
          agentCollaborationScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/autonomous.ts|GET /project/:projectId/latest",
    classified(
      "project-owner",
      "user-session",
      "project.autonomous.latest.read",
      "path-project",
      autonomousHealthScopeEvidence,
      autonomousHealthScopeEvidence,
    ),
  ],
  ...[
    ["GET /health/database", "system.health.database.read"],
    ["GET /health/storage", "system.health.storage.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/index.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          "system-operational-metadata",
          autonomousHealthScopeEvidence,
          autonomousHealthScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/aiChat.ts|POST /chat",
    classified(
      "authenticated",
      "user-session",
      "user.ai-chat.execute",
      "current-user-session",
      aiChatSessionEvidence,
      aiChatSessionEvidence,
    ),
  ],
  ...[
    ["GET /genres", "system.domain.genres.list", "domain-taxonomy"],
    ["GET /genres/:genre", "system.domain.genre.read", "domain-taxonomy"],
    ["GET /patterns", "system.domain.patterns.read", "domain-knowledge"],
    [
      "GET /recommendations",
      "system.domain.recommendations.read",
      "domain-knowledge",
    ],
    ["POST /analyze", "system.domain.analysis.execute", "request-domain-input"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/domain.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          scope,
          domainScopeEvidence,
          domainScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /analyze", "project.economy.analyze"],
    ["POST /simulate", "project.economy.simulate"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/economy.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "body-blueprint-project",
          economyScopeEvidence,
          economyScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/economy.ts|POST /balance",
    classified(
      "authenticated",
      "user-session-or-api-key",
      "system.economy.balance.execute",
      "request-economy-report",
      economyScopeEvidence,
      economyScopeEvidence,
    ),
  ],
  [
    "rest|server/src/routes/economy.ts|GET /report/:gameId",
    classified(
      "authenticated",
      "user-session-or-api-key",
      "system.economy.report.metadata.read",
      "placeholder-metadata",
      economyScopeEvidence,
      economyScopeEvidence,
    ),
  ],
  ...[
    ["GET /score/:agent", "system.evaluation.score.read"],
    ["GET /history", "system.evaluation.history.read"],
    ["GET /alerts", "system.evaluation.alerts.read"],
    ["POST /run", "system.evaluation.suite.execute"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/evaluation.ts|${operation}`,
        classified(
          "evaluation-operator",
          "user-session",
          capability,
          "global-evaluation-runtime",
          evaluationOperatorEvidence,
          evaluationOperatorEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/world.ts|POST /simulate",
    classified(
      "project-owner",
      "user-session",
      "project.world.simulate",
      "body-blueprint-project",
      worldScopeEvidence,
      worldScopeEvidence,
    ),
  ],
  ...[
    ["POST /tick", "system.world.tick.metadata.read", "placeholder-metadata"],
    [
      "GET /state/:gameId",
      "system.world.state.metadata.read",
      "placeholder-metadata",
    ],
    [
      "GET /emergence/:gameId",
      "system.world.emergence.metadata.read",
      "placeholder-metadata",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/world.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          scope,
          worldScopeEvidence,
          worldScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /start", "project.lifecycle.start", "body-game-project"],
    ["POST /tick", "project.lifecycle.tick", "body-game-project"],
    ["POST /patch", "project.lifecycle.patch", "body-blueprint-project"],
    [
      "GET /status/:gameId",
      "project.lifecycle.status.read",
      "path-game-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/lifecycle.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          lifecycleScopeEvidence,
          lifecycleScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /:agentId", "project.memory.entries.read", "query-project"],
    ["POST /store", "project.memory.entry.store", "body-project"],
    ["POST /search", "project.memory.search", "body-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/memory.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          memoryScopeEvidence,
          memoryScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/memory.ts|GET /system/stats",
    classified(
      "memory-operator",
      "user-session",
      "system.memory.stats.read",
      "global-memory-runtime",
      memoryScopeEvidence,
      memoryScopeEvidence,
    ),
  ],
  ...[
    ["POST /create", "project.planning.create", "body-project"],
    ["POST /execute", "project.planning.execute", "resolved-plan-project"],
    ["GET /:id", "project.planning.read", "resolved-plan-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/planning.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          planningScopeEvidence,
          planningScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /status", "system.platform.status.read", "platform-runtime-metadata"],
    ["GET /agents", "system.platform.agents.list", "governance-agent-registry"],
    [
      "GET /agents/:id",
      "system.platform.agent.read",
      "governance-agent-registry",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/system.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          scope,
          systemMetadataScopeEvidence,
          systemMetadataScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/compile.ts|POST /",
    classified(
      "project-owner",
      "user-session",
      "project.compile.execute",
      "body-project",
      compileScopeEvidence,
      compileScopeEvidence,
    ),
  ],
  ...[
    ["POST /game", "project.simulation.game.execute", "body-blueprint-project"],
    ["POST /run", "project.simulation.run.execute", "body-blueprint-project"],
    [
      "GET /metrics/:gameId",
      "project.simulation.metrics.read",
      "path-game-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/simulation.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          simulationScopeEvidence,
          simulationScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/simulation.ts|POST /feedback",
    classified(
      "authenticated",
      "user-session-or-api-key",
      "system.simulation.feedback.analyze",
      "request-simulation-report",
      simulationScopeEvidence,
      simulationScopeEvidence,
    ),
  ],
  ...[
    ["POST /game", "project.generation.v2.game.execute", "body-project"],
    [
      "POST /lua",
      "project.generation.v2.lua.generate",
      "body-blueprint-project",
    ],
    [
      "POST /export",
      "project.generation.v2.export.generate",
      "body-blueprint-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/generation-v2.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          generationV2ScopeEvidence,
          generationV2ScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/generation-v2.ts|POST /blueprint",
    classified(
      "authenticated",
      "user-session-or-api-key",
      "system.generation.v2.blueprint.generate",
      "request-generation-outputs",
      generationV2ScopeEvidence,
      generationV2ScopeEvidence,
    ),
  ],
  ...[
    ["POST /generate", "project.lua.generate"],
    ["POST /generate-full", "project.lua.generate-full"],
    ["POST /assemble-experience", "project.lua.experience.assemble"],
    ["POST /generate-assets", "project.lua.assets.generate"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/luaGeneration.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "body-project",
          luaGenerationScopeEvidence,
          luaGenerationScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /run", "project.playtest.run", "body-project"],
    ["GET /:projectId", "project.playtest.report.read", "path-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/playtest.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          playtestScopeEvidence,
          playtestScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /run", "project.repair.run", "body-project"],
    ["GET /:projectId", "project.repair.session.read", "path-project"],
    ["GET /history/:projectId", "project.repair.history.read", "path-project"],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/repair.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          repairScopeEvidence,
          repairScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    [
      "GET /patterns",
      "system.knowledge.patterns.read",
      "knowledge-pattern-registry",
    ],
    [
      "GET /prompts",
      "system.knowledge.prompts.read",
      "knowledge-prompt-registry",
    ],
    ["GET /search", "system.knowledge.search", "knowledge-runtime"],
    [
      "GET /recommend",
      "system.knowledge.recommendations.read",
      "knowledge-runtime",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/knowledge.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          scope,
          knowledgeScopeEvidence,
          knowledgeScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/knowledge.ts|POST /store",
    classified(
      "project-owner",
      "user-session",
      "project.knowledge.record.store",
      "body-project",
      knowledgeScopeEvidence,
      knowledgeScopeEvidence,
    ),
  ],
  ...[
    ["POST /analyze", "system.game-architect.analysis.execute"],
    ["POST /generate-design", "system.game-architect.design.generate"],
    ["POST /generate-prompts", "system.game-architect.prompts.generate"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/gameArchitect.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          "request-game-idea",
          gameArchitectScopeEvidence,
          gameArchitectScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["GET /:projectId/history", "project.chat.history.read", "path-project"],
    [
      "GET /conversation/:id",
      "project.chat.conversation.read",
      "resolved-conversation-project",
    ],
    [
      "POST /message",
      "project.chat.message.create",
      "body-or-resolved-conversation-project",
    ],
    [
      "DELETE /conversation/:id",
      "project.chat.conversation.delete",
      "resolved-conversation-project",
    ],
  ].map(
    ([operation, capability, scope]) =>
      [
        `rest|server/src/routes/chatPersistence.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          scope,
          chatPersistenceScopeEvidence,
          chatPersistenceScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/platform.ts|POST /users",
    classified(
      "platform-operator",
      "user-session",
      "system.platform.users.create",
      "global-user-directory",
      platformRemainingScopeEvidence,
      platformRemainingScopeEvidence,
    ),
  ],
  ...[
    ["GET /registry/agents", "system.platform.registry.agents.list"],
    ["GET /registry/agents/:id", "system.platform.registry.agent.read"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/platform.ts|${operation}`,
        classified(
          "authenticated",
          "user-session-or-api-key",
          capability,
          "platform-agent-registry",
          platformRemainingScopeEvidence,
          platformRemainingScopeEvidence,
        ),
      ] as const,
  ),
  ...[
    ["POST /generate", "user.concept.create"],
    ["GET /:id", "user.concept.read"],
    ["POST /experience/generate", "user.concept.pipeline.generate"],
  ].map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/concept.ts|${operation}`,
        classified(
          "user-self",
          "user-session",
          capability,
          "session-owned-concept",
          conceptEntryScopeEvidence,
          conceptEntryScopeEvidence,
        ),
      ] as const,
  ),
  [
    "rest|server/src/routes/concept.ts|POST /experience/generate-direct",
    classified(
      "project-owner",
      "user-session",
      "project.concept.pipeline.generate-direct",
      "body-project",
      conceptEntryScopeEvidence,
      conceptEntryScopeEvidence,
    ),
  ],
  [
    "rest|server/src/routes/autonomous.ts|POST /run",
    classified(
      "project-owner",
      "user-session",
      "project.autonomous.run",
      "body-project",
      autonomousRunScopeEvidence,
      autonomousRunScopeEvidence,
    ),
  ],
  [
    "rest|server/src/routes/game-generation.ts|GET /generation/stream",
    classified(
      "project-owner",
      "user-session",
      "project.generation.stream.read",
      "query-project",
      gameGenerationFinalScopeEvidence,
      gameGenerationFinalScopeEvidence,
    ),
  ],
  [
    "rest|server/src/routes/game-generation.ts|GET /system/cache-stats",
    classified(
      "generation-operator",
      "user-session",
      "system.generation.cache-stats.read",
      "global-generation-cache",
      gameGenerationFinalScopeEvidence,
      gameGenerationFinalScopeEvidence,
    ),
  ],
  ...(
    [
      [
        "GET /:projectId/blueprint/proposals",
        "project.blueprint.proposals.read",
      ],
      [
        "POST /:projectId/blueprint/proposals",
        "project.blueprint.proposals.create",
      ],
      [
        "POST /:projectId/blueprint/proposals/:proposalId/accept",
        "project.blueprint.proposals.accept",
      ],
      [
        "POST /:projectId/blueprint/proposals/:proposalId/reject",
        "project.blueprint.proposals.reject",
      ],
    ] as const
  ).map(
    ([operation, capability]) =>
      [
        `rest|server/src/routes/game-generation.ts|${operation}`,
        classified(
          "project-owner",
          "user-session",
          capability,
          "path-project",
          blueprintProposalEvidence,
          blueprintProposalEvidence,
        ),
      ] as const,
  ),
  [
    "socket|server/src/socket/index.ts|project:leave",
    classified(
      "authenticated",
      "user-session",
      "project.room.leave",
      "joined-project",
      socketLeaveParityEvidence,
      socketLeaveParityEvidence,
    ),
  ],
]);

/**
 * AUDIT object-binding sweep. Rules are matched most specific first and keyed by
 * source plus resourceScope rather than by individual operation, so a route
 * added to a family already reviewed inherits that family's verdict instead of
 * silently defaulting to unreviewed.
 *
 * Only families whose handlers were actually read carry a verdict here. Every
 * other family derives `indirect-unreviewed` and is recorded as an open gap.
 */
const MAR_STUDIO_COMMAND =
  "server/src/__tests__/mar001.studio-command-concealment.test.ts";
const MAR_STUDIO_PROTOCOL =
  "server/src/__tests__/mar001.studio-protocol-binding.test.ts";
const MAR_STUDIO_CLOSURE =
  "server/src/__tests__/mar001.studio-surface-closure.test.ts";
const MAR_CONVERSATION =
  "server/src/__tests__/mar001.conversation-ownership.test.ts";
const MAR_JOB = "server/src/__tests__/mar001.job-ownership.test.ts";
const MAR_AUTONOMOUS =
  "server/src/__tests__/mar001.autonomous-session-ownership.test.ts";

/**
 * Recorded verdicts, keyed most specific first.
 *
 * These live here rather than in the generated file because the generated file
 * is generated: running this script used to reset every recorded verdict to
 * `indirect-unreviewed` / `none-recorded`, silently discarding the evidence of
 * four remediation slices. Regeneration is now idempotent, and `--check`
 * refuses a committed matrix that this script would not produce.
 */
const bindingRules: ReadonlyArray<{
  source?: string;
  scope?: string;
  operations?: readonly string[];
  binding: string;
  crossTenantEvidence: string;
}> = [
  // MAR-001, recorded by executed cross-tenant request rather than by reading.
  // Studio command routes: SEC-STUDIO-COMMAND-DISCLOSURE-001.
  {
    source: "server/src/routes/studio.ts",
    operations: [
      "GET /commands/:commandId",
      "POST /commands/:commandId/acknowledge",
      "POST /commands/:commandId/result",
    ],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_STUDIO_COMMAND,
  },
  // SEC-STUDIO-PROTOCOL-BINDING-001 and SEC-STUDIO-STATUS-COUNT-001.
  {
    source: "server/src/routes/studio.ts",
    operations: ["POST /protocol/message", "GET /status"],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_STUDIO_PROTOCOL,
  },
  // The rest of the Studio surface, correct already and now exercised.
  {
    source: "server/src/routes/studio.ts",
    operations: ["GET /protocol/info"],
    binding: "not-resource-scoped",
    crossTenantEvidence: MAR_STUDIO_CLOSURE,
  },
  {
    source: "server/src/routes/studio.ts",
    binding: "indirect-verified",
    crossTenantEvidence: MAR_STUDIO_CLOSURE,
  },
  // SEC-CONVERSATION-DISCLOSURE-001: migrated to the canonical helper.
  {
    source: "server/src/routes/chatPersistence.ts",
    operations: [
      "GET /conversation/:id",
      "POST /message",
      "DELETE /conversation/:id",
    ],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_CONVERSATION,
  },
  // SEC-JOB-DISCLOSURE-001 and SEC-JOB-DOUBLE-RESPONSE-001.
  {
    source: "server/src/routes/distributed.ts",
    operations: [
      "GET /job/:id",
      "POST /retry/:id",
      "GET /dead-letter",
      "POST /submit",
    ],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_JOB,
  },
  // Plan access was already correct. Exercised, not rewritten.
  {
    source: "server/src/routes/planning.ts",
    operations: ["GET /:id", "POST /execute", "POST /create"],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_JOB,
  },
  // Autonomous session control resolves the session and conceals a foreign one
  // as absent. Correct before this pass; it lacked only evidence.
  {
    source: "server/src/routes/autonomous.ts",
    scope: "resolved-session-project",
    binding: "indirect-verified",
    crossTenantEvidence: MAR_AUTONOMOUS,
  },
  {
    source: "server/src/routes/autonomous.ts",
    operations: ["POST /run"],
    binding: "indirect-verified",
    crossTenantEvidence: MAR_AUTONOMOUS,
  },
  {
    // The project id is in the path and is authorized directly. Recording it as
    // an indirect resolution would overstate what the route does.
    source: "server/src/routes/autonomous.ts",
    operations: ["GET /project/:projectId/latest"],
    binding: "path-scoped",
    crossTenantEvidence: MAR_AUTONOMOUS,
  },
  // concept.ts resolves both identifiers in router.param middleware
  // (concept.ts:45-70): the pipeline or artifact is fetched, its owning project
  // is derived, access is checked against that project, and denial is concealed
  // as 404. The binding is real. Its only cross-owner evidence asserts strings
  // in the router source, so it cannot show a cross-owner request being denied.
  {
    source: "server/src/routes/concept.ts",
    scope: "resolved-pipeline-project",
    binding: "indirect-verified",
    crossTenantEvidence: "static-source-only",
  },
  {
    source: "server/src/routes/concept.ts",
    scope: "resolved-artifact-project",
    binding: "indirect-verified",
    crossTenantEvidence: "static-source-only",
  },
  // game-generation.ts blueprint reads resolve the blueprint first and then
  // authorize against blueprint.project_id, which is the correct order.
  {
    source: "server/src/routes/game-generation.ts",
    scope: "resolved-blueprint-project",
    binding: "indirect-verified",
    crossTenantEvidence: "none-recorded",
  },
  // economy, world, simulation, lifecycle and generation-v2 all take the whole
  // blueprint from req.body and call requireProjectAccess(blueprint.id), using a
  // field named like a blueprint identifier as a project identifier. lifecycle
  // POST /tick is the only one that first asserts blueprint.id === gameId.
  {
    scope: "body-blueprint-project",
    binding: "body-supplied-object",
    crossTenantEvidence: "none-recorded",
  },
  // platform.ts user-self routes are exercised against a live server by
  // security2gE.authorization-domains.test.ts, which issues a real foreign
  // request rather than asserting source text.
  {
    source: "server/src/routes/platform.ts",
    scope: "path-user",
    binding: "path-scoped",
    crossTenantEvidence:
      "server/src/__tests__/security2gE.authorization-domains.test.ts",
  },
];

function deriveResourceBinding(resourceScope: string): string {
  if (resourceScope.startsWith("path-")) return "path-scoped";
  if (resourceScope.startsWith("global-")) return "not-resource-scoped";
  if (resourceScope === "authentication" || resourceScope === "public") {
    return "not-resource-scoped";
  }
  return "indirect-unreviewed";
}

function bindingFor(
  operation: Pick<MatrixOperation, "source" | "operation"> & {
    resourceScope: string;
  },
): Pick<
  MatrixOperation,
  "resourceBinding" | "crossTenantEvidence" | "mar001Category"
> {
  const rule =
    bindingRules.find(
      (candidate) =>
        candidate.source === operation.source &&
        candidate.operations?.includes(operation.operation),
    ) ??
    bindingRules.find(
      (candidate) =>
        candidate.source === operation.source &&
        candidate.scope === operation.resourceScope,
    ) ??
    bindingRules.find(
      (candidate) =>
        candidate.source === operation.source &&
        candidate.scope === undefined &&
        candidate.operations === undefined,
    ) ??
    bindingRules.find(
      (candidate) =>
        candidate.source === undefined &&
        candidate.scope === operation.resourceScope,
    );

  const resourceBinding = rule
    ? rule.binding
    : deriveResourceBinding(operation.resourceScope);
  const crossTenantEvidence = rule ? rule.crossTenantEvidence : "none-recorded";
  return {
    resourceBinding,
    crossTenantEvidence,
    mar001Category: categorise(resourceBinding, operation.resourceScope),
  };
}

/**
 * Scopes with nothing to bind: metadata, registries, values echoed back from the
 * request, and the caller's own session. Listed rather than pattern-matched,
 * because a scope quietly falling into the wrong bucket is how a real gap would
 * disappear from the count.
 */
const NOT_RESOURCE_BOUND_SCOPES: ReadonlySet<string> = new Set([
  "api-v1-metadata",
  "api-v2-metadata",
  "current-user",
  "current-user-session",
  "domain-knowledge",
  "domain-taxonomy",
  "governance-agent-registry",
  "knowledge-pattern-registry",
  "knowledge-prompt-registry",
  "knowledge-runtime",
  "placeholder-metadata",
  "platform-agent-registry",
  "platform-runtime-metadata",
  "request-domain-input",
  "request-economy-report",
  "request-game-idea",
  "request-generation-outputs",
  "request-simulation-report",
  "static-system-metadata",
  "system",
  "system-operational-metadata",
]);

/**
 * Scopes where the authorized identifier is itself the thing acted on, so the
 * mismatch MAR-001 exists to prevent cannot be expressed.
 */
const DIRECT_PROJECT_SCOPES: ReadonlySet<string> = new Set([
  "authorized-project-set",
  "authorized-project-set-or-client",
  "body-game-project",
  "body-project",
  "filtered-project-set",
  "owner-project-set",
  "path-game-project",
  "path-project",
  "query-project",
]);

function categorise(resourceBinding: string, resourceScope: string): string {
  // The strongest statement wins: a verified mechanism is verified whatever
  // shape its identifier has.
  if (resourceBinding === "indirect-verified") return "verified-correct";
  if (
    resourceBinding === "not-resource-scoped" ||
    NOT_RESOURCE_BOUND_SCOPES.has(resourceScope)
  ) {
    return "not-resource-bound";
  }
  if (
    resourceBinding === "path-scoped" ||
    DIRECT_PROJECT_SCOPES.has(resourceScope)
  ) {
    return "direct-project";
  }
  return "mechanism-gap";
}

/**
 * Outbound emissions are discovered rather than listed, so a new broadcast
 * cannot be added without appearing here as `global-unreviewed`.
 */
function discoverBroadcasts(): MatrixBroadcast[] {
  const discovered = new Map<string, MatrixBroadcast>();
  // Matches io.emit("literal", …) and io.emit(identifier, …). Emissions sent
  // through io.to(room).emit(…) are already scoped and are not global.
  const pattern = /\bio\.emit\(\s*(?:["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*))/g;

  for (const file of listTypeScriptFiles(serverRoot)) {
    const source = relativeSource(file);
    for (const match of fs.readFileSync(file, "utf8").matchAll(pattern)) {
      const event = match[1] ?? `dynamic:${match[2]}`;
      const rule = broadcastRules.find(
        (candidate) => candidate.source === source && candidate.event === event,
      );
      discovered.set(`${source}|${event}`, {
        event,
        source,
        targeting: rule?.targeting ?? "global-unreviewed",
        tenancyEvidence: rule?.tenancyEvidence ?? "none-recorded",
      });
    }
  }

  return [...discovered.values()].sort((left, right) =>
    `${left.source}|${left.event}`.localeCompare(
      `${right.source}|${right.event}`,
    ),
  );
}

const broadcastRules: ReadonlyArray<{
  source: string;
  event: string;
  targeting: string;
  tenancyEvidence: string;
}> = [
  // index.ts:263-272 emitForProject addresses project:<id> when evt.projectId is
  // present and falls back to a global broadcast when it is not.
  {
    source: "server/src/index.ts",
    event: "dynamic:eventName",
    targeting: "project-room-with-global-fallback",
    tenancyEvidence: "none-recorded",
  },
  // The evaluation, memory and planning branches sit in the same switch as
  // emitForProject, with the same evt.projectId in scope, and broadcast anyway.
  ...[
    "evaluation.started",
    "evaluation.completed",
    "evaluation.failed",
    "memory.created",
    "memory.updated",
    "memory.snapshot",
    "memory.decision",
    "planning.created",
    "planning.updated",
    "planning.step.selected",
    "planning.replanned",
    "planning.completed",
    "planning.failed",
  ].map((event) => ({
    source: "server/src/index.ts",
    event,
    targeting: "global-bypassing-available-scope",
    tenancyEvidence: "none-recorded",
  })),
  // index.ts:751 streams execution traces from an ExecutionTracer listener that
  // receives no project, so the payload cannot be scoped without plumbing one
  // through. It carries executionId, nodeId, agentId, evaluationScore and error.
  {
    source: "server/src/index.ts",
    event: "trace.event",
    targeting: "global-no-project-context",
    tenancyEvidence: "none-recorded",
  },
];

const current = JSON.parse(
  fs.readFileSync(matrixPath, "utf8"),
) as AuthorizationMatrix;
const currentByKey = new Map(
  current.operations.map((operation) => [operationKey(operation), operation]),
);

const operations = discoverOperations().map((operation): MatrixOperation => {
  const override = overrides.get(operationKey(operation));
  const existing = currentByKey.get(operationKey(operation));

  const resolved = override
    ? { ...operation, ...override }
    : existing
      ? { ...existing }
      : {
          ...operation,
          classification: "unclassified",
          principal: "unresolved",
          capability: "unresolved",
          resourceScope: "unresolved",
          positiveEvidence: "missing",
          negativeEvidence: "missing",
        };

  // Recomputed on every run rather than carried over from the existing file, so
  // a family's verdict cannot go stale once its rule changes.
  return { ...resolved, ...bindingFor(resolved) } as MatrixOperation;
});

const broadcasts = discoverBroadcasts();

const next: AuthorizationMatrix = {
  version: 1,
  controlId: "SECURITY-2G-E",
  operations,
  broadcasts,
};

const rendered = `${JSON.stringify(next, null, 2)}
`;

/**
 * `--check` refuses a committed matrix this script would not produce.
 *
 * Without it the generated file could be hand-edited and then silently reset by
 * the next run, which is exactly what happened: regenerating discarded the
 * recorded cross-tenant evidence of four remediation slices, and nothing
 * failed. Verdicts now live in the rules above, so regeneration is idempotent
 * and this check keeps it that way.
 */
if (process.argv.includes("--check")) {
  const committed = fs.existsSync(matrixPath)
    ? fs.readFileSync(matrixPath, "utf8")
    : "";
  const normalise = (value: string) => value.split("\r\n").join("\n");
  if (normalise(committed) !== normalise(rendered)) {
    console.error("Authorization matrix validation");
    console.error("  status: FAIL");
    console.error(
      "  error: the committed matrix is not what this generator produces.",
    );
    console.error(
      "  Edit the binding rules in this script, then regenerate. Editing the",
    );
    console.error("  generated file directly does not survive the next run.");
    process.exit(1);
  }
  console.log("Authorization matrix validation");
  console.log("  status: PASS");
  console.log(`  operations: ${operations.length}`);
  const categories = operations.reduce<Record<string, number>>(
    (totals, operation) => {
      totals[operation.mar001Category] =
        (totals[operation.mar001Category] ?? 0) + 1;
      return totals;
    },
    {},
  );
  for (const [category, total] of Object.entries(categories).sort()) {
    console.log(`  ${category}: ${total}`);
  }
} else {
  fs.writeFileSync(matrixPath, rendered);
  console.log(
    `Authorization matrix now tracks ${operations.length} operations and ${broadcasts.length} global broadcasts.`,
  );
}
