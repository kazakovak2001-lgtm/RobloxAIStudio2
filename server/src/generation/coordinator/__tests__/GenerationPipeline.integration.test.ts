/**
 * Generation Pipeline Integration Tests
 *
 * Tests the complete pipeline:
 *   Request → Validation → Planning → Execution → Artifact → Package → Validation
 */

import { describe, it, expect } from "vitest";
import { GenerationCoordinator } from "../GenerationCoordinator";
import { GenerationContextBuilder } from "../GenerationContext";
import { ArtifactAssembler } from "../ArtifactAssembler";
import { PipelineIntegrityValidator } from "../PipelineIntegrityValidator";
import { GenerationPackageBuilder } from "../GenerationPackageBuilder";
import { ProjectStructureValidator } from "../ProjectStructureValidator";
import { AgentDependencyResolver } from "../AgentExecutionManager";
import { AgentRegistry } from "../../../agents/core/AgentRegistry";
import type { GenerationContext, GeneratedArtifact } from "../types";
import { createArtifactId } from "../types";

describe("GenerationContextBuilder", () => {
  it("creates a valid context", () => {
    const ctx = GenerationContextBuilder.create({
      jobId: "job-1",
      projectId: "proj-1",
      intent: "Generate obby game",
      constraints: ["kid-friendly"],
    });

    expect(ctx.sessionId).toMatch(/^gen-/);
    expect(ctx.jobId).toBe("job-1");
    expect(ctx.stages).toHaveLength(0);
    expect(ctx.outputs).toEqual({});
    expect(ctx.startedAt).toBeGreaterThan(0);
  });

  it("tracks stage lifecycle", () => {
    const ctx = GenerationContextBuilder.create({
      jobId: "job-1",
      projectId: "proj-1",
      intent: "Test",
      constraints: [],
    });

    GenerationContextBuilder.beginStage(ctx, "planning");
    expect(ctx.stages[0].status).toBe("running");

    GenerationContextBuilder.completeStage(ctx, "planning", { planId: "p1" });
    expect(ctx.stages[0].status).toBe("completed");
    expect(ctx.stages[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(ctx.outputs["planning"]).toEqual({ planId: "p1" });
  });

  it("tracks failed stages", () => {
    const ctx = GenerationContextBuilder.create({
      jobId: "job-1",
      projectId: "proj-1",
      intent: "Test",
      constraints: [],
    });

    GenerationContextBuilder.beginStage(ctx, "execution");
    GenerationContextBuilder.failStage(ctx, "execution", "Agent crashed");
    expect(ctx.stages[0].status).toBe("failed");
    expect(ctx.stages[0].error).toBe("Agent crashed");
  });
});

describe("ArtifactAssembler", () => {
  it("assembles artifacts from context", () => {
    const assembler = new ArtifactAssembler();
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [],
      outputs: {
        lua_generator: {
          scripts: { server: ["print('hello')"], client: ["print('world')"] },
        },
        game_designer: { gameplay: { mechanics: ["jump"] } },
      },
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };

    const result = assembler.assemble(ctx);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("detects duplicates", () => {
    const assembler = new ArtifactAssembler();
    const art: GeneratedArtifact = {
      id: "a1",
      type: "lua-script",
      path: "scripts/server/main.lua",
      content: "print('hi')",
      size: 20,
      generatedBy: "lua_gen",
      timestamp: Date.now(),
    };
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [],
      outputs: {},
      artifacts: [art, { ...art, id: "a2" }],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };

    const result = assembler.assemble(ctx);
    expect(result.duplicatesRemoved).toBe(1);
  });
});

describe("AgentDependencyResolver", () => {
  it("resolves topological order", () => {
    const deps = [
      { agent: "lua_generator", dependencies: ["game_designer"] },
      { agent: "game_designer", dependencies: ["requirements"] },
      { agent: "requirements", dependencies: [] },
    ];

    const order = AgentDependencyResolver.resolve(deps);
    expect(order.indexOf("requirements")).toBeLessThan(
      order.indexOf("game_designer"),
    );
    expect(order.indexOf("game_designer")).toBeLessThan(
      order.indexOf("lua_generator"),
    );
  });
});

describe("PipelineIntegrityValidator", () => {
  it("detects missing stages", () => {
    const validator = new PipelineIntegrityValidator();
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [{ name: "planning", status: "completed", durationMs: 100 }],
      outputs: {},
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };

    const report = validator.validate(ctx, []);
    expect(report.valid).toBe(false);
    expect(report.missingDependencies.length).toBeGreaterThan(0);
  });

  it("passes when all stages complete", () => {
    const validator = new PipelineIntegrityValidator();
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [
        { name: "planning", status: "completed", durationMs: 10 },
        { name: "execution", status: "completed", durationMs: 50 },
        { name: "artifact-assembly", status: "completed", durationMs: 5 },
        { name: "validation", status: "completed", durationMs: 2 },
      ],
      outputs: {},
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };
    const arts: GeneratedArtifact[] = [
      {
        id: createArtifactId(),
        type: "metadata",
        path: "meta/out.json",
        content: {},
        size: 10,
        generatedBy: "test",
        timestamp: Date.now(),
      },
    ];

    const report = validator.validate(ctx, arts);
    expect(report.valid).toBe(true);
    expect(report.stagesExecuted).toBe(4);
  });
});

