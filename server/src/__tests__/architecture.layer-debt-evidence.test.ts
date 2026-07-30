import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ImportBoundaryValidator } from "../core/architecture/ImportBoundaryValidator";
import { buildAstImportInventory } from "../../../scripts/architecture/ast-import-inventory";
import {
  collectLayerViolations,
  type ArchitectureManifest,
  type LayerViolation,
} from "../../../scripts/architecture/boundary-gate-core";
import {
  buildLayerDebtEvidence,
  validateLayerDebtEvidence,
  type LayerDebtEvidenceDocument,
  type LayerDebtOwner,
} from "../../../scripts/architecture/layer-debt-evidence";

const ROOT = process.cwd();

function fixtureViolation(
  overrides: Partial<LayerViolation> = {},
): LayerViolation {
  return {
    from: "studio",
    to: "platform",
    file: "server/src/studio/StudioProjectImporter.ts",
    importPath: "../platform/storage",
    sourceLayer: "domains",
    targetLayer: "api",
    sourceDomain: "studio",
    targetDomain: "platform",
    ...overrides,
  };
}

describe("layer debt evidence", () => {
  it("builds stable evidence rows from acknowledged layer violations", () => {
    const allowedLayerEdges = [
      {
        from: "domains",
        to: "api",
        reason: "Owned by STUDIO-2F.",
      },
    ];
    const owners: LayerDebtOwner[] = [
      {
        sourceLayer: "domains",
        targetLayer: "api",
        milestone: "STUDIO-2F",
      },
    ];

    const evidence = buildLayerDebtEvidence(allowedLayerEdges, owners, [
      fixtureViolation(),
      fixtureViolation(),
    ]);

    expect(evidence.rows).toEqual([
      {
        sourceLayer: "domains",
        targetLayer: "api",
        sourceDomain: "studio",
        targetDomain: "platform",
        file: "server/src/studio/StudioProjectImporter.ts",
        importPath: "../platform/storage",
        milestone: "STUDIO-2F",
      },
    ]);
  });

  it("fails when documented evidence drifts from the AST inventory", () => {
    const allowedLayerEdges = [
      {
        from: "domains",
        to: "api",
        reason: "Owned by STUDIO-2F.",
      },
    ];
    const documented: LayerDebtEvidenceDocument = {
      version: "1.0.0",
      owners: [
        {
          sourceLayer: "domains",
          targetLayer: "api",
          milestone: "STUDIO-2F",
        },
      ],
      rows: [],
    };

    expect(
      validateLayerDebtEvidence(documented, allowedLayerEdges, [
        fixtureViolation(),
      ]),
    ).toEqual([
      expect.stringContaining("Layer debt evidence drift detected."),
    ]);
  });

  it("matches the tracked evidence against the real repository AST", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "architecture.manifest.json"), "utf8"),
    ) as ArchitectureManifest;
    const documented = JSON.parse(
      readFileSync(join(ROOT, "architecture.layer-debt.json"), "utf8"),
    ) as LayerDebtEvidenceDocument;
    const validator = new ImportBoundaryValidator(ROOT);
    const inventory = buildAstImportInventory(ROOT, validator);
    const violations = collectLayerViolations(manifest, inventory.edges);

    expect(
      validateLayerDebtEvidence(
        documented,
        manifest.allowedLayerEdges ?? [],
        violations,
      ),
    ).toEqual([]);
  });
});
