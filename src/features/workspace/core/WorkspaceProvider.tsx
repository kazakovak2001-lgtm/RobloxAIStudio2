/**
 * workspace/core/WorkspaceProvider.tsx
 *
 * Workspace state provider following the Context + Provider + useHook pattern.
 * Uses useReducer for complex state management (multiple interdependent fields).
 *
 * Pattern reference: src/shared/hooks/useSidebar.tsx
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  AICommandState,
  CanvasMode,
  PropertiesContext,
  WorkflowPhase,
  WorkspaceState,
  ZoneState,
} from "./types";
import { DEFAULT_WORKSPACE_STATE, PHASE_TO_DEFAULT_MODE } from "./constants";

// ─── Actions ────────────────────────────────────────────────────────────────

type WorkspaceAction =
  | { type: "SET_PHASE"; phase: WorkflowPhase }
  | { type: "SET_CANVAS_MODE"; mode: CanvasMode }
  | {
      type: "SET_ZONE_STATE";
      zone: "explorer" | "properties" | "aiCommand";
      state: Partial<ZoneState>;
    }
  | { type: "SET_PROPERTIES_CONTEXT"; context: PropertiesContext }
  | { type: "REVEAL_PANEL"; panelId: string }
  | { type: "HIDE_PANEL"; panelId: string }
  | { type: "SET_AI_COMMAND_STATE"; state: Partial<AICommandState> }
  | { type: "SET_PROJECT_ID"; projectId: string | null }
  | { type: "RESET_WORKSPACE" };

// ─── Reducer ────────────────────────────────────────────────────────────────

function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "SET_PHASE": {
      const completedPhases = state.completedPhases.includes(state.currentPhase)
        ? state.completedPhases
        : [...state.completedPhases, state.currentPhase];

      return {
        ...state,
        currentPhase: action.phase,
        completedPhases,
        activeCanvasMode: PHASE_TO_DEFAULT_MODE[action.phase],
      };
    }

    case "SET_CANVAS_MODE": {
      // Preserve current mode state before switching
      const now = Date.now();
      return {
        ...state,
        activeCanvasMode: action.mode,
        modeStates: {
          ...state.modeStates,
          [action.mode]: {
            ...state.modeStates[action.mode],
            lastActivated: now,
          },
        },
      };
    }

    case "SET_ZONE_STATE": {
      return {
        ...state,
        zones: {
          ...state.zones,
          [action.zone]: {
            ...state.zones[action.zone],
            ...action.state,
          },
        },
      };
    }

    case "SET_PROPERTIES_CONTEXT": {
      return {
        ...state,
        propertiesContext: action.context,
      };
    }

    case "REVEAL_PANEL": {
      const revealed = state.manuallyRevealedPanels.includes(action.panelId)
        ? state.manuallyRevealedPanels
        : [...state.manuallyRevealedPanels, action.panelId];
      const hidden = state.manuallyHiddenPanels.filter(
        (id) => id !== action.panelId,
      );
      return {
        ...state,
        manuallyRevealedPanels: revealed,
        manuallyHiddenPanels: hidden,
      };
    }

    case "HIDE_PANEL": {
      const hidden = state.manuallyHiddenPanels.includes(action.panelId)
        ? state.manuallyHiddenPanels
        : [...state.manuallyHiddenPanels, action.panelId];
      const revealed = state.manuallyRevealedPanels.filter(
        (id) => id !== action.panelId,
      );
      return {
        ...state,
        manuallyHiddenPanels: hidden,
        manuallyRevealedPanels: revealed,
      };
    }

    case "SET_AI_COMMAND_STATE": {
      return {
        ...state,
        aiCommandState: {
          ...state.aiCommandState,
          ...action.state,
        },
      };
    }

    case "SET_PROJECT_ID": {
      return {
        ...state,
        projectId: action.projectId,
      };
    }

    case "RESET_WORKSPACE": {
      return { ...DEFAULT_WORKSPACE_STATE };
    }

    default:
      return state;
  }
}

// ─── Context Value ──────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  /** Current workspace state */
  state: WorkspaceState;
  /** Advance to a new workflow phase */
  setPhase: (phase: WorkflowPhase) => void;
  /** Switch the active canvas display mode */
  setCanvasMode: (mode: CanvasMode) => void;
  /** Update a zone's collapse/size state */
  setZoneState: (
    zone: "explorer" | "properties" | "aiCommand",
    zoneState: Partial<ZoneState>,
  ) => void;
  /** Set what drives the properties panel content */
  setPropertiesContext: (context: PropertiesContext) => void;
  /** Manually reveal a hidden/on-demand panel */
  revealPanel: (panelId: string) => void;
  /** Manually hide a visible panel */
  hidePanel: (panelId: string) => void;
  /** Update AI Command Center state */
  setAICommandState: (aiState: Partial<AICommandState>) => void;
  /** Set the active project ID */
  setProjectId: (projectId: string | null) => void;
  /** Reset workspace to default state */
  resetWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    DEFAULT_WORKSPACE_STATE,
  );

  const setPhase = useCallback((phase: WorkflowPhase) => {
    dispatch({ type: "SET_PHASE", phase });
  }, []);

  const setCanvasMode = useCallback((mode: CanvasMode) => {
    dispatch({ type: "SET_CANVAS_MODE", mode });
  }, []);

  const setZoneState = useCallback(
    (
      zone: "explorer" | "properties" | "aiCommand",
      zoneState: Partial<ZoneState>,
    ) => {
      dispatch({ type: "SET_ZONE_STATE", zone, state: zoneState });
    },
    [],
  );

  const setPropertiesContext = useCallback((context: PropertiesContext) => {
    dispatch({ type: "SET_PROPERTIES_CONTEXT", context });
  }, []);

  const revealPanel = useCallback((panelId: string) => {
    dispatch({ type: "REVEAL_PANEL", panelId });
  }, []);

  const hidePanel = useCallback((panelId: string) => {
    dispatch({ type: "HIDE_PANEL", panelId });
  }, []);

  const setAICommandState = useCallback((aiState: Partial<AICommandState>) => {
    dispatch({ type: "SET_AI_COMMAND_STATE", state: aiState });
  }, []);

  const setProjectId = useCallback((projectId: string | null) => {
    dispatch({ type: "SET_PROJECT_ID", projectId });
  }, []);

  const resetWorkspace = useCallback(() => {
    dispatch({ type: "RESET_WORKSPACE" });
  }, []);

  const value: WorkspaceContextValue = useMemo(
    () => ({
      state,
      setPhase,
      setCanvasMode,
      setZoneState,
      setPropertiesContext,
      revealPanel,
      hidePanel,
      setAICommandState,
      setProjectId,
      resetWorkspace,
    }),
    [
      state,
      setPhase,
      setCanvasMode,
      setZoneState,
      setPropertiesContext,
      revealPanel,
      hidePanel,
      setAICommandState,
      setProjectId,
      resetWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access workspace state and actions.
 * Must be used within a WorkspaceProvider.
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
