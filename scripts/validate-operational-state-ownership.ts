import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const inventoryPath = join(
  root,
  "config/runtime/operational-state-ownership.json",
);
const allowedClassifications = new Set([
  "durable",
  "restart-reconstructible",
  "intentionally-ephemeral",
]);
const allowedProductionStatuses = new Set([
  "production-wired",
  "compatibility-facade",
  "scaffold",
]);

interface InventoryEntry {
  path: string;
  owner: string;
  productionStatus: string;
  states: Array<{ name: string; classification: string; source: string }>;
}

interface Inventory {
  schemaVersion: number;
  inventoryRules: Array<{ root: string; pattern: string }>;
  entries: InventoryEntry[];
}

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as Inventory;
const errors: string[] = [];
const paths = new Set<string>();

if (inventory.schemaVersion !== 1) errors.push("Unsupported schemaVersion");
for (const entry of inventory.entries) {
  if (paths.has(entry.path)) errors.push(`Duplicate entry: ${entry.path}`);
  paths.add(entry.path);
  if (!existsSync(join(root, entry.path)))
    errors.push(`Missing source: ${entry.path}`);
  if (!entry.owner.trim()) errors.push(`Missing owner: ${entry.path}`);
  if (!allowedProductionStatuses.has(entry.productionStatus)) {
    errors.push(`Invalid production status: ${entry.path}`);
  }
  if (!entry.states.length)
    errors.push(`Missing state classification: ${entry.path}`);
  for (const state of entry.states) {
    if (!allowedClassifications.has(state.classification)) {
      errors.push(`Invalid classification: ${entry.path}/${state.name}`);
    }
    if (!state.source.trim())
      errors.push(`Missing source: ${entry.path}/${state.name}`);
  }
}

for (const rule of inventory.inventoryRules) {
  const base = join(root, rule.root);
  const pattern = new RegExp(rule.pattern);
  for (const file of filesBelow(base)) {
    const repositoryPath = relative(root, file).replaceAll("\\", "/");
    if (pattern.test(repositoryPath) && !paths.has(repositoryPath)) {
      errors.push(`Unclassified operational runtime: ${repositoryPath}`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`[operational-state] ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `[operational-state] PASS: ${inventory.entries.length} runtime owners classified`,
  );
}
