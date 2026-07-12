/**
 * MultiplayerValidator — Validates server/client separation and exploit risks.
 */

export interface MultiplayerIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  artifact: string;
}

export interface MultiplayerReport {
  valid: boolean;
  score: number;
  issues: MultiplayerIssue[];
}

export class MultiplayerValidator {
  validate(
    scripts: Array<{ name: string; type: string; content: string }>,
  ): MultiplayerReport {
    const issues: MultiplayerIssue[] = [];

    for (const script of scripts) {
      this.checkServerClientSeparation(script, issues);
      this.checkRemoteEventSecurity(script, issues);
      this.checkExploitRisks(script, issues);
    }

    const criticals = issues.filter((i) => i.severity === "critical").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const score = Math.max(0, 100 - criticals * 25 - warnings * 10);

    return { valid: criticals === 0, score, issues };
  }

  private checkServerClientSeparation(
    script: { name: string; type: string; content: string },
    issues: MultiplayerIssue[],
  ): void {
    if (
      script.type === "LocalScript" &&
      script.content.includes("DataStoreService")
    ) {
      issues.push({
        severity: "critical",
        category: "separation",
        message: "Client script accesses DataStoreService",
        artifact: script.name,
      });
    }
    if (
      script.type === "LocalScript" &&
      script.content.includes("ServerStorage")
    ) {
      issues.push({
        severity: "critical",
        category: "separation",
        message: "Client script accesses ServerStorage",
        artifact: script.name,
      });
    }
  }

  private checkRemoteEventSecurity(
    script: { name: string; type: string; content: string },
    issues: MultiplayerIssue[],
  ): void {
    if (
      script.type === "ServerScript" &&
      script.content.includes("OnServerEvent") &&
      !script.content.includes("typeof")
    ) {
      issues.push({
        severity: "warning",
        category: "validation",
        message: "RemoteEvent handler may not validate payload types",
        artifact: script.name,
      });
    }
  }

  private checkExploitRisks(
    script: { name: string; type: string; content: string },
    issues: MultiplayerIssue[],
  ): void {
    if (
      script.type === "LocalScript" &&
      script.content.includes("Humanoid.WalkSpeed")
    ) {
      issues.push({
        severity: "warning",
        category: "exploit",
        message: "Client modifying WalkSpeed (exploitable)",
        artifact: script.name,
      });
    }
    if (
      script.type === "LocalScript" &&
      script.content.includes("Humanoid.Health")
    ) {
      issues.push({
        severity: "critical",
        category: "exploit",
        message: "Client modifying Health directly",
        artifact: script.name,
      });
    }
  }
}
