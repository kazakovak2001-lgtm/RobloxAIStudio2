/**
 * UILayoutBuilder.ts — Builds UI layout structures.
 */

import type { UIObject } from "./types";
import { createUIId } from "./types";

export class UILayoutBuilder {
  buildListLayout(
    parentId: string,
    direction: "Vertical" | "Horizontal" = "Vertical",
    padding = 5,
  ): UIObject {
    return {
      id: createUIId(),
      type: "UIListLayout",
      name: "Layout",
      parent: parentId,
      properties: {
        FillDirection: direction,
        Padding: padding,
        SortOrder: "LayoutOrder",
      },
      children: [],
    };
  }

  buildPadding(parentId: string, padding = 10): UIObject {
    return {
      id: createUIId(),
      type: "UIPadding",
      name: "Padding",
      parent: parentId,
      properties: {
        PaddingTop: padding,
        PaddingBottom: padding,
        PaddingLeft: padding,
        PaddingRight: padding,
      },
      children: [],
    };
  }

  buildAspectRatio(parentId: string, ratio = 1.0): UIObject {
    return {
      id: createUIId(),
      type: "UIAspectRatioConstraint",
      name: "AspectRatio",
      parent: parentId,
      properties: { AspectRatio: ratio },
      children: [],
    };
  }
}
