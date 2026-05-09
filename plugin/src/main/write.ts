import { serializeNode } from "./serializer";

const PLUGIN_NS = "codex";
const MANAGED_KEY = "managed";
const NODE_KEY = "key";

type RequestParams = Record<string, unknown> | undefined;

type MutationError = {
  code: string;
  message: string;
  details?: unknown;
};

type MutationResult = {
  nodeId: string;
  type: string;
  name: string;
  parentId?: string;
  key?: string;
  node: ReturnType<typeof serializeNode>;
};

type FindNodeResult = Omit<MutationResult, "node"> & {
  node?: ReturnType<typeof serializeNode>;
  pageId?: string;
  pageName?: string;
  path: string[];
};

type FindNodesWarning = {
  code: "PAGE_LOAD_FAILED" | "NODE_SERIALIZE_FAILED";
  message: string;
  pageId?: string;
  pageName?: string;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  field?: string;
  details?: unknown;
};

type FindNodesSummary = {
  scope: "currentPage" | "allPages";
  effectiveScope: "currentPage" | "allPages" | "page";
  pageId?: string;
  totalScanned: number;
  totalMatched: number;
  returned: number;
  limit: number;
  truncated: boolean;
  pagesLoaded?: number;
  pagesFailed?: number;
};

type BatchOperation = {
  type: string;
  nodeId?: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
  ref?: string;
};

type BatchContext = {
  refs: Map<string, string>;
};

/** Returns true when a value is a plain object suitable for RPC param inspection. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Throws a structured mutation error that can be serialized back to the server. */
function fail(code: string, message: string, details?: unknown): never {
  throw Object.assign(new Error(message), {
    mutationError: { code, message, details } satisfies MutationError,
  });
}

/** Normalizes unknown failures into the wire-format mutation error shape. */
function toMutationError(error: unknown): MutationError {
  if (isObject(error) && "mutationError" in error) {
    return (error as { mutationError: MutationError }).mutationError;
  }
  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: String(error) };
}

/** Reads a required string field from untyped RPC params. */
function getString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("INVALID_INPUT", `${field} must be a non-empty string`);
  }
  return value;
}

/** Returns a non-empty string when present, otherwise undefined. */
function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Reads a required numeric field from untyped RPC params. */
function getNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail("INVALID_INPUT", `${field} must be a number`);
  }
  return value;
}

/** Reads a positive numeric field from untyped RPC params. */
function getPositiveNumber(value: unknown, field: string): number {
  const number = getNumber(value, field);
  if (number <= 0) {
    fail("INVALID_INPUT", `${field} must be greater than 0`);
  }
  return number;
}

/** Reads a non-negative numeric field from untyped RPC params. */
function getNonnegativeNumber(value: unknown, field: string): number {
  const number = getNumber(value, field);
  if (number < 0) {
    fail("INVALID_INPUT", `${field} must be greater than or equal to 0`);
  }
  return number;
}

/** Reads a Figma node id string in colon-separated format. */
function getFigmaNodeId(value: unknown, field: string): string {
  const nodeId = getString(value, field);
  if (!/^\d+:\d+$/.test(nodeId)) {
    fail("INVALID_INPUT", `${field} must use colon format, e.g. '4029:12345'`);
  }
  return nodeId;
}

/** Reads an optional Figma node id string in colon-separated format. */
function getOptionalFigmaNodeId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return getFigmaNodeId(value, field);
}

/** Reads an optional non-empty string when present. */
function getOptionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return getString(value, field);
}

/** Reads a required node name and rejects empty or whitespace-only labels. */
function getNodeName(value: unknown, field = "name"): string {
  const name = getString(value, field);
  if (name.trim().length === 0) {
    fail("INVALID_INPUT", `${field} must not be empty or whitespace only`);
  }
  return name;
}

/** Validates an enum string field against the allowed literals. */
function validateEnum(value: unknown, field: string, allowed: readonly string[]): void {
  const literal = getString(value, field);
  if (!allowed.includes(literal)) {
    fail("INVALID_INPUT", `${field} must be one of: ${allowed.join(", ")}`);
  }
}

/** Validates the shared text style payload shape. */
function validateTextStyle(value: unknown): void {
  if (!isObject(value)) {
    fail("INVALID_INPUT", "style must be an object");
  }
  getOptionalNonEmptyString(value.fontFamily, "style.fontFamily");
  getOptionalNonEmptyString(value.fontStyle, "style.fontStyle");
  if (value.fontSize !== undefined) getPositiveNumber(value.fontSize, "style.fontSize");
  if (value.textDecoration !== undefined) {
    validateEnum(value.textDecoration, "style.textDecoration", [
      "NONE",
      "UNDERLINE",
      "STRIKETHROUGH",
    ]);
  }
  if (value.textAlignHorizontal !== undefined) {
    validateEnum(value.textAlignHorizontal, "style.textAlignHorizontal", [
      "LEFT",
      "CENTER",
      "RIGHT",
      "JUSTIFIED",
    ]);
  }
  if (value.textAlignVertical !== undefined) {
    validateEnum(value.textAlignVertical, "style.textAlignVertical", ["TOP", "CENTER", "BOTTOM"]);
  }
  if (value.textAutoResize !== undefined) {
    validateEnum(value.textAutoResize, "style.textAutoResize", [
      "NONE",
      "WIDTH_AND_HEIGHT",
      "HEIGHT",
      "TRUNCATE",
    ]);
  }
  if (value.lineHeight !== undefined) {
    if (!isObject(value.lineHeight)) {
      fail("INVALID_INPUT", "style.lineHeight must be an object");
    }
    if (value.lineHeight.unit !== undefined) {
      validateEnum(value.lineHeight.unit, "style.lineHeight.unit", ["PIXELS", "PERCENT"]);
    }
    if (value.lineHeight.value !== undefined) {
      getNonnegativeNumber(value.lineHeight.value, "style.lineHeight.value");
    }
  }
  if (value.letterSpacing !== undefined) {
    if (!isObject(value.letterSpacing)) {
      fail("INVALID_INPUT", "style.letterSpacing must be an object");
    }
    if (value.letterSpacing.unit !== undefined) {
      validateEnum(value.letterSpacing.unit, "style.letterSpacing.unit", ["PIXELS", "PERCENT"]);
    }
    if (value.letterSpacing.value !== undefined) {
      getNumber(value.letterSpacing.value, "style.letterSpacing.value");
    }
  }
}

