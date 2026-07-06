/**
 * UI Generation types (v2.6)
 */

import { randomUUID } from "crypto";

export type UIObjectType =
  | "ScreenGui"
  | "Frame"
  | "TextButton"
  | "TextLabel"
  | "TextBox"
  | "ImageLabel"
  | "ScrollingFrame"
  | "UIListLayout"
  | "UIPadding"
  | "UIAspectRatioConstraint";

export interface UIObject {
  id: string;
  type: UIObjectType;
  name: string;
  parent: string | null;
  properties: Record<string, unknown>;
  children: string[];
}

export interface UIScreen {
  id: string;
  name: string;
  screenType: "hud" | "menu" | "dialog" | "overlay";
  rootObject: UIObject;
  objects: UIObject[];
}

export interface UIHierarchy {
  screens: UIScreen[];
  totalObjects: number;
  depth: number;
}

export interface UIValidationReport {
  valid: boolean;
  objectsChecked: number;
  errors: string[];
  warnings: string[];
}

export interface UIGenerationMetrics {
  screensGenerated: number;
  objectsGenerated: number;
  validationDurationMs: number;
  generationDurationMs: number;
  totalDurationMs: number;
}

export function createUIId(): string {
  return `ui-${randomUUID().slice(0, 8)}`;
}
