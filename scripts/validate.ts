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

interface DocumentationAuthorityError {
  file: string;
  message: string;
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

function validateDocumentationAuthority(): DocumentationAuthorityError[] {
  const roadmapPath = "docs/00-project-control/ROADMAP_STATUS.md";
  const reconciliationPath =
    "docs/00-project-control/DOC-202A_ROADMAP_AUTHORITY_RECONCILIATION.md";
  const readmePath = "docs/README.md";

  const documents = new Map<string, string>();
  const errors: DocumentationAuthorityError[] = [];

  for (const path of [roadmapPath, reconciliationPath, readmePath]) {
    try {
      documents.set(path, readFileSync(path, "utf-8"));
    } catch {
      errors.push({ file: path, message: "required authority document is missing" });
    }
  }

  const roadmap = documents.get(roadmapPath) ?? "";
  const reconciliation = documents.get(reconciliationPath) ?? "";
  const readme = documents.get(readmePath) ?? "";
  const currentAuthority = `${roadmap}\n${reconciliation}\n${readme}`;

  const requiredCurrentClaims = [
    "`ARCH-2B` | Exhaustive truthful architecture boundary gate | Critical | ✅ Complete",
    "`FRONTEND-2C` | Protected Frontend quality and bundle baseline | High | ✅ Complete",
    "`RUNTIME-2D` | Runtime/provider/orchestration/memory ownership | High | ✅ Complete",
    "`DURABILITY-2E` | Durable writes and operational-state truthfulness | High | ✅ Complete",
    "`SECURITY-2G` | Dependency, SAST, secret, image, SBOM, and RBAC control gate | High | **Next**",
  ];

  for (const claim of requiredCurrentClaims) {
    if (!roadmap.includes(claim)) {
      errors.push({
        file: roadmapPath,
        message: `missing required current roadmap claim: ${claim}`,
      });
    }
  }

  const forbiddenCurrentClaims = [
    /ARCH-2B[^\n]*(?:Planned|Next)/i,
    /RUNTIME-2D[^\n]*Planned/i,
    /DURABILITY-2E[^\n]*(?:Planned|In progress)/i,
    /ARCH-2B, RUNTIME-2D, DURABILITY-2E[^\n]*remain planned/i,
  ];

  for (const pattern of forbiddenCurrentClaims) {
    if (pattern.test(currentAuthority)) {
      errors.push({
        file: "current documentation authority",
        message: `stale completed-gate status matches ${pattern}`,
      });
    }
  }

  const requiredEvidence = [
    "7ccc4e02ba4175318856cd14b845e4ccd4dc6057",
    "022788ace31982e2b08ea099800de784b4dbe482",
    "a33a8c30588f1e4705d27856e61d839c8efd42ac",
    "kazakovak2001-lgtm/Frontend",
  ];

  for (const evidence of requiredEvidence) {
    if (!reconciliation.includes(evidence)) {
      errors.push({
        file: reconciliationPath,
        message: `missing exact reconciliation evidence: ${evidence}`,
      });
    }
  }

  if (!readme.includes("historical planning baselines")) {
    errors.push({
      file: readmePath,
      message:
        "TECH-AUDIT-2 roadmap/backlog must be labelled as historical planning baselines",
    });
  }

  if (!readme.includes("All new user-facing web work belongs in the standalone `Frontend` repository")) {
    errors.push({
      file: readmePath,
      message:
        "standalone Frontend repository ownership must remain explicit",
    });
  }

  if (!reconciliation.includes("remain intentionally process-local")) {
    errors.push({
      file: reconciliationPath,
      message:
        "intentionally ephemeral runtime handles must not be relabelled durable",
    });
  }

  return errors;
}

function main(): void {
  const stagedFiles = getStagedFiles();
  const filesToCheck =
    stagedFiles.length > 0 ? stagedFiles : getAllTrackedFiles();

  console.log(`Validating ${filesToCheck.length} files...\n`);

  const sensitiveResult = detectSensitiveFiles(filesToCheck);
  const hygieneResult = validateRepositoryHygiene(filesToCheck);
  const documentationErrors = validateDocumentationAuthority();

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

  for (const error of documentationErrors) {
    console.error(
      `  ERROR [DOC_AUTHORITY] ${error.file} — ${error.message}`,
    );
  }

  const totalErrors =
    sensitiveResult.errors.length +
    hygieneResult.errors.length +
    contentErrors +
    documentationErrors.length;

  if (totalErrors > 0) {
    console.error(`\n✗ Validation failed with ${totalErrors} error(s)\n`);
    process.exit(1);
  }

  console.log("✓ All validation checks passed\n");
}

main();