/** Validates the shared padding object shape. */
function validatePaddingObject(value: unknown, field: string): void {
  if (!isObject(value)) {
    fail("INVALID_INPUT", `${field} must be an object`);
  }
  if (value.top !== undefined) getNonnegativeNumber(value.top, `${field}.top`);
  if (value.right !== undefined) getNonnegativeNumber(value.right, `${field}.right`);
  if (value.bottom !== undefined) getNonnegativeNumber(value.bottom, `${field}.bottom`);
  if (value.left !== undefined) getNonnegativeNumber(value.left, `${field}.left`);
}

type ComponentPropertyPrimitive = string | boolean;

function validateStringRecord(value: unknown, field: string): Record<string, string> {
  if (!isObject(value)) {
    fail("INVALID_INPUT", `${field} must be an object`);
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.trim().length === 0) {
      fail("INVALID_INPUT", `${field} keys must not be empty`);
    }
    if (typeof raw !== "string" || raw.length === 0) {
      fail("INVALID_INPUT", `${field}.${key} must be a non-empty string`);
    }
    result[key] = raw;
  }
  if (Object.keys(result).length === 0) {
    fail("INVALID_INPUT", `${field} must include at least one property`);
  }
  return result;
}

function validateComponentPropertyValueMap(value: unknown, field: string): Record<string, ComponentPropertyPrimitive> {
  if (!isObject(value)) {
    fail("INVALID_INPUT", `${field} must be an object`);
  }
  const result: Record<string, ComponentPropertyPrimitive> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.trim().length === 0) {
      fail("INVALID_INPUT", `${field} keys must not be empty`);
    }
    if (typeof raw !== "string" && typeof raw !== "boolean") {
      fail("INVALID_INPUT", `${field}.${key} must be a string or boolean`);
    }
    result[key] = raw;
  }
  if (Object.keys(result).length === 0) {
    fail("INVALID_INPUT", `${field} must include at least one property`);
  }
  return result;
}

function validateComponentPropertyOperations(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    fail("INVALID_INPUT", "operations must be a non-empty array");
  }
  for (const [index, operation] of value.entries()) {
    if (!isObject(operation)) {
      fail("INVALID_INPUT", `operations[${index}] must be an object`);
    }
    validateEnum(operation.action, `operations[${index}].action`, ["add", "edit", "delete"]);
    getOptionalNonEmptyString(operation.propertyName, `operations[${index}].propertyName`);
    if (operation.action === "add") {
      validateEnum(operation.propertyType, `operations[${index}].propertyType`, [
        "BOOLEAN",
        "TEXT",
        "INSTANCE_SWAP",
        "VARIANT",
      ]);
      if (typeof operation.defaultValue !== "string" && typeof operation.defaultValue !== "boolean") {
        fail("INVALID_INPUT", `operations[${index}].defaultValue must be a string or boolean`);
      }
    }
    if (operation.action === "edit") {
      if (operation.newName !== undefined) {
        getOptionalNonEmptyString(operation.newName, `operations[${index}].newName`);
      }
      if (
        operation.defaultValue !== undefined &&
        typeof operation.defaultValue !== "string" &&
        typeof operation.defaultValue !== "boolean"
      ) {
        fail("INVALID_INPUT", `operations[${index}].defaultValue must be a string or boolean`);
      }
    }
    if (operation.preferredValues !== undefined) {
      if (!Array.isArray(operation.preferredValues)) {
        fail("INVALID_INPUT", `operations[${index}].preferredValues must be an array`);
      }
      for (const [valueIndex, preferredValue] of operation.preferredValues.entries()) {
        if (!isObject(preferredValue)) {
          fail("INVALID_INPUT", `operations[${index}].preferredValues[${valueIndex}] must be an object`);
        }
        validateEnum(preferredValue.type, `operations[${index}].preferredValues[${valueIndex}].type`, [
          "COMPONENT",
          "COMPONENT_SET",
        ]);
        getOptionalNonEmptyString(
          preferredValue.key,
          `operations[${index}].preferredValues[${valueIndex}].key`
        );
      }
    }
  }
}

/** Validates the shared create-node base params shape. */
function validateCreateNodeBase(params: Record<string, unknown>): void {
  getOptionalFigmaNodeId(params.parentId, "parentId");
  getOptionalNonEmptyString(params.name, "name");
  if (params.x !== undefined) getNumber(params.x, "x");
  if (params.y !== undefined) getNumber(params.y, "y");
  if (params.width !== undefined) getPositiveNumber(params.width, "width");
  if (params.height !== undefined) getPositiveNumber(params.height, "height");
  getOptionalNonEmptyString(params.key, "key");
}

