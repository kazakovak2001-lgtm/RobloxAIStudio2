/**
 * RepairExecutor — Applies repair strategies to artifacts.
 */

import type { RepairPlan, RepairResult } from "./RepairTypes";

export class RepairExecutor {
  /**
   * Execute a repair plan and return results.
   */
  execute(plan: RepairPlan): RepairResult[] {
    const results: RepairResult[] = [];

    for (const item of plan.items) {
      if (item.decision === "ignore" || item.decision === "escalate") {
        results.push({
          planItem: item,
          applied: false,
          artifactChanged: item.targetArtifact,
          description: `Skipped: decision=${item.decision}`,
        });
        continue;
      }

      const result = this.applyStrategy(item);
      results.push(result);
    }

    return results;
  }

  private applyStrategy(item: RepairResult["planItem"]): RepairResult {
    // Each strategy simulates the repair action.
    // In production, these would modify actual artifact content.
    switch (item.repairStrategy) {
      case "create_remote_event":
        return this.result(
          item,
          true,
          `Created RemoteEvent for ${item.targetArtifact}`,
        );
      case "create_module_script":
        return this.result(
          item,
          true,
          `Created missing module: ${item.targetArtifact}`,
        );
      case "move_script":
        return this.result(
          item,
          true,
          `Moved ${item.targetArtifact} to correct service`,
        );
      case "repair_dependency_graph":
        return this.result(
          item,
          true,
          `Repaired dependency chain for ${item.targetArtifact}`,
        );
      case "regenerate_configuration":
        return this.result(item, true, `Regenerated configuration module`);
      case "regenerate_ui":
        return this.result(item, true, `Regenerated UI controller`);
      case "regenerate_script":
        return this.result(
          item,
          true,
          `Regenerated script: ${item.targetArtifact}`,
        );
      case "update_asset_manifest":
        return this.result(item, true, `Updated asset manifest`);
      case "fix_asset_reference":
        return this.result(
          item,
          true,
          `Fixed asset reference in ${item.targetArtifact}`,
        );
      default:
        return this.result(
          item,
          false,
          `Unknown strategy: ${item.repairStrategy}`,
        );
    }
  }

  private result(
    item: RepairResult["planItem"],
    applied: boolean,
    description: string,
  ): RepairResult {
    return {
      planItem: item,
      applied,
      artifactChanged: item.targetArtifact,
      description,
    };
  }
}
