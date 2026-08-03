#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface AuthorityEntry {
  path: string;
  owner: string;
  rank: number;
  status: "current" | "supporting";
  requiredClaims: string[];
  forbiddenClaims: string[];
}

interface HistoricalEntry {
  path: string;
  owner: string;
  status: "historical";
}

interface LinkCheck {
  source: string;
  target: string;
}

interface AuthorityInventory {
  version: number;
  controlId: string;
  repository: string;
  releaseIdentity: {
    backendBranch: string;
    backendCommit: string;
    frontendRepository: string;
    frontendCommit: string;
  };
  authority: AuthorityEntry[];
  historical: HistoricalEntry[];
  linkChecks: LinkCheck[];
}

const inventoryPath = resolve("config/documentation/authority-inventory.json");

function isExactText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value !== "*" &&
    !value.includes("**")
  );
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function validateInventory(candidate: unknown): string[] {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== "object") {
    return ["inventory must be an object"];
  }

  const inventory = candidate as Partial<AuthorityInventory>;
  if (inventory.version !== 1) errors.push("version must be 1");
  if (inventory.controlId !== "DOC-202A")
    errors.push("controlId must be DOC-202A");
  if (inventory.repository !== "kazakovak2001-lgtm/RobloxAIStudio2") {
    errors.push("repository must name the exact backend repository");
  }
  if (
    inventory.releaseIdentity?.backendBranch !== "release/cutover-1e-candidate"
  ) {
    errors.push("backendBranch must name the protected release branch");
  }
  if (!isSha(inventory.releaseIdentity?.backendCommit)) {
    errors.push("backendCommit must be an exact 40-character SHA");
  }
  if (
    inventory.releaseIdentity?.frontendRepository !==
    "kazakovak2001-lgtm/Frontend"
  ) {
    errors.push("frontendRepository must name the exact paired repository");
  }
  if (!isSha(inventory.releaseIdentity?.frontendCommit)) {
    errors.push("frontendCommit must be an exact 40-character SHA");
  }

  if (!Array.isArray(inventory.authority) || inventory.authority.length === 0) {
    errors.push("authority must be a non-empty array");
  } else {
    const paths = new Set<string>();
    const ranks = new Set<number>();
    for (const [index, entry] of inventory.authority.entries()) {
      const prefix = `authority[${index}]`;
      if (!isExactText(entry.path)) errors.push(`${prefix}.path must be exact`);
      if (!isExactText(entry.owner))
        errors.push(`${prefix}.owner must be exact`);
      if (!Number.isInteger(entry.rank) || entry.rank <= 0) {
        errors.push(`${prefix}.rank must be a positive integer`);
      }
      if (entry.status !== "current" && entry.status !== "supporting") {
        errors.push(`${prefix}.status must be current or supporting`);
      }
      if (
        !Array.isArray(entry.requiredClaims) ||
        entry.requiredClaims.length === 0
      ) {
        errors.push(`${prefix}.requiredClaims must be non-empty`);
      }
      if (!Array.isArray(entry.forbiddenClaims)) {
        errors.push(`${prefix}.forbiddenClaims must be an array`);
      }
      if (paths.has(entry.path))
        errors.push(`${prefix}.path duplicates another authority entry`);
      if (ranks.has(entry.rank))
        errors.push(`${prefix}.rank duplicates another authority entry`);
      paths.add(entry.path);
      ranks.add(entry.rank);
    }
  }

  if (
    !Array.isArray(inventory.historical) ||
    inventory.historical.length === 0
  ) {
    errors.push("historical must be a non-empty array");
  } else {
    for (const [index, entry] of inventory.historical.entries()) {
      const prefix = `historical[${index}]`;
      if (!isExactText(entry.path)) errors.push(`${prefix}.path must be exact`);
      if (!isExactText(entry.owner))
        errors.push(`${prefix}.owner must be exact`);
      if (entry.status !== "historical")
        errors.push(`${prefix}.status must be historical`);
    }
  }

  if (
    !Array.isArray(inventory.linkChecks) ||
    inventory.linkChecks.length === 0
  ) {
    errors.push("linkChecks must be a non-empty array");
  }

  return errors;
}

