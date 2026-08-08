/**
 * UIInstanceTreeBuilder — converts `UIGeneratorAgent`'s abstract `uiDesign`
 * into the materializable wire tree.
 *
 * STUDIO-2F-A. The division of labour is deliberate and is the reason this
 * builder exists rather than asking the model for Roblox properties directly:
 * the language model supplies *intent* — screen names, element types, captions
 * and theme colours — while geometry, `ZIndex`, `LayoutOrder` and every
 * property value are derived here, in code. A model that emits coordinates
 * produces a different tree on every run for the same design, which would
 * change the content hash and re-deliver forever.
 *
 * Output is a pure function of its input. No clock, no randomness, no ids.
 */

import {
  UI_TREE_SCHEMA_VERSION,
  assertMaterializableUITree,
  type AllowedUIClass,
  type MaterializableUITree,
  type UIInstanceNode,
  type UIPropertyValue,
  type UITreeScreen,
} from "./UIInstanceTreeContract";

/** Abstract screen element as produced by UIGeneratorAgent. */
interface AbstractElement {
  id?: unknown;
  type?: unknown;
  label?: unknown;
}

interface AbstractScreen {
  name?: unknown;
  type?: unknown;
  elements?: unknown;
}

export interface UIDesignTheme {
  primaryColor?: unknown;
  accentColor?: unknown;
}

const DEFAULT_PRIMARY: Rgb = { r: 26, g: 26, b: 46 };
const DEFAULT_ACCENT: Rgb = { r: 233, g: 69, b: 96 };
const TEXT_ON_DARK: Rgb = { r: 255, g: 255, b: 255 };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Abstract element type → the class that represents it. Unknown element types
 * degrade to a TextLabel rather than failing: the model chooses these strings
 * freely, and a caption rendered as a label is a truthful representation of an
 * element this sprint cannot build, whereas failing the whole export would
 * make GUI delivery hostage to model vocabulary drift.
 */
const ELEMENT_CLASS_BY_TYPE: Readonly<Record<string, AllowedUIClass>> = {
  textlabel: "TextLabel",
  label: "TextLabel",
  text: "TextLabel",
  textbutton: "TextButton",
  button: "TextButton",
  textbox: "TextBox",
  input: "TextBox",
  imagelabel: "ImageLabel",
  image: "ImageLabel",
  icon: "ImageLabel",
  frame: "Frame",
  panel: "Frame",
  container: "Frame",
  progressbar: "Frame",
  bar: "Frame",
  healthbar: "Frame",
  scrollingframe: "ScrollingFrame",
  list: "ScrollingFrame",
};

export class UIInstanceTreeBuilder {
  /**
   * Build the wire tree from an agent `uiDesign` payload. Throws when the
   * result would not satisfy the contract, so a malformed design fails at the
   * recorder boundary rather than in Studio.
   */
  build(uiDesign: unknown): MaterializableUITree {
    if (!isRecord(uiDesign)) {
      throw new Error("uiDesign must be an object");
    }

    const rawScreens = Array.isArray(uiDesign.screens) ? uiDesign.screens : [];
    if (rawScreens.length === 0) {
      throw new Error("uiDesign must contain at least one screen");
    }

    const theme = isRecord(uiDesign.components) ? uiDesign.components : {};
    const primary = parseHexColor(theme.primaryColor) ?? DEFAULT_PRIMARY;
    const accent = parseHexColor(theme.accentColor) ?? DEFAULT_ACCENT;

    const screens: UITreeScreen[] = [];
    const usedNames = new Set<string>();

    for (const [index, rawScreen] of rawScreens.entries()) {
      const screen = this.buildScreen(
        isRecord(rawScreen) ? rawScreen : {},
        index,
        usedNames,
        primary,
        accent,
      );
      screens.push(screen);
    }

    const tree: MaterializableUITree = {
      schemaVersion: UI_TREE_SCHEMA_VERSION,
      screens,
    };

    assertMaterializableUITree(tree);
    return tree;
  }

