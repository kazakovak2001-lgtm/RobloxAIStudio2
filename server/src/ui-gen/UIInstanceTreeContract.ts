/**
 * UIInstanceTreeContract — the wire contract for GUI materialization.
 *
 * STUDIO-2F-A. This is the only shape the Studio plugin is permitted to turn
 * into real Roblox Instances. It is deliberately closed and fail-closed,
 * modelled on `assertPlayableLuaScripts` in `server/src/types/playableLua.ts`.
 *
 * Two properties of this format are load-bearing rather than stylistic:
 *
 * 1. **No identifiers.** `server/src/ui-gen/types.ts` mints `UIObject.id` with
 *    `randomUUID()`, and `ArtifactStore.store` does the same for artifact ids.
 *    Any id inside the payload would change on every regeneration, so
 *    byte-identical designs would produce different content hashes and
 *    re-deliver forever. Parenting is therefore expressed by nesting, and
 *    screens are addressed by `screenName`.
 *
 * 2. **Typed property values.** A bare `[0, 0.5, 0, 1]` cannot be told apart
 *    from a `Rect`, a `UDim2` or a plain table, and a bare `"Center"` cannot be
 *    told apart from a string caption and an Enum item. Every value carries an
 *    explicit `kind` so the Lua side constructs it unambiguously instead of
 *    guessing. `color3` uses 0–255 integers rather than 0–1 floats so the JSON
 *    round-trips exactly and no float formatting drift feeds the artifact hash.
 *
 * The class allowlist here is a defence-in-depth copy: the plugin carries its
 * own independent allowlist, because a backend-supplied class name reaching
 * `Instance.new` would let a `{"className": "Script", "properties": {"Source":
 * "..."}}` payload create executable code inside what this system calls a GUI
 * tree.
 */

export const UI_TREE_SCHEMA_VERSION = 1;

/** Maximum nesting depth, counting the ScreenGui root as depth 1. */
export const MAX_UI_TREE_DEPTH = 8;

/** Maximum instances in a single delivered tree, across all screens. */
export const MAX_UI_TREE_NODES = 250;

/**
 * Every class the plugin may construct. Deliberately excludes every script
 * class — no payload may ever produce executable code through this path.
 */
export const ALLOWED_UI_CLASSES = [
  "ScreenGui",
  "Frame",
  "TextLabel",
  "TextButton",
  "TextBox",
  "ImageLabel",
  "ScrollingFrame",
  "UIListLayout",
  "UIPadding",
  "UIAspectRatioConstraint",
] as const;

export type AllowedUIClass = (typeof ALLOWED_UI_CLASSES)[number];

const ALLOWED_UI_CLASS_SET: ReadonlySet<string> = new Set(ALLOWED_UI_CLASSES);

export type UIPropertyValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  /** UDim2.new(xScale, xOffset, yScale, yOffset) */
  | {
      kind: "udim2";
      xScale: number;
      xOffset: number;
      yScale: number;
      yOffset: number;
    }
  /** UDim.new(scale, offset) */
  | { kind: "udim"; scale: number; offset: number }
  /** Vector2.new(x, y) */
  | { kind: "vector2"; x: number; y: number }
  /** Color3.fromRGB(r, g, b) — integers, never 0–1 floats. */
  | { kind: "color3"; r: number; g: number; b: number }
  /** Enum.<enumName>.<item> */
  | { kind: "enum"; enumName: string; item: string };

export type UIPropertyKind = UIPropertyValue["kind"];

export interface UIInstanceNode {
  className: AllowedUIClass;
  name: string;
  properties?: Record<string, UIPropertyValue>;
  children?: UIInstanceNode[];
}

export interface UITreeScreen {
  /** Stable materialization key. Screens are replaced by name, never by id. */
  screenName: string;
  root: UIInstanceNode;
}

export interface MaterializableUITree {
  schemaVersion: number;
  screens: UITreeScreen[];
}

/**
 * Properties every GuiObject accepts. UIListLayout, UIPadding and
 * UIAspectRatioConstraint are not GuiObjects and get their own lists only.
 */
