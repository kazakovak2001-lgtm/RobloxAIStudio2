/**
 * Test: Pre-Implementation Check workflow
 */
import { AgentRegistry } from "../server/src/agents/core/AgentRegistry";
import { CodebaseKnowledge } from "../server/src/knowledge/CodebaseKnowledge";

async function main() {
  const registry = new AgentRegistry();
  const knowledge = new CodebaseKnowledge();
  knowledge.indexSourceTree();

  console.log("═══ PRE-IMPLEMENTATION CHECK TEST ═══\n");
  console.log('Intent: "I want to create a new Analytics module"\n');

  // Step 1: Duplication check
  const dup = await registry.executeAgent("duplication_detector", {
    name: "Analytics",
    description: "analytics module for tracking metrics",
    exports: ["AnalyticsService", "AnalyticsRouter", "createAnalyticsRouter"],
  });
  const dupData = dup.duplication as Record<string, unknown>;
  console.log(
    `Duplicate found: ${dupData?.hasDuplicate} (${dupData?.confidence}%)`,
  );
  const matches = dupData?.matches as
    Array<Record<string, unknown>> | undefined;
  if (matches && matches.length > 0) {
    console.log("Existing implementations:");
    for (const m of matches.slice(0, 5)) {
      console.log(`  - ${m.path} (${m.relevance}%): ${m.reason}`);
    }
  }

  // Step 2: Architecture check
  console.log("");
  const arch = await registry.executeAgent("architecture_controller", {
    action: "scan",
  });
  const archData = arch.architecture as Record<string, unknown>;
  const violations = (archData?.violations as unknown[])?.length ?? 0;
  console.log(`Architecture violations: ${violations}`);

  // Step 3: Decision
  const hasDup = dupData?.hasDuplicate === true;
  const conf = (dupData?.confidence as number) ?? 0;

  let decision: string;
  let reason: string;
  if (hasDup && conf >= 80) {
    decision = "BLOCK";
    reason = `High-confidence duplicate (${conf}%). Use existing implementation.`;
  } else if (hasDup && conf >= 40) {
    decision = "WARN";
    reason = `Potential duplicate (${conf}%). Review before creating.`;
  } else {
    decision = "ALLOW";
    reason = "No significant duplicates found.";
  }

  console.log("\n─── DECISION ───");
  console.log(`  Decision: ${decision}`);
  console.log(`  Reason: ${reason}`);
  if (matches && matches.length > 0) {
    console.log(`  Recommended: Reuse ${matches[0].path}`);
  }

  // Test 2: Something that doesn't exist
  console.log("\n═══ PRE-CHECK TEST 2 ═══\n");
  console.log('Intent: "Create a QuantumPhysicsSimulator"\n');

  const dup2 = await registry.executeAgent("duplication_detector", {
    name: "QuantumPhysicsSimulator",
    description: "quantum physics simulation for particle effects",
    exports: ["QuantumSimulator", "ParticleEngine"],
  });
  const dupData2 = dup2.duplication as Record<string, unknown>;
  console.log(
    `Duplicate found: ${dupData2?.hasDuplicate} (${dupData2?.confidence}%)`,
  );

  const conf2 = (dupData2?.confidence as number) ?? 0;
  const decision2 = conf2 >= 80 ? "BLOCK" : conf2 >= 40 ? "WARN" : "ALLOW";
  console.log(`  Decision: ${decision2}`);
  console.log(
    `  Reason: ${conf2 < 40 ? "No duplicates. Safe to create." : "Review needed."}`,
  );
}

main().catch(console.error);
