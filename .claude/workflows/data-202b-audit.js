export const meta = {
  name: "data-202b-audit",
  description:
    "Implementation-first, cross-checked audit of DATA-202B autonomous-session persistence and restart correctness",
};

const target =
  args?.target ??
  "DATA-202B as merged by PR #139 at merge commit 396d6330, compared with the current checked-out HEAD";

const common = `
Audit ${target} in RobloxAIStudio2. This is a read-only audit: do not edit, commit,
merge, push, change branches, or modify external state. Inspect the implementation,
tests, validators, current project-control authority, and relevant git history before
accepting documentation claims. Use git diff 396d6330^1 396d6330 to identify the
original slice, then verify its present-day descendants on the current HEAD.

Every material statement must be explicitly classified as FACT, INFERENCE, GAP,
RISK, or RECOMMENDATION and carry precise evidence. Distinguish a failed check from
a check not run. Pay special attention to deterministic behavior, durable
acknowledgement, restart reconstruction, concurrency/claim fencing, and the rule
that live runtime handles never enter persisted state.
`;

const reviews = await pipeline(
  [
    {
      label: "Architecture and runtime",
      agentType: "architecture-auditor",
      prompt: `${common}\nTrace the DATA-202B runtime and storage call graph end to end. Check domain boundaries, autonomous phase transitions, claim/recovery ordering, persisted record shapes, deterministic behavior, and whether current authority overstates or understates the implementation.`,
    },
    {
      label: "Persistence and restart",
      agentType: "architecture-auditor",
      prompt: `${common}\nPerform a persistence-specific audit. Inspect AutonomousSessionStore, OperationalStoreComposition, StorageProvider/Postgres behavior, bootstrap ordering, rejection handling, concurrent mutation fences, fresh-instance restart tests, and serialized state for process-local handles.`,
    },
    {
      label: "Regression tests",
      agentType: "architecture-auditor",
      prompt: `${common}\nAudit the regression evidence. Map each DATA-202B invariant to a test or validator, identify assertions that cannot fail for the intended reason, and list missing success, rejection, concurrency, restart, route-contract, and runtime-handle cases. Run only focused non-mutating checks when useful.`,
    },
    {
      label: "Security",
      agentType: "security-reviewer",
      prompt: `${common}\nReview DATA-202B for cross-project access, stale or replayed execution, duplicate claims, fail-open recovery, untrusted persisted data, log/secret exposure, and capability handles crossing the persistence boundary.`,
    },
    {
      label: "Release evidence",
      agentType: "release-reviewer",
      prompt: `${common}\nAudit whether DATA-202B's merge and present-day release claims are supported by the exact commits, repository inventories, current gates, paired Frontend pins, restart evidence, and clean candidate state. Do not promote or merge anything.`,
    },
  ],
  (review) =>
    agent(review.prompt, {
      label: review.label,
      agentType: review.agentType,
    }),
);

const completed = reviews.filter(Boolean);

return agent(
  `${common}
You are the final architecture-audit synthesizer. Cross-check and deduplicate the
independent reviews below against one another. Reject claims that lack precise
evidence or conflict with stronger implementation evidence. Preserve disagreements
as explicit GAPs instead of averaging them away.

Return:
1. Scope and exact commits inspected.
2. A compact invariant-to-evidence matrix.
3. Ranked findings using only FACT/INFERENCE/GAP/RISK/RECOMMENDATION.
4. Validation commands and exact outcomes.
5. A verdict: CONFORMANT, NON-CONFORMANT, or INSUFFICIENT EVIDENCE.
6. The smallest recommended next vertical slice; do not implement it.

Independent reviews:
${completed.map((review, index) => `\n--- Review ${index + 1} ---\n${review}`).join("\n")}`,
  {
    label: "Cross-check and synthesize",
    agentType: "architecture-auditor",
  },
);