function validateRepository(inventory: AuthorityInventory): string[] {
  const errors: string[] = [];
  const currentPaths = new Set(inventory.authority.map((entry) => entry.path));

  for (const entry of inventory.authority) {
    if (!existsSync(entry.path)) {
      errors.push(`${entry.path}: authority file is missing`);
      continue;
    }
    const content = readFileSync(entry.path, "utf-8");
    for (const claim of entry.requiredClaims) {
      if (!content.includes(claim)) {
        errors.push(
          `${entry.path}: missing required claim ${JSON.stringify(claim)}`,
        );
      }
    }
    for (const claim of entry.forbiddenClaims) {
      if (content.includes(claim)) {
        errors.push(
          `${entry.path}: contains forbidden stale claim ${JSON.stringify(claim)}`,
        );
      }
    }
  }

  for (const entry of inventory.historical) {
    if (!existsSync(entry.path)) {
      errors.push(`${entry.path}: historical file is missing`);
    }
    if (currentPaths.has(entry.path)) {
      errors.push(
        `${entry.path}: file cannot be both current authority and historical`,
      );
    }
  }

  for (const link of inventory.linkChecks) {
    if (!existsSync(link.source)) {
      errors.push(`${link.source}: link source is missing`);
      continue;
    }
    if (!existsSync(link.target)) {
      errors.push(
        `${link.source}: authority link target is missing: ${link.target}`,
      );
      continue;
    }
    const source = readFileSync(link.source, "utf-8");
    const relativeTarget = link.target.startsWith(`${dirname(link.source)}/`)
      ? `./${link.target.slice(dirname(link.source).length + 1)}`
      : link.target;
    if (!source.includes(relativeTarget) && !source.includes(link.target)) {
      errors.push(`${link.source}: does not reference ${link.target}`);
    }
  }

  return errors;
}

function runSelfTests(inventory: AuthorityInventory): string[] {
  const failures: string[] = [];
  if (validateInventory(inventory).length !== 0) {
    failures.push("positive inventory fixture must pass");
  }

  const invalid: Array<[string, unknown]> = [
    [
      "wildcard owner",
      { ...inventory, authority: [{ ...inventory.authority[0], owner: "*" }] },
    ],
    [
      "duplicate rank",
      {
        ...inventory,
        authority: inventory.authority.map((entry, index) =>
          index === 1 ? { ...entry, rank: inventory.authority[0].rank } : entry,
        ),
      },
    ],
    [
      "ambiguous backend identity",
      {
        ...inventory,
        releaseIdentity: {
          ...inventory.releaseIdentity,
          backendCommit: "HEAD",
        },
      },
    ],
    [
      "historical promoted to current",
      {
        ...inventory,
        historical: [{ ...inventory.historical[0], status: "current" }],
      },
    ],
    ["missing authority", { ...inventory, authority: [] }],
  ];

  for (const [name, fixture] of invalid) {
    if (validateInventory(fixture).length === 0) {
      failures.push(`negative fixture ${name} must fail`);
    }
  }
  return failures;
}

function main(): void {
  const inventory = JSON.parse(
    readFileSync(inventoryPath, "utf-8"),
  ) as AuthorityInventory;
  const errors = [
    ...validateInventory(inventory),
    ...runSelfTests(inventory),
    ...validateRepository(inventory),
  ];

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR [DOC_AUTHORITY] ${error}`);
    process.exit(1);
  }

  console.log(
    `Documentation authority valid: ${inventory.authority.length} authority document(s), ${inventory.historical.length} historical document(s), ${inventory.linkChecks.length} link check(s).`,
  );
}

main();
