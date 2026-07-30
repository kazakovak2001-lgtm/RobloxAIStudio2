import { describe, expect, it } from "vitest";
import {
  collectLayerViolations,
  evaluateBoundaryGate,
  validateManifestModel,
  type ArchitectureManifest,
  type ImportEdge,
} from "../../../scripts/architecture/boundary-gate-core";

function createManifest(): ArchitectureManifest {
  return {
    layers: {
      core: { modules: ["core"], canImportFrom: [] },
      domains: { modules: ["game"], canImportFrom: ["core"] },
      infrastructure: {
        modules: ["transport"],
        canImportFrom: ["core", "domains"],
      },
      api: {
        modules: ["routes"],
        canImportFrom: ["core", "domains", "infrastructure"],
      },
    },
    domains: {
      core: { path: "server/src/core", layer: "core" },
      game: { path: "server/src/game", layer: "domains" },
      transport: {
        path: "server/src/transport",
        layer: "infrastructure",
      },
      routes: { path: "server/src/routes", layer: "api" },
    },
    allowedCycles: [],
    allowedLayerEdges: [],
  };
}

function edge(overrides: Partial<ImportEdge> = {}): ImportEdge {
  return {
    from: "game",
    to: "routes",
    file: "server/src/game/example.ts",
    importPath: "../routes/example",
    ...overrides,
  };
}

describe("architecture boundary gate core", () => {
  it("accepts a complete and internally consistent manifest", () => {
    const manifest = createManifest();

    expect(
      validateManifestModel(manifest, ["core", "game", "transport", "routes"]),
    ).toEqual([]);
  });

  it("rejects unmodeled and stale subsystems", () => {
    const manifest = createManifest();

    const errors = validateManifestModel(manifest, [
      "core",
      "game",
      "transport",
      "new-domain",
    ]);

    expect(errors).toContain("Unmodeled server/src subsystem: 'new-domain'.");
    expect(errors).toContain("Manifest models non-subsystem path: 'routes'.");
  });

  it("rejects unknown layers, duplicate exceptions and stale allowlist entries", () => {
    const manifest = createManifest();
    manifest.domains.game.layer = "missing";
    manifest.allowedLayerEdges = [
      { from: "api", to: "domains", reason: "already legal" },
      { from: "api", to: "domains", reason: "duplicate" },
    ];

    const errors = validateManifestModel(manifest, [
      "core",
      "game",
      "transport",
      "routes",
    ]);

    expect(errors).toContain("Domain 'game' references unknown layer 'missing'.");
    expect(errors).toContain(
      "Allowed layer edge 'api → domains' is stale because the edge is already permitted.",
    );
    expect(errors).toContain(
      "Allowed layer edge 'api → domains' is duplicated.",
    );
  });

  it("detects a forbidden layer edge regardless of import syntax provenance", () => {
    const manifest = createManifest();
    const edges: ImportEdge[] = [
      edge({ importPath: "../routes/static" }),
      edge({
        file: "server/src/game/reexport.ts",
        importPath: "../routes/reexport",
      }),
      edge({
        file: "server/src/game/dynamic.ts",
        importPath: "../routes/dynamic",
      }),
      edge({
        file: "server/src/game/commonjs.ts",
        importPath: "../routes/commonjs",
      }),
    ];

    const violations = collectLayerViolations(manifest, edges);

    expect(violations).toHaveLength(4);
    expect(violations.every((item) => item.sourceLayer === "domains")).toBe(
      true,
    );
    expect(violations.every((item) => item.targetLayer === "api")).toBe(true);
  });

  it("acknowledges an explicit temporary layer edge without passing hidden debt as clean", () => {
    const manifest = createManifest();
    const violations = collectLayerViolations(manifest, [edge()]);

    const decision = evaluateBoundaryGate({
      manifestErrors: [],
      criticalViolationCount: 0,
      cycles: [],
      unresolvedInternalImportCount: 0,
      layerViolations: violations,
      allowedLayerEdges: [
        {
          from: "domains",
          to: "api",
          reason: "Tracked migration debt owned by ARCH-205",
        },
      ],
    });

    expect(decision.status).toBe("PASS");
    expect(decision.exitCode).toBe(0);
    expect(decision.acknowledgedLayerViolations).toHaveLength(1);
    expect(decision.unexpectedLayerViolations).toEqual([]);
  });

  it("fails a forbidden non-allowlisted layer edge", () => {
    const manifest = createManifest();
    const violations = collectLayerViolations(manifest, [edge()]);

    const decision = evaluateBoundaryGate({
      manifestErrors: [],
      criticalViolationCount: 0,
      cycles: [],
      unresolvedInternalImportCount: 0,
      layerViolations: violations,
    });

    expect(decision).toMatchObject({
      status: "FAIL",
      exitCode: 1,
      reasons: ["layer-edge"],
    });
  });

  it("normalizes cycle rotation and direction while rejecting non-allowlisted cycles", () => {
    const acknowledged = evaluateBoundaryGate({
      manifestErrors: [],
      criticalViolationCount: 0,
      cycles: [["planning", "socket", "execution", "planning"]],
      unresolvedInternalImportCount: 0,
      layerViolations: [],
      allowedCycles: [["execution", "socket", "planning"]],
    });

    expect(acknowledged.status).toBe("PASS");
    expect(acknowledged.acknowledgedCycles).toHaveLength(1);

    const rejected = evaluateBoundaryGate({
      manifestErrors: [],
      criticalViolationCount: 0,
      cycles: [["game", "transport", "game"]],
      unresolvedInternalImportCount: 0,
      layerViolations: [],
      allowedCycles: [],
    });

    expect(rejected.status).toBe("FAIL");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.reasons).toContain("cycle");
  });

  it.each([
    ["manifest", { manifestErrors: ["broken"] }],
    ["critical-boundary", { criticalViolationCount: 1 }],
    ["unresolved-import", { unresolvedInternalImportCount: 1 }],
  ] as const)(
    "derives report status and exit code from %s failure",
    (reason, patch) => {
      const decision = evaluateBoundaryGate({
        manifestErrors: [],
        criticalViolationCount: 0,
        cycles: [],
        unresolvedInternalImportCount: 0,
        layerViolations: [],
        ...patch,
      });

      expect(decision.status).toBe("FAIL");
      expect(decision.exitCode).toBe(1);
      expect(decision.reasons).toContain(reason);
    },
  );
});
