/**
 * Test: Decision Memory
 */
import { DecisionMemory } from "../server/src/knowledge/DecisionMemory";

function main() {
  console.log("═══ DECISION MEMORY TEST ═══\n");

  const memory = new DecisionMemory();
  memory.initialize();

  const stats = memory.getStats();
  console.log("Statistics:");
  console.log(`  Total decisions: ${stats.totalDecisions}`);
  console.log(`  Total rules: ${stats.totalRules}`);
  console.log(`  By source:`, stats.bySource);

  // Test: Search for "pipeline"
  console.log("\n─── Search: 'pipeline' ───");
  const pipelineResults = memory.search("pipeline");
  for (const r of pipelineResults.slice(0, 3)) {
    console.log(`  [${r.relevance}%] ${r.decision.title} (${r.decision.date})`);
    console.log(`    Decision: ${r.decision.decision.slice(0, 80)}...`);
  }

  // Test: Search for "authentication"
  console.log("\n─── Search: 'authentication' ───");
  const authResults = memory.search("authentication");
  for (const r of authResults.slice(0, 3)) {
    console.log(`  [${r.relevance}%] ${r.decision.title} (${r.decision.date})`);
  }

  // Test: Find prior decisions for intent
  console.log("\n─── Prior Decision Check: 'create new event system' ───");
  const check = memory.findPriorDecisions("event system");
  console.log(`  Prior decisions found: ${check.priorDecisions.length}`);
  console.log(`  Applicable rules: ${check.applicableRules.length}`);
  console.log(`  Recommendation: ${check.recommendation}`);

  // Test: Governance rules
  console.log("\n─── Governance Rules (Architecture) ───");
  const archRules = memory
    .getRules()
    .filter((r) => r.category === "architecture");
  for (const r of archRules.slice(0, 5)) {
    console.log(`  [${r.id}] ${r.rule.slice(0, 80)}`);
  }

  // Test: Decisions for AutonomousOrchestrator
  console.log("\n─── Decisions for: AutonomousOrchestrator ───");
  const orchDecisions = memory.getDecisionsForModule("AutonomousOrchestrator");
  for (const d of orchDecisions) {
    console.log(`  ${d.date}: ${d.title}`);
  }
}

main();
