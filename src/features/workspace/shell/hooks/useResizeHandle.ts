/**
 * workspace/shell/hooks/useResizeHandle.ts
 *
 * Reusable hook for drag resize on zone boundaries.
 * Supports both vertical (height) and horizontal (width) resizing.
 */
import { useCallback, useRef } from "react";

interface ResizeConfig {
  direction: "horizontal" | "vertical";
  min: number;
  max: number;
  onResize: (size: number) => void;
  onResizeEnd?: (size: number) => void;
}

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export function useResizeHandle({
  direction,
  min,
  max,
  onResize,
  onResizeEnd,
}: ResizeConfig): ResizeHandleProps {
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const element = (e.target as HTMLElement).parentElement;
      if (!element) return;

      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      const rect = element.getBoundingClientRect();
      startSize.current = direction === "horizontal" ? rect.width : rect.height;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const currentPos =
          direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta =
          direction === "vertical"
            ? startPos.current - currentPos // Invert for bottom panel (drag up = bigger)
            : currentPos - startPos.current;
        const newSize = Math.min(max, Math.max(min, startSize.current + delta));
        onResize(newSize);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (onResizeEnd) {
          const currentRect = element.getBoundingClientRect();
          const finalSize =
            direction === "horizontal" ? currentRect.width : currentRect.height;
          onResizeEnd(finalSize);
        }
      };

      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, min, max, onResize, onResizeEnd],
  );

  return { onMouseDown };
}
