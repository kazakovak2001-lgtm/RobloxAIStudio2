/**
 * AUDIT-MASTER-REGISTER control gate.
 *
 * The register exists so an audit finding cannot quietly disappear, and so a
 * claim about a finding cannot outlive its evidence. The gate is deliberately
 * structural: it does not fail on severity, because a red gate for every open
 * P1 would only be silenced. What it does refuse is a finding with no status,
 * no disposition, or evidence that does not exist in the tree.
 *
 * A finding may honestly say it is open, unreviewed or accepted. It may not say
 * nothing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface RegisterFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  disposition: string;
  area: string;
  remediationGroup: string;
  mar: string;
  marNote?: string;
  evidence: string[];
  owningBranch?: string;
  owningSha?: string;
  notes?: string;
}

interface MarRootCause {
  id: string;
  priority: string;
  title: string;
}

interface AuditRegister {
  schemaVersion: number;
  controlId: string;
  statement: string;
  remediationGroups: string[];
  severities: string[];
  statuses: string[];
  dispositions: string[];
  marRootCauses: MarRootCause[];
  findings: RegisterFinding[];
}

/**
 * A finding that the deduplicated root-cause taxonomy does not cover.
 *
 * This is a real answer, not a missing one. Filing such a finding under an
 * approximate neighbour would make the taxonomy look complete while quietly
 * losing the finding; saying `unmapped` and explaining why keeps the gap
 * visible as a fact about the taxonomy.
 */
const UNMAPPED = "unmapped";

const root = process.cwd();
const registerPath = join(root, "config/audit/master-audit-register.json");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validate(): { errors: string[]; warnings: string[]; total: number } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(registerPath)) {
    return {
      errors: [
        `Audit register is missing: config/audit/master-audit-register.json`,
      ],
      warnings,
      total: 0,
    };
  }

  let register: AuditRegister;
  try {
    register = JSON.parse(readFileSync(registerPath, "utf8")) as AuditRegister;
  } catch (error) {
    return {
      errors: [`Audit register is not valid JSON: ${String(error)}`],
      warnings,
      total: 0,
    };
  }

  if (register.schemaVersion !== 1) {
    errors.push("Audit register must declare schemaVersion 1.");
  }
  if (register.controlId !== "AUDIT-MASTER-REGISTER") {
    errors.push("Audit register must declare controlId AUDIT-MASTER-REGISTER.");
  }
  if (!isNonEmptyString(register.statement)) {
    errors.push("Audit register must state what it is for.");
  }

  const severities = new Set(register.severities ?? []);
  const statuses = new Set(register.statuses ?? []);
  const dispositions = new Set(register.dispositions ?? []);
  if (!severities.size || !statuses.size || !dispositions.size) {
    errors.push(
      "Audit register must declare its severity, status and disposition vocabularies.",
    );
  }

  const remediationGroups = new Set(register.remediationGroups ?? []);
  if (!remediationGroups.size) {
    errors.push("Audit register must declare its remediation groups.");
  }

  // The root causes are the audit's own vocabulary. Declaring them here is what
  // lets a finding's `mar` be checked rather than merely recorded.
  const rootCauses = Array.isArray(register.marRootCauses)
    ? register.marRootCauses
    : [];
  if (!rootCauses.length) {
    errors.push("Audit register must declare its root-cause taxonomy.");
  }
  const marIds = new Set<string>();
  for (const rootCause of rootCauses) {
    if (!isNonEmptyString(rootCause.id)) {
      errors.push("A root cause has no id.");
      continue;
    }
    if (marIds.has(rootCause.id)) {
      errors.push(`Duplicate root cause id: ${rootCause.id}`);
    }
    marIds.add(rootCause.id);
    if (!isNonEmptyString(rootCause.title)) {
      errors.push(`Root cause ${rootCause.id} has no title.`);
    }
    if (!isNonEmptyString(rootCause.priority)) {
      errors.push(`Root cause ${rootCause.id} has no priority.`);
    }
  }

  const findings = Array.isArray(register.findings) ? register.findings : [];
  if (!findings.length) {
    errors.push("Audit register must contain at least one finding.");
  }

  const seen = new Set<string>();
  for (const finding of findings) {
    const label = isNonEmptyString(finding.id) ? finding.id : "(missing id)";

    if (!isNonEmptyString(finding.id)) {
      errors.push("A finding has no id.");
    } else if (seen.has(finding.id)) {
      errors.push(`Duplicate finding id: ${finding.id}`);
    } else {
      seen.add(finding.id);
    }

    if (!isNonEmptyString(finding.title)) {
      errors.push(`Finding ${label} has no title.`);
    }
    if (!isNonEmptyString(finding.area)) {
      errors.push(`Finding ${label} has no area.`);
    }
    if (!severities.has(finding.severity)) {
      errors.push(`Finding ${label} has unknown severity: ${finding.severity}`);
    }
    // Without a group the finding never reaches the remediation plan, so it
    // would be recorded and then never scheduled.
    if (!remediationGroups.has(finding.remediationGroup)) {
      errors.push(
        `Finding ${label} has unknown remediation group: ${finding.remediationGroup}`,
      );
    }
    if (!statuses.has(finding.status)) {
      errors.push(`Finding ${label} has unknown status: ${finding.status}`);
    }
    // Without a root cause the finding cannot be scheduled against the audit's
    // remediation order, which is the order the work actually follows.
    if (finding.mar === UNMAPPED) {
      if (!isNonEmptyString(finding.marNote)) {
        errors.push(
          `Finding ${label} claims no root cause covers it without saying why.`,
        );
      }
    } else if (!marIds.has(finding.mar)) {
      errors.push(`Finding ${label} has unknown root cause: ${finding.mar}`);
    }
    // The disposition is what stops a finding from being recorded and then
    // forgotten: it must say what was done, even when the answer is nothing.
    if (!dispositions.has(finding.disposition)) {
      errors.push(
        `Finding ${label} has unknown disposition: ${finding.disposition}`,
      );
    }

    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
      errors.push(`Finding ${label} records no evidence.`);
      continue;
    }
    for (const evidence of finding.evidence) {
      if (!isNonEmptyString(evidence)) {
        errors.push(`Finding ${label} has an empty evidence path.`);
        continue;
      }
      // Evidence must exist in this tree. A path that only exists on another
      // branch would make the register look better supported than it is.
      if (!existsSync(join(root, evidence))) {
        errors.push(`Finding ${label} cites missing evidence: ${evidence}`);
      }
    }

    // A fix that lives on an unmerged branch has to say which one, or the
    // register claims work that nobody can find.
    if (finding.disposition === "FIXED-UNMERGED") {
      if (!isNonEmptyString(finding.owningBranch)) {
        errors.push(`Finding ${label} is fixed but records no owning branch.`);
      }
      if (!isNonEmptyString(finding.owningSha)) {
        errors.push(`Finding ${label} is fixed but records no owning commit.`);
      }
    }

    if (
      (finding.status === "CONFIRMED" || finding.status === "LIKELY") &&
      !isNonEmptyString(finding.notes)
    ) {
      warnings.push(`Finding ${label} states a defect without explaining it.`);
    }
  }

  return { errors, warnings, total: findings.length };
}

const { errors, warnings, total } = validate();

console.log("Audit register validation");
console.log(`  status: ${errors.length === 0 ? "PASS" : "FAIL"}`);
console.log(`  findings: ${total}`);
for (const warning of warnings) console.log(`  warning: ${warning}`);
for (const error of errors) console.log(`  error: ${error}`);

if (errors.length > 0) process.exit(1);
