import { serializeNode, type SerializedNode } from "./serializer";
import {
  buildReconciliationPlan,
  cloneBeforeMutate,
  migrateComponentSet,
  repairComponentSet,
  verifyPostflight,
  type ComponentSnapshot,
  type InstanceSnapshot,
} from "./componentMigration";

const PLUGIN_NS = "codex";
const MANAGED_KEY = "managed";
const NODE_KEY = "key";
const FIND_NODES_ALL_PAGES_MAX_DURATION_MS = 20_000;

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
  node?: SerializedNode;
};

type FindNodeResult = Omit<MutationResult, "node"> & {
  node?: SerializedNode;
  pageId?: string;
  pageName?: string;
  path: string[];
};

type FindNodesWarning = {
  code: "PAGE_LOAD_FAILED" | "NODE_SERIALIZE_FAILED" | "SKIPPED_TIME_BUDGET" | "SKIPPED_LIMIT";
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
  pagesSkipped?: number;
  complete?: boolean;
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
    return { code: "PLUGIN_ERROR", message: error.message, details: { name: error.name } };
  }
  return { code: "PLUGIN_ERROR", message: String(error), details: { valueType: typeof error } };
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
      if (operation.propertyType === "INSTANCE_SWAP" && (!Array.isArray(operation.preferredValues) || operation.preferredValues.length === 0)) {
        fail("INVALID_INPUT", `operations[${index}].preferredValues must contain at least one preferred value for INSTANCE_SWAP`);
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
    if (operation.action === "edit" && operation.propertyType === "INSTANCE_SWAP" && (!Array.isArray(operation.preferredValues) || operation.preferredValues.length === 0)) {
      fail("INVALID_INPUT", `operations[${index}].preferredValues must contain at least one preferred value for INSTANCE_SWAP`);
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

const LAYOUT_CONTAINER_KEYS = [
  "layoutMode",
  "primaryAxisSizingMode",
  "counterAxisSizingMode",
  "primaryAxisAlignItems",
  "counterAxisAlignItems",
  "layoutWrap",
  "clipsContent",
] as const;

const LAYOUT_KEYS = [
  ...LAYOUT_CONTAINER_KEYS,
  "layoutSizingHorizontal",
  "layoutSizingVertical",
  "layoutPositioning",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
] as const;

/** Validates flat native auto-layout and sizing properties shared by write tools. */
function validateLayoutProperties(params: Record<string, unknown>, container: boolean): void {
  if (params.layoutMode !== undefined) {
    validateEnum(params.layoutMode, "layoutMode", ["NONE", "HORIZONTAL", "VERTICAL"]);
    if (!container) fail("UNSUPPORTED_NODE", "layoutMode is only supported for container nodes");
  }
  if (params.primaryAxisSizingMode !== undefined) {
    validateEnum(params.primaryAxisSizingMode, "primaryAxisSizingMode", ["AUTO", "FIXED"]);
    if (!container) fail("UNSUPPORTED_NODE", "primaryAxisSizingMode is only supported for container nodes");
  }
  if (params.counterAxisSizingMode !== undefined) {
    validateEnum(params.counterAxisSizingMode, "counterAxisSizingMode", ["AUTO", "FIXED"]);
    if (!container) fail("UNSUPPORTED_NODE", "counterAxisSizingMode is only supported for container nodes");
  }
  if (params.primaryAxisAlignItems !== undefined) {
    validateEnum(params.primaryAxisAlignItems, "primaryAxisAlignItems", ["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]);
    if (!container) fail("UNSUPPORTED_NODE", "primaryAxisAlignItems is only supported for container nodes");
  }
  if (params.counterAxisAlignItems !== undefined) {
    validateEnum(params.counterAxisAlignItems, "counterAxisAlignItems", ["MIN", "CENTER", "MAX", "BASELINE"]);
    if (!container) fail("UNSUPPORTED_NODE", "counterAxisAlignItems is only supported for container nodes");
  }
  if (params.layoutWrap !== undefined) {
    validateEnum(params.layoutWrap, "layoutWrap", ["NO_WRAP", "WRAP"]);
    if (!container) fail("UNSUPPORTED_NODE", "layoutWrap is only supported for container nodes");
  }
  if (params.clipsContent !== undefined) {
    if (typeof params.clipsContent !== "boolean") fail("INVALID_INPUT", "clipsContent must be a boolean");
    if (!container) fail("UNSUPPORTED_NODE", "clipsContent is only supported for container nodes");
  }
  for (const key of ["layoutSizingHorizontal", "layoutSizingVertical"] as const) {
    if (params[key] === undefined) continue;
    validateEnum(params[key], key, ["FIXED", "HUG", "FILL"]);
    if (params[key] === "HUG" && !container && !params.__textNode) {
      fail("UNSUPPORTED_NODE", `${key}=HUG is only valid for auto-layout containers or text`);
    }
  }
  if (params.layoutPositioning !== undefined) {
    validateEnum(params.layoutPositioning, "layoutPositioning", ["AUTO", "ABSOLUTE"]);
  }
  for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const) {
    if (params[key] !== undefined && params[key] !== null) getNonnegativeNumber(params[key], key);
  }
  if (typeof params.minWidth === "number" && typeof params.maxWidth === "number" && params.minWidth > params.maxWidth) {
    fail("INVALID_INPUT", "minWidth must not exceed maxWidth");
  }
  if (typeof params.minHeight === "number" && typeof params.maxHeight === "number" && params.minHeight > params.maxHeight) {
    fail("INVALID_INPUT", "minHeight must not exceed maxHeight");
  }
}

/** Validates resolved write params before executeWrite mutates the document. */
export function validateWriteToolParams(
  type: string,
  nodeIds: string[] | undefined,
  params: RequestParams
): void {
  const merged: Record<string, unknown> = {
    ...(params ?? {}),
    nodeId: nodeIds?.[0] ?? params?.nodeId,
  };

  switch (type) {
    case "migrate_component_set":
    case "repair_component_set":
    case "clone_component_set":
    case "merge_component_sets":
    case "split_component_set":
    case "migrate_instances":
    case "reconcile_component_set":
      if (params?.dryRun !== undefined && typeof params.dryRun !== "boolean") fail("INVALID_INPUT", "dryRun must be a boolean");
      if (params?.cloneBeforeMutate !== undefined && typeof params.cloneBeforeMutate !== "boolean") fail("INVALID_INPUT", "cloneBeforeMutate must be a boolean");
      if (params?.failOnUnsupported !== undefined && typeof params.failOnUnsupported !== "boolean") fail("INVALID_INPUT", "failOnUnsupported must be a boolean");
      if (params?.verify !== undefined && typeof params.verify !== "boolean") fail("INVALID_INPUT", "verify must be a boolean");
      if (type !== "merge_component_sets" && type !== "migrate_instances") getFigmaNodeId(params?.componentSetId, "componentSetId");
      if (type === "clone_component_set") {
        getOptionalFigmaNodeId(params?.parentId, "parentId");
        getOptionalNonEmptyString(params?.name, "name");
      }
      if (type === "merge_component_sets") {
        if (!Array.isArray(params?.componentSetIds) || params.componentSetIds.length < 2) fail("INVALID_INPUT", "componentSetIds must contain at least two component IDs");
        params.componentSetIds.forEach((value, index) => getFigmaNodeId(value, `componentSetIds[${index}]`));
        if (new Set(params.componentSetIds).size !== params.componentSetIds.length) fail("INVALID_INPUT", "componentSetIds must not contain duplicates");
        getOptionalFigmaNodeId(params?.targetComponentSetId, "targetComponentSetId");
      }
      if (type === "split_component_set") {
        if (!Array.isArray(params?.groups) || params.groups.length < 1) fail("INVALID_INPUT", "groups must contain at least one group");
        params.groups.forEach((value, index) => {
          if (!isObject(value)) fail("INVALID_INPUT", `groups[${index}] must be an object`);
          getNodeName(value.name, `groups[${index}].name`);
          if (!Array.isArray(value.componentIds) || value.componentIds.length < 1) fail("INVALID_INPUT", `groups[${index}].componentIds must contain at least one component ID`);
          value.componentIds.forEach((componentId, componentIndex) => getFigmaNodeId(componentId, `groups[${index}].componentIds[${componentIndex}]`));
        });
        if (params?.deleteSource !== undefined && typeof params.deleteSource !== "boolean") fail("INVALID_INPUT", "deleteSource must be a boolean");
      }
      if (type === "migrate_instances") {
        getFigmaNodeId(params?.targetComponentSetId, "targetComponentSetId");
        if (params?.instanceIds !== undefined) {
          if (!Array.isArray(params.instanceIds) || params.instanceIds.length < 1) fail("INVALID_INPUT", "instanceIds must contain at least one instance ID");
          params.instanceIds.forEach((value, index) => getFigmaNodeId(value, `instanceIds[${index}]`));
        }
      }
      return;
    case "create_frame":
    case "create_component":
      if (params) validateCreateNodeBase(params);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      if (params?.strokes !== undefined) toSolidPaints(params.strokes);
      if (params?.cornerRadius !== undefined) getNonnegativeNumber(params.cornerRadius, "cornerRadius");
      if (params?.itemSpacing !== undefined) getNumber(params.itemSpacing, "itemSpacing");
      if (params?.padding !== undefined) validatePaddingObject(params.padding, "padding");
      if (params) validateLayoutProperties(params, true);
      return;
    case "create_instance":
      getFigmaNodeId(params?.componentId, "componentId");
      getOptionalFigmaNodeId(params?.parentId, "parentId");
      getOptionalNonEmptyString(params?.name, "name");
      if (params?.x !== undefined) getNumber(params.x, "x");
      if (params?.y !== undefined) getNumber(params.y, "y");
      if (params?.width !== undefined) getPositiveNumber(params.width, "width");
      if (params?.height !== undefined) getPositiveNumber(params.height, "height");
      getOptionalNonEmptyString(params?.key, "key");
      if (params) validateLayoutProperties(params, false);
      return;
    case "swap_instance_component":
      getFigmaNodeId(params?.instanceId, "instanceId");
      getFigmaNodeId(params?.componentId, "componentId");
      if (params?.preserveOverrides !== undefined && typeof params.preserveOverrides !== "boolean") {
        fail("INVALID_INPUT", "preserveOverrides must be a boolean");
      }
      if (params?.preserveBounds !== undefined && typeof params.preserveBounds !== "boolean") {
        fail("INVALID_INPUT", "preserveBounds must be a boolean");
      }
      if (params?.variantProperties !== undefined) {
        validateStringRecord(params.variantProperties, "variantProperties");
      }
      if (params?.properties !== undefined) {
        validateComponentPropertyValueMap(params.properties, "properties");
      }
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
    case "bind_component_properties":
      getFigmaNodeId(params?.componentId, "componentId");
      if (params?.instanceId !== undefined) getFigmaNodeId(params.instanceId, "instanceId");
      if (!Array.isArray(params?.bindings) || params.bindings.length === 0) fail("INVALID_INPUT", "bindings must be a non-empty array");
      for (const [index, binding] of params.bindings.entries()) {
        if (!isObject(binding)) fail("INVALID_INPUT", `bindings[${index}] must be an object`);
        getString(binding.propertyName, `bindings[${index}].propertyName`);
        if (binding.propertyType !== undefined) validateEnum(binding.propertyType, `bindings[${index}].propertyType`, ["BOOLEAN", "TEXT", "INSTANCE_SWAP", "VARIANT"]);
        if (binding.propertyType === "INSTANCE_SWAP" && (!Array.isArray(binding.preferredValues) || binding.preferredValues.length === 0)) fail("INVALID_INPUT", `bindings[${index}].preferredValues must contain at least one preferred value for INSTANCE_SWAP`);
        if (binding.defaultValue !== undefined && typeof binding.defaultValue !== "string" && typeof binding.defaultValue !== "boolean") fail("INVALID_INPUT", `bindings[${index}].defaultValue must be a string or boolean`);
        if (binding.value !== undefined && typeof binding.value !== "string" && typeof binding.value !== "boolean") fail("INVALID_INPUT", `bindings[${index}].value must be a string or boolean`);
        if (binding.preferredValues !== undefined) {
          if (!Array.isArray(binding.preferredValues)) fail("INVALID_INPUT", `bindings[${index}].preferredValues must be an array`);
          for (const preferred of binding.preferredValues) {
            if (!isObject(preferred)) fail("INVALID_INPUT", `bindings[${index}].preferredValues entries must be objects`);
            validateEnum(preferred.type, `bindings[${index}].preferredValues.type`, ["COMPONENT", "COMPONENT_SET"]);
            getString(preferred.key, `bindings[${index}].preferredValues.key`);
          }
        }
      }
      return;
    case "create_text":
      if (params) validateCreateNodeBase(params);
      if (params?.characters !== undefined && typeof params.characters !== "string") {
        fail("INVALID_INPUT", "characters must be a string");
      }
      if (params?.style !== undefined) validateTextStyle(params.style);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      if (params) validateLayoutProperties({ ...params, __textNode: true }, false);
      return;
    case "create_rectangle":
      if (params) validateCreateNodeBase(params);
      if (params?.fills !== undefined) toSolidPaints(params.fills);
      if (params?.strokes !== undefined) toSolidPaints(params.strokes);
      if (params?.cornerRadius !== undefined) getNonnegativeNumber(params.cornerRadius, "cornerRadius");
      if (params) validateLayoutProperties(params, false);
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
      if (merged.layoutMode === undefined && !LAYOUT_KEYS.some((key) => key !== "layoutMode" && merged[key] !== undefined)) {
        fail("INVALID_INPUT", "at least one layout property is required");
      }
      validateLayoutProperties(merged, true);
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

/** Applies x and y coordinates independently when provided. */
function applyPosition(node: SceneNode, params: RequestParams): void {
  if (params?.x !== undefined) node.x = getNumber(params.x, "x");
  if (params?.y !== undefined) node.y = getNumber(params.y, "y");
}

/** Applies width and height independently when provided. */
function applySize(node: SceneNode, params: RequestParams): void {
  if (params?.width === undefined && params?.height === undefined) return;
  if (!("resize" in node)) fail("UNSUPPORTED_NODE", "resize is not supported for this node");
  const width = params.width === undefined ? node.width : getPositiveNumber(params.width, "width");
  const height = params.height === undefined ? node.height : getPositiveNumber(params.height, "height");
  node.resize(width, height);
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

/** Applies auto-layout direction and optional main-axis sizing to supported containers. */
function applyLayoutMode(node: SceneNode, layoutMode: unknown, primaryAxisSizingMode?: unknown): void {
  if (layoutMode !== undefined) {
    if (!("layoutMode" in node)) {
      fail("UNSUPPORTED_NODE", "layoutMode is not supported for this node");
    }
    node.layoutMode = getString(layoutMode, "layoutMode") as FrameNode["layoutMode"];
  }
  if (primaryAxisSizingMode !== undefined) {
    if (!("primaryAxisSizingMode" in node)) {
      fail("UNSUPPORTED_NODE", "primaryAxisSizingMode is not supported for this node");
    }
    node.primaryAxisSizingMode = getString(primaryAxisSizingMode, "primaryAxisSizingMode") as FrameNode["primaryAxisSizingMode"];
  }
}
/** Applies flat native auto-layout and sizing properties after node attachment. */
function applyLayoutProperties(node: SceneNode, params: RequestParams): void {
  if (!params) return;
  const containerKeys = ["layoutMode", "primaryAxisSizingMode", "counterAxisSizingMode", "primaryAxisAlignItems", "counterAxisAlignItems", "layoutWrap", "clipsContent"] as const;
  const isContainer = "children" in node;
  for (const key of containerKeys) {
    if (params[key] === undefined) continue;
    if (!isContainer) fail("UNSUPPORTED_NODE", `${key} is only supported for container nodes`);
    (node as SceneNode & Record<string, unknown>)[key] = params[key];
  }
  for (const key of ["layoutSizingHorizontal", "layoutSizingVertical", "layoutPositioning"] as const) {
    if (params[key] === undefined) continue;
    (node as SceneNode & Record<string, unknown>)[key] = params[key];
  }
  for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const) {
    if (params[key] !== undefined && params[key] !== null) {
      (node as unknown as Record<string, number | null>)[key] = params[key] as number;
    }
  }
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
function toMutationResult(node: SceneNode, includeNode = true): MutationResult {
  return {
    nodeId: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parent && node.parent.type !== "DOCUMENT" ? node.parent.id : undefined,
    key: getPluginKey(node),
    ...(includeNode ? { node: serializeNode(node) } : {}),
  };
}

/** Creates a frame on the current page and applies supported initial properties. */
async function createFrame(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createFrame();
  try {
    setName(node, params?.name, "Frame");
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    applyLayoutMode(node, params?.layoutMode);
    applyPadding(node, params?.padding);
    applyItemSpacing(node, params?.itemSpacing);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    applyPosition(node, params);
    applySize(node, params);
    applyLayoutProperties(node, params);
    return toMutationResult(node, params?.compact === false);
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
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    applyLayoutMode(node, params?.layoutMode);
    applyPadding(node, params?.padding);
    applyItemSpacing(node, params?.itemSpacing);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    applyPosition(node, params);
    applySize(node, params);
    applyLayoutProperties(node, params);
    return toMutationResult(node, params?.compact === false);
  } catch (error) {
    node.remove();
    throw error;
  }
}

/** Creates an instance from a component node. Supports cross-page components via getNodeByIdAsync. */
async function createInstance(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const componentId = getString(params?.componentId, "componentId");
  // Use async lookup so components on other pages can be resolved.
  const source = await figma.getNodeByIdAsync(componentId);
  if (!source) {
    fail("NOT_FOUND", `componentId ${componentId} was not found`);
  }
  if (source.type !== "COMPONENT") {
    fail("INVALID_COMPONENT", "componentId must reference a COMPONENT node");
  }

  const node = (source as ComponentNode).createInstance();
  try {
    setName(node, params?.name, `${source.name} Instance`);
    setPluginData(node, getOptionalString(params?.key));
    // Attach before positioning so x/y are interpreted in the target parent's coordinate space.
    parent.appendChild(node);
    applyPosition(node, params);
    applySize(node, params);
    applyLayoutProperties(node, params);
    return toMutationResult(node, params?.compact === false);
  } catch (error) {
    node.remove();
    throw error;
  }
}

async function getComponentSourceById(componentId: string): Promise<ComponentNode | ComponentSetNode> {
  const source = await figma.getNodeByIdAsync(componentId);
  if (!source || source.type === "DOCUMENT" || source.type === "PAGE") {
    fail("NOT_FOUND", "componentId was not found");
  }
  if (source.type !== "COMPONENT" && source.type !== "COMPONENT_SET") {
    fail("INVALID_COMPONENT", "componentId must reference a COMPONENT or COMPONENT_SET node");
  }
  return source as ComponentNode | ComponentSetNode;
}

function variantMatches(component: ComponentNode, requested: Record<string, string>): boolean {
  const actual = isObject(component.variantProperties)
    ? (component.variantProperties as Record<string, unknown>)
    : {};
  return Object.entries(requested).every(([property, value]) => actual[property] === value);
}

function resolveComponentSetVariant(
  componentSet: ComponentSetNode,
  variantProperties: Record<string, string> | undefined
): ComponentNode {
  const variants = componentSet.children.filter((child): child is ComponentNode => child.type === "COMPONENT");
  if (variants.length === 0) {
    fail("INVALID_COMPONENT", "componentId references an empty COMPONENT_SET");
  }
  if (!variantProperties) {
    if (variants.length === 1) return variants[0];
    fail(
      "INVALID_INPUT",
      "variantProperties are required when componentId references a COMPONENT_SET with multiple variants"
    );
  }
  const match = variants.find((variant) => variantMatches(variant, variantProperties));
  if (!match) {
    fail("VARIANT_NOT_FOUND", "No variant in componentId matches the requested variantProperties", {
      componentId: componentSet.id,
      variantProperties,
    });
  }
  return match;
}

type BoundsSnapshot = { x: number; y: number; width: number; height: number };
type ComponentSummary = { id: string; name: string } | null;

function captureBounds(node: SceneNode): BoundsSnapshot {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function restoreBounds(node: SceneNode, bounds: BoundsSnapshot): void {
  node.x = bounds.x;
  node.y = bounds.y;
  if ("resize" in node) {
    node.resize(bounds.width, bounds.height);
  }
}

async function getMainComponentSummary(instance: InstanceNode): Promise<ComponentSummary> {
  const readableInstance = instance as InstanceNode & {
    mainComponent?: ComponentNode | null;
    getMainComponentAsync?: () => Promise<ComponentNode | null>;
  };
  const component = readableInstance.getMainComponentAsync
    ? await readableInstance.getMainComponentAsync()
    : readableInstance.mainComponent ?? null;
  return component ? { id: component.id, name: component.name } : null;
}

/** Swaps a current-page instance to another local component, including cross-page sources. */
async function swapInstanceComponent(
  params: RequestParams
): Promise<MutationResult & {
  oldMainComponent: ComponentSummary;
  newMainComponent: ComponentSummary;
  componentId: string;
  componentName: string;
  preservedBounds: boolean;
  boundsBefore: BoundsSnapshot;
  boundsAfter: BoundsSnapshot;
  appliedProperties?: Record<string, ComponentPropertyPrimitive>;
  warnings?: Array<{ code: string; message: string }>;
}> {
  const instance = await getNodeById(getString(params?.instanceId, "instanceId"), "instanceId");
  if (instance.type !== "INSTANCE") {
    fail("INVALID_INSTANCE", "instanceId must reference an INSTANCE node");
  }

  const source = await getComponentSourceById(getString(params?.componentId, "componentId"));
  const variantProperties = params?.variantProperties
    ? validateStringRecord(params.variantProperties, "variantProperties")
    : undefined;
  const replacement =
    source.type === "COMPONENT"
      ? (source as ComponentNode)
      : resolveComponentSetVariant(source as ComponentSetNode, variantProperties);
  const preserveBounds = params?.preserveBounds !== false;
  const boundsBefore = captureBounds(instance);
  const bounds = preserveBounds ? boundsBefore : undefined;
  const oldMainComponent = await getMainComponentSummary(instance as InstanceNode);
  const warnings: Array<{ code: string; message: string }> = [];
  if (params?.preserveOverrides === false) {
    warnings.push({
      code: "PRESERVE_OVERRIDES_UNSUPPORTED",
      message: "Figma's swapComponent API does not expose a flag to disable override preservation; applicable overrides may still be preserved.",
    });
  }

  try {
    (instance as InstanceNode).swapComponent(replacement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail("FIGMA_API_LIMITATION", `Unable to swap instance component: ${message}`);
  }

  if (bounds) restoreBounds(instance, bounds);

  const appliedProperties: Record<string, ComponentPropertyPrimitive> = {};
  if (variantProperties) {
    Object.assign(appliedProperties, variantProperties);
  }
  if (params?.properties !== undefined) {
    Object.assign(appliedProperties, validateComponentPropertyValueMap(params.properties, "properties"));
  }
  if (Object.keys(appliedProperties).length > 0) {
    (instance as InstanceNode).setProperties(appliedProperties);
  }

  const newMainComponent = await getMainComponentSummary(instance as InstanceNode);
  const boundsAfter = captureBounds(instance);

  return {
    ...toMutationResult(instance),
    oldMainComponent,
    newMainComponent,
    componentId: replacement.id,
    componentName: replacement.name,
    preservedBounds: preserveBounds,
    boundsBefore,
    boundsAfter,
    ...(Object.keys(appliedProperties).length > 0 ? { appliedProperties } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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

/** Creates/updates component property definitions and optionally applies values to an instance. */
async function bindComponentProperties(params: RequestParams): Promise<MutationResult & { bindings: unknown[]; appliedValues?: Record<string, ComponentPropertyPrimitive> }> {
  const owner = await getComponentPropertyOwner(params?.componentId);
  if (owner.type === "COMPONENT" && owner.parent?.type === "COMPONENT_SET") {
    fail("FIGMA_API_LIMITATION", "Component property definitions must be bound on a component set or non-variant component");
  }
  const bindings = params?.bindings as Array<Record<string, unknown>>;
  const results: unknown[] = [];
  const applied: Record<string, ComponentPropertyPrimitive> = {};
  const definitions = owner.componentPropertyDefinitions as Record<string, { type: string; defaultValue?: ComponentPropertyPrimitive }>;
  for (const binding of bindings) {
    const propertyName = getString(binding.propertyName, "propertyName");
    const existing = definitions[propertyName];
    let returnedName = propertyName;
    if (!existing) {
      const propertyType = getString(binding.propertyType, "propertyType") as ComponentPropertyType;
      const defaultValue = binding.defaultValue as ComponentPropertyPrimitive;
      if (defaultValue === undefined) fail("INVALID_INPUT", `defaultValue is required when adding ${propertyName}`);
      returnedName = owner.addComponentProperty(propertyName, propertyType, defaultValue, binding.preferredValues === undefined ? undefined : { preferredValues: binding.preferredValues as InstanceSwapPreferredValue[] });
      results.push({ propertyName, returnedName, action: "add" });
    } else {
      const next: { defaultValue?: ComponentPropertyPrimitive; preferredValues?: InstanceSwapPreferredValue[] } = {};
      if (binding.defaultValue !== undefined) next.defaultValue = binding.defaultValue as ComponentPropertyPrimitive;
      if (binding.preferredValues !== undefined) next.preferredValues = binding.preferredValues as InstanceSwapPreferredValue[];
      if (Object.keys(next).length > 0) owner.editComponentProperty(propertyName, next);
      results.push({ propertyName, returnedName, action: Object.keys(next).length > 0 ? "edit" : "unchanged" });
    }
    if (binding.value !== undefined) applied[propertyName] = binding.value as ComponentPropertyPrimitive;
  }
  if (params?.instanceId !== undefined) {
    const instance = await getNodeById(getString(params.instanceId, "instanceId"));
    if (instance.type !== "INSTANCE") fail("INVALID_INSTANCE", "instanceId must reference an INSTANCE node");
    if (Object.keys(applied).length > 0) (instance as InstanceNode).setProperties(applied);
  }
  return { ...toMutationResult(owner), bindings: results, ...(Object.keys(applied).length > 0 ? { appliedValues: applied } : {}) };
}

/** Creates a text node on the current page and applies content and style inputs. */
async function createText(params: RequestParams): Promise<MutationResult> {
  const parent = await getParentNode(getOptionalString(params?.parentId));
  const node = figma.createText();
  try {
    setName(node, params?.name, "Text");
    await applyTextStyle(node, params?.style);
    await applyTextContent(node, params?.characters);
    applyFills(node, params?.fills);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    applyPosition(node, params);
    applySize(node, params);
    if (params?.width !== undefined && params?.height === undefined && (!isObject(params.style) || params.style.textAutoResize === undefined)) {
      node.textAutoResize = "HEIGHT";
    }
    applyLayoutProperties(node, params);
    return toMutationResult(node, params?.compact === false);
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
    applyFills(node, params?.fills);
    applyStrokes(node, params?.strokes);
    applyCornerRadius(node, params?.cornerRadius);
    setPluginData(node, getOptionalString(params?.key));
    parent.appendChild(node);
    applyPosition(node, params);
    applySize(node, params);
    applyLayoutProperties(node, params);
    return toMutationResult(node, params?.compact === false);
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

/** Recursively scans find_nodes matches and stops as soon as the requested limit is satisfied. */
function scanFindNodesUntilLimit(
  root: ChildrenMixin,
  filters: Parameters<typeof matchesFindFilters>[1],
  limit: number,
  matches: SceneNode[]
): { scanned: number; matched: number; limitReached: boolean } {
  let scanned = 0;
  let matched = 0;

  for (const child of root.children) {
    scanned += 1;
    if (matchesFindFilters(child, filters)) {
      matched += 1;
      matches.push(child);
      if (matches.length >= limit) {
        return { scanned, matched, limitReached: true };
      }
    }
    if ("children" in child) {
      const result = scanFindNodesUntilLimit(child, filters, limit, matches);
      scanned += result.scanned;
      matched += result.matched;
      if (result.limitReached) {
        return { scanned, matched, limitReached: true };
      }
    }
  }

  return { scanned, matched, limitReached: false };
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
    const result = toFindNodeResult(node);
    const serializationError = result.node?.serializationErrors?.[0];
    if (serializationError) {
      return {
        result,
        warning: {
          code: "NODE_SERIALIZE_FAILED",
          message: `Unable to serialize node '${node.name}' (${node.id}) field '${serializationError.field}': ${serializationError.message}`,
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          pageId: result.pageId,
          pageName: result.pageName,
          field: serializationError.field,
          details: serializationError,
        },
      };
    }
    return { result };
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

/** Builds a structured warning when all-pages search stops before scanning every page. */
function toSkippedPagesWarning(
  code: "SKIPPED_TIME_BUDGET" | "SKIPPED_LIMIT",
  details: Record<string, unknown>
): FindNodesWarning {
  const message =
    code === "SKIPPED_TIME_BUDGET"
      ? "Stopped all-pages search before bridge timeout; some pages were not scanned."
      : "Stopped all-pages search after the result limit was satisfied; some pages were not scanned.";
  return { code, message, details };
}

/** Returns true when a node matches the find_nodes filters. */
function matchesFindFilters(
  node: SceneNode,
  filters: {
    includeHidden: boolean;
    nodeId?: string;
    types?: string[];
    key?: string;
    parentId?: string;
    nameMatcher?: (node: SceneNode) => boolean;
  }
): boolean {
  if (!filters.includeHidden && node.visible === false) return false;
  if (filters.nodeId && node.id !== filters.nodeId) return false;
  if (filters.types?.length && !filters.types.includes(node.type)) return false;
  if (filters.key && getPluginKey(node) !== filters.key) return false;
  if (filters.parentId && node.parent?.id !== filters.parentId) return false;
  if (filters.nameMatcher && !filters.nameMatcher(node)) return false;
  return true;
}

/** Returns the roots to traverse for current-page/pageId find_nodes searches. */
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
    fail("INVALID_INPUT", "allPages find_nodes searches must use the bounded incremental scanner");
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

/** Scans all pages incrementally so cold dynamic-page loads can return partial results before bridge timeout. */
async function findNodesAcrossAllPages(
  filters: Parameters<typeof matchesFindFilters>[1],
  limit: number,
  maxDurationMs = FIND_NODES_ALL_PAGES_MAX_DURATION_MS
): Promise<{
  nodes: SceneNode[];
  totalScanned: number;
  totalMatched: number;
  pagesLoaded: number;
  pagesFailed: number;
  pagesSkipped: number;
  complete: boolean;
  startedAt: number;
  maxDurationMs: number;
  warnings: FindNodesWarning[];
}> {
  const startedAt = Date.now();
  const pages = [...figma.root.children] as PageNode[];
  const nodes: SceneNode[] = [];
  const warnings: FindNodesWarning[] = [];
  let totalScanned = 0;
  let totalMatched = 0;
  let pagesLoaded = 0;
  let pagesFailed = 0;
  let pagesVisited = 0;
  let stopReason: "timeBudget" | "limit" | undefined;

  for (const page of pages) {
    if (Date.now() - startedAt >= maxDurationMs) {
      stopReason = "timeBudget";
      break;
    }
    pagesVisited += 1;
    try {
      await page.loadAsync();
      pagesLoaded += 1;
    } catch (error) {
      pagesFailed += 1;
      warnings.push(toPageLoadWarning(page, error));
      continue;
    }

    if (Date.now() - startedAt >= maxDurationMs) {
      stopReason = "timeBudget";
      break;
    }

    const result = scanFindNodesUntilLimit(page, filters, limit, nodes);
    totalScanned += result.scanned;
    totalMatched += result.matched;
    if (result.limitReached) {
      stopReason = "limit";
      break;
    }
  }

  const pagesSkipped = Math.max(0, pages.length - pagesVisited);
  const complete = stopReason === undefined && pagesSkipped === 0;
  if (!complete) {
    warnings.push(
      toSkippedPagesWarning(stopReason === "timeBudget" ? "SKIPPED_TIME_BUDGET" : "SKIPPED_LIMIT", {
        maxDurationMs,
        pagesScanned: pagesVisited,
        pagesLoaded,
        pagesFailed,
        pagesSkipped,
      })
    );
  }

  return {
    nodes,
    totalScanned,
    totalMatched,
    pagesLoaded,
    pagesFailed,
    pagesSkipped,
    complete,
    startedAt,
    maxDurationMs,
    warnings,
  };
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
  const effectiveName = name ?? nameSubstring;
  const nameMatcher = effectiveName ? createNameMatcher(effectiveName, name ? nameMatch : "contains") : undefined;
  const filters = { includeHidden, nodeId, types, key, parentId, nameMatcher };

  let warnings: FindNodesWarning[] = [];
  let limited: SceneNode[] = [];
  let totalScanned = 0;
  let totalMatched = 0;
  let allPagesStats: Pick<FindNodesSummary, "pagesLoaded" | "pagesFailed" | "pagesSkipped" | "complete"> | undefined;
  let allPagesStartedAt: number | undefined;
  let allPagesMaxDurationMs: number | undefined;

  if (scope === "allPages" && !pageId) {
    const result = await findNodesAcrossAllPages(filters, limit);
    limited = result.nodes;
    totalScanned = result.totalScanned;
    totalMatched = result.totalMatched;
    warnings = result.warnings;
    allPagesStats = {
      pagesLoaded: result.pagesLoaded,
      pagesFailed: result.pagesFailed,
      pagesSkipped: result.pagesSkipped,
      complete: result.complete,
    };
    allPagesStartedAt = result.startedAt;
    allPagesMaxDurationMs = result.maxDurationMs;
  } else {
    const rootsResult = await getFindRoots(scope, pageId);
    warnings = rootsResult.warnings;
    const nodes: SceneNode[] = [];
    for (const root of rootsResult.roots) {
      collectNodes(root, nodes);
    }
    totalScanned = nodes.length;
    const matches = nodes.filter((node) => matchesFindFilters(node, filters));
    totalMatched = matches.length;
    limited = matches.slice(0, limit);
  }

  const complete = allPagesStats?.complete ?? true;
  const summary: FindNodesSummary = {
    scope,
    effectiveScope: pageId ? "page" : scope,
    pageId,
    totalScanned,
    totalMatched,
    returned: limited.length,
    limit,
    truncated: totalMatched > limited.length || !complete,
    ...(allPagesStats ?? {}),
  };
  const serializedMatches: FindNodeResult[] = [];
  const serializeWarnings: FindNodesWarning[] = [];
  for (const node of limited) {
    if (
      allPagesStartedAt !== undefined &&
      allPagesMaxDurationMs !== undefined &&
      Date.now() - allPagesStartedAt >= allPagesMaxDurationMs
    ) {
      if (!warnings.some((warning) => warning.code === "SKIPPED_TIME_BUDGET")) {
        serializeWarnings.push(
          toSkippedPagesWarning("SKIPPED_TIME_BUDGET", {
            maxDurationMs: allPagesMaxDurationMs,
            serializedMatches: serializedMatches.length,
            skippedMatches: limited.length - serializedMatches.length,
          })
        );
      }
      break;
    }
    const serialized = toFindNodeResultSafe(node);
    serializedMatches.push(serialized.result);
    if (serialized.warning) {
      serializeWarnings.push(serialized.warning);
    }
  }
  summary.returned = serializedMatches.length;
  if (serializedMatches.length < limited.length) {
    summary.truncated = true;
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
  return toMutationResult(node, params?.compact === false);
}

/** Apply safe native dimension operations on a component set. */
function applyDimensionOperations(componentSet: ComponentSetNode, dimensions: unknown, failOnUnsupported = true): { renamed: unknown[]; deleted: unknown[]; remapped: unknown[] } {
  const ops = Array.isArray(dimensions) ? dimensions : [];
  const renamed: unknown[] = [];
  const deleted: unknown[] = [];
  const remapped: unknown[] = [];
  for (const raw of ops) {
    if (!isObject(raw)) fail("INVALID_INPUT", "dimensions entries must be objects");
    const action = raw.action;
    const name = typeof raw.name === "string" ? raw.name : "";
    if (!name || (action !== "rename" && action !== "delete")) fail("INVALID_INPUT", "dimension operation requires action and name");
    const children = componentSet.children.filter((n): n is ComponentNode => n.type === "COMPONENT");
    if (action === "rename") {
      const newName = typeof raw.newName === "string" ? raw.newName : "";
      if (!newName) fail("INVALID_INPUT", "newName is required when renaming a dimension");
      if (name === newName) continue;
      for (const child of children) {
        const props = isObject((child as any).variantProperties) ? { ...((child as any).variantProperties as Record<string,string>) } : {};
        if (!(name in props)) continue;
        const value = props[name];
        delete props[name];
        if (newName in props && props[newName] !== value) {
          // Collapse duplicate dimension keys deterministically by retaining the existing target value.
          remapped.push({ componentId: child.id, dimension: name, to: newName, value: props[newName] });
        } else props[newName] = value;
        (child as any).name = Object.entries(props).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join(", ");
        renamed.push({ componentId: child.id, from: name, to: newName });
      }
      continue;
    }
    // Figma does not expose a supported API to delete a variant dimension/property definition.
    if (failOnUnsupported !== false) {
      fail("UNSUPPORTED_FIGMA_API", `Deleting dimension ${name} is not supported by the Figma plugin API`, { dimension: name });
    }
    deleted.push({ dimension: name, skipped: true });
  }
  return { renamed, deleted, remapped };
}

type InstanceMigrationClassification = {
  instanceId: string;
  classification: "exact" | "variant" | "unmapped";
  targetComponentId?: string;
};

function readVariantProperties(node: object): Record<string, unknown> | null {
  if (!("variantProperties" in node) || !isObject(node.variantProperties)) return null;
  return node.variantProperties;
}

/** Component migration operations. Unsupported Figma APIs fail closed. */
function componentSnapshot(node: ComponentNode | ComponentSetNode): ComponentSnapshot {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    width: (node as SceneNode).width,
    height: (node as SceneNode).height,
    variantProperties: node.type === "COMPONENT" ? ((node as ComponentNode).variantProperties ?? null) : undefined,
  };
}

function componentVariants(set: ComponentSetNode): ComponentNode[] {
  return set.children.filter((n): n is ComponentNode => n.type === "COMPONENT");
}

function cloneComponent(component: ComponentNode): ComponentNode {
  if (typeof (component as any).clone !== "function") fail("UNSUPPORTED_FIGMA_API", "clone is not supported by this Figma runtime");
  return (component as any).clone() as ComponentNode;
}

function cloneVariants(sets: ComponentSetNode[]): ComponentNode[] {
  const clones: ComponentNode[] = [];
  for (const set of sets) for (const variant of componentVariants(set)) clones.push(cloneComponent(variant));
  return clones;
}

function combineClones(clones: ComponentNode[], parent: BaseNode & ChildrenMixin, name?: string): ComponentSetNode {
  if (clones.length < 2) fail("INVALID_COMPONENT_SET", "at least two variants are required");
  let output: ComponentSetNode;
  try { output = figma.combineAsVariants(clones, parent); }
  catch (error) { for (const clone of clones) { try { clone.remove(); } catch {} } fail("FIGMA_API_LIMITATION", `Unable to combine variants: ${error instanceof Error ? error.message : String(error)}`); }
  if (name) output.name = name;
  return output;
}

function variantSchema(set: ComponentSetNode): Record<string, string>[] {
  return componentVariants(set).map((v) => {
    const parsed = Object.fromEntries(v.name.split(",").map((x) => x.trim().split("=").map((y) => y.trim())).filter((x) => x.length === 2));
    return { ...((v as any).variantProperties ?? {}), ...parsed };
  });
}

/** Executes component migration using clone+combine so source nodes remain untouched. */
async function executeComponentMigration(type: string, params: RequestParams): Promise<unknown> {
  const id = typeof params?.componentSetId === "string" ? params.componentSetId : undefined;
  if (!id && type !== "merge_component_sets") fail("INVALID_INPUT", "componentSetId is required");
  const node = id ? await figma.getNodeByIdAsync(id) : null;
  if (id && (!node || node.type !== "COMPONENT_SET")) fail("INVALID_COMPONENT_SET", "componentSetId must reference a COMPONENT_SET node");
  const dryRun = params?.dryRun !== false;

  if (type === "clone_component_set") {
    if (dryRun) return { plan: { sourceId: id, name: params?.name ?? node!.name }, dryRun: true };
    const clone = cloneBeforeMutate(node as ComponentSetNode) as ComponentSetNode;
    if (params?.name && typeof params.name === "string") clone.name = params.name;
    if (params?.parentId && typeof params.parentId === "string") {
      const parent = await figma.getNodeByIdAsync(params.parentId);
      if (!parent || !("appendChild" in parent)) fail("NOT_FOUND", "parentId was not found or unsupported");
      (parent as ChildrenMixin).appendChild(clone);
    }
    return { nodeId: clone.id, sourceId: id, cloned: true, node: serializeNode(clone) };
  }

  if (type === "merge_component_sets") {
    const declaredIds = Array.isArray(params?.componentSetIds)
      ? params.componentSetIds.filter((value): value is string => typeof value === "string")
      : [];
    const sourceId = getString(params?.sourceComponentSetId ?? params?.componentSetId ?? declaredIds[0], "sourceComponentSetId");
    const targetId = getString(params?.targetComponentSetId ?? declaredIds[1], "targetComponentSetId");
    const setIds = [...new Set([sourceId, targetId, ...declaredIds])];
    if (setIds.length < 2) fail("INVALID_INPUT", "merge_component_sets requires at least two distinct component sets");
    const sets: ComponentSetNode[] = [];
    for (const setId of setIds) {
      const candidate = await figma.getNodeByIdAsync(setId);
      if (!candidate || candidate.type !== "COMPONENT_SET") fail("INVALID_COMPONENT_SET", `${setId} must reference a COMPONENT_SET node`);
      sets.push(candidate as ComponentSetNode);
    }
    const plan = {
      sourceComponentSetIds: sets.map((set) => set.id),
      targetComponentSetId: targetId,
      variantCount: sets.reduce((count, set) => count + componentVariants(set).length, 0),
    };
    if (dryRun) return { plan, dryRun: true };
    const parent = sets[0].parent;
    if (!parent || !("appendChild" in parent)) fail("INVALID_TARGET_PARENT", "component sets must have a valid parent");
    const output = combineClones(cloneVariants(sets), parent as BaseNode & ChildrenMixin, typeof params?.name === "string" ? params.name : undefined);
    return {
      merged: true,
      sourceComponentSetIds: sets.map((set) => set.id),
      targetComponentSetId: targetId,
      nodeId: output.id,
      node: serializeNode(output),
    };
  }

  if (type === "split_component_set") {
    const set = node as ComponentSetNode;
    const groups = Array.isArray(params?.groups)
      ? params.groups.filter(isObject)
      : [];
    const legacyIds = Array.isArray(params?.componentIds)
      ? params.componentIds.filter((value): value is string => typeof value === "string")
      : [];
    const requestedGroups = groups.length > 0
      ? groups.map((group, index) => ({
          name: typeof group.name === "string" ? group.name : `Split ${index + 1}`,
          componentIds: Array.isArray(group.componentIds)
            ? group.componentIds.filter((value): value is string => typeof value === "string")
            : [],
        }))
      : [{ name: typeof params?.name === "string" ? params.name : set.name, componentIds: legacyIds }];
    const variants = componentVariants(set);
    const outputsPlan = requestedGroups.map((group) => {
      const selected = variants.filter((variant) => group.componentIds.length === 0 || group.componentIds.includes(variant.id));
      if (selected.length < 2) fail("NO_COMPONENTS_TO_SPLIT", `group '${group.name}' must select at least two matching variants`);
      return { name: group.name, componentIds: selected.map((variant) => variant.id) };
    });
    const plan = { sourceComponentSetId: set.id, groups: outputsPlan };
    if (dryRun) return { plan, dryRun: true };
    const parent = set.parent;
    if (!parent || !("appendChild" in parent)) fail("INVALID_TARGET_PARENT", "component set has no valid parent");
    const outputs: Array<{ nodeId: string; name: string; componentIds: string[]; node: SerializedNode }> = [];
    try {
      for (const group of outputsPlan) {
        const selected = variants.filter((variant) => group.componentIds.includes(variant.id));
        const output = combineClones(selected.map(cloneComponent), parent as BaseNode & ChildrenMixin, group.name);
        outputs.push({ nodeId: output.id, name: output.name, componentIds: group.componentIds, node: serializeNode(output) });
      }
    } catch (error) {
      for (const output of outputs) {
        try { (await figma.getNodeByIdAsync(output.nodeId))?.remove(); } catch {}
      }
      throw error;
    }
    if (params?.deleteSource === true) set.remove();
    return { split: true, sourceComponentSetId: set.id, outputs, nodeId: outputs[0]?.nodeId };
  }

  if (type === "migrate_instances") {
    const targetId = getString(params?.targetComponentSetId, "targetComponentSetId");
    const target = await figma.getNodeByIdAsync(targetId);
    if (!target || target.type !== "COMPONENT_SET") fail("INVALID_COMPONENT_SET", "targetComponentSetId must reference a COMPONENT_SET");
    const variants = componentVariants(target as ComponentSetNode); if (!variants.length) fail("INVALID_COMPONENT_SET", "target component set has no variants");
    const ids = Array.isArray(params?.instanceIds) ? params.instanceIds.filter((x): x is string => typeof x === "string") : [];
    const instances: InstanceNode[] = []; const classifications: InstanceMigrationClassification[] = [];
    const byKey = new Map(variants.map((v) => [v.key, v]));
    for (const instanceId of ids) {
      const raw = await figma.getNodeByIdAsync(instanceId); if (!raw || raw.type !== "INSTANCE") { classifications.push({ instanceId, classification: "unmapped" }); continue; }
      const inst = raw as InstanceNode; instances.push(inst);
      const main = inst.mainComponent;
      const match = variants.find((v) => v.id === main?.id) ?? variants.find((v) => JSON.stringify(v.variantProperties ?? null) === JSON.stringify(readVariantProperties(inst) ?? null)) ?? (main?.key ? byKey.get(main.key) : undefined);
      if (!match) classifications.push({ instanceId, classification: "unmapped" }); else classifications.push({ instanceId, classification: main?.id === match.id ? "exact" : "variant", targetComponentId: match.id });
    }
    const unmapped = classifications.filter((x) => x.classification === "unmapped");
    if (unmapped.length) fail("INSTANCE_MIGRATION_CONFLICT", "one or more instances cannot be classified", { classifications });
    if (dryRun) return { dryRun: true, targetComponentSetId: targetId, classifications };
    const changed: Array<{ instance: InstanceNode; from: ComponentNode; to: ComponentNode }> = [];
    try {
      for (const c of classifications) { if (!c.targetComponentId) continue; const inst = instances.find((i) => i.id === c.instanceId)!; const from = inst.mainComponent; const to = variants.find((v) => v.id === c.targetComponentId)!; if (from && from.id !== to.id) { inst.swapComponent(to); changed.push({ instance: inst, from, to }); } }
    } catch (error) {
      for (const item of changed) { try { item.instance.swapComponent(item.from); } catch {} }
      fail("INSTANCE_MIGRATION_FAILED", `instance migration failed: ${error instanceof Error ? error.message : String(error)}`, { compensated: true });
    }
    return { migrated: true, targetComponentSetId: targetId, classifications, remapped: changed.map((x) => ({ instanceId: x.instance.id, targetComponentId: x.to.id })) };
  }

  const set = node as ComponentSetNode;
  const snapshot = componentSnapshot(set);
  if (type === "reconcile_component_set") {
    const expected = (params?.expected && typeof params.expected === "object" ? params.expected : {}) as any;
    const expectedName = typeof expected.name === "string" ? expected.name : set.name;
    const expectedVariants = Array.isArray(expected.variants) ? expected.variants : undefined;
    const actualVariants = variantSchema(set);
    const schemaMatches = !expectedVariants || JSON.stringify(expectedVariants) === JSON.stringify(actualVariants);
    const verification = { ok: expectedName === set.name && schemaMatches, mismatched: expectedName !== set.name || !schemaMatches ? [set.id] : [], missing: [] };
    if (verification.ok || dryRun) return { verification, dryRun: dryRun || verification.ok, noOp: verification.ok };
    params = { ...params, expected: { ...expected, name: expectedName } };
  }
  const desired = (params?.expected && typeof params.expected === "object" ? params.expected : snapshot) as ComponentSnapshot;
  const plan = type === "repair_component_set" ? repairComponentSet(snapshot, desired) : migrateComponentSet(snapshot, desired, []);
  if (dryRun) return { plan, dryRun: true };
  const parent = set.parent; if (!parent || !("appendChild" in parent)) fail("INVALID_TARGET_PARENT", "component set has no valid parent");
  const clones = cloneVariants([set]);
  if (desired.name && desired.name !== set.name) { /* name is applied to rebuilt set below */ }
  const output = combineClones(clones, parent as BaseNode & ChildrenMixin, desired.name ?? set.name);
  try {
    const dimensions = applyDimensionOperations(output, params?.dimensions, params?.failOnUnsupported !== false);
    return { repaired: type === "repair_component_set", migrated: type !== "repair_component_set", sourceId: set.id, nodeId: output.id, node: serializeNode(output), dimensions, noOp: false };
  } catch (error) {
    try { output.remove(); } catch {}
    throw error;
  }
}

/** Dispatches a single write tool invocation to its concrete implementation. */
async function executeWrite(type: string, nodeIds: string[] | undefined, params: RequestParams): Promise<unknown> {
  const merged: Record<string, unknown> = {
    ...(params ?? {}),
    nodeId: nodeIds?.[0] ?? params?.nodeId,
  };
  switch (type) {
    case "migrate_component_set":
    case "repair_component_set":
    case "clone_component_set":
    case "merge_component_sets":
    case "split_component_set":
    case "migrate_instances":
    case "reconcile_component_set":
      return executeComponentMigration(type, params);
    case "create_frame":
      return createFrame(params);
    case "create_component":
      return createComponent(params);
    case "create_instance":
      return createInstance(params);
    case "swap_instance_component":
      return swapInstanceComponent(params);
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
    case "bind_component_properties":
      return bindComponentProperties(params);
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
      return mutateNode(merged, (node) => {
        applyLayoutMode(node, merged.layoutMode, merged.primaryAxisSizingMode);
        applyLayoutProperties(node, merged);
      });
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

const CREATION_WRITE_TYPES = new Set(["create_frame", "create_component", "create_text", "create_rectangle", "create_instance"]);

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
  const createdNodeIds: string[] = [];
  const failureMode = params?.failureMode === "atomic" ? "atomic" : "best-effort";
  const compact = params?.compact === true;

  for (let index = 0; index < params.operations.length; index++) {
    try {
      const operation = params.operations[index] as BatchOperation;
      const resolvedNodeId = resolveRef(operation.nodeId, context);
      const resolvedNodeIds = operation.nodeIds?.map((id) => resolveRef(id, context) ?? id);
      const resolvedParams = resolveParams(operation.params, context);
      const effectiveParams = compact ? { ...(resolvedParams ?? {}), compact: true } : resolvedParams;
      validateWriteToolParams(
        operation.type,
        resolvedNodeIds ?? (resolvedNodeId ? [resolvedNodeId] : undefined),
        effectiveParams
      );
      const result = await executeWrite(
        operation.type,
        resolvedNodeIds ?? (resolvedNodeId ? [resolvedNodeId] : undefined),
        effectiveParams
      );
      results.push(result);

      if (isObject(result) && typeof result.nodeId === "string" && CREATION_WRITE_TYPES.has(operation.type)) createdNodeIds.push(result.nodeId);

      if (isObject(result) && typeof result.nodeId === "string" && operation.ref) {
        context.refs.set(operation.ref, result.nodeId);
      }
    } catch (error) {
      const removedNodeIds: string[] = [];
      const unrevertedNodeIds: string[] = [];
      if (failureMode === "atomic") {
        for (const id of [...createdNodeIds].reverse()) {
          try {
            const node = await figma.getNodeByIdAsync(id);
            if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
              node.remove();
              removedNodeIds.push(id);
            } else if (node) unrevertedNodeIds.push(id);
          } catch {
            unrevertedNodeIds.push(id);
          }
        }
      }
      return {
        executedCount: results.length,
        ...(compact ? { createdNodeIds } : {}),
        createdRefs: Object.fromEntries(context.refs),
        failedStepIndex: index,
        failure: toMutationError(error),
        rollback: { attempted: failureMode === "atomic", completed: unrevertedNodeIds.length === 0, removedNodeIds, unrevertedNodeIds },
        ...(compact ? {} : { results }),
      };
    }
  }

  return {
    executedCount: results.length,
    ...(compact ? { createdNodeIds } : {}),
    createdRefs: Object.fromEntries(context.refs),
    ...(compact ? {} : { results }),
  };
}

/** Serializes plugin-side write failures into the transport error shape. */
export function serializeWriteError(error: unknown): MutationError {
  return toMutationError(error);
}
