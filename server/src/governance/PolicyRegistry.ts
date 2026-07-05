/**
 * PolicyRegistry.ts
 *
 * Central store for CI/CD governance rules.
 * Supports default system policies and custom project policies.
 * Future-ready for AI-driven policy tuning via runtime updates.
 */

export interface PolicyRule {
  id: string;
  name: string;
  /** Expression evaluated against ImpactAnalysis fields */
  condition: string;
  /** Threshold value for numeric comparisons (used in condition evaluation) */
  threshold: number;
  severity: "low" | "medium" | "high" | "critical";
  action: "allow" | "warn" | "block";
  /** Whether this rule is active */
  enabled: boolean;
}

/**
 * Default system policies — always active unless explicitly disabled.
 */
export const DEFAULT_POLICIES: PolicyRule[] = [
  {
    id: "P1",
    name: "High Risk Blocker",
    condition: "impactScore >= 75",
    threshold: 75,
    severity: "critical",
    action: "block",
    enabled: true,
  },
  {
    id: "P2",
    name: "Critical Path Guard",
    condition: "criticalPaths.length > 0 && impactScore >= 50",
    threshold: 50,
    severity: "high",
    action: "warn",
    enabled: true,
  },
  {
    id: "P3",
    name: "Propagation Risk",
    condition: "propagationDepth >= 4",
    threshold: 4,
    severity: "medium",
    action: "warn",
    enabled: true,
  },
  {
    id: "P4",
    name: "Extreme Network Risk",
    condition: "riskBreakdown.network >= 30",
    threshold: 30,
    severity: "critical",
    action: "block",
    enabled: true,
  },
  {
    id: "P5",
    name: "Circular Dependency Alert",
    condition: "circularRisks.length > 0",
    threshold: 1,
    severity: "high",
    action: "warn",
    enabled: true,
  },
];

export class PolicyRegistry {
  private policies: PolicyRule[] = [];

  constructor() {
    this.loadDefaults();
  }

  private loadDefaults(): void {
    this.policies = [...DEFAULT_POLICIES];
  }

  /** Get all active policies. */
  getActivePolicies(): PolicyRule[] {
    return this.policies.filter((p) => p.enabled);
  }

  /** Get all policies (including disabled). */
  getAllPolicies(): PolicyRule[] {
    return [...this.policies];
  }

  /** Add or replace a policy. */
  addPolicy(policy: PolicyRule): void {
    const idx = this.policies.findIndex((p) => p.id === policy.id);
    if (idx >= 0) {
      this.policies[idx] = policy;
    } else {
      this.policies.push(policy);
    }
  }

  /** Remove a policy by ID. */
  removePolicy(id: string): boolean {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx >= 0) {
      this.policies.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Enable or disable a policy. */
  setEnabled(id: string, enabled: boolean): void {
    const policy = this.policies.find((p) => p.id === id);
    if (policy) policy.enabled = enabled;
  }

  /** Get a single policy by ID. */
  getPolicy(id: string): PolicyRule | null {
    return this.policies.find((p) => p.id === id) ?? null;
  }

  get size(): number {
    return this.policies.length;
  }
}

let _default: PolicyRegistry | null = null;
export function getDefaultPolicyRegistry(): PolicyRegistry {
  if (!_default) _default = new PolicyRegistry();
  return _default;
}