/** Validates resolved write params before executeWrite mutates the document. */
function validateWriteToolParams(
  type: string,
  nodeIds: string[] | undefined,
  params: RequestParams
): void {
  const merged: Record<string, unknown> = {
    ...(params ?? {}),
    nodeId: nodeIds?.[0] ?? params?.nodeId,
  };

  switch (type) {
    case "create_frame":
    case "create_component":
      if (params) validateCreateNodeBase(params);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      if (params?.strokes !== undefined) toSolidPaints(params.strokes);
      if (params?.cornerRadius !== undefined) {
        getNonnegativeNumber(params.cornerRadius, "cornerRadius");
      }
      if (params?.layoutMode !== undefined) {
        validateEnum(params.layoutMode, "layoutMode", ["NONE", "HORIZONTAL", "VERTICAL"]);
      }
      if (params?.itemSpacing !== undefined) getNumber(params.itemSpacing, "itemSpacing");
      if (params?.padding !== undefined) validatePaddingObject(params.padding, "padding");
      return;
    case "create_instance":
      getFigmaNodeId(params?.componentId, "componentId");
      getOptionalFigmaNodeId(params?.parentId, "parentId");
      getOptionalNonEmptyString(params?.name, "name");
      if (params?.x !== undefined) getNumber(params.x, "x");
      if (params?.y !== undefined) getNumber(params.y, "y");
      getOptionalNonEmptyString(params?.key, "key");
      return;
    case "combine_as_variants":
      if (!Array.isArray(params?.componentIds) || params.componentIds.length < 2) {
        fail("INVALID_INPUT", "componentIds must include at least two component IDs");
      }
      params.componentIds.forEach((componentId, index) =>
        getFigmaNodeId(componentId, `componentIds[${index}]`)
      );
      getOptionalFigmaNodeId(params?.parentId, "parentId");
      getOptionalNonEmptyString(params?.name, "name");
      if (params?.x !== undefined) getNumber(params.x, "x");
      if (params?.y !== undefined) getNumber(params.y, "y");
      getOptionalNonEmptyString(params?.key, "key");
      return;
    case "set_variant_properties":
      getFigmaNodeId(params?.componentId, "componentId");
      validateStringRecord(params?.variantProperties, "variantProperties");
      if (params?.replace !== undefined && typeof params.replace !== "boolean") {
        fail("INVALID_INPUT", "replace must be a boolean");
      }
      return;
    case "manage_component_properties":
      getFigmaNodeId(params?.componentId, "componentId");
      validateComponentPropertyOperations(params?.operations);
      return;
    case "set_component_properties":
      getFigmaNodeId(params?.instanceId, "instanceId");
      validateComponentPropertyValueMap(params?.properties, "properties");
      return;
    case "set_exposed_instance":
      getFigmaNodeId(params?.instanceId, "instanceId");
      if (typeof params?.isExposed !== "boolean") {
        fail("INVALID_INPUT", "isExposed must be a boolean");
      }
      return;
    case "create_text":
      if (params) validateCreateNodeBase(params);
      if (params?.characters !== undefined && typeof params.characters !== "string") {
        fail("INVALID_INPUT", "characters must be a string");
      }
      if (params?.style !== undefined) validateTextStyle(params.style);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      return;
    case "create_rectangle":
      if (params) validateCreateNodeBase(params);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      if (params?.strokes !== undefined) toSolidPaints(params.strokes);
      if (params?.cornerRadius !== undefined) {
        getNonnegativeNumber(params.cornerRadius, "cornerRadius");
      }
      return;
    case "append_children":
      getFigmaNodeId(params?.parentId, "parentId");
      if (!Array.isArray(params?.childIds) || params.childIds.length === 0) {
        fail("INVALID_INPUT", "childIds must be a non-empty array");
      }
      params.childIds.forEach((childId, index) => getFigmaNodeId(childId, `childIds[${index}]`));
      return;
    case "set_position":
      getFigmaNodeId(merged.nodeId, "nodeId");
      getNumber(merged.x, "x");
      getNumber(merged.y, "y");
      return;
    case "set_size":
      getFigmaNodeId(merged.nodeId, "nodeId");
      getPositiveNumber(merged.width, "width");
      getPositiveNumber(merged.height, "height");
      return;
    case "set_fills":
      getFigmaNodeId(merged.nodeId, "nodeId");
      toSolidPaints(merged.fills);
      return;
    case "set_strokes":
      getFigmaNodeId(merged.nodeId, "nodeId");
      toSolidPaints(merged.strokes);
      return;
    case "set_corner_radius":
      getFigmaNodeId(merged.nodeId, "nodeId");
      getNonnegativeNumber(merged.cornerRadius, "cornerRadius");
      return;
    case "set_text_content":
      getFigmaNodeId(merged.nodeId, "nodeId");
      if (typeof merged.characters !== "string") {
        fail("INVALID_INPUT", "characters must be a string");
      }
      return;
    case "set_text_style":
      getFigmaNodeId(merged.nodeId, "nodeId");
      validateTextStyle(merged.style);
      return;
    case "set_layout_mode":
      getFigmaNodeId(merged.nodeId, "nodeId");
      validateEnum(merged.layoutMode, "layoutMode", ["NONE", "HORIZONTAL", "VERTICAL"]);
      return;
    case "set_padding":
      getFigmaNodeId(merged.nodeId, "nodeId");
      if (
        merged.top === undefined &&
        merged.right === undefined &&
        merged.bottom === undefined &&
        merged.left === undefined
      ) {
        return;
      }
      if (merged.top !== undefined) getNonnegativeNumber(merged.top, "top");
      if (merged.right !== undefined) getNonnegativeNumber(merged.right, "right");
      if (merged.bottom !== undefined) getNonnegativeNumber(merged.bottom, "bottom");
      if (merged.left !== undefined) getNonnegativeNumber(merged.left, "left");
      return;
    case "set_item_spacing":
      getFigmaNodeId(merged.nodeId, "nodeId");
      getNumber(merged.itemSpacing, "itemSpacing");
      return;
    case "set_node_name":
    case "rename_node":
      getFigmaNodeId(merged.nodeId, "nodeId");
      getNodeName(merged.name);
      return;
    case "find_nodes":
      getOptionalNonEmptyString(params?.query, "query");
      getOptionalFigmaNodeId(params?.nodeId, "nodeId");
      getOptionalNonEmptyString(params?.name, "name");
      getOptionalNonEmptyString(params?.key, "key");
      getOptionalFigmaNodeId(params?.parentId, "parentId");
      if (params?.scope !== undefined) {
        validateEnum(params.scope, "scope", ["currentPage", "allPages"]);
      }
      getOptionalFigmaNodeId(params?.pageId, "pageId");
      if (params?.nameMatch !== undefined) {
        validateEnum(params.nameMatch, "nameMatch", ["contains", "exact", "regex"]);
      }
      if (params?.type !== undefined && typeof params.type !== "string" && !Array.isArray(params.type)) {
        fail("INVALID_INPUT", "type must be a string or an array of strings");
      }
      if (Array.isArray(params?.type)) {
        for (const [index, type] of params.type.entries()) {
          if (typeof type !== "string" || type.length === 0) {
            fail("INVALID_INPUT", `type[${index}] must be a non-empty string`);
          }
        }
      }
      if (params?.limit !== undefined) {
        const limit = getPositiveNumber(params.limit, "limit");
        if (!Number.isInteger(limit)) fail("INVALID_INPUT", "limit must be an integer");
      }
      if (params?.includeHidden !== undefined && typeof params.includeHidden !== "boolean") {
        fail("INVALID_INPUT", "includeHidden must be a boolean");
      }
      return;
    case "delete_node":
      getFigmaNodeId(merged.nodeId, "nodeId");
      return;
    default:
      return;
  }
}

/** Converts a hex color string into the RGBA values expected by the Figma API. */
function hexToRGBA(value: string): RGBA {
  const hex = value.replace("#", "");
  if (hex.length !== 6 && hex.length !== 8) {
    fail("INVALID_COLOR", `Invalid color: ${value}`);
  }
  const parse = (start: number) => parseInt(hex.slice(start, start + 2), 16) / 255;
  return {
    r: parse(0),
    g: parse(2),
    b: parse(4),
    a: hex.length === 8 ? parse(6) : 1,
  };
}

/** Validates and converts V1 paint input into solid Figma paints. */
function toSolidPaints(value: unknown): SolidPaint[] {
  if (!Array.isArray(value)) {
    fail("INVALID_INPUT", "Paint list must be an array");
  }
  return value.map((paint) => {
    if (!isObject(paint) || paint.type !== "SOLID") {
      fail("UNSUPPORTED_PAINT", "Only SOLID paints are supported in V1");
    }
    const rgba = hexToRGBA(getString(paint.color, "color"));
    const opacity =
      typeof paint.opacity === "number" ? paint.opacity : rgba.a ?? 1;
    return {
      type: "SOLID",
      color: { r: rgba.r, g: rgba.g, b: rgba.b },
      opacity,
    };
  });
}

