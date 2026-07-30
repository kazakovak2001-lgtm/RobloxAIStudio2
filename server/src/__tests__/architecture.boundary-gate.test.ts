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

function baseGateInput() {
  return {
    manifestErrors: [],
    criticalViolationCount: 0,
    cycles: [],
    unresolvedInternalImportCount: 0,
    layerViolations: [],
  };
}

describe("architecture boundary gate core", () => {
  it("accepts a consistent manifest", () => {
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

  it("rejects invalid layer exceptions", () => {
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

  it("detects forbidden layer edges", () => {
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

  it("reports explicit temporary layer debt", () => {
    const manifest = createManifest();
    const violations = collectLayerViolations(manifest, [edge()]);

    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
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

  it("fails a forbidden layer edge", () => {
    const manifest = createManifest();
    const violations = collectLayerViolations(manifest, [edge()]);

    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      layerViolations: violations,
    });

    expect(decision).toMatchObject({
      status: "FAIL",
      exitCode: 1,
      reasons: ["layer-edge"],
    });
  });

  it("normalizes and rejects cycles", () => {
    const acknowledged = evaluateBoundaryGate({
      ...baseGateInput(),
      cycles: [["planning", "socket", "execution", "planning"]],
      allowedCycles: [["execution", "socket", "planning"]],
    });

    expect(acknowledged.status).toBe("PASS");
    expect(acknowledged.acknowledgedCycles).toHaveLength(1);

    const rejected = evaluateBoundaryGate({
      ...baseGateInput(),
      cycles: [["game", "transport", "game"]],
    });

    expect(rejected.status).toBe("FAIL");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.reasons).toContain("cycle");
  });

  it("fails on manifest errors", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      manifestErrors: ["broken"],
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("manifest");
  });

  it("fails on critical boundary violations", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      criticalViolationCount: 1,
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("critical-boundary");
  });

  it("fails on unresolved internal imports", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      unresolvedInternalImportCount: 1,
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("unresolved-import");
  });
});