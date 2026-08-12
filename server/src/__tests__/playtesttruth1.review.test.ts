import { describe, it, expect } from "vitest";

import {
  PlaytestEngine,
  decodePlaytestReport,
  PLAYTEST_REPORT_SCHEMA_VERSION,
  type PlaytestInput,
} from "../playtest";
import {
  REPAIR_EVIDENCE_VERSION,
  isEvidenceVersionedRepairSession,
  isLegacyRepairSession,
  type RepairSessionState,
} from "../repair/RepairTypes";

/**
 * PLAYTEST-TRUTH-1 review follow-up.
 *
 * Three findings from the review of the slice, each about a boundary where the
 * removed heuristic could come back or where the new contract was asserted more
 * strongly than it was enforced.
 */

const PROJECT = "playtest-truth-review";

function input(content = "print('hello')"): PlaytestInput {
  return {
    projectId: PROJECT,
    scripts: [
      {
        name: "Main",
        type: "ServerScript",
        path: "ServerScriptService/Main.server.lua",
        content,
        dependencies: [],
      },
    ],
    assets: [],
  };
}

/**
 * `decodePlaytestReport` takes `unknown` because it reads storage, where a row
 * can be truncated or half-written. It used to check the version, the evidence
 * kind, `runtime.status` and the presence of an `issues` array, then cast. A
 * row that passed those four checks and nothing else came back as a whole
 * `PlaytestReport`, and the first ordinary access threw at the caller instead.
 */
describe("PLAYTEST-TRUTH-1 decoding refuses an incomplete report", () => {
  const valid = () =>
    JSON.parse(JSON.stringify(new PlaytestEngine().run(input()))) as Record<
      string,
      unknown
    >;

  const withoutField = (field: string) => {
    const report = valid();
    delete report[field];
    return report;
  };

  it("decodes a complete report", () => {
    const decoded = decodePlaytestReport(valid());
    expect(decoded).not.toBeNull();
    // The exact access that used to throw on a truncated row.
    expect(typeof decoded!.findingCounts.total).toBe("number");
  });

  it("refuses the truncated row that passed the old four checks", () => {
    // Version, evidence kind, runtime status and an issues array, and nothing
    // else. This is the payload the review described.
    expect(
      decodePlaytestReport({
        schemaVersion: PLAYTEST_REPORT_SCHEMA_VERSION,
        evidenceKind: "static-analysis",
        runtime: {
          status: "not-measured",
          reason: "No Roblox runtime play session was performed.",
        },
        issues: [],
      }),
    ).toBeNull();
  });

  it.each([
    "findingCounts",
    "systems",
    "performance",
    "recommendations",
    "projectId",
    "generatedAt",
    "summary",
    "issues",
    "runtime",
  ])("refuses a report missing %s", (field) => {
    expect(decodePlaytestReport(withoutField(field))).toBeNull();
  });

  it("refuses runtime evidence that does not say why", () => {
    // The strongest claim in the report is that nothing was measured. An empty
    // reason leaves it unsupported.
    expect(
      decodePlaytestReport({ ...valid(), runtime: { status: "not-measured" } }),
    ).toBeNull();
    expect(
      decodePlaytestReport({
        ...valid(),
        runtime: { status: "not-measured", reason: "" },
      }),
    ).toBeNull();
  });

  it("refuses counts that are not whole and non-negative", () => {
    const counts = (patch: Record<string, unknown>) =>
      decodePlaytestReport({
        ...valid(),
        findingCounts: {
          critical: 0,
          warning: 0,
          suggestion: 0,
          optimization: 0,
          total: 0,
          ...patch,
        },
      });
    expect(counts({})).not.toBeNull();
    expect(counts({ critical: -1 })).toBeNull();
    expect(counts({ total: 1.5 })).toBeNull();
    expect(counts({ warning: "2" })).toBeNull();
    expect(counts({ optimization: undefined })).toBeNull();
  });

  it("refuses a malformed issue, system or performance entry", () => {
    const report = valid();
    const issue = {
      id: "i-1",
      severity: "critical",
      category: "c",
      affectedArtifact: "a",
      reason: "r",
      recommendedFix: "f",
      priority: 1,
    };
    expect(decodePlaytestReport({ ...report, issues: [issue] })).not.toBeNull();
    // A severity outside the closed set, and a missing required field.
    expect(
      decodePlaytestReport({
        ...report,
        issues: [{ ...issue, severity: "blocker" }],
      }),
    ).toBeNull();
    const { recommendedFix: _dropped, ...incomplete } = issue;
    expect(
      decodePlaytestReport({ ...report, issues: [incomplete] }),
    ).toBeNull();
    expect(
      decodePlaytestReport({ ...report, recommendations: [incomplete] }),
    ).toBeNull();
    expect(
      decodePlaytestReport({
        ...report,
        systems: [{ system: "economy", counts: {}, status: "pass" }],
      }),
    ).toBeNull();
    expect(
      decodePlaytestReport({
        ...report,
        systems: [
          {
            system: "economy",
            counts: {
              critical: 0,
              warning: 0,
              suggestion: 0,
              optimization: 0,
              total: 0,
            },
            status: "production_ready",
          },
        ],
      }),
    ).toBeNull();
    expect(
      decodePlaytestReport({
        ...report,
        performance: {
          ...(report.performance as Record<string, unknown>),
          riskAreas: [7],
        },
      }),
    ).toBeNull();
  });

  it("does not let a legacy report decode as version 2", () => {
    // A pre-slice record with the old total. Filling in every version-2 field
    // must not rescue it: the version is what makes it legacy.
    expect(
      decodePlaytestReport({ ...valid(), schemaVersion: 1, overallScore: 87 }),
    ).toBeNull();
    expect(
      decodePlaytestReport({ ...valid(), schemaVersion: undefined }),
    ).toBeNull();
  });
});