/** Marks nodes created or managed through the write tools with shared plugin data. */
function setPluginData(node: BaseNode, key?: string): void {
  if (!("setSharedPluginData" in node)) return;
  node.setSharedPluginData(PLUGIN_NS, MANAGED_KEY, "true");
  if (key) {
    node.setSharedPluginData(PLUGIN_NS, NODE_KEY, key);
  }
}

/** Reads the stable plugin-managed key associated with a node, if any. */
function getPluginKey(node: BaseNode): string | undefined {
  if (!("getSharedPluginData" in node)) return undefined;
  const key = node.getSharedPluginData(PLUGIN_NS, NODE_KEY);
  return key || undefined;
}

/** Checks whether a node belongs to the active page. */
function isOnCurrentPage(node: BaseNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE" && current.parent) {
    current = current.parent;
  }
  return current?.type === "PAGE" && current.id === figma.currentPage.id;
}

/** Ensures an async lookup resolved to a mutable scene node on the current page. */
function ensureSceneNode(node: BaseNode | null, field: string): SceneNode {
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
    fail("NOT_FOUND", `${field} was not found`);
  }
  if (!isOnCurrentPage(node)) {
    fail("OUT_OF_SCOPE", "Mutations are restricted to the current page");
  }
  return node as SceneNode;
}

/** Fetches a scene node by id and validates the current-page mutation boundary. */
async function getNodeById(nodeId: string, field = "nodeId"): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  return ensureSceneNode(node, field);
}

/** Resolves the parent container for create operations, defaulting to the current page. */
async function getParentNode(parentId?: string): Promise<(BaseNode & ChildrenMixin) | PageNode> {
  if (!parentId) return figma.currentPage;
  const node = await getNodeById(parentId, "parentId");
  if (!("appendChild" in node)) {
    fail("INVALID_PARENT", "parentId must reference a node that can contain children");
  }
  return node;
}

/** Applies an explicit name or falls back to the default node label. */
function setName(node: SceneNode, name: unknown, fallback: string): void {
  node.name = getOptionalString(name) ?? fallback;
}

/** Applies x and y coordinates when both are provided. */
function applyPosition(node: SceneNode, params: RequestParams): void {
  if (params?.x !== undefined && params?.y !== undefined) {
    node.x = getNumber(params.x, "x");
    node.y = getNumber(params.y, "y");
  }
}

/** Applies width and height when the node supports resize. */
function applySize(node: SceneNode, params: RequestParams): void {
  if (params?.width !== undefined && params?.height !== undefined) {
    if (!("resize" in node)) {
      fail("UNSUPPORTED_NODE", "resize is not supported for this node");
    }
    node.resize(getNumber(params.width, "width"), getNumber(params.height, "height"));
  }
}

/** Applies solid fill paints to nodes that expose fills. */
function applyFills(node: SceneNode, fills: unknown): void {
  if (fills === undefined) return;
  if (!("fills" in node)) {
    fail("UNSUPPORTED_NODE", "fills are not supported for this node");
  }
  node.fills = toSolidPaints(fills);
}

/** Applies solid stroke paints to nodes that expose strokes. */
function applyStrokes(node: SceneNode, strokes: unknown): void {
  if (strokes === undefined) return;
  if (!("strokes" in node)) {
    fail("UNSUPPORTED_NODE", "strokes are not supported for this node");
  }
  node.strokes = toSolidPaints(strokes);
}

/** Applies a uniform corner radius to supported nodes. */
function applyCornerRadius(node: SceneNode, cornerRadius: unknown): void {
  if (cornerRadius === undefined) return;
  if (!("cornerRadius" in node)) {
    fail("UNSUPPORTED_NODE", "cornerRadius is not supported for this node");
  }
  (node as SceneNode & { cornerRadius: number }).cornerRadius = getNumber(
    cornerRadius,
    "cornerRadius"
  );
}

/** Applies the requested auto-layout mode to supported container nodes. */
function applyLayoutMode(node: SceneNode, layoutMode: unknown): void {
  if (layoutMode === undefined) return;
  if (!("layoutMode" in node)) {
    fail("UNSUPPORTED_NODE", "layoutMode is not supported for this node");
  }
  node.layoutMode = getString(layoutMode, "layoutMode") as FrameNode["layoutMode"];
}

/** Applies auto-layout padding values, defaulting omitted edges to zero. */
function applyPadding(node: SceneNode, padding: unknown): void {
  if (padding === undefined) return;
  if (!("paddingTop" in node) || !isObject(padding)) {
    fail("UNSUPPORTED_NODE", "padding is not supported for this node");
  }
  node.paddingTop = typeof padding.top === "number" ? padding.top : 0;
  node.paddingRight = typeof padding.right === "number" ? padding.right : 0;
  node.paddingBottom = typeof padding.bottom === "number" ? padding.bottom : 0;
  node.paddingLeft = typeof padding.left === "number" ? padding.left : 0;
}

/** Applies auto-layout item spacing to supported container nodes. */
function applyItemSpacing(node: SceneNode, itemSpacing: unknown): void {
  if (itemSpacing === undefined) return;
  if (!("itemSpacing" in node)) {
    fail("UNSUPPORTED_NODE", "itemSpacing is not supported for this node");
  }
  node.itemSpacing = getNumber(itemSpacing, "itemSpacing");
}

/** Loads the fonts needed for subsequent text mutations and returns the active font. */
async function loadFont(node: TextNode, style?: Record<string, unknown>): Promise<FontName> {
  const fontFamily = getOptionalString(style?.fontFamily);
  const fontStyle = getOptionalString(style?.fontStyle);

  if (typeof node.fontName === "symbol") {
    if (fontFamily || fontStyle) {
      const base = node.getRangeAllFontNames(0, node.characters.length)[0] ?? {
        family: "Inter",
        style: "Regular",
      };
      const font: FontName = {
        family: fontFamily ?? base.family,
        style: fontStyle ?? base.style,
      };
      await figma.loadFontAsync(font);
      return font;
    }

    const fonts = node.getRangeAllFontNames(0, node.characters.length);
    const uniqueFonts = new Map(fonts.map((font) => [`${font.family}::${font.style}`, font]));
    for (const font of uniqueFonts.values()) {
      await figma.loadFontAsync(font);
    }
    return fonts[0] ?? { family: "Inter", style: "Regular" };
  }

  const font: FontName = {
    family: fontFamily ?? node.fontName.family,
    style: fontStyle ?? node.fontName.style,
  };
  await figma.loadFontAsync(font);
  return font;
}