describe("GenerationPackageBuilder", () => {
  it("builds a complete package", () => {
    const builder = new GenerationPackageBuilder();
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [
        {
          name: "planning",
          status: "completed",
          startedAt: 1000,
          durationMs: 10,
        },
        {
          name: "execution",
          status: "completed",
          startedAt: 1010,
          durationMs: 50,
        },
        {
          name: "artifact-assembly",
          status: "completed",
          startedAt: 1060,
          durationMs: 5,
        },
        {
          name: "validation",
          status: "completed",
          startedAt: 1065,
          durationMs: 2,
        },
      ],
      outputs: { planning: { planId: "p1" } },
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };
    const arts: GeneratedArtifact[] = [
      {
        id: "a1",
        type: "lua-script",
        path: "scripts/server/main.lua",
        content: "print(1)",
        size: 16,
        generatedBy: "lua_gen",
        timestamp: Date.now(),
      },
    ];

    const pkg = builder.build(ctx, arts);
    expect(pkg.packageId).toMatch(/^pkg-/);
    expect(pkg.scripts).toHaveLength(1);
    expect(pkg.totalArtifacts).toBe(1);
    expect(pkg.metadata.generationId).toBe("gen-1");
  });
});

describe("ProjectStructureValidator", () => {
  it("validates a well-formed package", () => {
    const validator = new ProjectStructureValidator();
    const builder = new GenerationPackageBuilder();
    const ctx: GenerationContext = {
      sessionId: "gen-1",
      jobId: "j-1",
      projectId: "p-1",
      intent: "Test",
      constraints: [],
      stages: [
        {
          name: "planning",
          status: "completed",
          startedAt: 1000,
          durationMs: 10,
        },
        {
          name: "execution",
          status: "completed",
          startedAt: 1010,
          durationMs: 50,
        },
        {
          name: "artifact-assembly",
          status: "completed",
          startedAt: 1060,
          durationMs: 5,
        },
        {
          name: "validation",
          status: "completed",
          startedAt: 1065,
          durationMs: 2,
        },
      ],
      outputs: { planning: { planId: "p1" } },
      artifacts: [],
      timings: {},
      startedAt: Date.now(),
      metadata: {},
    };
    const arts: GeneratedArtifact[] = [
      {
        id: "a1",
        type: "lua-script",
        path: "scripts/server/main.lua",
        content: "print(1)",
        size: 16,
        generatedBy: "lua_gen",
        timestamp: Date.now(),
      },
    ];

    const pkg = builder.build(ctx, arts);
    const result = validator.validate(pkg);
    expect(result.valid).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });
});

describe("GenerationCoordinator (E2E)", () => {
  it("produces a generation result with metrics", async () => {
    const coordinator = new GenerationCoordinator(new AgentRegistry());
    const result = await coordinator.generate({
      jobId: "job-e2e-1",
      intent: "Generate an obby game with 5 levels",
      constraints: ["kid-friendly"],
      projectId: "test-project",
    });

    // Even with stub agents, the pipeline should execute
    expect(result.session.status).toMatch(/completed|failed/);
    expect(result.metrics.totalDurationMs).toBeGreaterThan(0);
    expect(result.metrics.planningDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.session.sessionId).toMatch(/^gen-/);
  });
});
