import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImportBoundaryValidator } from "../server/src/core/architecture/ImportBoundaryValidator";
import { buildAstImportInventory } from "./architecture/ast-import-inventory";
import {
  collectLayerViolations,
  type ArchitectureManifest,
} from "./architecture/boundary-gate-core";
import {
  validateLayerDebtEvidence,
  type LayerDebtEvidenceDocument,
} from "./architecture/layer-debt-evidence";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(join(root, "architecture.manifest.json"), "utf8"),
) as ArchitectureManifest;
const documented = JSON.parse(
  readFileSync(join(root, "architecture.layer-debt.json"), "utf8"),
) as LayerDebtEvidenceDocument;
const validator = new ImportBoundaryValidator(root);
const inventory = buildAstImportInventory(root, validator);
const violations = collectLayerViolations(manifest, inventory.edges);
const errors = validateLayerDebtEvidence(
  documented,
  manifest.allowedLayerEdges ?? [],
  violations,
);

if (errors.length > 0) {
  console.error("Layer debt evidence validation failed:\n");
  for (const error of errors) console.error(`${error}\n`);
  process.exit(1);
}

console.log(
  `Layer debt evidence valid: ${documented.rows.length} exact AST edge(s), ${documented.owners.length} owned layer exception(s).`,
);
