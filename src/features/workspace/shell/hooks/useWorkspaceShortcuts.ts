/**
 * workspace/shell/hooks/useWorkspaceShortcuts.ts
 *
 * Global keyboard shortcuts for workspace navigation.
 * Only active when Mission Control mode is rendered.
 * Respects input focus — shortcuts are ignored when typing in inputs/textareas.
 */
import { useEffect } from "react";
import type { CanvasMode } from "../../core";

interface ShortcutConfig {
  onModeChange: (mode: CanvasMode) => void;
  onToggleAICommand: () => void;
  onToggleExplorer: () => void;
  onToggleProperties: () => void;
}

const MODE_SHORTCUTS: Record<string, CanvasMode> = {
  "1": "build",
  "2": "pipeline",
  "3": "simulation",
  "4": "playtest",
  "5": "code",
  "6": "analytics",
};

export function useWorkspaceShortcuts({
  onModeChange,
  onToggleAICommand,
  onToggleExplorer,
  onToggleProperties,
}: ShortcutConfig): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Require Ctrl (or Cmd on Mac)
      if (!e.ctrlKey && !e.metaKey) return;

      // Ctrl+1-6: Canvas mode switching
      if (MODE_SHORTCUTS[e.key]) {
        e.preventDefault();
        onModeChange(MODE_SHORTCUTS[e.key]);
        return;
      }

      // Ctrl+J: Toggle AI Command Center
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        onToggleAICommand();
        return;
      }

      // Ctrl+B: Toggle Explorer
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        onToggleExplorer();
        return;
      }

      // Ctrl+Shift+P: Toggle Properties
      if ((e.key === "p" || e.key === "P") && e.shiftKey) {
        e.preventDefault();
        onToggleProperties();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onModeChange, onToggleAICommand, onToggleExplorer, onToggleProperties]);
}
