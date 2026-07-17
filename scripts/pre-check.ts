/**
 * pre-check.ts — Developer CLI for Pre-Implementation Check.
 *
 * Usage:
 *   npx tsx scripts/pre-check.ts "I want to create a new Analytics module"
 *   npx tsx scripts/pre-check.ts --name=Analytics --type=service "analytics for metrics"
 *
 * No server required — runs agents directly.
 */

import { AgentRegistry } from "../server/src/agents/core/AgentRegistry";
import { CodebaseKnowledge } from "../server/src/knowledge/CodebaseKnowledge";
import { DecisionMemory } from "../server/src/knowledge/DecisionMemory";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help") {
    console.log('Usage: npx tsx scripts/pre-check.ts "describe your feature"');
    console.log(
      '       npx tsx scripts/pre-check.ts --name=MyComponent "description"',
    );
    process.exit(0);
  }

  // Parse args
  let name: string | undefined;
  let type: string | undefined;
  const intentParts: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--name=")) name = arg.slice(7);
    else if (arg.startsWith("--type=")) type = arg.slice(7);
    else intentParts.push(arg);
  }

  const intent = intentParts.join(" ");
  if (!intent) {
    console.error("Error: intent is required");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  AI Pre-Implementation Check                     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`  Intent: "${intent}"`);
  if (name) console.log(`  Name: ${name}`);
  if (type) console.log(`  Type: ${type}`);
  console.log("");

  // Initialize
  const registry = new AgentRegistry();
  const knowledge = new CodebaseKnowledge();
  const decisions = new DecisionMemory();

  knowledge.indexSourceTree();
  decisions.initialize();

  // Step 1: Duplication
  const effectiveName = name ?? extractName(intent);
  const dupResult = await registry.executeAgent("duplication_detector", {
    name: effectiveName,
    description: intent,
    exports: [],
    category: type,
  });
  const dupData = dupResult.duplication as Record<string, unknown> | undefined;
  const hasDup = dupData?.hasDuplicate === true;
  const confidence = (dupData?.confidence as number) ?? 0;

  // Step 2: Architecture
  const archResult = await registry.executeAgent("architecture_controller", {
    action: "scan",
  });
  const archData = archResult.architecture as
    Record<string, unknown> | undefined;
  const violations = ((archData as any)?.violations as unknown[])?.length ?? 0;

  // Step 3: Decision Memory
  const priorCheck = decisions.findPriorDecisions(intent);

  // Step 4: Decision
  let decision: string;
  let reason: string;
  if (hasDup && confidence >= 80) {
    decision = "🚫 BLOCK";
    reason = `High-confidence duplicate (${confidence}%). Must reuse existing.`;
  } else if (hasDup && confidence >= 40) {
    decision = "⚠️  WARN";
    reason = `Potential duplicate (${confidence}%). Review before creating.`;
  } else if (violations > 0) {
    decision = "⚠️  WARN";
    reason = `No duplicates but ${violations} architecture violation(s).`;
  } else {
    decision = "✅ ALLOW";
    reason = "No duplicates. Architecture clean. Safe to proceed.";
  }

  // Output
  console.log("─── RESULT ───\n");
  console.log(`  Decision: ${decision}`);
  console.log(`  Reason: ${reason}`);

  if (hasDup) {
    const matches = dupData?.matches as
      Array<Record<string, unknown>> | undefined;
    if (matches && matches.length > 0) {
      console.log("\n  Existing implementations:");
      for (const m of matches.slice(0, 5)) {
        console.log(`    → ${m.path} (${m.relevance}%)`);
      }
    }
  }

  if (priorCheck.priorDecisions.length > 0) {
    console.log("\n  Prior decisions:");
    for (const d of priorCheck.priorDecisions.slice(0, 3)) {
      console.log(`    → ${d.decision.title} (${d.decision.date})`);
    }
  }

  if (priorCheck.applicableRules.length > 0) {
    console.log("\n  Applicable rules:");
    for (const r of priorCheck.applicableRules.slice(0, 3)) {
      console.log(`    → [${r.id}] ${r.rule.slice(0, 70)}`);
    }
  }

  console.log("");
  process.exit(decision.includes("BLOCK") ? 1 : 0);
}

function extractName(intent: string): string {
  const cleaned = intent
    .replace(/^(i want to |create |build |implement |add |make |new )/i, "")
    .replace(/\s+(module|component|service|agent|system|layer|class)$/i, "")
    .trim();
  const words = cleaned.split(/\s+/);
  const capitalized = words.filter((w) => w[0] === w[0]?.toUpperCase());
  return capitalized.length > 0
    ? capitalized.join("")
    : words.slice(0, 2).join("");
}

main().catch((err) => {
  console.error("Pre-check failed:", err);
  process.exit(1);
});