const COMMON_GUI_OBJECT_PROPERTIES: Readonly<Record<string, UIPropertyKind>> = {
  Size: "udim2",
  Position: "udim2",
  AnchorPoint: "vector2",
  BackgroundColor3: "color3",
  BackgroundTransparency: "number",
  BorderSizePixel: "int",
  Visible: "bool",
  ZIndex: "int",
  LayoutOrder: "int",
};

const TEXT_PROPERTIES: Readonly<Record<string, UIPropertyKind>> = {
  Text: "string",
  Font: "enum",
  TextSize: "int",
  TextColor3: "color3",
  TextWrapped: "bool",
  TextScaled: "bool",
  TextTransparency: "number",
  TextXAlignment: "enum",
  TextYAlignment: "enum",
};

/** Allowed property name → required value kind, per class. */
export const ALLOWED_UI_PROPERTIES: Readonly<
  Record<AllowedUIClass, Readonly<Record<string, UIPropertyKind>>>
> = {
  ScreenGui: {
    ResetOnSpawn: "bool",
    IgnoreGuiInset: "bool",
    Enabled: "bool",
    DisplayOrder: "int",
  },
  Frame: { ...COMMON_GUI_OBJECT_PROPERTIES },
  TextLabel: { ...COMMON_GUI_OBJECT_PROPERTIES, ...TEXT_PROPERTIES },
  TextButton: {
    ...COMMON_GUI_OBJECT_PROPERTIES,
    ...TEXT_PROPERTIES,
    AutoButtonColor: "bool",
  },
  TextBox: {
    ...COMMON_GUI_OBJECT_PROPERTIES,
    ...TEXT_PROPERTIES,
    PlaceholderText: "string",
    ClearTextOnFocus: "bool",
  },
  ImageLabel: {
    ...COMMON_GUI_OBJECT_PROPERTIES,
    Image: "string",
    ImageTransparency: "number",
    ScaleType: "enum",
  },
  ScrollingFrame: {
    ...COMMON_GUI_OBJECT_PROPERTIES,
    CanvasSize: "udim2",
    ScrollBarThickness: "int",
  },
  UIListLayout: {
    FillDirection: "enum",
    SortOrder: "enum",
    HorizontalAlignment: "enum",
    VerticalAlignment: "enum",
    Padding: "udim",
  },
  UIPadding: {
    PaddingTop: "udim",
    PaddingBottom: "udim",
    PaddingLeft: "udim",
    PaddingRight: "udim",
  },
  UIAspectRatioConstraint: { AspectRatio: "number" },
};

/**
 * Every Enum item the plugin may resolve. An unknown item must fail rather
 * than reaching `Enum[enumName][item]`, which would either error at an
 * unpredictable point mid-build or silently resolve to something unintended.
 */
export const ALLOWED_UI_ENUM_ITEMS: Readonly<
  Record<string, readonly string[]>
> = {
  Font: [
    "Gotham",
    "GothamBold",
    "GothamMedium",
    "GothamSemibold",
    "SourceSans",
    "SourceSansBold",
    "SourceSansSemibold",
  ],
  TextXAlignment: ["Left", "Center", "Right"],
  TextYAlignment: ["Top", "Center", "Bottom"],
  FillDirection: ["Horizontal", "Vertical"],
  SortOrder: ["Name", "LayoutOrder"],
  HorizontalAlignment: ["Left", "Center", "Right"],
  VerticalAlignment: ["Top", "Center", "Bottom"],
  ScaleType: ["Stretch", "Slice", "Tile", "Fit", "Crop"],
};

/**
 * Instance names must be usable as Roblox instance names and as unambiguous
 * receipt path segments, so path separators and control characters are out.
 */
const VALID_INSTANCE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_ -]{0,49}$/;

/**
 * Reserved for the folder the plugin rescues creator-authored instances into
 * when it replaces a generated screen. A generated node may never claim this
 * name, or a replacement would collide with the very container protecting the
 * creator's work.
 */
export const PRESERVED_CONTENT_FOLDER = "AIStudioPreserved";

/**
 * Roblox integer properties are 32-bit. `1e300` satisfies "is a whole number"
 * but raises on assignment, which would turn a validation problem into a
 * build-time failure with a much less precise message.
 */
