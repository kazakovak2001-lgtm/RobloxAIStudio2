import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const registryPath = join(root, "config/runtime/runtime-ownership.json");
const reportPath = join(root, "artifacts/runtime/memory-ownership-report.json");

const allowedLifecycles = new Set(["request", "execution", "project", "process"]);
const allowedDurability = new Set(["none", "restart-volatile", "durable"]);

type MemoryLifecycle = "request" | "execution" | "project" | "process";
type MemoryDurability = "none" | "restart-volatile" | "durable";

interface MemoryRuntimeEntry {
  id: string;
  capability: string;
  path: string;
  classification: string;
  owner: string;
  productionUse: string;
  responsibility: string;
  lifecycle?: MemoryLifecycle;
  durability?: MemoryDurability;
  bounds?: string;
}

interface RuntimeOwnershipRegistry {
  schemaVersion: number;
  memoryPolicy?: {
    durableProductStateOwner: string | null;
    statement: string;
  };
  entries: MemoryRuntimeEntry[];
}

interface MemoryProfile {
  id: string;
  capability: string;
  path: string;
  classification: string;
  productionUse: string;
  lifecycle: MemoryLifecycle | null;
  durability: MemoryDurability | null;
  bounds: string | null;
}

function repositoryPath(absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function main(): void {
  const errors: string[] = [];
  const registry = JSON.parse(
    readFileSync(registryPath, "utf8"),
  ) as RuntimeOwnershipRegistry;

  const policy = registry.memoryPolicy;
  if (!policy) {
    errors.push("Runtime ownership registry must define memoryPolicy.");
  } else if (!isNonEmptyString(policy.statement)) {
    errors.push("memoryPolicy.statement must explain the durable ownership state.");
  }

  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const memoryEntries = entries.filter((entry) => entry.capability.includes("memory"));

  if (memoryEntries.length === 0) {
    errors.push("At least one memory runtime entry must be registered.");
  }

  const profiles: MemoryProfile[] = memoryEntries.map((entry) => {
    if (!allowedLifecycles.has(entry.lifecycle ?? "")) {
      errors.push(
        `Memory runtime ${entry.id} has invalid or missing lifecycle: ${entry.lifecycle ?? "undefined"}.`,
      );
    }
    if (!allowedDurability.has(entry.durability ?? "")) {
      errors.push(
        `Memory runtime ${entry.id} has invalid or missing durability: ${entry.durability ?? "undefined"}.`,
      );
    }
    if (!isNonEmptyString(entry.bounds)) {
      errors.push(`Memory runtime ${entry.id} must define concrete bounds.`);
    }
    if (entry.owner !== "memory") {
      errors.push(
        `Memory runtime ${entry.id} must be owned by the memory domain; found ${entry.owner}.`,
      );
    }

    return {
      id: entry.id,
      capability: entry.capability,
      path: entry.path,
      classification: entry.classification,
      productionUse: entry.productionUse,
      lifecycle: entry.lifecycle ?? null,
      durability: entry.durability ?? null,
      bounds: isNonEmptyString(entry.bounds) ? entry.bounds : null,
    };
  });

  const durableEntries = memoryEntries.filter(
    (entry) => entry.durability === "durable",
  );
  const durableOwner = policy?.durableProductStateOwner ?? null;

  if (durableOwner === null && durableEntries.length > 0) {
    errors.push(
      `memoryPolicy declares no durable owner, but durable entries exist: ${durableEntries
        .map((entry) => entry.id)
        .join(", ")}.`,
    );
  }

  if (durableOwner !== null) {
    const owner = memoryEntries.find((entry) => entry.id === durableOwner);
    if (!owner) {
      errors.push(
        `memoryPolicy references unknown durableProductStateOwner ${durableOwner}.`,
      );
    } else if (owner.durability !== "durable") {
      errors.push(
        `Durable product-state owner ${durableOwner} must declare durability=durable.`,
      );
    }

    if (durableEntries.length !== 1) {
      errors.push(
        `Exactly one durable memory runtime is required when a durable owner is declared; found ${durableEntries.length}.`,
      );
    }
  }

  const report = {
    schemaVersion: 1,
    status: errors.length === 0 ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    registryPath: repositoryPath(registryPath),
    policy: policy ?? null,
    counts: {
      memoryEntries: memoryEntries.length,
      executionLifecycle: memoryEntries.filter(
        (entry) => entry.lifecycle === "execution",
      ).length,
      processLifecycle: memoryEntries.filter(
        (entry) => entry.lifecycle === "process",
      ).length,
      restartVolatile: memoryEntries.filter(
        (entry) => entry.durability === "restart-volatile",
      ).length,
      durable: durableEntries.length,
    },
    profiles,
    errors,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Memory ownership validation");
  console.log(`  status: ${report.status}`);
  console.log(`  memory entries: ${report.counts.memoryEntries}`);
  console.log(`  execution lifecycle: ${report.counts.executionLifecycle}`);
  console.log(`  process lifecycle: ${report.counts.processLifecycle}`);
  console.log(`  restart-volatile: ${report.counts.restartVolatile}`);
  console.log(`  durable: ${report.counts.durable}`);
  console.log(`  durable owner: ${durableOwner ?? "none"}`);
  console.log(`  report: ${repositoryPath(reportPath)}`);

  for (const error of errors) console.error(`  error: ${error}`);
  if (errors.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
