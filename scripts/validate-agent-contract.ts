/**
 * AGENT-CONTRACT-1 — reconcile the agent contract against the running registry.
 *
 * The contract is only authoritative if the implementations agree with it, so
 * this runs outside the test suite: `npm run validate` fails when a definition
 * describes an agent that no longer exists, an agent exists that nothing
 * describes, or a declared attempt ceiling differs from the one the
 * implementation actually loops.
 */
import {
  AGENT_DEFINITIONS,
  validateAgentDefinitions,
} from "../server/src/agents/contract/agentContract";
import { AgentRegistry } from "../server/src/agents/core/AgentRegistry";

function main(): void {
  const registry = new AgentRegistry();
  const registered = registry.registeredTypes();
  const issues = validateAgentDefinitions(
    AGENT_DEFINITIONS,
    registered,
    registry.attemptCeilings(),
  );

  console.log("Agent contract validation");
  console.log(`  definitions: ${AGENT_DEFINITIONS.length}`);
  console.log(`  registered implementations: ${registered.length}`);
  console.log(`  status: ${issues.length === 0 ? "pass" : "fail"}`);

  for (const issue of issues) {
    console.error(`  error: [${issue.code}] ${issue.message}`);
  }
  if (issues.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
