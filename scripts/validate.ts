#!/usr/bin/env tsx
/**
 * Repository validation script.
 * Runs all hygiene and security checks against staged files.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  detectSensitiveFiles,
  detectSensitiveContent,
  validateRepositoryHygiene,
} from "../server/src/validation/commitValidator.js";

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

function main(): void {
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
      // File might be binary or deleted
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
    sensitiveResult.errors.length + hygieneResult.errors.length + contentErrors;

  if (totalErrors > 0) {
    console.error(`\n✗ Validation failed with ${totalErrors} error(s)\n`);
    process.exit(1);
  }

  console.log("✓ All validation checks passed\n");
}

main();