/** Applies supported text style fields after ensuring the required fonts are loaded. */
async function applyTextStyle(node: TextNode, style: unknown): Promise<void> {
  if (style === undefined) return;
  if (!isObject(style)) {
    fail("INVALID_INPUT", "style must be an object");
  }
  const nextFont = await loadFont(node, style);
  if (getOptionalString(style.fontFamily) || getOptionalString(style.fontStyle)) {
    node.fontName = nextFont;
  }
  if (typeof style.fontSize === "number") node.fontSize = style.fontSize;
  if (typeof style.textDecoration === "string") {
    node.textDecoration = style.textDecoration as TextDecoration;
  }
  if (typeof style.textAlignHorizontal === "string") {
    node.textAlignHorizontal = style.textAlignHorizontal as typeof node.textAlignHorizontal;
  }
  if (typeof style.textAlignVertical === "string") {
    node.textAlignVertical = style.textAlignVertical as typeof node.textAlignVertical;
  }
  if (typeof style.textAutoResize === "string") {
    node.textAutoResize = style.textAutoResize as typeof node.textAutoResize;
  }
  if (isObject(style.lineHeight)) {
    node.lineHeight = {
      unit:
        typeof style.lineHeight.unit === "string"
          ? (style.lineHeight.unit as "PIXELS" | "PERCENT")
          : "PIXELS",
      value:
        typeof style.lineHeight.value === "number" ? style.lineHeight.value : 0,
    };
  }
  if (isObject(style.letterSpacing)) {
    node.letterSpacing = {
      unit:
        typeof style.letterSpacing.unit === "string"
          ? (style.letterSpacing.unit as "PIXELS" | "PERCENT")
          : "PIXELS",
      value:
        typeof style.letterSpacing.value === "number"
          ? style.letterSpacing.value
          : 0,
    };
  }
}

/** Replaces text node characters after loading the active font. */
async function applyTextContent(node: TextNode, characters: unknown): Promise<void> {
  await loadFont(node);
  if (characters !== undefined && characters !== null && typeof characters !== "string") {
    fail("INVALID_INPUT", "characters must be a string");
  }
  node.characters = typeof characters === "string" ? characters : "";
}

/** Builds the normalized mutation payload returned by write operations. */
function toMutationResult(node: SceneNode): MutationResult {
  return {
    nodeId: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parent && node.parent.type !== "DOCUMENT" ? node.parent.id : undefined,
    key: getPluginKey(node),
    node: serializeNode(node),
  };
}

