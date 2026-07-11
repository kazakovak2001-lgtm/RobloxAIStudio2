/**
 * PlaytestRuleEngine — Executes validation rules against the experience.
 */

import { randomUUID } from "crypto";
import type {
  PlaytestInput,
  PlaytestIssue,
  SystemScore,
} from "./PlaytestTypes";

export class PlaytestRuleEngine {
  run(input: PlaytestInput): {
    issues: PlaytestIssue[];
    systemScores: SystemScore[];
  } {
    const issues: PlaytestIssue[] = [];

    this.checkRemoteEvents(input, issues);
    this.checkModuleScripts(input, issues);
    this.checkCircularDeps(input, issues);
    this.checkScriptPlacement(input, issues);
    this.checkAssets(input, issues);
    this.checkConfiguration(input, issues);
    this.checkGameplaySystems(input, issues);

    const systemScores = this.calculateSystemScores(input, issues);
    return { issues, systemScores };
  }

  private checkRemoteEvents(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    const hasRemotes = input.scripts.some(
      (s) => s.name.includes("Remote") || s.content.includes("RemoteEvent"),
    );
    if (!hasRemotes) {
      issues.push(
        this.issue(
          "critical",
          "networking",
          "RemoteEvents",
          "No RemoteEvent setup found",
          "Add a Remotes module in ReplicatedStorage",
          1,
        ),
      );
    }

    // Check for server scripts that fire events without a handler
    for (const script of input.scripts) {
      if (
        script.content.includes("FireClient") &&
        !input.scripts.some((s) => s.content.includes("OnClientEvent"))
      ) {
        issues.push(
          this.issue(
            "warning",
            "networking",
            script.name,
            "FireClient used but no OnClientEvent handler found",
            "Add client-side event listener",
            3,
          ),
        );
        break;
      }
    }
  }

  private checkModuleScripts(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    for (const script of input.scripts) {
      for (const dep of script.dependencies) {
        const exists = input.scripts.some((s) => s.name === dep);
        if (!exists) {
          issues.push(
            this.issue(
              "warning",
              "dependencies",
              script.name,
              `Missing dependency: ${dep}`,
              `Create module "${dep}" or remove the require`,
              2,
            ),
          );
        }
      }
    }
  }

  private checkCircularDeps(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    if (
      input.dependencyGraph?.circular &&
      input.dependencyGraph.circular.length > 0
    ) {
      for (const cycle of input.dependencyGraph.circular) {
        issues.push(
          this.issue(
            "critical",
            "dependencies",
            cycle.join(" → "),
            "Circular dependency detected",
            "Break the cycle by extracting shared logic into a separate module",
            1,
          ),
        );
      }
    }
  }

  private checkScriptPlacement(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    for (const script of input.scripts) {
      if (
        script.type === "ServerScript" &&
        script.path.includes("StarterPlayer")
      ) {
        issues.push(
          this.issue(
            "critical",
            "architecture",
            script.name,
            "ServerScript placed in StarterPlayer",
            "Move to ServerScriptService",
            1,
          ),
        );
      }
      if (
        script.type === "LocalScript" &&
        script.path.includes("ServerScriptService")
      ) {
        issues.push(
          this.issue(
            "critical",
            "architecture",
            script.name,
            "LocalScript placed in ServerScriptService",
            "Move to StarterPlayerScripts",
            1,
          ),
        );
      }
    }
  }

  private checkAssets(input: PlaytestInput, issues: PlaytestIssue[]): void {
    const placeholders = input.assets.filter((a) => a.placeholder);
    if (
      placeholders.length > 0 &&
      placeholders.length === input.assets.length
    ) {
      issues.push(
        this.issue(
          "warning",
          "assets",
          "All Assets",
          `All ${placeholders.length} assets are placeholders`,
          "Generate or upload actual asset files",
          4,
        ),
      );
    }

    if (input.assets.length === 0) {
      issues.push(
        this.issue(
          "suggestion",
          "assets",
          "Asset Package",
          "No assets defined",
          "Add UI, audio, and environment assets",
          5,
        ),
      );
    }
  }

  private checkConfiguration(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    const hasConfig = input.scripts.some(
      (s) => s.name.includes("Config") || s.name.includes("Settings"),
    );
    if (!hasConfig) {
      issues.push(
        this.issue(
          "suggestion",
          "architecture",
          "Configuration",
          "No configuration module found",
          "Add a SharedConfig module for game constants",
          4,
        ),
      );
    }

    const hasDataService = input.scripts.some(
      (s) => s.name.includes("Data") || s.content.includes("DataStore"),
    );
    if (!hasDataService) {
      issues.push(
        this.issue(
          "warning",
          "gameplay",
          "DataService",
          "No data persistence found",
          "Add a DataService for saving player progress",
          3,
        ),
      );
    }
  }

  private checkGameplaySystems(
    input: PlaytestInput,
    issues: PlaytestIssue[],
  ): void {
    const hasLobby = input.scripts.some(
      (s) => s.name.includes("Lobby") || s.content.includes("PlayerAdded"),
    );
    if (!hasLobby) {
      issues.push(
        this.issue(
          "suggestion",
          "gameplay",
          "LobbyManager",
          "No player spawn/lobby system found",
          "Add a LobbyManager for player join handling",
          5,
        ),
      );
    }

    const hasUI = input.scripts.some(
      (s) => s.type === "LocalScript" && s.content.includes("ScreenGui"),
    );
    if (!hasUI) {
      issues.push(
        this.issue(
          "suggestion",
          "gameplay",
          "UIController",
          "No UI controller creating ScreenGuis",
          "Add client UI for player feedback",
          5,
        ),
      );
    }
  }

  private calculateSystemScores(
    _input: PlaytestInput,
    issues: PlaytestIssue[],
  ): SystemScore[] {
    const categories = [
      "architecture",
      "networking",
      "dependencies",
      "assets",
      "gameplay",
    ];
    return categories.map((cat) => {
      const catIssues = issues.filter((i) => i.category === cat);
      const criticals = catIssues.filter(
        (i) => i.severity === "critical",
      ).length;
      const warnings = catIssues.filter((i) => i.severity === "warning").length;
      let score = 100 - criticals * 25 - warnings * 10;
      score = Math.max(0, Math.min(100, score));
      return {
        system: cat,
        score,
        issues: catIssues.length,
        status: score >= 80 ? "pass" : score >= 50 ? "warn" : "fail",
      };
    });
  }

  private issue(
    severity: PlaytestIssue["severity"],
    category: string,
    artifact: string,
    reason: string,
    fix: string,
    priority: number,
  ): PlaytestIssue {
    return {
      id: `issue-${randomUUID().slice(0, 8)}`,
      severity,
      category,
      affectedArtifact: artifact,
      reason,
      recommendedFix: fix,
      priority,
    };
  }
}
