/**
 * BestPractices — Roblox development best practices database.
 */

import type { BestPractice } from "./DomainTypes";

const PRACTICES: BestPractice[] = [
  {
    id: "net-1",
    category: "networking",
    rule: "Server-authoritative game state",
    reason: "Prevents exploits; clients should only render",
    severity: "required",
  },
  {
    id: "net-2",
    category: "networking",
    rule: "Validate all RemoteEvent payloads on server",
    reason: "Exploiters can send arbitrary data",
    severity: "required",
  },
  {
    id: "net-3",
    category: "networking",
    rule: "Rate-limit client RemoteEvent calls",
    reason: "Prevents spam and server overload",
    severity: "required",
  },
  {
    id: "net-4",
    category: "networking",
    rule: "Batch RemoteEvent updates when possible",
    reason: "Reduces network overhead (max 60/sec per player)",
    severity: "recommended",
  },
  {
    id: "rep-1",
    category: "replication",
    rule: "Use ReplicatedStorage for shared modules",
    reason: "Accessible by both server and client",
    severity: "required",
  },
  {
    id: "rep-2",
    category: "replication",
    rule: "Never put secrets in ReplicatedStorage",
    reason: "Clients can read all replicated content",
    severity: "required",
  },
  {
    id: "sec-1",
    category: "security",
    rule: "Never trust client for game-state decisions",
    reason: "Clients are fully exploitable",
    severity: "required",
  },
  {
    id: "sec-2",
    category: "security",
    rule: "Sanity-check player movement server-side",
    reason: "Prevents teleport exploits",
    severity: "recommended",
  },
  {
    id: "sec-3",
    category: "security",
    rule: "Double-validate currency transactions",
    reason: "Economic exploits are common",
    severity: "required",
  },
  {
    id: "ds-1",
    category: "datastore",
    rule: "Use pcall around DataStore operations",
    reason: "DataStore can fail; handle errors gracefully",
    severity: "required",
  },
  {
    id: "ds-2",
    category: "datastore",
    rule: "Implement session locking",
    reason: "Prevents data duplication on rapid rejoin",
    severity: "recommended",
  },
  {
    id: "ds-3",
    category: "datastore",
    rule: "Auto-save every 2-5 minutes",
    reason: "Minimizes data loss on crash",
    severity: "recommended",
  },
  {
    id: "perf-1",
    category: "performance",
    rule: "Enable StreamingEnabled for large worlds",
    reason: "Reduces client memory and load time",
    severity: "recommended",
  },
  {
    id: "perf-2",
    category: "performance",
    rule: "Keep visible part count under 50,000",
    reason: "More parts = lower FPS on mobile",
    severity: "recommended",
  },
  {
    id: "perf-3",
    category: "performance",
    rule: "Use task.wait() instead of wait()",
    reason: "task library is more performant and precise",
    severity: "recommended",
  },
  {
    id: "perf-4",
    category: "performance",
    rule: "Use CollectionService for batch operations",
    reason: "More efficient than iterating workspace",
    severity: "optional",
  },
  {
    id: "perf-5",
    category: "performance",
    rule: "Profile with MicroProfiler regularly",
    reason: "Identify bottlenecks before players do",
    severity: "optional",
  },
  {
    id: "mob-1",
    category: "mobile",
    rule: "Design touch-first UI (44px min tap target)",
    reason: "60%+ of Roblox players are on mobile",
    severity: "required",
  },
  {
    id: "mob-2",
    category: "mobile",
    rule: "Test on low-end mobile devices",
    reason: "Ensure acceptable FPS on target hardware",
    severity: "recommended",
  },
  {
    id: "con-1",
    category: "console",
    rule: "Support gamepad navigation in all menus",
    reason: "Console players use controllers exclusively",
    severity: "recommended",
  },
  {
    id: "mem-1",
    category: "memory",
    rule: "Monitor server memory (budget: 512MB)",
    reason: "Server crashes if memory exceeded",
    severity: "required",
  },
  {
    id: "mem-2",
    category: "memory",
    rule: "Disconnect events on object destruction",
    reason: "Prevents memory leaks",
    severity: "recommended",
  },
];

export class BestPracticesDB {
  getAll(): BestPractice[] {
    return PRACTICES;
  }

  getByCategory(category: string): BestPractice[] {
    return PRACTICES.filter((p) => p.category === category);
  }

  getRequired(): BestPractice[] {
    return PRACTICES.filter((p) => p.severity === "required");
  }

  getCategories(): string[] {
    return [...new Set(PRACTICES.map((p) => p.category))];
  }
}
