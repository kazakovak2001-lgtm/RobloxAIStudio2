# Workspace UX Redesign V2 — AI Mission Control Specification

## Overview

This directory contains the complete UX architecture specification for transforming the RobloxAiStudio-DevKit workspace from a flat 3-column panel grid into a professional "AI Mission Control" interface. This is a **documentation-only deliverable** — no executable application code is produced.

The specification defines:

- A **5-zone spatial layout** (Command Bar, Project Explorer, Center Canvas, Properties Panel, AI Command Center)
- **Workflow-first navigation** through 8 pipeline phases (Generate → Planning → Generation → Validation → Simulation → Economy → Playtest → Export)
- **Progressive disclosure** managing 29+ panel components with max 8 visible at any phase
- **Responsive strategy** for screens from 768px to 1920px+

## Directory Structure

```
docs/workspace-ux-redesign-v2/
├── README.md                 # This file — specification overview and navigation guide
├── types/                    # TypeScript type definitions (formal contracts)
│   ├── index.ts              # Barrel file re-exporting all types
│   ├── workspace-state.ts    # WorkspaceState, WorkflowPhase, CanvasMode, ZoneState
│   ├── panel-registry.ts     # PanelId, PanelRegistration, ModuleRegistry
│   ├── user-preferences.ts   # WorkspacePreferences, WorkspaceLayout
│   ├── breakpoint-config.ts  # BreakpointConfig for all 4 responsive breakpoints
│   └── panels.ts             # PanelId union type, PanelMetadata for all 29 components
├── configs/                  # TypeScript configuration schemas
│   ├── workflow-phases.ts    # 8 phase definitions with transition rules
│   ├── visibility-matrix.ts  # 29-panel × 8-phase visibility matrix
│   └── canvas-modes.ts       # 6 canvas mode definitions with component assignments
├── zones/                    # Zone-by-zone layout specifications
│   ├── command-bar.md        # Zone 1: Command Bar (fixed top strip)
│   ├── project-explorer.md   # Zone 2: Project Explorer (collapsible left panel)
│   ├── center-canvas.md      # Zone 3: Center Canvas (6-mode primary area)
│   ├── properties-panel.md   # Zone 4: Properties Panel (context-aware right panel)
│   ├── ai-command-center.md  # Zone 5: AI Command Center (resizable bottom zone)
│   ├── layout-grid.md        # CSS Grid specification for the 5-zone shell
│   ├── agentboard-expanded.md # AgentBoard expanded timeline specification
│   └── properties-context-rules.md # Context-aware properties behavior
├── workflows/                # Navigation and disclosure documentation
│   ├── phase-panel-behavior.md   # Per-phase panel behavior details
│   ├── manual-overrides.md       # User override rules and panel discovery
│   └── sidebar-coexistence.md    # Sidebar vs workspace navigation strategy
├── responsive/               # Responsive layout documentation
│   ├── breakpoints.md        # 4 breakpoint definitions (Desktop/Laptop/Tablet/Large)
│   ├── transitions.md        # Animation and transition timing specs
│   └── touch-interactions.md # Tablet touch patterns
├── interactions/             # Interaction model documentation
│   ├── interaction-model.md  # AI streaming states, keyboard nav, drag-and-drop
│   └── notifications.md      # Notification patterns for async events
├── visual/                   # Visual hierarchy and design language
│   └── hierarchy.md          # Attention tiers, color system, typography, depth
├── migration/                # Migration strategy documentation
│   ├── migration-table.md    # 29-component migration mapping
│   └── scalability.md        # Module registry, overflow, customization, plugins
├── risks/                    # Risk analysis
│   └── risk-analysis.md      # Technical, UX, and project risks with mitigations
└── audit/                    # Current workspace audit documentation
    ├── component-catalog.md       # 29 panel components with data sources
    ├── routes-and-navigation.md   # 12 routes and 7 sidebar entries
    └── fragmentation-analysis.md  # Visual fragmentation issues
```

## How to Navigate

### By Role

| Role                        | Start Here                                                                 |
| --------------------------- | -------------------------------------------------------------------------- |
| **Implementation engineer** | `types/index.ts` → `configs/` → `zones/`                                   |
| **UX designer**             | `zones/` → `visual/hierarchy.md` → `responsive/`                           |
| **Product manager**         | `README.md` → `workflows/` → `risks/risk-analysis.md`                      |
| **QA engineer**             | `audit/` → `migration/migration-table.md` → `configs/visibility-matrix.ts` |

### By Workflow

1. **Understand current state** → `audit/` directory
2. **Learn the new layout** → `zones/` directory (start with `layout-grid.md`)
3. **Understand navigation** → `workflows/` directory
4. **Check responsive behavior** → `responsive/` directory
5. **Plan implementation** → `migration/` → `configs/` → `types/`
6. **Assess risks** → `risks/risk-analysis.md`

### By Requirement

Each specification file maps to specific requirements from the requirements document:

| Requirement                   | Primary Files                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| Req 1: Workspace Audit        | `audit/*`                                                           |
| Req 2: 5-Zone Layout          | `zones/*`, `types/workspace-state.ts`                               |
| Req 3: Workflow Navigation    | `workflows/*`, `configs/workflow-phases.ts`                         |
| Req 4: Progressive Disclosure | `configs/visibility-matrix.ts`, `workflows/phase-panel-behavior.md` |
| Req 5: Context-Aware Panels   | `zones/properties-context-rules.md`                                 |
| Req 6: AgentBoard             | `zones/agentboard-expanded.md`                                      |
| Req 7: Multi-Mode Canvas      | `zones/center-canvas.md`, `configs/canvas-modes.ts`                 |
| Req 8: AI Command Center      | `zones/ai-command-center.md`                                        |
| Req 9: Responsive Layout      | `responsive/*`, `types/breakpoint-config.ts`                        |
| Req 10: Scalability           | `migration/scalability.md`, `types/panel-registry.ts`               |
| Req 11: Migration Strategy    | `migration/migration-table.md`                                      |
| Req 12: Interaction Model     | `interactions/*`                                                    |
| Req 13: Visual Hierarchy      | `visual/hierarchy.md`                                               |
| Req 14: Performance & A11y    | `performance/budgets-and-a11y.md`                                   |
| Req 15: Risks                 | `risks/risk-analysis.md`                                            |

## Key Design Decisions

1. **Zone-based layout over grid** — Semantically meaningful zones replace the flat `xl:grid-cols-[1fr_1.15fr_0.95fr]`
2. **Workflow phases as primary navigation** — The generation pipeline drives what the user sees
3. **AgentBoard as visual centerpiece** — Elevated from a card to full Center Canvas during pipeline execution
4. **Persistent AI Command Center** — Always-available AI interaction at the bottom
5. **Progressive disclosure via visibility matrix** — Max 8 panels visible per phase

## Type Definitions

All TypeScript interfaces in `types/` serve as formal contracts for future implementation. Import them via the barrel file:

```typescript
import type {
  WorkspaceState,
  WorkflowPhase,
  CanvasMode,
  PanelId,
  PanelRegistration,
  BreakpointConfig,
} from "./types";
```

## Constraints

- **No executable code** — This is a documentation-only specification
- **All 29 existing panels preserved** — No components are removed
- **All 12 routes preserved** — Routing structure unchanged
- **All 7 navigation entries preserved** — Sidebar items remain
- **Design system compliance** — Builds on existing Tailwind CSS configuration
