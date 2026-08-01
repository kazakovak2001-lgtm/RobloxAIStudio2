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
}

interface AuthorizationMatrix {
  version: number;
  controlId: string;
  operations: MatrixOperation[];
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
]);

const current = JSON.parse(
  fs.readFileSync(matrixPath, "utf8"),
) as AuthorizationMatrix;
const currentByKey = new Map(
  current.operations.map((operation) => [operationKey(operation), operation]),
);

const operations = discoverOperations().map((operation): MatrixOperation => {
  const override = overrides.get(operationKey(operation));
  if (override) return { ...operation, ...override };

  const existing = currentByKey.get(operationKey(operation));
  if (existing) return existing;

  return {
    ...operation,
    classification: "unclassified",
    principal: "unresolved",
    capability: "unresolved",
    resourceScope: "unresolved",
    positiveEvidence: "missing",
    negativeEvidence: "missing",
  };
});

const next: AuthorizationMatrix = {
  version: 1,
  controlId: "SECURITY-2G-E",
  operations,
};

fs.writeFileSync(matrixPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Authorization matrix now tracks ${operations.length} operations.`);