/** Creates a frame on the current page and applies supported initial properties. */
async function createFrame(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createFrame();
  try {
    setName(node, params?.name, "Frame");
    applyPosition(node, params);
    applySize(node, params);
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    applyLayoutMode(node, params?.layoutMode);
    applyPadding(node, params?.padding);
    applyItemSpacing(node, params?.itemSpacing);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    return toMutationResult(node);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Creates a component on the current page and applies supported initial properties. */
async function createComponent(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createComponent();
  try {
    setName(node, params?.name, "Component");
    applyPosition(node, params);
    applySize(node, params);
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    applyLayoutMode(node, params?.layoutMode);
    applyPadding(node, params?.padding);
    applyItemSpacing(node, params?.itemSpacing);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    return toMutationResult(node);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Creates an instance from a local component on the current page. */
async function createInstance(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const componentId = getString(params?.componentId, "componentId");
  const source = await getNodeById(componentId, "componentId");
  if (source.type !== "COMPONENT") {
    fail("INVALID_COMPONENT", "componentId must reference a COMPONENT node");
  }

  const node = (source as ComponentNode).createInstance();
  try {
    setName(node, params?.name, `${source.name} Instance`);
    applyPosition(node, params);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    return toMutationResult(node);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Combines existing local components into a Figma-native component set. */
async function combineAsVariants(
  params: RequestParams
): Promise<MutationResult & { sourceComponentIds: string[] }> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  if (!Array.isArray(params?.componentIds) || params.componentIds.length < 2) {
    fail("INVALID_INPUT", "componentIds must include at least two component IDs");
  }

  const components: ComponentNode[] = [];
  for (let index = 0; index < params.componentIds.length; index++) {
    const componentId = getString(params.componentIds[index], `componentIds[${index}]`);
    const node = await getNodeById(componentId, `componentIds[${index}]`);
    if (node.type !== "COMPONENT") {
      fail("INVALID_COMPONENT", `componentIds[${index}] must reference a COMPONENT node`);
    }
    components.push(node as ComponentNode);
  }

  const componentSet = figma.combineAsVariants(components, parent);
  try {
    setName(componentSet, params?.name, "Component Set");
    applyPosition(componentSet, params);
    setPluginData(componentSet, getOptionalString(params?.key));
    return {
      ...toMutationResult(componentSet),
      sourceComponentIds: components.map((component) => component.id),
    };
  } catch (error) {
    componentSet.remove();
    throw error;
  }
}

function variantNameFromProperties(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([property, value]) => `${property}=${value}`)
    .join(", ");
}

/** Updates a component variant by renaming it to Figma's Property=Value syntax. */
async function setVariantProperties(
  params: RequestParams
): Promise<MutationResult & { variantProperties: Record<string, string> }> {
  const component = await getNodeById(getString(params?.componentId, "componentId"), "componentId");
  if (component.type !== "COMPONENT") {
    fail("INVALID_COMPONENT", "componentId must reference a COMPONENT node");
  }
  if (!component.parent || component.parent.type !== "COMPONENT_SET") {
    fail("INVALID_COMPONENT", "componentId must reference a variant COMPONENT inside a COMPONENT_SET");
  }

  const requested = validateStringRecord(params?.variantProperties, "variantProperties");
  const current = isObject((component as ComponentNode).variantProperties)
    ? { ...((component as ComponentNode).variantProperties as Record<string, string>) }
    : {};
  const next = params?.replace === true ? requested : { ...current, ...requested };
  component.name = variantNameFromProperties(next);

  return {
    ...toMutationResult(component),
    variantProperties: next,
  };
}

type ComponentPropertyOwner = (ComponentNode | ComponentSetNode) & ComponentPropertiesMixin;

async function getComponentPropertyOwner(componentId: unknown): Promise<ComponentPropertyOwner> {
  const node = await getNodeById(getString(componentId, "componentId"), "componentId");
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    fail("INVALID_COMPONENT", "componentId must reference a COMPONENT or COMPONENT_SET node");
  }
  return node as ComponentPropertyOwner;
}

/** Adds, edits, or deletes component property definitions on components/component sets. */
async function manageComponentProperties(params: RequestParams): Promise<MutationResult & { operations: unknown[] }> {
  const owner = await getComponentPropertyOwner(params?.componentId);
  validateComponentPropertyOperations(params?.operations);
  const operations = params?.operations as Array<Record<string, unknown>>;
  const results: unknown[] = [];

  for (const operation of operations) {
    const action = getString(operation.action, "action");
    const propertyName = getString(operation.propertyName, "propertyName");
    if (action === "add") {
      const propertyType = getString(operation.propertyType, "propertyType") as ComponentPropertyType;
      const defaultValue = operation.defaultValue as ComponentPropertyPrimitive;
      const returnedName = owner.addComponentProperty(
        propertyName,
        propertyType,
        defaultValue,
        operation.preferredValues === undefined
          ? undefined
          : { preferredValues: operation.preferredValues as InstanceSwapPreferredValue[] }
      );
      results.push({ action, propertyName, returnedName });
      continue;
    }
    if (action === "edit") {
      const next: {
        name?: string;
        defaultValue?: string | boolean;
        preferredValues?: InstanceSwapPreferredValue[];
      } = {};
      if (typeof operation.newName === "string") next.name = operation.newName;
      if (typeof operation.defaultValue === "string" || typeof operation.defaultValue === "boolean") {
        next.defaultValue = operation.defaultValue;
      }
      if (operation.preferredValues !== undefined) {
        next.preferredValues = operation.preferredValues as InstanceSwapPreferredValue[];
      }
      const returnedName = owner.editComponentProperty(propertyName, next);
      results.push({ action, propertyName, returnedName });
      continue;
    }
    owner.deleteComponentProperty(propertyName);
    results.push({ action, propertyName });
  }

  return {
    ...toMutationResult(owner),
    operations: results,
  };
}

/** Sets variant/component property values on an instance. */
async function setComponentProperties(params: RequestParams): Promise<MutationResult & { componentProperties: Record<string, ComponentPropertyPrimitive> }> {
  const node = await getNodeById(getString(params?.instanceId, "instanceId"), "instanceId");
  if (node.type !== "INSTANCE") {
    fail("INVALID_INSTANCE", "instanceId must reference an INSTANCE node");
  }
  const properties = validateComponentPropertyValueMap(params?.properties, "properties");
  (node as InstanceNode).setProperties(properties);
  return {
    ...toMutationResult(node),
    componentProperties: properties,
  };
}

/** Toggles whether a nested instance is exposed to the containing component/component set. */
async function setExposedInstance(params: RequestParams): Promise<MutationResult & { isExposedInstance: boolean }> {
  const node = await getNodeById(getString(params?.instanceId, "instanceId"), "instanceId");
  if (node.type !== "INSTANCE") {
    fail("INVALID_INSTANCE", "instanceId must reference an INSTANCE node");
  }
  try {
    (node as InstanceNode).isExposedInstance = params?.isExposed === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(
      "FIGMA_API_LIMITATION",
      `Unable to set exposed instance state: ${message}`,
      {
        instanceId: node.id,
        requiredContext:
          "Figma only allows eligible nested instances inside components/component sets to be exposed.",
      }
    );
  }
  return {
    ...toMutationResult(node),
    isExposedInstance: (node as InstanceNode).isExposedInstance,
  };
}

/** Creates a text node on the current page and applies content and style inputs. */
async function createText(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createText();
  try {
    setName(node, params?.name, "Text");
    applyPosition(node, params);
    applySize(node, params);
    await applyTextStyle(node, params?.style);
    await applyTextContent(node, params?.characters);
    applyFills(node, params?.fills);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    return toMutationResult(node);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Creates a rectangle on the current page and applies supported visual properties. */
async function createRectangle(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createRectangle();
  try {
    setName(node, params?.name, "Rectangle");
    applyPosition(node, params);
    applySize(node, params);
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    return toMutationResult(node);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Re-parents existing child nodes under the requested container. */
async function appendChildren(params: RequestParams): Promise<unknown> {
  const parent = await getNodeById(getString(params?.parentId, "parentId"));
  if (!("appendChild" in parent)) {
    fail("INVALID_PARENT", "parentId must reference a container node");
  }
  if (!Array.isArray(params?.childIds)) {
    fail("INVALID_INPUT", "childIds must be an array");
  }
  const children: MutationResult[] = [];
  for (const childId of params.childIds) {
    const child = await getNodeById(getString(childId, "childId"));
    parent.appendChild(child);
    children.push(toMutationResult(child));
  }
  return {
    parent: toMutationResult(parent),
    children,
  };
}

/** Recursively collects scene nodes below a container for search operations. */
function collectNodes(root: ChildrenMixin, acc: SceneNode[]): void {
  for (const child of root.children) {
    acc.push(child);
    if ("children" in child) {
      collectNodes(child, acc);
    }
  }
}

/** Returns the page owning a node, if it has one. */
function getNodePage(node: BaseNode): PageNode | undefined {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE" && current.parent) {
    current = current.parent;
  }
  return current?.type === "PAGE" ? current : undefined;
}

/** Builds a readable path from the page to a node. */
function getNodePath(node: BaseNode): string[] {
  const names: string[] = [];
  let current: BaseNode | null = node;
  while (current && current.type !== "DOCUMENT") {
    names.unshift(current.name);
    current = current.parent;
  }
  return names;
}

/** Builds the enriched payload returned for find_nodes matches. */
function toFindNodeResult(node: SceneNode): FindNodeResult {
  const page = getNodePage(node);
  return {
    ...toMutationResult(node),
    pageId: page?.id,
    pageName: page?.name,
    path: getNodePath(node),
  };
}

/** Builds minimal find_nodes metadata without deep node serialization. */
function toMinimalFindNodeResult(node: SceneNode): FindNodeResult {
  const page = getNodePage(node);
  return {
    nodeId: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parent && node.parent.type !== "DOCUMENT" ? node.parent.id : undefined,
    key: getPluginKey(node),
    pageId: page?.id,
    pageName: page?.name,
    path: getNodePath(node),
  };
}

/** Serializes a find_nodes match, falling back to minimal metadata if deep serialization fails. */
function toFindNodeResultSafe(node: SceneNode): { result: FindNodeResult; warning?: FindNodesWarning } {
  try {
    return { result: toFindNodeResult(node) };
  } catch (error) {
    const message = getErrorMessage(error);
    const result = toMinimalFindNodeResult(node);
    return {
      result,
      warning: {
        code: "NODE_SERIALIZE_FAILED",
        message: `Unable to serialize node '${node.name}' (${node.id}): ${message}`,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        pageId: result.pageId,
        pageName: result.pageName,
        field: "node",
        details: { message },
      },
    };
  }
}

/** Reads a string filter from direct params or the legacy JSON query object. */
function getFindString(
  params: RequestParams,
  queryFilters: Record<string, unknown> | undefined,
  field: string
): string | undefined {
  return getOptionalString(params?.[field]) ?? getOptionalString(queryFilters?.[field]);
}

/** Reads a numeric filter from direct params or the legacy JSON query object. */
function getFindNumber(
  params: RequestParams,
  queryFilters: Record<string, unknown> | undefined,
  field: string
): number | undefined {
  const value = params?.[field] ?? queryFilters?.[field];
  return typeof value === "number" ? value : undefined;
}

/** Reads a boolean filter from direct params or the legacy JSON query object. */
function getFindBoolean(
  params: RequestParams,
  queryFilters: Record<string, unknown> | undefined,
  field: string
): boolean | undefined {
  const value = params?.[field] ?? queryFilters?.[field];
  return typeof value === "boolean" ? value : undefined;
}

/** Reads a node type filter from direct params or the legacy JSON query object. */
function getFindTypes(
  params: RequestParams,
  queryFilters: Record<string, unknown> | undefined
): string[] | undefined {
  const value = params?.type ?? queryFilters?.type;
  if (typeof value === "string" && value.length > 0) return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  return undefined;
}

/** Returns a readable message for unknown Figma runtime failures. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Builds a structured warning for page-level load failures during search. */
function toPageLoadWarning(page: PageNode, error: unknown): FindNodesWarning {
  const message = getErrorMessage(error);
  return {
    code: "PAGE_LOAD_FAILED",
    message: `Unable to load page '${page.name}' (${page.id}): ${message}`,
    pageId: page.id,
    pageName: page.name,
    details: { message },
  };
}

/** Returns the roots to traverse for find_nodes according to scope/page filters. */
async function getFindRoots(
  scope: "currentPage" | "allPages",
  pageId?: string
): Promise<{ roots: PageNode[]; warnings: FindNodesWarning[] }> {
  if (pageId) {
    let page: BaseNode | null;
    try {
      page = await figma.getNodeByIdAsync(pageId);
    } catch (error) {
      const message = getErrorMessage(error);
      fail("PAGE_RESOLVE_FAILED", `Unable to resolve page '${pageId}': ${message}`, {
        pageId,
        message,
      });
    }
    if (!page || page.type !== "PAGE") {
      fail("NOT_FOUND", "pageId was not found");
    }
    try {
      await page.loadAsync();
    } catch (error) {
      const message = getErrorMessage(error);
      fail("PAGE_LOAD_FAILED", `Unable to load page '${page.name}' (${page.id}): ${message}`, {
        pageId: page.id,
        pageName: page.name,
        message,
      });
    }
    return { roots: [page], warnings: [] };
  }
  if (scope === "allPages") {
    const roots: PageNode[] = [];
    const warnings: FindNodesWarning[] = [];
    const pages = [...figma.root.children] as PageNode[];
    for (const page of pages) {
      try {
        await page.loadAsync();
        roots.push(page);
      } catch (error) {
        warnings.push(toPageLoadWarning(page, error));
      }
    }
    return { roots, warnings };
  }
  return { roots: [figma.currentPage], warnings: [] };
}

/** Creates a name matcher for contains, exact, or regex modes. */
function createNameMatcher(value: string, mode: "contains" | "exact" | "regex"): (node: SceneNode) => boolean {
  if (mode === "exact") {
    return (node) => node.name === value;
  }
  if (mode === "regex") {
    let pattern: RegExp;
    try {
      pattern = new RegExp(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail("INVALID_INPUT", `Invalid name regex: ${message}`);
    }
    return (node) => pattern.test(node.name);
  }
  return (node) => node.name.includes(value);
}

/** Finds nodes by id, name, plugin key, parent id, type, page, and scope. */
async function findNodes(params: RequestParams): Promise<unknown> {
  const rawQuery = getOptionalString(params?.query);
  let queryFilters: Record<string, unknown> | undefined;
  let nameSubstring: string | undefined;

  if (rawQuery) {
    try {
      const parsed = JSON.parse(rawQuery);
      if (isObject(parsed)) {
        queryFilters = parsed;
      } else {
        nameSubstring = rawQuery;
      }
    } catch {
      nameSubstring = rawQuery;
    }
  }

  const scope =
    (getFindString(params, queryFilters, "scope") as "currentPage" | "allPages" | undefined) ??
    "currentPage";
  if (scope !== "currentPage" && scope !== "allPages") {
    fail("INVALID_INPUT", "scope must be one of: currentPage, allPages");
  }
  const pageId = getFindString(params, queryFilters, "pageId");
  const { roots, warnings } = await getFindRoots(scope, pageId);
  const nodes: SceneNode[] = [];
  for (const root of roots) {
    collectNodes(root, nodes);
  }

  let matches = nodes;
  const nodeId = getFindString(params, queryFilters, "nodeId");
  const name = getFindString(params, queryFilters, "name");
  const key = getFindString(params, queryFilters, "key");
  const parentId = getFindString(params, queryFilters, "parentId");
  const types = getFindTypes(params, queryFilters);
  const nameMatch =
    (getFindString(params, queryFilters, "nameMatch") as "contains" | "exact" | "regex" | undefined) ??
    "contains";
  if (nameMatch !== "contains" && nameMatch !== "exact" && nameMatch !== "regex") {
    fail("INVALID_INPUT", "nameMatch must be one of: contains, exact, regex");
  }
  const includeHidden = getFindBoolean(params, queryFilters, "includeHidden") !== false;
  const rawLimit = getFindNumber(params, queryFilters, "limit") ?? 100;
  if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
    fail("INVALID_INPUT", "limit must be a positive integer");
  }
  const limit = Math.min(rawLimit, 500);

  if (!includeHidden) matches = matches.filter((node) => node.visible !== false);
  if (nodeId) matches = matches.filter((node) => node.id === nodeId);
  if (types?.length) matches = matches.filter((node) => types.includes(node.type));
  if (key) matches = matches.filter((node) => getPluginKey(node) === key);
  if (parentId) matches = matches.filter((node) => node.parent?.id === parentId);
  const effectiveName = name ?? nameSubstring;
  if (effectiveName) {
    const matcher = createNameMatcher(effectiveName, name ? nameMatch : "contains");
    matches = matches.filter(matcher);
  }

  const limited = matches.slice(0, limit);
  const summary: FindNodesSummary = {
    scope,
    effectiveScope: pageId ? "page" : scope,
    pageId,
    totalScanned: nodes.length,
    totalMatched: matches.length,
    returned: limited.length,
    limit,
    truncated: matches.length > limited.length,
    ...(scope === "allPages" && !pageId
      ? { pagesLoaded: roots.length, pagesFailed: warnings.length }
      : {}),
  };
  const serializedMatches: FindNodeResult[] = [];
  const serializeWarnings: FindNodesWarning[] = [];
  for (const node of limited) {
    const serialized = toFindNodeResultSafe(node);
    serializedMatches.push(serialized.result);
    if (serialized.warning) {
      serializeWarnings.push(serialized.warning);
    }
  }
  const responseWarnings = [...warnings, ...serializeWarnings];
  return {
    summary,
    matches: serializedMatches,
    ...(responseWarnings.length > 0 ? { warnings: responseWarnings } : {}),
  };
}

/** Deletes a current-page node and reports its id. */
async function deleteNode(params: RequestParams): Promise<unknown> {
  const node = await getNodeById(getString(params?.nodeId, "nodeId"));
  node.remove();
  return { deleted: node.id };
}

/** Loads a node, runs a mutator, and returns the normalized mutation result. */
async function mutateNode(
  params: RequestParams,
  mutator: (node: SceneNode) => Promise<void> | void
): Promise<MutationResult> {
  const node = await getNodeById(getString(params?.nodeId, "nodeId"));
  await mutator(node);
  return toMutationResult(node);
}

/** Dispatches a single write tool invocation to its concrete implementation. */
async function executeWrite(type: string, nodeIds: string[] | undefined, params: RequestParams): Promise<unknown> {
  const merged: Record<string, unknown> = {
    ...(params ?? {}),
    nodeId: nodeIds?.[0] ?? params?.nodeId,
  };
  switch (type) {
    case "create_frame":
      return createFrame(params);
    case "create_component":
      return createComponent(params);
    case "create_instance":
      return createInstance(params);
    case "combine_as_variants":
      return combineAsVariants(params);
    case "set_variant_properties":
      return setVariantProperties(params);
    case "manage_component_properties":
      return manageComponentProperties(params);
    case "set_component_properties":
      return setComponentProperties(params);
    case "set_exposed_instance":
      return setExposedInstance(params);
    case "create_text":
      return createText(params);
    case "create_rectangle":
      return createRectangle(params);
    case "append_children":
      return appendChildren(params);
    case "set_position":
      return mutateNode(merged, (node) => {
        node.x = getNumber(merged.x, "x");
        node.y = getNumber(merged.y, "y");
      });
    case "set_size":
      return mutateNode(merged, (node) => {
        if (!("resize" in node)) fail("UNSUPPORTED_NODE", "resize is not supported for this node");
        node.resize(getNumber(merged.width, "width"), getNumber(merged.height, "height"));
      });
    case "set_fills":
      return mutateNode(merged, (node) => applyFills(node, merged.fills));
    case "set_strokes":
      return mutateNode(merged, (node) => applyStrokes(node, merged.strokes));
    case "set_corner_radius":
      return mutateNode(merged, (node) => applyCornerRadius(node, merged.cornerRadius));
    case "set_text_content":
      return mutateNode(merged, async (node) => {
        if (node.type !== "TEXT") fail("UNSUPPORTED_NODE", "set_text_content only supports TEXT nodes");
        await applyTextContent(node, merged.characters);
      });
    case "set_text_style":
      return mutateNode(merged, async (node) => {
        if (node.type !== "TEXT") fail("UNSUPPORTED_NODE", "set_text_style only supports TEXT nodes");
        await applyTextStyle(node, merged.style);
      });
    case "set_layout_mode":
      return mutateNode(merged, (node) => applyLayoutMode(node, merged.layoutMode));
    case "set_padding":
      return mutateNode(merged, (node) => applyPadding(node, merged.padding ?? merged));
    case "set_item_spacing":
      return mutateNode(merged, (node) => applyItemSpacing(node, merged.itemSpacing));
    case "set_node_name":
    case "rename_node":
      return mutateNode(merged, (node) => {
        node.name = getNodeName(merged.name);
      });
    case "find_nodes":
      return findNodes(params);
    case "delete_node":
      return deleteNode(merged);
    default:
      fail("UNKNOWN_WRITE_TOOL", `Unknown write tool: ${type}`);
  }
}

/** Resolves temporary batch references like `tmp:card` into concrete node ids. */
function resolveRef(value: string | undefined, context: BatchContext): string | undefined {
  if (!value || !value.startsWith("tmp:")) return value;
  const resolved = context.refs.get(value);
  if (!resolved) {
    fail("UNKNOWN_REFERENCE", `Unknown batch reference: ${value}`);
  }
  return resolved;
}

/** Resolves temporary references inside an operation's params object. */
function resolveParams(
  params: Record<string, unknown> | undefined,
  context: BatchContext
): Record<string, unknown> | undefined {
  if (!params) return params;
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, resolveRef(value, context) ?? value];
      }
      if (Array.isArray(value)) {
        return [
          key,
          value.map((item) =>
            typeof item === "string" ? resolveRef(item, context) ?? item : item
          ),
        ];
      }
      return [key, value];
    })
  );
}

/** Handles both single write requests and ordered batch mutations from the server. */
export async function handleWriteRequest(
  type: string,
  nodeIds: string[] | undefined,
  params: RequestParams
): Promise<unknown> {
  if (type !== "batch_mutation") {
    validateWriteToolParams(type, nodeIds, params);
    return executeWrite(type, nodeIds, params);
  }

  if (!Array.isArray(params?.operations) || params.operations.length === 0) {
    fail("INVALID_INPUT", "operations must be a non-empty array");
  }

  const context: BatchContext = { refs: new Map() };
  const results: unknown[] = [];

  for (let index = 0; index < params.operations.length; index++) {
    try {
      const operation = params.operations[index] as BatchOperation;
      const resolvedNodeId = resolveRef(operation.nodeId, context);
      const resolvedNodeIds = operation.nodeIds?.map((id) => resolveRef(id, context) ?? id);
      const resolvedParams = resolveParams(operation.params, context);
      validateWriteToolParams(
        operation.type,
        resolvedNodeIds ?? (resolvedNodeId ? [resolvedNodeId] : undefined),
        resolvedParams
      );
      const result = await executeWrite(
        operation.type,
        resolvedNodeIds ?? (resolvedNodeId ? [resolvedNodeId] : undefined),
        resolvedParams
      );
      results.push(result);

      if (isObject(result) && typeof result.nodeId === "string" && operation.ref) {
        context.refs.set(operation.ref, result.nodeId);
      }
    } catch (error) {
      return {
        executedCount: results.length,
        createdRefs: Object.fromEntries(context.refs),
        failedStepIndex: index,
        failure: toMutationError(error),
        results,
      };
    }
  }

  return {
    executedCount: results.length,
    createdRefs: Object.fromEntries(context.refs),
    results,
  };
}

/** Serializes plugin-side write failures into the transport error shape. */
export function serializeWriteError(error: unknown): MutationError {
  return toMutationError(error);
}
