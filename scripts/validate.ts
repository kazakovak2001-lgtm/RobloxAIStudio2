#!/usr/bin/env tsx
/**
 * Repository validation script.
 * Runs hygiene, security, and current-authority documentation checks.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  detectSensitiveFiles,
  detectSensitiveContent,
  validateRepositoryHygiene,
} from "../server/src/validation/commitValidator.js";

interface SecurityException {
  controlId: string;
  advisory: string;
  package: string;
  repository: string;
  owner: string;
  rationale: string;
  compensatingControl: string;
  approvalReference: string;
  createdAt: string;
  expiresAt: string;
}

interface SecurityPolicy {
  dependencyAuditLevel: string;
  productionOnly: boolean;
  exceptions: SecurityException[];
}

interface PackageManifest {
  securityPolicy?: SecurityPolicy;
}

function getStagedFiles(): string[] {
  try {
    const output = execSync("git diff --cached --name-only", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function getAllTrackedFiles(): string[] {
  try {
    const output = execSync("git ls-files", { encoding: "utf-8" });
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function isExactNonEmpty(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim() === value &&
    value !== "*" &&
    !value.includes("**")
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateSecurityPolicy(policy: unknown, today: string): string[] {
  const errors: string[] = [];
  if (!policy || typeof policy !== "object") {
    return ["package.json securityPolicy must be an object"];
  }

  const candidate = policy as Partial<SecurityPolicy>;
  if (candidate.dependencyAuditLevel !== "high") {
    errors.push("dependencyAuditLevel must be exactly high");
  }
  if (candidate.productionOnly !== true) {
    errors.push("productionOnly must be true");
  }
  if (!Array.isArray(candidate.exceptions)) {
    errors.push("exceptions must be an array");
    return errors;
  }

  const seenScopes = new Set<string>();
  candidate.exceptions.forEach((exception, index) => {
    const prefix = `exceptions[${index}]`;
    if (!exception || typeof exception !== "object") {
      errors.push(`${prefix} must be an object`);
      return;
    }

    const requiredTextFields: Array<keyof SecurityException> = [
      "controlId",
      "advisory",
      "package",
      "repository",
      "owner",
      "rationale",
      "compensatingControl",
      "approvalReference",
    ];
    for (const field of requiredTextFields) {
      if (!isExactNonEmpty(exception[field])) {
        errors.push(
          `${prefix}.${field} must be exact, non-empty and non-wildcard`,
        );
      }
    }

    if (exception.controlId !== "SECURITY-2G-B") {
      errors.push(`${prefix}.controlId must be SECURITY-2G-B`);
    }
    if (exception.repository !== "kazakovak2001-lgtm/RobloxAIStudio2") {
      errors.push(`${prefix}.repository must name this exact repository`);
    }
    if (!isIsoDate(exception.createdAt) || !isIsoDate(exception.expiresAt)) {
      errors.push(`${prefix} dates must use YYYY-MM-DD`);
    } else {
      if (exception.createdAt > exception.expiresAt) {
        errors.push(`${prefix}.createdAt must not be after expiresAt`);
      }
      if (exception.expiresAt < today) {
        errors.push(`${prefix} is expired`);
      }
      const created = Date.parse(`${exception.createdAt}T00:00:00Z`);
      const expires = Date.parse(`${exception.expiresAt}T00:00:00Z`);
      if ((expires - created) / 86_400_000 > 30) {
        errors.push(`${prefix} exceeds the 30-day maximum lifetime`);
      }
    }

    const scope = `${exception.advisory}\u0000${exception.package}`;
    if (seenScopes.has(scope)) {
      errors.push(`${prefix} duplicates an existing advisory/package scope`);
    }
    seenScopes.add(scope);
  });

  return errors;
}

function runSecurityPolicySelfTests(): string[] {
  const today = "2026-08-01";
  const valid: SecurityPolicy = {
    dependencyAuditLevel: "high",
    productionOnly: true,
    exceptions: [
      {
        controlId: "SECURITY-2G-B",
        advisory: "GHSA-example-0000-0000",
        package: "example-package@1.2.3",
        repository: "kazakovak2001-lgtm/RobloxAIStudio2",
        owner: "security-owner",
        rationale: "Temporary upstream remediation window.",
        compensatingControl: "Affected feature disabled in production.",
        approvalReference: "issue #150",
        createdAt: "2026-08-01",
        expiresAt: "2026-08-15",
      },
    ],
  };
  const failures: string[] = [];
  if (validateSecurityPolicy(valid, today).length !== 0) {
    failures.push("positive security-policy fixture must pass");
  }

  const invalidFixtures: Array<[string, unknown]> = [
    [
      "wildcard",
      {
        ...valid,
        exceptions: [{ ...valid.exceptions[0], advisory: "*" }],
      },
    ],
    [
      "ownerless",
      { ...valid, exceptions: [{ ...valid.exceptions[0], owner: "" }] },
    ],
    [
      "expired",
      {
        ...valid,
        exceptions: [{ ...valid.exceptions[0], expiresAt: "2026-07-31" }],
      },
    ],
    [
      "ambiguous repository",
      {
        ...valid,
        exceptions: [{ ...valid.exceptions[0], repository: "RobloxAIStudio2" }],
      },
    ],
    [
      "overlong lifetime",
      {
        ...valid,
        exceptions: [{ ...valid.exceptions[0], expiresAt: "2026-09-15" }],
      },
    ],
  ];
  for (const [name, fixture] of invalidFixtures) {
    if (validateSecurityPolicy(fixture, today).length === 0) {
      failures.push(`negative security-policy fixture ${name} must fail`);
    }
  }
  return failures;
}

function main(): void {
  const packageManifest = JSON.parse(
    readFileSync("package.json", "utf-8"),
  ) as PackageManifest;
  const policyErrors = validateSecurityPolicy(
    packageManifest.securityPolicy,
    new Date().toISOString().slice(0, 10),
  );
  const selfTestErrors = runSecurityPolicySelfTests();

  for (const error of [...policyErrors, ...selfTestErrors]) {
    console.error(`  ERROR [SECURITY_POLICY] package.json — ${error}`);
  }
  if (process.argv.includes("--security-policy-only")) {
    if (policyErrors.length + selfTestErrors.length > 0) {
      process.exit(1);
    }
    console.log("✓ Security dependency policy and fixtures passed\n");
    return;
  }

  const stagedFiles = getStagedFiles();
  const filesToCheck =
    stagedFiles.length > 0 ? stagedFiles : getAllTrackedFiles();
  console.log(`Validating ${filesToCheck.length} files...\n`);

  const sensitiveResult = detectSensitiveFiles(filesToCheck);
  const hygieneResult = validateRepositoryHygiene(filesToCheck);

  let contentErrors = 0;
  for (const filePath of filesToCheck) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const result = detectSensitiveContent(content, filePath);
      if (!result.valid) {
        contentErrors += result.errors.length;
        for (const error of result.errors) {
          console.error(
            `  ERROR [${error.code}] ${error.file}:${error.line} — ${error.message}`,
          );
        }
      }
    } catch {
      // File might be binary or deleted.
    }
  }

  for (const error of sensitiveResult.errors) {
    console.error(`  ERROR [${error.code}] ${error.message}`);
  }
  for (const error of hygieneResult.errors) {
    console.error(`  ERROR [${error.code}] ${error.message}`);
  }
  for (const warning of hygieneResult.warnings) {
    console.warn(`  WARN  [${warning.code}] ${warning.message}`);
  }
  const totalErrors =
    sensitiveResult.errors.length +
    hygieneResult.errors.length +
    contentErrors +
    policyErrors.length +
    selfTestErrors.length;
  if (totalErrors > 0) {
    console.error(`\n✗ Validation failed with ${totalErrors} error(s)\n`);
    process.exit(1);
  }
  console.log("✓ All validation checks passed\n");
}

main();
