/**
 * Renders the remediation plan from the master audit register.
 *
 * The plan is generated rather than written so it cannot drift from the
 * register. Ordering is by the worst severity in each group, and grouping is by
 * shared architectural root rather than by symptom, because several findings in
 * this audit are the same defect seen from different places and repairing them
 * separately would mean repairing the root several times.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface RegisterFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  disposition: string;
  area: string;
  remediationGroup: string;
  owningBranch?: string;
  owningSha?: string;
  notes?: string;
}

interface AuditRegister {
  controlId: string;
  remediationGroups: string[];
  findings: RegisterFinding[];
}

const root = process.cwd();
const register = JSON.parse(
  readFileSync(join(root, "config/audit/master-audit-register.json"), "utf8"),
) as AuditRegister;
const planPath = join(
  root,
  "docs/00-project-control/MASTER-AUDIT-REMEDIATION_PLAN.md",
);

/** Why each group is one repair rather than several. */
const groupIntent: Record<string, string> = {
  "must-reverify-before-remediation":
    "Nothing else should be repaired against these until they are re-established as fact. Both carry conflicting or unverified history.",
  "authorization-object-binding":
    "One defect shape: the identifier the caller was authorized for is not the thing the operation acts on. Fixing the sweep and the evidence together is what stops the next instance.",
  "realtime-tenancy":
    "Outbound emissions ignore the project boundary that the inbound side enforces. Two distinct repairs sit inside this group, one cheap and one needing context plumbed through.",
  "generation-start-admission":
    "Everything that decides whether a generation may begin and under whose identity. Two of these are already fixed on branches and the rest share their entry point.",
  "canonical-generation-recovery":
    "Canonical generation survives as a durable record but not as running work. The queue choice, the shutdown path and the weak restart test are the same gap seen three ways.",
  "pipeline-outcome-truth":
    "What the system reports about a run does not always match what happened. This is where green signals hide red states.",
  "blueprint-provenance":
    "Generation runs against mutable, sometimes stale design input, and design changes agreed elsewhere never reach it.",
  "generation-fidelity":
    "The generated artifact does not reliably match the stated requirement, in transport, in intent and in world content.",
  "durable-product-state":
    "Product state documented as persisted is held in process memory and erased by restart.",
  "auth-credential-lifecycle":
    "Credential identity and credential recovery are incomplete in ways the interface does not admit.",
  "release-capability-truth":
    "A release can present itself as healthy without the capability it exists to provide.",
  "data-handling":
    "Sensitive content reaches places it should not, and evidence records an identity the caller asserted rather than one the server knows.",
  "supply-chain-hardening":
    "Reproducibility and exception hygiene in the build and scanning path.",
  "architecture-deadwood":
    "Unreachable code that still looks canonical to a reader.",
  "assurance-not-performed":
    "Whole classes of assurance have not been run. Listed so their absence is explicit rather than implied by silence.",
  "verified-controls":
    "Controls confirmed to behave correctly. Recorded so they are not mistaken for gaps and not quietly regressed.",
};

const severityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function worstSeverity(findings: RegisterFinding[]): string {
  return findings
    .map((finding) => finding.severity)
    .sort(
      (left, right) => (severityRank[left] ?? 9) - (severityRank[right] ?? 9),
    )[0];
}

const byGroup = new Map<string, RegisterFinding[]>();
for (const finding of register.findings) {
  const list = byGroup.get(finding.remediationGroup) ?? [];
  list.push(finding);
  byGroup.set(finding.remediationGroup, list);
}

const ordered = [...byGroup.entries()].sort((left, right) => {
  // Re-verification first regardless of severity: acting on a stale belief is
  // worse than acting late.
  if (left[0] === "must-reverify-before-remediation") return -1;
  if (right[0] === "must-reverify-before-remediation") return 1;
  // Verified controls last: nothing to do.
  if (left[0] === "verified-controls") return 1;
  if (right[0] === "verified-controls") return -1;
  const bySeverity =
    (severityRank[worstSeverity(left[1])] ?? 9) -
    (severityRank[worstSeverity(right[1])] ?? 9);
  return bySeverity !== 0 ? bySeverity : right[1].length - left[1].length;
});

const counts = register.findings.reduce<Record<string, number>>(
  (totals, finding) => {
    totals[finding.disposition] = (totals[finding.disposition] ?? 0) + 1;
    return totals;
  },
  {},
);

const lines: string[] = [];
lines.push(
  "<!-- Generated by scripts/generate-remediation-plan.ts. Edit the register, not this file. -->",
);
lines.push("");
lines.push("# Master audit remediation plan");
lines.push("");
lines.push(
  `Generated from \`config/audit/master-audit-register.json\` (${register.findings.length} findings). Severity is the register's; ordering is by the worst severity in each group, except that re-verification comes first and verified controls come last.`,
);
lines.push("");
lines.push(
  "Findings are grouped by shared architectural root rather than by symptom. Several of these are the same defect seen from different places, and repairing them one at a time would mean repairing the root several times.",
);
lines.push("");
lines.push("## Disposition summary");
lines.push("");
lines.push("| Disposition | Findings |");
lines.push("| --- | --- |");
for (const [disposition, total] of Object.entries(counts).sort(
  (left, right) => right[1] - left[1],
)) {
  lines.push(`| ${disposition} | ${total} |`);
}
lines.push("");

let order = 0;
for (const [group, findings] of ordered) {
  order += 1;
  const severity = worstSeverity(findings);
  lines.push(`## ${order}. ${group} — worst severity ${severity}`);
  lines.push("");
  if (groupIntent[group]) {
    lines.push(groupIntent[group]);
    lines.push("");
  }
  lines.push("| Finding | Severity | Status | Disposition |");
  lines.push("| --- | --- | --- | --- |");
  for (const finding of [...findings].sort(
    (left, right) =>
      (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9),
  )) {
    const fixedAt = finding.owningBranch
      ? ` (${finding.owningBranch} @ ${finding.owningSha})`
      : "";
    lines.push(
      `| **${finding.id}** — ${finding.title} | ${finding.severity} | ${finding.status} | ${finding.disposition}${fixedAt} |`,
    );
  }
  lines.push("");
}

writeFileSync(planPath, `${lines.join("\n")}\n`);
console.log(
  `Remediation plan rendered for ${register.findings.length} findings across ${byGroup.size} groups.`,
);
