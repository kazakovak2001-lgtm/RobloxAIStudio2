import { describe, expect, it } from "vitest";
import {
  canonicalCycle,
  collectLayerViolations,
  evaluateBoundaryGate,
  validateManifestModel,
  type ArchitectureManifest,
  type ImportEdge,
} from "../../../scripts/architecture/boundary-gate-core";

const REAL_SUBSYSTEMS = ["core", "game", "transport", "routes"];

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
    manifestErrors: [] as string[],
    criticalViolationCount: 0,
    cycles: [] as string[][],
    unresolvedInternalImportCount: 0,
    layerViolations: [],
  };
}

describe("architecture boundary gate core", () => {
  it("accepts a consistent manifest", () => {
    const manifest = createManifest();
    const errors = validateManifestModel(manifest, REAL_SUBSYSTEMS);

    expect(errors).toEqual([]);
  });

  it("rejects unmodeled and stale subsystems", () => {
    const manifest = createManifest();
    const subsystems = ["core", "game", "transport", "new-domain"];
    const errors = validateManifestModel(manifest, subsystems);

    expect(errors).toContain("Unmodeled server/src subsystem: 'new-domain'.");
    expect(errors).toContain("Manifest models non-subsystem path: 'routes'.");
  });

  it("normalizes manifest paths before subsystem modeling", () => {
    const manifest = createManifest();
    manifest.domains.core.path = "server/src/core/../routes";

    const errors = validateManifestModel(manifest, REAL_SUBSYSTEMS);

    expect(errors).toContain("Unmodeled server/src subsystem: 'core'.");
    expect(errors).toContain(
      "Subsystem 'routes' is modeled by both 'core' and 'routes'.",
    );
  });

  it("rejects invalid layer exceptions", () => {
    const manifest = createManifest();
    manifest.domains.game.layer = "missing";
    manifest.allowedLayerEdges = [
      { from: "api", to: "domains", reason: "already legal" },
      { from: "api", to: "domains", reason: "duplicate" },
    ];

    const errors = validateManifestModel(manifest, REAL_SUBSYSTEMS);
    const unknownLayer = "Domain 'game' references unknown layer 'missing'.";
    const staleEdge =
      "Allowed layer edge 'api → domains' is stale because the edge is already permitted.";
    const duplicateEdge = "Allowed layer edge 'api → domains' is duplicated.";

    expect(errors).toContain(unknownLayer);
    expect(errors).toContain(staleEdge);
    expect(errors).toContain(duplicateEdge);
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
    const sourceLayers = violations.map((item) => item.sourceLayer);
    const targetLayers = violations.map((item) => item.targetLayer);

    expect(violations).toHaveLength(4);
    expect(new Set(sourceLayers)).toEqual(new Set(["domains"]));
    expect(new Set(targetLayers)).toEqual(new Set(["api"]));
  });

  it("reports explicit temporary layer debt", () => {
    const manifest = createManifest();
    const violations = collectLayerViolations(manifest, [edge()]);
    const allowedLayerEdges = [
      {
        from: "domains",
        to: "api",
        reason: "Tracked migration debt owned by ARCH-205",
      },
    ];

    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      layerViolations: violations,
      allowedLayerEdges,
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

  it("normalizes cycle rotation without reversing edge direction", () => {
    const forward = ["planning", "socket", "execution", "planning"];
    const rotated = ["socket", "execution", "planning", "socket"];
    const reversed = ["planning", "execution", "socket", "planning"];

    expect(canonicalCycle(forward)).toBe(canonicalCycle(rotated));
    expect(canonicalCycle(forward)).not.toBe(canonicalCycle(reversed));

    const rejected = evaluateBoundaryGate({
      ...baseGateInput(),
      cycles: [reversed],
      allowedCycles: [forward],
    });

    expect(rejected.status).toBe("FAIL");
    expect(rejected.reasons).toContain("cycle");
  });

  it("acknowledges only explicitly allowlisted directed cycles", () => {
    const acknowledged = evaluateBoundaryGate({
      ...baseGateInput(),
      cycles: [["planning", "socket", "execution", "planning"]],
      allowedCycles: [["execution", "planning", "socket"]],
    });

    expect(acknowledged.status).toBe("PASS");
    expect(acknowledged.acknowledgedCycles).toHaveLength(1);

    const rejected = evaluateBoundaryGate({
      ...baseGateInput(),
      cycles: [["game", "transport", "game"]],
      allowedCycles: [],
    });

    expect(rejected.status).toBe("FAIL");
    expect(rejected.exitCode).toBe(1);
    expect(rejected.reasons).toContain("cycle");
  });

  it("fails for manifest errors", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      manifestErrors: ["broken"],
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("manifest");
  });

  it("fails for critical boundary violations", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      criticalViolationCount: 1,
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("critical-boundary");
  });

  it("fails for unresolved internal imports", () => {
    const decision = evaluateBoundaryGate({
      ...baseGateInput(),
      unresolvedInternalImportCount: 1,
    });

    expect(decision.status).toBe("FAIL");
    expect(decision.exitCode).toBe(1);
    expect(decision.reasons).toContain("unresolved-import");
  });
});
