/**
 * INTENT-FIDELITY-001 — requirements that can be traced through a run.
 *
 * Requirements reached downstream agents as an opaque object of plain strings.
 * Nothing carried identity, so nothing could ask whether a specific constraint
 * had survived planning, design and generation. The answer was prose, and prose
 * cannot be checked.
 *
 * Two things here. Identity, so a requirement can be named; and coverage, so a
 * run reports which of its requirements it can actually show evidence for. The
 * second matters more: it turns "the pipeline handled the requirements" into a
 * list of the ones it did not.
 */

import type { RequirementCoverage, RequirementSpec } from "../types/blueprint";

/** Fields whose value the system filled in rather than the user stating it. */
export type AssumedFields = readonly string[];

interface RequirementSource {
  functional?: unknown;
  non_functional?: unknown;
  constraints?: unknown;
  success_criteria?: unknown;
}

const KINDS: ReadonlyArray<{
  key: keyof RequirementSource;
  kind: RequirementSpec["kind"];
}> = [
  { key: "functional", kind: "functional" },
  { key: "constraints", kind: "constraint" },
  { key: "success_criteria", kind: "success_criterion" },
  { key: "non_functional", kind: "non_functional" },
];

function asTexts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    // Non-functional requirements arrive as a record of named properties.
    return Object.entries(value as Record<string, unknown>)
      .filter(
        ([, entry]) => typeof entry === "string" || typeof entry === "number",
      )
      .map(([name, entry]) => `${name}: ${String(entry)}`.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Give every requirement in an agent's output a stable identity.
 *
 * A requirement whose text mentions a field the system assumed is marked
 * derived rather than user-stated. That is deliberately conservative: it can
 * under-claim, and under-claiming which requirements came from the user is the
 * safe direction. See INTENT-DEFAULT-CONTAMINATION-001.
 */
export function identifyRequirements(
  requirements: unknown,
  assumedValues: AssumedFields = [],
): RequirementSpec[] {
  if (!requirements || typeof requirements !== "object") return [];
  const source = requirements as RequirementSource;

  const derivedMarkers = assumedValues
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const specs: RequirementSpec[] = [];
  for (const { key, kind } of KINDS) {
    for (const text of asTexts(source[key])) {
      const lowered = text.toLowerCase();
      const derived = derivedMarkers.some((marker) => lowered.includes(marker));
      specs.push({
        id: `R-${String(specs.length + 1).padStart(3, "0")}`,
        text,
        kind,
        source: derived ? "derived" : "user-stated",
      });
    }
  }
  return specs;
}

/**
 * Report which requirements this run can show evidence for.
 *
 * Evidence is a requirement's identifier appearing in what the run produced.
 * That is a low bar on purpose: it measures whether the chain carries identity
 * at all, which today it largely does not, and a low bar that is honestly
 * reported is more useful than a high bar that is assumed to be met.
 */
export function evaluateRequirementCoverage(
  specs: readonly RequirementSpec[],
  producedArtifacts: readonly unknown[],
): RequirementCoverage {
  if (specs.length === 0) {
    return { total: 0, covered: 0, uncoveredIds: [] };
  }

  let haystack = "";
  for (const artifact of producedArtifacts) {
    try {
      haystack += JSON.stringify(artifact) ?? "";
    } catch {
      // An artifact that cannot be serialized cannot be searched, and skipping
      // it can only under-report coverage.
    }
  }

  const uncoveredIds = specs
    .filter((spec) => !haystack.includes(spec.id))
    .map((spec) => spec.id);

  return {
    total: specs.length,
    covered: specs.length - uncoveredIds.length,
    uncoveredIds,
  };
}
