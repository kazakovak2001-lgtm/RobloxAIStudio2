/**
 * Test: Architecture Graph queries
 */
import { CodebaseKnowledge } from "../server/src/knowledge/CodebaseKnowledge";

function main() {
  console.log("═══ ARCHITECTURE GRAPH TEST ═══\n");

  const knowledge = new CodebaseKnowledge();
  const start = Date.now();
  knowledge.indexSourceTree();
  const duration = Date.now() - start;
  console.log(`Indexed in ${duration}ms\n`);

  // Graph stats
  const stats = knowledge.getGraphStats();
  console.log("Graph Statistics:");
  console.log(`  Total edges: ${stats.totalEdges}`);
  console.log(`  Avg dependencies per file: ${stats.avgDependencies}`);
  console.log("\n  Most depended upon (imported by others):");
  for (const item of stats.mostDepended.slice(0, 5)) {
    console.log(`    ${item.file} — ${item.count} dependents`);
  }
  console.log("\n  Most dependencies (imports the most):");
  for (const item of stats.mostDependencies.slice(0, 5)) {
    console.log(`    ${item.file} — ${item.count} imports`);
  }

  // Test: What depends on AgentRegistry?
  console.log("\n─── Query: What depends on AgentRegistry? ───");
  const agentRegDeps = knowledge.getDependents(
    "server/src/agents/core/AgentRegistry.ts",
  );
  console.log(`  ${agentRegDeps.length} files depend on AgentRegistry:`);
  for (const dep of agentRegDeps.slice(0, 8)) {
    console.log(`    - ${dep}`);
  }

  // Test: Impact of changing BaseAgent
  console.log("\n─── Query: Impact of changing BaseAgent? ───");
  const impact = knowledge.getImpact("server/src/agents/core/BaseAgent.ts");
  console.log(`  Direct dependents: ${impact.directDependents.length}`);
  console.log(`  Transitive dependents: ${impact.transitiveDependents.length}`);
  console.log(`  Impact score: ${impact.impactScore}/100`);
  console.log("  Direct dependents:");
  for (const dep of impact.directDependents.slice(0, 5)) {
    console.log(`    - ${dep}`);
  }

  // Test: Where should a new agent go?
  console.log("\n─── Query: Where should a new agent be placed? ───");
  const suggestions = knowledge.suggestLocation(["../core/BaseAgent"], "agent");
  for (const s of suggestions.slice(0, 3)) {
    console.log(`  ${s.directory} — ${s.reason}`);
  }

  // Test: What does the controller route depend on?
  console.log("\n─── Query: Controller route dependencies ───");
  const controllerDeps = knowledge.getDependencies(
    "server/src/routes/controller.ts",
  );
  console.log(`  ${controllerDeps.length} dependencies:`);
  for (const dep of controllerDeps) {
    console.log(`    - ${dep}`);
  }
}

main();