const MAX_SAFE_ROBLOX_INT = 2147483647;

export function getMaterializableUITreeIssues(tree: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(tree)) {
    return ["UI tree must be an object"];
  }
  if (tree.schemaVersion !== UI_TREE_SCHEMA_VERSION) {
    issues.push(
      `UI tree schemaVersion must be ${UI_TREE_SCHEMA_VERSION}, received ${JSON.stringify(tree.schemaVersion)}`,
    );
    // Version is the fallback discriminator; nothing below is meaningful
    // against an unknown shape.
    return issues;
  }
  if (!Array.isArray(tree.screens) || tree.screens.length === 0) {
    issues.push("UI tree must contain a non-empty screens array");
    return issues;
  }

  let nodeBudget = MAX_UI_TREE_NODES;
  const seenScreenNames = new Set<string>();

  for (const [index, screen] of tree.screens.entries()) {
    const label = `screen ${index + 1}`;
    if (!isRecord(screen)) {
      issues.push(`${label} must be an object`);
      continue;
    }
    const screenName = screen.screenName;
    if (
      typeof screenName !== "string" ||
      !VALID_INSTANCE_NAME.test(screenName)
    ) {
      issues.push(`${label} requires a valid screenName`);
      continue;
    }
    if (seenScreenNames.has(screenName)) {
      issues.push(`duplicate screenName ${screenName}`);
      continue;
    }
    seenScreenNames.add(screenName);

    if (!isRecord(screen.root)) {
      issues.push(`${screenName} requires a root node`);
      continue;
    }
    if (screen.root.className !== "ScreenGui") {
      issues.push(`${screenName} root must be a ScreenGui`);
      continue;
    }
    if (screen.root.name !== screenName) {
      issues.push(
        `${screenName} root name must equal screenName, received ${JSON.stringify(screen.root.name)}`,
      );
      continue;
    }

    nodeBudget = collectNodeIssues(
      screen.root,
      screenName,
      1,
      nodeBudget,
      issues,
    );
  }

  if (nodeBudget < 0) {
    issues.push(`UI tree exceeds the ${MAX_UI_TREE_NODES}-instance budget`);
  }

  return [...new Set(issues)];
}

/** Returns the remaining node budget; negative means the cap was exceeded. */
function collectNodeIssues(
  node: unknown,
  path: string,
  depth: number,
  budget: number,
  issues: string[],
): number {
  if (budget < 0) return budget;
  if (!isRecord(node)) {
    issues.push(`${path} must be an object`);
    return budget;
  }

  let remaining = budget - 1;
  if (remaining < 0) return remaining;

  if (depth > MAX_UI_TREE_DEPTH) {
    issues.push(`${path} exceeds the maximum depth of ${MAX_UI_TREE_DEPTH}`);
    return remaining;
  }

  const className = node.className;
  if (typeof className !== "string" || !ALLOWED_UI_CLASS_SET.has(className)) {
    issues.push(
      `${path} has a class outside the allowlist: ${JSON.stringify(className)}`,
    );
    return remaining;
  }

  const name = node.name;
  if (typeof name !== "string" || !VALID_INSTANCE_NAME.test(name)) {
    issues.push(`${path} requires a valid instance name`);
    return remaining;
  }
  if (name === PRESERVED_CONTENT_FOLDER) {
    issues.push(
      `${path} may not use the reserved name ${PRESERVED_CONTENT_FOLDER}`,
    );
    return remaining;
  }

  remaining = collectPropertyIssues(
    node.properties,
    className as AllowedUIClass,
    `${path}.${name}`,
    issues,
    remaining,
  );

  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      issues.push(`${path}.${name} children must be an array`);
      return remaining;
    }
    const siblingNames = new Set<string>();
    for (const child of node.children) {
      if (isRecord(child) && typeof child.name === "string") {
        if (siblingNames.has(child.name)) {
          issues.push(`${path}.${name} has duplicate child name ${child.name}`);
        }
        siblingNames.add(child.name);
      }
      remaining = collectNodeIssues(
        child,
        `${path}.${name}`,
        depth + 1,
        remaining,
        issues,
      );
    }
  }

  return remaining;
}