  private buildScreen(
    screen: AbstractScreen,
    index: number,
    usedNames: Set<string>,
    primary: Rgb,
    accent: Rgb,
  ): UITreeScreen {
    const screenName = uniqueName(
      sanitizeName(screen.name, `Screen${index + 1}`),
      usedNames,
    );

    const elements = Array.isArray(screen.elements) ? screen.elements : [];
    const isHud = String(screen.type ?? "").toLowerCase() === "hud";

    const container: UIInstanceNode = {
      className: "Frame",
      name: "Container",
      properties: isHud
        ? {
            Size: udim2(0, 260, 0, 44 * Math.max(1, elements.length) + 16),
            Position: udim2(0, 16, 0, 16),
            AnchorPoint: vector2(0, 0),
            BackgroundColor3: color3(primary),
            BackgroundTransparency: number(0.25),
            BorderSizePixel: int(0),
          }
        : {
            Size: udim2(0.4, 0, 0.6, 0),
            Position: udim2(0.5, 0, 0.5, 0),
            AnchorPoint: vector2(0.5, 0.5),
            BackgroundColor3: color3(primary),
            BackgroundTransparency: number(0.1),
            BorderSizePixel: int(0),
          },
      children: [
        {
          className: "UIListLayout",
          name: "Layout",
          properties: {
            FillDirection: enumValue("FillDirection", "Vertical"),
            SortOrder: enumValue("SortOrder", "LayoutOrder"),
            HorizontalAlignment: enumValue("HorizontalAlignment", "Center"),
            Padding: udim(0, 6),
          },
        },
        {
          className: "UIPadding",
          name: "Padding",
          properties: {
            PaddingTop: udim(0, 8),
            PaddingBottom: udim(0, 8),
            PaddingLeft: udim(0, 8),
            PaddingRight: udim(0, 8),
          },
        },
      ],
    };

    const siblingNames = new Set<string>(["Layout", "Padding"]);
    const children = container.children as UIInstanceNode[];

    for (const [elementIndex, rawElement] of elements.entries()) {
      children.push(
        this.buildElement(
          isRecord(rawElement) ? rawElement : {},
          elementIndex,
          siblingNames,
          accent,
        ),
      );
    }

    return {
      screenName,
      root: {
        className: "ScreenGui",
        name: screenName,
        properties: {
          ResetOnSpawn: bool(false),
          IgnoreGuiInset: bool(true),
          Enabled: bool(true),
        },
        children: [container],
      },
    };
  }

