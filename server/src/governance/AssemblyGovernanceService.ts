import {
  AssemblyRegistry,
  getDefaultAssemblyRegistry,
} from "../assembly/AssemblyRegistry";
import {
  GovernancePolicyEngine,
  type GovernanceDecision,
} from "./GovernancePolicyEngine";

export type AssemblyCIStatus = "PASSED" | "BLOCKED" | "WARN";

/**
 * Governance-owned facade for assembly impact decisions.
 *
 * Assembly remains responsible for versions, diffs and impact analysis.
 * Governance owns policy evaluation and the ALLOW/WARN/BLOCK decision. Keeping
 * the composition here removes the assembly -> governance runtime dependency.
 */
export class AssemblyGovernanceService {
  constructor(
    private readonly registry: AssemblyRegistry = getDefaultAssemblyRegistry(),
    private readonly policyEngine: GovernancePolicyEngine =
      new GovernancePolicyEngine(),
  ) {}

  runGovernanceCheck(
    assemblyId: string,
    fromVersion: string,
    toVersion: string,
  ): GovernanceDecision | null {
    const analysis = this.registry.getImpactAnalysis(
      assemblyId,
      fromVersion,
      toVersion,
    );
    if (!analysis) return null;

    return this.policyEngine.evaluatePolicies(analysis);
  }

  getCIStatus(assemblyId: string): AssemblyCIStatus | null {
    const versions = this.registry.listVersions(assemblyId);
    if (versions.length < 2) return "PASSED";

    const fromVersion = versions[versions.length - 2];
    const toVersion = versions[versions.length - 1];
    const decision = this.runGovernanceCheck(
      assemblyId,
      fromVersion,
      toVersion,
    );
    if (!decision) return null;
    if (decision.status === "BLOCK") return "BLOCKED";
    if (decision.status === "WARN") return "WARN";
    return "PASSED";
  }
}

let defaultService: AssemblyGovernanceService | null = null;

export function getDefaultAssemblyGovernanceService(): AssemblyGovernanceService {
  if (!defaultService) defaultService = new AssemblyGovernanceService();
  return defaultService;
}
