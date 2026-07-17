/**
 * workspace/core/panel-registry/definitions.ts
 *
 * Registers all 29 existing workspace panels with their metadata.
 * Each panel declares its target zone, supported phases/modes, and
 * per-phase visibility rules.
 *
 * Zone assignments:
 *   canvas      — Main content panels (AgentBoard, GameArchitect, etc.)
 *   properties  — Inspector/detail panels (CostMonitor, TokenUsage, etc.)
 *   ai-command  — Bottom command panels (LiveConsole, GenerateButton, etc.)
 */

import type { PanelVisibility, WorkflowPhase } from "../types";
import type { PanelRegistration } from "./types";
import { registerPanel } from "./registry";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** All phases shorthand */
const ALL_PHASES: WorkflowPhase[] = [
  "generate",
  "planning",
  "generation",
  "validation",
  "simulation",
  "economy",
  "playtest",
  "export",
];

/** Create a visibility map with a default value, then override specific phases */
function visibility(
  defaultState: PanelVisibility,
  overrides?: Partial<Record<WorkflowPhase, PanelVisibility>>,
): Record<WorkflowPhase, PanelVisibility> {
  const base: Record<WorkflowPhase, PanelVisibility> = {
    generate: defaultState,
    planning: defaultState,
    generation: defaultState,
    validation: defaultState,
    simulation: defaultState,
    economy: defaultState,
    playtest: defaultState,
    export: defaultState,
  };
  if (overrides) {
    for (const [phase, vis] of Object.entries(overrides)) {
      base[phase as WorkflowPhase] = vis;
    }
  }
  return base;
}

// ─── Canvas Zone Panels ─────────────────────────────────────────────────────

const canvasPanels: PanelRegistration[] = [
  {
    id: "agent-board",
    name: "Agent Board",
    zone: "canvas",
    supportedModes: ["build", "pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible", {
      simulation: "on-demand",
      playtest: "on-demand",
    }),
    priority: 10,
    category: "generation",
    memo: true,
  },
  {
    id: "game-architect-panel",
    name: "Game Architect Panel",
    zone: "canvas",
    supportedModes: ["build", "code"],
    supportedPhases: ["generate", "planning", "generation"],
    visibility: visibility("hidden", {
      generate: "visible",
      planning: "visible",
      generation: "visible",
    }),
    priority: 15,
    category: "generation",
    lazy: true,
  },
  {
    id: "simulation-panel",
    name: "Simulation Panel",
    zone: "canvas",
    supportedModes: ["simulation"],
    supportedPhases: ["simulation", "economy", "playtest"],
    visibility: visibility("hidden", {
      simulation: "visible",
      economy: "on-demand",
      playtest: "on-demand",
    }),
    priority: 10,
    category: "validation",
    lazy: true,
  },
  {
    id: "economy-panel",
    name: "Economy Panel",
    zone: "canvas",
    supportedModes: ["simulation", "analytics"],
    supportedPhases: ["economy", "simulation"],
    visibility: visibility("hidden", {
      economy: "visible",
      simulation: "on-demand",
    }),
    priority: 12,
    category: "analytics",
    lazy: true,
  },
  {
    id: "playtest-panel",
    name: "Playtest Panel",
    zone: "canvas",
    supportedModes: ["playtest"],
    supportedPhases: ["playtest"],
    visibility: visibility("hidden", {
      playtest: "visible",
    }),
    priority: 10,
    category: "validation",
    lazy: true,
  },
  {
    id: "artifact-explorer",
    name: "Artifact Explorer",
    zone: "canvas",
    supportedModes: ["build", "code", "pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      validation: "visible",
      export: "visible",
    }),
    priority: 20,
    category: "navigation",
    memo: true,
  },
  {
    id: "export-preview",
    name: "Export Preview",
    zone: "canvas",
    supportedModes: ["build", "code"],
    supportedPhases: ["export"],
    visibility: visibility("hidden", {
      export: "visible",
    }),
    priority: 10,
    category: "export",
    lazy: true,
  },
  {
    id: "autonomous-pipeline-panel",
    name: "Autonomous Pipeline Panel",
    zone: "canvas",
    supportedModes: ["pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      planning: "visible",
      generation: "visible",
      validation: "visible",
    }),
    priority: 15,
    category: "generation",
    lazy: true,
  },
  {
    id: "pipeline-status-viewer",
    name: "Pipeline Status Viewer",
    zone: "canvas",
    supportedModes: ["pipeline", "build"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      validation: "visible",
    }),
    priority: 18,
    category: "monitoring",
    memo: true,
  },
  {
    id: "progress-timeline",
    name: "Progress Timeline",
    zone: "canvas",
    supportedModes: ["pipeline", "build"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      planning: "visible",
      generation: "visible",
      validation: "visible",
    }),
    priority: 25,
    category: "monitoring",
    memo: true,
  },
  {
    id: "pipeline-view",
    name: "Pipeline View",
    zone: "canvas",
    supportedModes: ["pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      validation: "visible",
    }),
    priority: 12,
    category: "monitoring",
    lazy: true,
  },
];

// ─── Properties Zone Panels ─────────────────────────────────────────────────

