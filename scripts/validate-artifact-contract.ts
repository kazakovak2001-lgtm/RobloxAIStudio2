/**
 * ARTIFACT-CONTRACT-2 — static checks on the artifact envelope contract.
 *
 * Registry-level drift, not runtime state. It runs in `npm run validate` and
 * needs no database and no Studio: it checks that the contract's own tables are
 * coherent, that every dependency rule names real stages, and that the
 * canonical serializer still produces order-independent identity.
 */
import {
  ARTIFACT_DEPENDENCY_RULES,
  ARTIFACT_ENVELOPE_SCHEMA_VERSION,
  CONTENT_HASH_ALGORITHM,
  DETERMINISTIC_PRODUCERS,
  computeContentHash,
} from "../server/src/pipeline/v2/artifactEnvelope";
import { STAGE_ORDER } from "../server/src/pipeline/v2/PipelineStage";

function main(): void {
  const errors: string[] = [];
  const stages = new Set<string>(STAGE_ORDER);

  if (
    !Number.isInteger(ARTIFACT_ENVELOPE_SCHEMA_VERSION) ||
    ARTIFACT_ENVELOPE_SCHEMA_VERSION < 1
  ) {
    errors.push("envelope schema version must be a positive integer");
  }

  for (const [id, version] of Object.entries(DETERMINISTIC_PRODUCERS)) {
    if (!Number.isInteger(version) || version < 1) {
      errors.push(`deterministic producer "${id}" has a non-positive version`);
    }
  }

  // A rule naming a stage that no longer exists would silently stop enforcing
  // lineage for that stage rather than failing.
  for (const [stage, upstream] of Object.entries(ARTIFACT_DEPENDENCY_RULES)) {
    if (!stages.has(stage)) {
      errors.push(`dependency rule names unknown stage "${stage}"`);
    }
    for (const dependency of upstream ?? []) {
      if (!stages.has(dependency)) {
        errors.push(
          `dependency rule for "${stage}" names unknown upstream stage "${dependency}"`,
        );
      }
    }
  }

  // The property the whole content identity rests on: logically equal payloads
  // hash equally regardless of key order, and array order still matters.
  const ordered = computeContentHash({ a: 1, b: { c: 2, d: [1, 2] } });
  const reordered = computeContentHash({ b: { d: [1, 2], c: 2 }, a: 1 });
  const reversedArray = computeContentHash({ a: 1, b: { c: 2, d: [2, 1] } });
  if (ordered !== reordered) {
    errors.push("canonical serialization is sensitive to object key order");
  }
  if (ordered === reversedArray) {
    errors.push("canonical serialization ignores array order");
  }
  if (!ordered.startsWith("sha256:")) {
    errors.push("content hash is not labelled with its algorithm");
  }

  console.log("Artifact contract validation");
  console.log(`  envelope schema version: ${ARTIFACT_ENVELOPE_SCHEMA_VERSION}`);
  console.log(`  content hash algorithm: ${CONTENT_HASH_ALGORITHM}`);
  console.log(
    `  deterministic producers: ${Object.keys(DETERMINISTIC_PRODUCERS).length}`,
  );
  console.log(
    `  stages with lineage rules: ${Object.keys(ARTIFACT_DEPENDENCY_RULES).length}`,
  );
  console.log(`  status: ${errors.length === 0 ? "pass" : "fail"}`);

  for (const error of errors) console.error(`  error: ${error}`);
  if (errors.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
