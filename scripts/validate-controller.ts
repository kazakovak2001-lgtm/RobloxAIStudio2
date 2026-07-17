/**
 * AI Project Controller Validation Script
 *
 * Tests agent registration, CodebaseKnowledge indexing,
 * and executes each controller agent.
 */

import { AgentRegistry } from "../server/src/agents/core/AgentRegistry";
import { CodebaseKnowledge } from "../server/src/knowledge/CodebaseKnowledge";
import { GCPSecretProvider } from "../server/src/cloud/secrets/GCPSecretProvider";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  AI Project Controller — Validation Suite        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ─── 1. Agent Registration ────────────────────────────────────────────────
  console.log("═══ 1. AGENT REGISTRATION ═══\n");
  const registry = new AgentRegistry();
  const types = registry.registeredTypes();
  console.log(`  Total agents registered: ${types.length}`);

  const controllers = [
    "architecture_controller",
    "code_review_controller",
    "duplication_detector",
  ];
  let allRegistered = true;
  for (const c of controllers) {
    const agent = registry.getAgent(c);
    const status = agent ? "✅ REGISTERED" : "❌ MISSING";
    if (!agent) allRegistered = false;
    console.log(`  ${c}: ${status}`);
  }
  console.log(`\n  Registration: ${allRegistered ? "PASS" : "FAIL"}\n`);

  // ─── 2. CodebaseKnowledge Indexing ────────────────────────────────────────
  console.log("═══ 2. CODEBASE KNOWLEDGE INDEXING ═══\n");
  const knowledge = new CodebaseKnowledge();
  const startIndex = Date.now();
  knowledge.indexSourceTree();
  const indexDuration = Date.now() - startIndex;

  const stats = knowledge.getStats();
  console.log(`  Files indexed: ${stats.total}`);
  console.log(`  Index duration: ${indexDuration}ms`);
  console.log("  By category:");
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${cat}: ${count}`);
  }
  console.log("");

  // ─── 3. Architecture Audit ────────────────────────────────────────────────
  console.log("═══ 3. ARCHITECTURE AUDIT ═══\n");
  const archResult = await registry.executeAgent("architecture_controller", {
    action: "scan",
  });
  if ("_failed" in archResult) {
    console.log("  ❌ Architecture agent failed:", archResult._error);
  } else {
    const arch = archResult.architecture as Record<string, unknown>;
    console.log(`  Status: ${arch.status}`);
    console.log(`  Files scanned: ${arch.filesScanned}`);
    console.log(`  Imports analyzed: ${arch.importsAnalyzed}`);
    console.log(`  Violations: ${(arch.violations as unknown[])?.length ?? 0}`);
    console.log(
      `  Circular deps: ${(arch.circularDependencies as unknown[])?.length ?? 0}`,
    );
  }
  console.log("");

  // ─── 4. Code Review Audit ─────────────────────────────────────────────────
  console.log("═══ 4. CODE REVIEW AUDIT ═══\n");
  const sampleCode = `
import { BaseAgent } from "../core/BaseAgent";
import type { AgentInput } from "../../types";

export class SampleAgent extends BaseAgent {
  public readonly name = "Sample";
  public readonly description = "A sample agent";
  public readonly inputSchema = {};
  public readonly outputSchema = {};

  protected async process(input: AgentInput): Promise<Record<string, unknown>> {
    return { result: "ok" };
  }
}`;

  const reviewResult = await registry.executeAgent("code_review_controller", {
    code: sampleCode,
    filePath: "server/src/agents/implementations/SampleAgent.ts",
  });
  if ("_failed" in reviewResult) {
    console.log("  ❌ Code review agent failed:", reviewResult._error);
  } else {
    const review = reviewResult.review as Record<string, unknown>;
    console.log(`  File: ${review.filePath}`);
    console.log(`  Score: ${review.score}/100`);
    console.log(`  Rules checked: ${review.rulesChecked}`);
    const findings = review.staticFindings as Array<{
      rule: string;
      passed: boolean;
      detail?: string;
    }>;
    if (findings && findings.length > 0) {
      console.log("  Findings:");
      for (const f of findings) {
        console.log(
          `    [${f.passed ? "PASS" : "FAIL"}] ${f.rule}${f.detail ? ": " + f.detail : ""}`,
        );
      }
    }
  }
  console.log("");

  // ─── 5. Duplication Detection ─────────────────────────────────────────────
  console.log("═══ 5. DUPLICATION DETECTION ═══\n");
  const dupResult = await registry.executeAgent("duplication_detector", {
    name: "AgentRegistry",
    description: "Registry for managing agent instances",
    exports: ["AgentRegistry", "register", "executeAgent"],
  });
  if ("_failed" in dupResult) {
    console.log("  ❌ Duplication agent failed:", dupResult._error);
  } else {
    const dup = dupResult.duplication as Record<string, unknown>;
    console.log(`  Has duplicate: ${dup.hasDuplicate}`);
    console.log(`  Confidence: ${dup.confidence}%`);
    console.log(`  Recommendation: ${dup.recommendation}`);
    const matches = dup.matches as Array<{
      path: string;
      relevance: number;
      reason: string;
    }>;
    if (matches && matches.length > 0) {
      console.log(`  Matches (${matches.length}):`);
      for (const m of matches.slice(0, 5)) {
        console.log(`    - ${m.path} (${m.relevance}%): ${m.reason}`);
      }
    }
  }
  console.log("");

  // ─── 6. GCP Secret Provider Status ────────────────────────────────────────
  console.log("═══ 6. SECRET PROVIDER STATUS ═══\n");
  const secrets = new GCPSecretProvider();
  const secretStatus = secrets.getStatus();
  console.log(`  Provider: ${secretStatus.provider}`);
  console.log(`  GCP enabled: ${secretStatus.gcpEnabled}`);
  console.log(`  Cached secrets: ${secretStatus.cachedSecrets}`);
  console.log("");

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("═══ VALIDATION SUMMARY ═══\n");
  console.log(`  Agent registration: ${allRegistered ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Codebase indexing: ✅ ${stats.total} files indexed`);
  console.log(
    `  Architecture audit: ${"_failed" in archResult ? "❌ FAIL" : "✅ PASS"}`,
  );
  console.log(
    `  Code review audit: ${"_failed" in reviewResult ? "❌ FAIL" : "✅ PASS"}`,
  );
  console.log(
    `  Duplication detection: ${"_failed" in dupResult ? "❌ FAIL" : "✅ PASS"}`,
  );
  console.log(`  Secret provider: ✅ ${secretStatus.provider} mode`);
}

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