const propertiesPanels: PanelRegistration[] = [
  {
    id: "cost-monitor",
    name: "Cost Monitor",
    zone: "properties",
    supportedModes: ["build", "pipeline", "analytics"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible", {
      playtest: "on-demand",
    }),
    priority: 20,
    category: "monitoring",
    memo: true,
  },
  {
    id: "token-usage",
    name: "Token Usage",
    zone: "properties",
    supportedModes: ["build", "pipeline", "analytics"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible", {
      playtest: "on-demand",
      simulation: "on-demand",
    }),
    priority: 22,
    category: "monitoring",
    memo: true,
  },
  {
    id: "metrics-panel",
    name: "Metrics Panel",
    zone: "properties",
    supportedModes: ["analytics", "pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      validation: "visible",
      economy: "visible",
    }),
    priority: 25,
    category: "analytics",
    memo: true,
  },
  {
    id: "project-summary",
    name: "Project Summary",
    zone: "properties",
    supportedModes: ["build", "code", "pipeline", "analytics"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible"),
    priority: 10,
    category: "navigation",
    memo: true,
  },
  {
    id: "review-summary-panel",
    name: "Review Summary Panel",
    zone: "properties",
    supportedModes: ["build", "pipeline"],
    supportedPhases: ["validation", "export"],
    visibility: visibility("hidden", {
      validation: "visible",
      export: "visible",
    }),
    priority: 15,
    category: "validation",
    lazy: true,
  },
  {
    id: "validation-results",
    name: "Validation Results",
    zone: "properties",
    supportedModes: ["build", "pipeline", "code"],
    supportedPhases: ["validation", "generation"],
    visibility: visibility("hidden", {
      validation: "visible",
      generation: "on-demand",
    }),
    priority: 12,
    category: "validation",
    lazy: true,
  },
  {
    id: "studio-bridge-panel",
    name: "Studio Bridge Panel",
    zone: "properties",
    supportedModes: ["build", "code"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      export: "visible",
    }),
    priority: 30,
    category: "export",
    lazy: true,
  },
  {
    id: "protocol-monitor",
    name: "Protocol Monitor",
    zone: "properties",
    supportedModes: ["pipeline", "build"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand"),
    priority: 40,
    category: "monitoring",
    lazy: true,
  },
  {
    id: "audit-log-viewer",
    name: "Audit Log Viewer",
    zone: "properties",
    supportedModes: ["pipeline", "analytics"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      validation: "visible",
    }),
    priority: 45,
    category: "monitoring",
    lazy: true,
  },
  {
    id: "generation-history-panel",
    name: "Generation History Panel",
    zone: "properties",
    supportedModes: ["build", "pipeline", "code"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      export: "visible",
    }),
    priority: 28,
    category: "generation",
    lazy: true,
  },
  {
    id: "studio-connection-status",
    name: "Studio Connection Status",
    zone: "properties",
    supportedModes: ["build", "code"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      export: "visible",
    }),
    priority: 35,
    category: "export",
    memo: true,
  },
  {
    id: "publish-workflow",
    name: "Publish Workflow",
    zone: "properties",
    supportedModes: ["build"],
    supportedPhases: ["export"],
    visibility: visibility("hidden", {
      export: "visible",
    }),
    priority: 8,
    category: "export",
    lazy: true,
  },
];

// ─── AI Command Zone Panels ─────────────────────────────────────────────────

const aiCommandPanels: PanelRegistration[] = [
  {
    id: "live-console",
    name: "Live Console",
    zone: "ai-command",
    supportedModes: [
      "build",
      "code",
      "pipeline",
      "simulation",
      "playtest",
      "analytics",
    ],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible"),
    priority: 5,
    category: "monitoring",
    memo: true,
  },
  {
    id: "generate-button",
    name: "Generate Button",
    zone: "ai-command",
    supportedModes: ["build", "code", "pipeline"],
    supportedPhases: ["generate", "planning", "generation"],
    visibility: visibility("hidden", {
      generate: "visible",
      planning: "visible",
      generation: "visible",
    }),
    priority: 1,
    category: "generation",
  },
  {
    id: "generation-status-panel",
    name: "Generation Status Panel",
    zone: "ai-command",
    supportedModes: ["build", "pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      validation: "visible",
    }),
    priority: 8,
    category: "generation",
    memo: true,
  },
  {
    id: "activity-feed",
    name: "Activity Feed",
    zone: "ai-command",
    supportedModes: ["build", "pipeline", "analytics"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible"),
    priority: 10,
    category: "monitoring",
    memo: true,
  },
  {
    id: "pipeline-status-bar",
    name: "Pipeline Status Bar",
    zone: "ai-command",
    supportedModes: [
      "build",
      "code",
      "pipeline",
      "simulation",
      "playtest",
      "analytics",
    ],
    supportedPhases: ALL_PHASES,
    visibility: visibility("visible"),
    priority: 3,
    category: "monitoring",
    memo: true,
  },
  {
    id: "sync-button",
    name: "Sync Button",
    zone: "ai-command",
    supportedModes: ["build", "code"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      export: "visible",
    }),
    priority: 15,
    category: "export",
  },
  {
    id: "agent-card",
    name: "Agent Card",
    zone: "ai-command",
    supportedModes: ["build", "pipeline"],
    supportedPhases: ALL_PHASES,
    visibility: visibility("on-demand", {
      generation: "visible",
      planning: "visible",
    }),
    priority: 12,
    category: "generation",
    memo: true,
  },
];

// ─── Register All Panels ────────────────────────────────────────────────────

/** Registers all 29 workspace panels. Called on module load. */
function registerAllPanels(): void {
  const allPanels = [...canvasPanels, ...propertiesPanels, ...aiCommandPanels];
  for (const panel of allPanels) {
    registerPanel(panel);
  }
}

registerAllPanels();