/**
 * A single `RepairSessionState` requiring `findingCounts` was wrong in both
 * directions: a legacy row does not have it, and the persistence layer only
 * type-checked because it cast. Legacy and evidence-versioned rows are now
 * separate variants discriminated by `evidenceVersion`.
 */
describe("PLAYTEST-TRUTH-1 repair sessions distinguish legacy rows by type", () => {
  const legacy = (): RepairSessionState => ({
    projectId: PROJECT,
    status: "completed",
    currentIteration: 1,
    maxIterations: 5,
    targetScore: 80,
    currentScore: 85,
    history: [
      {
        iteration: 1,
        scoreBefore: 70,
        scoreAfter: 85,
        changedArtifacts: [],
        duration: 0,
        tokenUsage: 0,
        aiCost: 0,
        repairsApplied: 0,
        timestamp: 0,
        parentExecutionId: "exec-legacy",
        strategyResults: [],
      },
    ],
    startedAt: 0,
    totalRepairs: 1,
  });

  const versioned = (): RepairSessionState => ({
    projectId: PROJECT,
    status: "running",
    currentIteration: 0,
    maxIterations: 5,
    evidenceVersion: REPAIR_EVIDENCE_VERSION,
    findingCounts: {
      critical: 1,
      warning: 2,
      suggestion: 0,
      optimization: 0,
      total: 3,
    },
    history: [],
    startedAt: 0,
    totalRepairs: 0,
  });

  it("keeps a legacy session readable without relabelling it", () => {
    const session = legacy();
    expect(isLegacyRepairSession(session)).toBe(true);
    expect(isEvidenceVersionedRepairSession(session)).toBe(false);
    if (isLegacyRepairSession(session)) {
      expect(session.currentScore).toBe(85);
      expect(session.history[0].scoreAfter).toBe(85);
    }
  });

  it("does not turn a legacy absence of findings into zero findings", () => {
    // Absence means the question was never asked. Zero would mean a repair ran
    // and found nothing, which is a different and false claim.
    const session = legacy();
    expect(session.findingCounts).toBeUndefined();
    expect(session.findingCounts).not.toEqual({
      critical: 0,
      warning: 0,
      suggestion: 0,
      optimization: 0,
      total: 0,
    });
  });

  it("narrows an evidence-versioned session to its required fields", () => {
    const session = versioned();
    expect(isEvidenceVersionedRepairSession(session)).toBe(true);
    if (isEvidenceVersionedRepairSession(session)) {
      expect(session.findingCounts.total).toBe(3);
    }
  });

  it("refuses to read a row as version 2 when the evidence fields are absent", () => {
    // The store reads rows through an unchecked generic assertion, so a row can
    // claim the version without carrying what the version promises. The safe
    // reading is the weaker one.
    const halfWritten = {
      ...versioned(),
      findingCounts: undefined,
    } as unknown as RepairSessionState;
    expect(isEvidenceVersionedRepairSession(halfWritten)).toBe(false);
    expect(isLegacyRepairSession(halfWritten)).toBe(true);
  });
});