function collectPropertyIssues(
  properties: unknown,
  className: AllowedUIClass,
  path: string,
  issues: string[],
  budget: number,
): number {
  if (properties === undefined) return budget;
  if (!isRecord(properties)) {
    issues.push(`${path} properties must be an object`);
    return budget;
  }

  const allowed = ALLOWED_UI_PROPERTIES[className];
  for (const [property, value] of Object.entries(properties)) {
    const expectedKind = allowed[property];
    if (!expectedKind) {
      issues.push(`${path} has a property outside the allowlist: ${property}`);
      continue;
    }
    const valueIssue = describePropertyValueIssue(
      value,
      expectedKind,
      property,
    );
    if (valueIssue) {
      issues.push(`${path}.${property} ${valueIssue}`);
    }
  }

  return budget;
}

function describePropertyValueIssue(
  value: unknown,
  expectedKind: UIPropertyKind,
  property: string,
): string | null {
  if (!isRecord(value)) return "must be a typed property value object";
  if (value.kind !== expectedKind) {
    return `must have kind ${expectedKind}, received ${JSON.stringify(value.kind)}`;
  }

  switch (expectedKind) {
    case "bool":
      return typeof value.value === "boolean" ? null : "must carry a boolean";
    case "int":
      return isFiniteNumber(value.value) &&
        Number.isInteger(value.value) &&
        Math.abs(value.value) <= MAX_SAFE_ROBLOX_INT
        ? null
        : "must carry a 32-bit integer";
    case "number":
      return isFiniteNumber(value.value) ? null : "must carry a finite number";
    case "string":
      return typeof value.value === "string" ? null : "must carry a string";
    case "udim2":
      return ["xScale", "xOffset", "yScale", "yOffset"].every((key) =>
        isFiniteNumber(value[key]),
      )
        ? null
        : "must carry finite xScale/xOffset/yScale/yOffset";
    case "udim":
      return isFiniteNumber(value.scale) && isFiniteNumber(value.offset)
        ? null
        : "must carry finite scale/offset";
    case "vector2":
      return isFiniteNumber(value.x) && isFiniteNumber(value.y)
        ? null
        : "must carry finite x/y";
    case "color3":
      return ["r", "g", "b"].every((key) => isRgbChannel(value[key]))
        ? null
        : "must carry integer r/g/b in 0-255";
    case "enum": {
      if (
        typeof value.enumName !== "string" ||
        typeof value.item !== "string"
      ) {
        return "must carry string enumName/item";
      }
      // In this contract the enum name always equals the property name. A
      // mismatched-but-allowlisted enum — Font carrying SortOrder.Name —
      // would otherwise pass validation and then fail at assignment time in
      // Studio, where the message is far less precise.
      if (value.enumName !== property) {
        return `must use enum ${property}, received ${value.enumName}`;
      }
      const items = ALLOWED_UI_ENUM_ITEMS[value.enumName];
      if (!items) return `references an unknown enum ${value.enumName}`;
      return items.includes(value.item)
        ? null
        : `references an unknown ${value.enumName} item ${value.item}`;
    }
  }
}

export function assertMaterializableUITree(
  tree: unknown,
): asserts tree is MaterializableUITree {
  const issues = getMaterializableUITreeIssues(tree);
  if (issues.length > 0) {
    throw new Error(`UI tree is not materializable: ${issues.join("; ")}`);
  }
}

/** True when content carries a version the current contract can materialize. */
export function isMaterializableUITreeCandidate(content: unknown): boolean {
  return isRecord(content) && content.schemaVersion !== undefined;
}

/**
 * The instance path a materialized screen must occupy, as Roblox's
 * `GetFullName()` renders it.
 *
 * Computed by the backend rather than taken from the receipt: a path the
 * plugin supplied and the backend echoed back would verify nothing. This must
 * stay in step with `ArtifactLoader:_ensureStageFolder` in the plugin, which
 * builds `ReplicatedStorage/AIStudioArtifacts/<stage>/`.
 */
export function expectedScreenInstancePath(
  stage: string,
  screenName: string,
): string {
  return `ReplicatedStorage.AIStudioArtifacts.${stage}.${screenName}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRgbChannel(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}