  private buildElement(
    element: AbstractElement,
    index: number,
    siblingNames: Set<string>,
    accent: Rgb,
  ): UIInstanceNode {
    const declaredType = String(element.type ?? "").toLowerCase();
    const className = ELEMENT_CLASS_BY_TYPE[declaredType] ?? "TextLabel";
    const caption =
      typeof element.label === "string" && element.label.trim().length > 0
        ? element.label
        : sanitizeName(element.id, `Element${index + 1}`);

    const name = uniqueName(
      sanitizeName(element.id ?? element.label, `Element${index + 1}`),
      siblingNames,
    );

    // LayoutOrder is derived from position, never from the model, so the same
    // design always yields the same ordering.
    const layoutOrder = int(index + 1);

    if (className === "TextButton") {
      return {
        className,
        name,
        properties: {
          Text: string(caption),
          Font: enumValue("Font", "GothamSemibold"),
          TextSize: int(18),
          TextColor3: color3(TEXT_ON_DARK),
          BackgroundColor3: color3(accent),
          Size: udim2(0.9, 0, 0, 36),
          BorderSizePixel: int(0),
          AutoButtonColor: bool(true),
          LayoutOrder: layoutOrder,
        },
      };
    }

    if (className === "TextBox") {
      return {
        className,
        name,
        properties: {
          Text: string(""),
          PlaceholderText: string(caption),
          Font: enumValue("Font", "Gotham"),
          TextSize: int(16),
          TextColor3: color3(TEXT_ON_DARK),
          BackgroundColor3: color3({ r: 40, g: 40, b: 56 }),
          Size: udim2(0.9, 0, 0, 32),
          BorderSizePixel: int(0),
          ClearTextOnFocus: bool(true),
          LayoutOrder: layoutOrder,
        },
      };
    }

    if (className === "Frame") {
      // Bars and panels: a filled track, since this sprint does not animate.
      return {
        className,
        name,
        properties: {
          Size: udim2(0.9, 0, 0, 20),
          BackgroundColor3: color3(accent),
          BorderSizePixel: int(0),
          LayoutOrder: layoutOrder,
        },
      };
    }

    if (className === "ImageLabel") {
      return {
        className,
        name,
        properties: {
          // No asset id is invented here — STUDIO-2F-B owns real assets.
          Image: string(""),
          BackgroundTransparency: number(1),
          Size: udim2(0, 32, 0, 32),
          ScaleType: enumValue("ScaleType", "Fit"),
          LayoutOrder: layoutOrder,
        },
      };
    }

    if (className === "ScrollingFrame") {
      return {
        className,
        name,
        properties: {
          Size: udim2(0.9, 0, 0, 120),
          CanvasSize: udim2(0, 0, 0, 0),
          ScrollBarThickness: int(6),
          BackgroundTransparency: number(0.5),
          BackgroundColor3: color3({ r: 20, g: 20, b: 30 }),
          BorderSizePixel: int(0),
          LayoutOrder: layoutOrder,
        },
      };
    }

    return {
      className: "TextLabel",
      name,
      properties: {
        Text: string(caption),
        Font: enumValue("Font", "Gotham"),
        TextSize: int(16),
        TextColor3: color3(TEXT_ON_DARK),
        BackgroundTransparency: number(1),
        Size: udim2(0.9, 0, 0, 24),
        TextXAlignment: enumValue("TextXAlignment", "Left"),
        LayoutOrder: layoutOrder,
      },
    };
  }
}

function bool(value: boolean): UIPropertyValue {
  return { kind: "bool", value };
}
function int(value: number): UIPropertyValue {
  return { kind: "int", value };
}
function number(value: number): UIPropertyValue {
  return { kind: "number", value };
}
function string(value: string): UIPropertyValue {
  return { kind: "string", value };
}
function udim2(
  xScale: number,
  xOffset: number,
  yScale: number,
  yOffset: number,
): UIPropertyValue {
  return { kind: "udim2", xScale, xOffset, yScale, yOffset };
}
function udim(scale: number, offset: number): UIPropertyValue {
  return { kind: "udim", scale, offset };
}
function vector2(x: number, y: number): UIPropertyValue {
  return { kind: "vector2", x, y };
}
function color3(rgb: Rgb): UIPropertyValue {
  return { kind: "color3", r: rgb.r, g: rgb.g, b: rgb.b };
}
function enumValue(enumName: string, item: string): UIPropertyValue {
  return { kind: "enum", enumName, item };
}

/**
 * Reduce arbitrary model text to a valid instance name. Returns the fallback
 * when nothing usable survives, so naming never fails the export.
 */
export function sanitizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  if (cleaned.length === 0) return fallback;
  // Names must start with a letter, digit or underscore.
  return /^[A-Za-z0-9_]/.test(cleaned) ? cleaned : `${fallback}`;
}

/** Deterministic de-duplication: first wins, later siblings get a suffix. */
function uniqueName(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let suffix = 2;
  while (used.has(`${candidate} ${suffix}`)) suffix++;
  const result = `${candidate} ${suffix}`;
  used.add(result);
  return result;
}

/** `#rrggbb` → 0–255 channels. Returns null for anything else. */
export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
