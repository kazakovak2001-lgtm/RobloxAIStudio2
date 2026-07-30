import {
  layerEdgeKey,
  type AllowedLayerEdge,
  type LayerViolation,
} from "./boundary-gate-core";

export const LAYER_DEBT_MILESTONES = [
  "RUNTIME-2D",
  "DURABILITY-2E",
  "STUDIO-2F",
] as const;

export type LayerDebtMilestone = (typeof LAYER_DEBT_MILESTONES)[number];

export interface LayerDebtOwner {
  sourceLayer: string;
  targetLayer: string;
  milestone: LayerDebtMilestone;
}

export interface LayerDebtEvidenceRow {
  sourceLayer: string;
  targetLayer: string;
  sourceDomain: string;
  targetDomain: string;
  file: string;
  importPath: string;
  milestone: LayerDebtMilestone;
}

export interface LayerDebtEvidenceDocument {
  version: "1.0.0";
  owners: LayerDebtOwner[];
  rows: LayerDebtEvidenceRow[];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function compareOwners(left: LayerDebtOwner, right: LayerDebtOwner): number {
  return (
    compareText(left.sourceLayer, right.sourceLayer) ||
    compareText(left.targetLayer, right.targetLayer) ||
    compareText(left.milestone, right.milestone)
  );
}

function compareRows(
  left: LayerDebtEvidenceRow,
  right: LayerDebtEvidenceRow,
): number {
  return (
    compareText(left.sourceLayer, right.sourceLayer) ||
    compareText(left.targetLayer, right.targetLayer) ||
    compareText(left.file, right.file) ||
    compareText(left.importPath, right.importPath) ||
    compareText(left.sourceDomain, right.sourceDomain) ||
    compareText(left.targetDomain, right.targetDomain) ||
    compareText(left.milestone, right.milestone)
  );
}

function canonicalOwners(owners: readonly LayerDebtOwner[]): LayerDebtOwner[] {
  return [...owners].sort(compareOwners);
}

function canonicalRows(
  rows: readonly LayerDebtEvidenceRow[],
): LayerDebtEvidenceRow[] {
  const seen = new Set<string>();
  return [...rows]
    .sort(compareRows)
    .filter((row) => {
      const key = [
        row.sourceLayer,
        row.targetLayer,
        row.sourceDomain,
        row.targetDomain,
        row.file,
        row.importPath,
        row.milestone,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildLayerDebtEvidence(
  allowedLayerEdges: readonly AllowedLayerEdge[],
  owners: readonly LayerDebtOwner[],
  violations: readonly LayerViolation[],
): LayerDebtEvidenceDocument {
  const allowedKeys = new Set(
    allowedLayerEdges.map((edge) => layerEdgeKey(edge.from, edge.to)),
  );
  const ownerByKey = new Map(
    owners.map((owner) => [
      layerEdgeKey(owner.sourceLayer, owner.targetLayer),
      owner,
    ]),
  );

  const rows = violations.flatMap((violation) => {
    const key = layerEdgeKey(violation.sourceLayer, violation.targetLayer);
    const owner = ownerByKey.get(key);
    if (!allowedKeys.has(key) || !owner) return [];

    return [
      {
        sourceLayer: violation.sourceLayer,
        targetLayer: violation.targetLayer,
        sourceDomain: violation.sourceDomain,
        targetDomain: violation.targetDomain,
        file: violation.file,
        importPath: violation.importPath,
        milestone: owner.milestone,
      },
    ];
  });

  return {
    version: "1.0.0",
    owners: canonicalOwners(owners),
    rows: canonicalRows(rows),
  };
}

export function validateLayerDebtEvidence(
  documented: LayerDebtEvidenceDocument,
  allowedLayerEdges: readonly AllowedLayerEdge[],
  violations: readonly LayerViolation[],
): string[] {
  const errors: string[] = [];
  const validMilestones = new Set<string>(LAYER_DEBT_MILESTONES);
  const allowedKeys = new Set(
    allowedLayerEdges.map((edge) => layerEdgeKey(edge.from, edge.to)),
  );
  const ownerKeys = new Set<string>();

  for (const owner of documented.owners) {
    const key = layerEdgeKey(owner.sourceLayer, owner.targetLayer);
    if (ownerKeys.has(key)) {
      errors.push(`Layer debt owner '${key}' is duplicated.`);
    }
    ownerKeys.add(key);

    if (!validMilestones.has(owner.milestone)) {
      errors.push(
        `Layer debt owner '${key}' has unknown milestone '${owner.milestone}'.`,
      );
    }
  }

  for (const key of allowedKeys) {
    if (!ownerKeys.has(key)) {
      errors.push(`Allowed layer edge '${key}' has no debt owner.`);
    }
  }

  for (const key of ownerKeys) {
    if (!allowedKeys.has(key)) {
      errors.push(`Layer debt owner '${key}' has no allowed layer edge.`);
    }
  }

  const generated = buildLayerDebtEvidence(
    allowedLayerEdges,
    documented.owners,
    violations,
  );
  const canonicalDocumented: LayerDebtEvidenceDocument = {
    version: documented.version,
    owners: canonicalOwners(documented.owners),
    rows: canonicalRows(documented.rows),
  };

  if (JSON.stringify(canonicalDocumented) !== JSON.stringify(generated)) {
    errors.push(
      [
        "Layer debt evidence drift detected.",
        "Expected canonical evidence:",
        JSON.stringify(generated, null, 2),
        "Documented evidence:",
        JSON.stringify(canonicalDocumented, null, 2),
      ].join("\n"),
    );
  }

  return errors;
}
