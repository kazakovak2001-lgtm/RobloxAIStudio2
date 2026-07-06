/**
 * UIHierarchyBuilder.ts — Builds complete UI screen hierarchies.
 */

import type { UIObject, UIScreen } from "./types";
import { createUIId } from "./types";
import { UILayoutBuilder } from "./UILayoutBuilder";
import { UIStyleBuilder } from "./UIStyleBuilder";

export class UIHierarchyBuilder {
  private layout = new UILayoutBuilder();
  private style = new UIStyleBuilder();

  buildMenuScreen(name: string, title: string, buttons: string[]): UIScreen {
    const rootId = createUIId();
    const frameId = createUIId();
    const objects: UIObject[] = [];

    const root: UIObject = {
      id: rootId,
      type: "ScreenGui",
      name,
      parent: null,
      properties: { ResetOnSpawn: false, IgnoreGuiInset: true },
      children: [frameId],
    };
    const frame: UIObject = {
      id: frameId,
      type: "Frame",
      name: "Container",
      parent: rootId,
      properties: this.style.centerFrame(),
      children: [],
    };
    objects.push(root, frame);

    // Title
    const titleId = createUIId();
    objects.push({
      id: titleId,
      type: "TextLabel",
      name: "Title",
      parent: frameId,
      properties: { Text: title, ...this.style.titleLabel() },
      children: [],
    });
    frame.children.push(titleId);

    // Layout + padding
    const layoutObj = this.layout.buildListLayout(frameId);
    const paddingObj = this.layout.buildPadding(frameId, 15);
    objects.push(layoutObj, paddingObj);
    frame.children.push(layoutObj.id, paddingObj.id);

    // Buttons
    for (const btn of buttons) {
      const btnId = createUIId();
      objects.push({
        id: btnId,
        type: "TextButton",
        name: `${btn}Button`,
        parent: frameId,
        properties: { Text: btn, ...this.style.button() },
        children: [],
      });
      frame.children.push(btnId);
    }

    return { id: rootId, name, screenType: "menu", rootObject: root, objects };
  }

  buildHUDScreen(
    name: string,
    elements: Array<{ name: string; type: "label" | "bar" }>,
  ): UIScreen {
    const rootId = createUIId();
    const objects: UIObject[] = [];

    const root: UIObject = {
      id: rootId,
      type: "ScreenGui",
      name,
      parent: null,
      properties: { ResetOnSpawn: false, IgnoreGuiInset: true },
      children: [],
    };
    objects.push(root);

    for (const el of elements) {
      const elId = createUIId();
      if (el.type === "label") {
        objects.push({
          id: elId,
          type: "TextLabel",
          name: el.name,
          parent: rootId,
          properties: { Text: el.name, ...this.style.hudLabel() },
          children: [],
        });
      } else {
        objects.push({
          id: elId,
          type: "Frame",
          name: el.name,
          parent: rootId,
          properties: this.style.progressBar(),
          children: [],
        });
      }
      root.children.push(elId);
    }

    return { id: rootId, name, screenType: "hud", rootObject: root, objects };
  }
}
