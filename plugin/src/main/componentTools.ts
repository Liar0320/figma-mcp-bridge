export type ComponentDiagnosticSeverity = "warning" | "error";

export type ComponentDiagnostic = {
  code: string;
  severity: ComponentDiagnosticSeverity;
  path?: string;
  nodeId?: string;
  message: string;
  suggestion?: string;
};

type NormalizedDimension = { name: string; values: string[] };
type NormalizedProperty = {
  name: string;
  type: string;
  defaultValue?: string | boolean;
  variantOptions?: string[];
};
type NormalizedVariant = {
  id: string;
  name: string;
  tuple: Record<string, string>;
  tupleKey: string;
};

export type NormalizedComponentSet = {
  version: 1;
  nodeId: string;
  name: string;
  type: "COMPONENT_SET";
  dimensions: NormalizedDimension[];
  properties: NormalizedProperty[];
  variants: NormalizedVariant[];
  diagnostics: ComponentDiagnostic[];
  healthy: boolean;
};

export type TargetSchema = {
  name?: string;
  dimensions?: Array<{ name: string; values: string[] }>;
  properties?: Array<{ name: string; type: string; defaultValue?: string | boolean; variantOptions?: string[] }>;
  requiredBindings?: Array<{ property: string; nodeName?: string; type?: string }>;
  variants?: Array<Record<string, string>>;
  visualTemplate?: Record<string, unknown>;
  layoutTemplate?: Record<string, unknown>;
};
export type NormalizedTarget = { name?: string; dimensions: NormalizedDimension[]; properties: NormalizedProperty[]; variants: string[][] };
export type ComponentSetVerification = { version: 1; nodeId: string; healthy: boolean; checks: unknown[]; normalized: NormalizedComponentSet; diagnostics: ComponentDiagnostic[] };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const stableStrings = (values: Iterable<unknown>): string[] =>
  [...new Set([...values].filter((value): value is string => typeof value === "string"))].sort((a, b) =>
    a.localeCompare(b)
  );

const diagnosticSort = (a: ComponentDiagnostic, b: ComponentDiagnostic): number =>
  [a.severity, a.code, a.path ?? "", a.nodeId ?? "", a.message].join("\u0000").localeCompare(
    [b.severity, b.code, b.path ?? "", b.nodeId ?? "", b.message].join("\u0000")
  );

const tupleKey = (tuple: Record<string, string>): string =>
  Object.keys(tuple)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `${name}=${tuple[name]}`)
    .join(",");

const parseVariantName = (name: string): Record<string, string> => {
  const tuple: Record<string, string> = {};
  for (const part of name.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) tuple[key] = value;
  }
  return tuple;
};

const readPlain = (node: unknown, field: string): unknown => {
  try {
    return (node as Record<string, unknown>)[field];
  } catch {
    throw new Error(`Unable to read ${field}`);
  }
};

const normalizeProperties = (
  raw: unknown,
  diagnostics: ComponentDiagnostic[],
  nodeId: string
): NormalizedProperty[] => {
  const properties: NormalizedProperty[] = [];
  for (const [rawName, rawDefinition] of Object.entries(asRecord(raw))) {
    const definition = asRecord(rawDefinition);
    const name = rawName.split("#", 1)[0].trim();
    const type = typeof definition.type === "string" ? definition.type : "UNKNOWN";
    if (!name) {
      diagnostics.push({
        code: "INVALID_PROPERTY_NAME",
        severity: "error",
        path: `properties.${rawName}`,
        nodeId,
        message: "Component property name must not be empty.",
        suggestion: "Rename the property to a non-empty stable name.",
      });
      continue;
    }
    if (!["BOOLEAN", "TEXT", "INSTANCE_SWAP", "VARIANT"].includes(type)) {
      diagnostics.push({
        code: "UNSUPPORTED_PROPERTY_TYPE",
        severity: "error",
        path: `properties.${name}.type`,
        nodeId,
        message: `Unsupported component property type ${type}.`,
        suggestion: "Use BOOLEAN, TEXT, INSTANCE_SWAP, or VARIANT.",
      });
    }
    const item: NormalizedProperty = { name, type };
    if (typeof definition.defaultValue === "string" || typeof definition.defaultValue === "boolean") {
      item.defaultValue = definition.defaultValue;
    }
    if (Array.isArray(definition.variantOptions)) item.variantOptions = stableStrings(definition.variantOptions);
    properties.push(item);
  }
  properties.sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set<string>();
  for (const property of properties) {
    if (names.has(property.name)) {
      diagnostics.push({
        code: "DUPLICATE_PROPERTY_NAME",
        severity: "error",
        path: `properties.${property.name}`,
        nodeId,
        message: `Duplicate component property name ${property.name}.`,
        suggestion: "Keep one native property definition per name.",
      });
    }
    names.add(property.name);
  }
  return properties;
};

export const normalizeComponentSetNode = (componentSet: unknown): NormalizedComponentSet => {
  const diagnostics: ComponentDiagnostic[] = [];
  const node = asRecord(componentSet);
  const nodeId = typeof node.id === "string" ? node.id : "";
  let name = "";
  try {
    name = String(readPlain(componentSet, "name") ?? "");
  } catch (error) {
    diagnostics.push({ code: "SERIALIZATION_ERROR", severity: "error", nodeId, message: String(error) });
  }
  let rawDefinitions: unknown = {};
  try {
    rawDefinitions = readPlain(componentSet, "componentPropertyDefinitions") ?? {};
  } catch (error) {
    diagnostics.push({
      code: "SERIALIZATION_ERROR",
      severity: "error",
      path: "componentPropertyDefinitions",
      nodeId,
      message: String(error),
      suggestion: "Repair the component set metadata before planning writes.",
    });
  }
  const properties = normalizeProperties(rawDefinitions, diagnostics, nodeId);
  const variantDefinitionNames = properties.filter((property) => property.type === "VARIANT").map((property) => property.name);
  const children = Array.isArray(node.children) ? node.children : [];
  const variants: NormalizedVariant[] = [];
  for (const child of children) {
    const childRecord = asRecord(child);
    const childId = typeof childRecord.id === "string" ? childRecord.id : "";
    const childType = childRecord.type;
    if (childType !== "COMPONENT") {
      diagnostics.push({
        code: "ORPHANED_VARIANT",
        severity: "error",
        path: "children",
        nodeId: childId || nodeId,
        message: "Component set contains a non-COMPONENT child.",
        suggestion: "Move non-component children out of the component set.",
      });
      continue;
    }
    let childName = "";
    let rawTuple: unknown;
    try {
      childName = String(readPlain(child, "name") ?? "");
      rawTuple = readPlain(child, "variantProperties");
    } catch (error) {
      diagnostics.push({ code: "SERIALIZATION_ERROR", severity: "error", nodeId: childId, message: String(error) });
      continue;
    }
    const tupleSource = asRecord(rawTuple);
    const tuple: Record<string, string> = {};
    for (const [key, value] of Object.entries(tupleSource)) {
      if (typeof value === "string" && key.trim() && value.trim()) tuple[key.trim()] = value.trim();
    }
    if (Object.keys(tuple).length === 0) Object.assign(tuple, parseVariantName(childName));
    const key = tupleKey(tuple);
    if (!key) {
      diagnostics.push({
        code: "MISSING_VARIANT_TUPLE",
        severity: "error",
        path: `variants.${childId}`,
        nodeId: childId,
        message: "Variant has no readable dimension tuple.",
        suggestion: "Set native variant properties on the component.",
      });
    }
    variants.push({ id: childId, name: childName, tuple, tupleKey: key });
  }
  const dimensions = new Map<string, Set<string>>();
  for (const name of variantDefinitionNames) dimensions.set(name, new Set());
  for (const variant of variants) {
    for (const [dimension, value] of Object.entries(variant.tuple)) {
      if (!dimensions.has(dimension)) dimensions.set(dimension, new Set());
      dimensions.get(dimension)!.add(value);
    }
  }
  for (const [dimension, values] of dimensions) {
    if (values.size === 0) {
      diagnostics.push({
        code: "MISSING_DIMENSION_VALUES",
        severity: "error",
        path: `dimensions.${dimension}`,
        nodeId,
        message: `Dimension ${dimension} has no observed values.`,
        suggestion: "Add at least one variant value or remove the dimension.",
      });
    }
  }
  const dimensionNames = [...dimensions.keys()].sort((a, b) => a.localeCompare(b));
  for (const variant of variants) {
    for (const dimension of dimensionNames) {
      if (!(dimension in variant.tuple)) {
        diagnostics.push({
          code: "MISSING_VARIANT_DIMENSION",
          severity: "error",
          path: `variants.${variant.id}.${dimension}`,
          nodeId: variant.id,
          message: `Variant is missing dimension ${dimension}.`,
          suggestion: "Assign every declared dimension to every variant.",
        });
      }
    }
  }
  const seenTuples = new Map<string, string>();
  for (const variant of variants) {
    const prior = seenTuples.get(variant.tupleKey);
    if (prior) {
      diagnostics.push({
        code: "DUPLICATE_VARIANT_TUPLE",
        severity: "error",
        path: `variants.${variant.id}`,
        nodeId: variant.id,
        message: `Variant tuple duplicates ${prior}: ${variant.tupleKey}.`,
        suggestion: "Delete or remap one variant so each tuple is unique.",
      });
    } else if (variant.tupleKey) seenTuples.set(variant.tupleKey, variant.id);
  }
  const normalizedDimensions = dimensionNames.map((dimension) => ({
    name: dimension,
    values: [...(dimensions.get(dimension) ?? [])].sort((a, b) => a.localeCompare(b)),
  }));
  variants.sort((a, b) => a.tupleKey.localeCompare(b.tupleKey) || a.id.localeCompare(b.id));
  diagnostics.sort(diagnosticSort);
  return {
    version: 1,
    nodeId,
    name,
    type: "COMPONENT_SET",
    dimensions: normalizedDimensions,
    properties,
    variants,
    diagnostics,
    healthy: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
};

const diagnostic = (code: string, path: string, message: string, suggestion: string): ComponentDiagnostic => ({
  code,
  severity: "error",
  path,
  message,
  suggestion,
});

export const validateTargetSchema = (target: TargetSchema): {
  valid: boolean;
  normalized: NormalizedTarget;
  diagnostics: ComponentDiagnostic[];
  expectedVariantCount: number;
} => {
  const diagnostics: ComponentDiagnostic[] = [];
  const dimensionsInput = Array.isArray(target?.dimensions) ? target.dimensions : [];
  const dimensions: NormalizedDimension[] = [];
  const dimensionNames = new Set<string>();
  for (let index = 0; index < dimensionsInput.length; index += 1) {
    const item = dimensionsInput[index];
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const values = Array.isArray(item?.values) ? stableStrings(item.values.map((value) => (typeof value === "string" ? value.trim() : value))) : [];
    if (!name) diagnostics.push(diagnostic("INVALID_DIMENSION_NAME", `dimensions.${index}.name`, "Dimension name must not be empty.", "Provide a stable non-empty dimension name."));
    if (dimensionNames.has(name)) diagnostics.push(diagnostic("DUPLICATE_DIMENSION_NAME", `dimensions.${index}.name`, `Duplicate dimension name ${name}.`, "Use each dimension name once."));
    if (values.length === 0) diagnostics.push(diagnostic("EMPTY_DIMENSION_VALUES", `dimensions.${index}.values`, `Dimension ${name || index} must define at least one value.`, "Add one or more non-empty values."));
    dimensionNames.add(name);
    dimensions.push({ name, values });
  }
  dimensions.sort((a, b) => a.name.localeCompare(b.name));
  const targetProperties: Record<string, unknown> = {};
  for (const property of target?.properties ?? []) {
    targetProperties[property.name] = property;
  }
  const properties = normalizeProperties(targetProperties, diagnostics, "");
  const propertyNames = new Set(properties.map((property) => property.name));
  for (const [index, binding] of (target?.requiredBindings ?? []).entries()) {
    if (!binding || typeof binding.property !== "string" || !propertyNames.has(binding.property)) {
      diagnostics.push(diagnostic("UNKNOWN_REQUIRED_BINDING", `requiredBindings.${index}`, `Required binding references unknown property ${String(binding?.property ?? "")}.`, "Declare the property before requiring its binding."));
    }
  }
  const explicitTuples = Array.isArray(target?.variants) ? target.variants : [];
  const tuples: string[][] = explicitTuples.length > 0
    ? explicitTuples.map((tuple) => dimensions.map((dimension) => String(tuple?.[dimension.name] ?? "")))
    : (() => {
        let result: string[][] = [[]];
        for (const dimension of dimensions) result = result.flatMap((prefix) => dimension.values.map((value) => [...prefix, value]));
        return result;
      })();
  const tupleKeys = new Set<string>();
  for (const [index, tuple] of tuples.entries()) {
    const key = dimensions.map((dimension, dimensionIndex) => `${dimension.name}=${tuple[dimensionIndex] ?? ""}`).join(",");
    if (tuple.some((value) => !value)) diagnostics.push(diagnostic("INVALID_VARIANT_TUPLE", `variants.${index}`, "Variant tuple is missing a declared dimension value.", "Provide one allowed value for every dimension."));
    for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
      if (!dimensions[dimensionIndex].values.includes(tuple[dimensionIndex])) diagnostics.push(diagnostic("UNKNOWN_VARIANT_VALUE", `variants.${index}.${dimensions[dimensionIndex].name}`, `Value ${tuple[dimensionIndex]} is not declared for ${dimensions[dimensionIndex].name}.`, "Use a value from the dimension declaration."));
    }
    if (tupleKeys.has(key)) diagnostics.push(diagnostic("DUPLICATE_VARIANT_TUPLE", `variants.${index}`, `Duplicate target variant tuple ${key}.`, "Remove duplicate tuples from the target schema."));
    tupleKeys.add(key);
  }
  diagnostics.sort(diagnosticSort);
  return {
    valid: diagnostics.length === 0,
    normalized: { name: typeof target?.name === "string" ? target.name.trim() : undefined, dimensions, properties, variants: tuples.sort((a, b) => a.join("\u0000").localeCompare(b.join("\u0000"))) },
    diagnostics,
    expectedVariantCount: tuples.length,
  };
};

export const inspectComponentSet = async (nodeId: string): Promise<NormalizedComponentSet> => {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    return {
      version: 1,
      nodeId,
      name: "",
      type: "COMPONENT_SET",
      dimensions: [],
      properties: [],
      variants: [],
      diagnostics: [{ code: "NODE_NOT_FOUND", severity: "error", nodeId, message: `Component set not found: ${nodeId}`, suggestion: "Provide an existing COMPONENT_SET node ID." }],
      healthy: false,
    };
  }
  if (node.type !== "COMPONENT_SET") {
    return {
      version: 1,
      nodeId,
      name: node.name,
      type: "COMPONENT_SET",
      dimensions: [],
      properties: [],
      variants: [],
      diagnostics: [{ code: "INVALID_NODE_TYPE", severity: "error", nodeId, message: `Expected COMPONENT_SET, received ${node.type}.`, suggestion: "Provide a COMPONENT_SET node ID." }],
      healthy: false,
    };
  }
  return normalizeComponentSetNode(node);
};

export const validateComponentPlan = (target: TargetSchema) => validateTargetSchema(target);

export const planComponentMigration = async (nodeId: string, target: TargetSchema) => {
  const current = await inspectComponentSet(nodeId);
  const validation = validateTargetSchema(target);
  const currentByTuple = new Map(current.variants.map((variant) => [variant.tupleKey, variant]));
  const targetTuples = validation.normalized.variants.map((tuple) =>
    validation.normalized.dimensions.map((dimension, index) => `${dimension.name}=${tuple[index]}`).join(",")
  );
  const targetSet = new Set(targetTuples);
  const operations: Array<Record<string, unknown>> = [];
  for (const tuple of targetTuples) if (!currentByTuple.has(tuple)) operations.push({ type: "create_variant", tuple });
  for (const variant of current.variants) if (!targetSet.has(variant.tupleKey)) operations.push({ type: "delete_variant", nodeId: variant.id, tuple: variant.tupleKey });
  if (validation.normalized.name && validation.normalized.name !== current.name) operations.push({ type: "rename_component_set", nodeId, name: validation.normalized.name });
  operations.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    version: 1,
    dryRun: true,
    nodeId,
    current,
    target: validation.normalized,
    diagnostics: [...current.diagnostics, ...validation.diagnostics].sort(diagnosticSort),
    valid: current.healthy && validation.valid,
    operations,
    expectedVariantCount: validation.expectedVariantCount,
  };
};

export const verifyComponentSet = async (nodeId: string): Promise<ComponentSetVerification> => {
  const inspected = await inspectComponentSet(nodeId);
  const checks = [
    { name: "schema", passed: inspected.dimensions.every((dimension) => dimension.name && dimension.values.length > 0), diagnostics: inspected.diagnostics.filter((item) => item.code.includes("DIMENSION") || item.code.includes("PROPERTY")) },
    { name: "variant-count", passed: inspected.variants.length > 0 && new Set(inspected.variants.map((variant) => variant.tupleKey)).size === inspected.variants.length, actual: inspected.variants.length, diagnostics: inspected.diagnostics.filter((item) => item.code === "DUPLICATE_VARIANT_TUPLE") },
    { name: "properties", passed: inspected.properties.every((property) => property.name && property.type !== "UNKNOWN"), diagnostics: inspected.diagnostics.filter((item) => item.code.includes("PROPERTY")) },
    { name: "serialization-health", passed: inspected.healthy, diagnostics: inspected.diagnostics.filter((item) => item.code === "SERIALIZATION_ERROR" || item.code === "ORPHANED_VARIANT") },
  ];
  return { version: 1, nodeId, healthy: inspected.healthy && checks.every((check) => check.passed), checks, normalized: inspected, diagnostics: inspected.diagnostics };
};

export type VisualStylePlan = {
  source: "built-in" | "template";
  kind: "Button" | "custom";
  variants: Array<{
    tuple: string[];
    fill?: string;
    stroke?: string;
    strokeWeight?: number;
    textColor?: string;
    opacity?: number;
    width?: number;
    height?: number;
    paddingX?: number;
    paddingY?: number;
    radius?: number;
    gap?: number;
    fontFamily?: string;
    fontStyle?: string;
    fontSize?: number;
    lineHeight?: number;
    iconSize?: number;
    iconVisible?: boolean;
    iconRotation?: number;
    layoutMode?: "HORIZONTAL" | "VERTICAL";
    primaryAxisAlignItems?: string;
    counterAxisAlignItems?: string;
  }>;
};

export type VariantGridPlacement = {
  tuple: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  column: number;
};

export type CreateComponentSetResult = {
  version: 1;
  dryRun: boolean;
  componentSetId?: string;
  variantCount: number;
  expectedVariantCount: number;
  target: NormalizedTarget;
  propertySummary: Array<{ name: string; type: string; bindings: number }>;
  visualPlan?: VisualStylePlan;
  warnings: ComponentDiagnostic[];
  verification?: ComponentSetVerification;
  rollback?: { attempted: boolean; completed: boolean; removedNodeIds: string[]; unrevertedNodeIds?: string[] };
  valid: boolean;
};

const BUTTON_DEFAULTS = {
  stateStyles: {
    Default: { color: "#3D6DFF" },
    Hover: { color: "#6691FF" },
    Active: { color: "#294FD9" },
    Disabled: { color: "#3D6DFF", opacity: 0.3 },
  },
  typeStyles: {
    Primary: { fill: "{state}", textColor: "#FFFFFF" },
    Ghost: { stroke: "{state}", textColor: "{state}", strokeWeight: 1 },
    Text: { textColor: "{state}" },
  },
  sizeStyles: {
    Small: { height: 32, paddingX: 16, paddingY: 6, radius: 20, fontSize: 14, lineHeight: 20 },
    Medium: { height: 44, paddingX: 22, paddingY: 10, radius: 1000, fontSize: 16, lineHeight: 24 },
    Large: { height: 52, paddingX: 28, paddingY: 12, radius: 32, fontSize: 20, lineHeight: 28 },
  },
  iconStyles: {
    None: { iconVisible: false, iconSize: 18, iconRotation: 0 },
    Right: { iconVisible: true, iconSize: 18, iconRotation: 0 },
    Up: { iconVisible: true, iconSize: 18, iconRotation: 90 },
  },
  typography: { fontFamily: "Inter", fontStyle: "Semi Bold" },
} as const;

const recordValue = (value: unknown, key: string): Record<string, unknown> => asRecord(asRecord(value)[key]);
const stringValue = (value: unknown, key: string): string | undefined => {
  const result = asRecord(value)[key];
  return typeof result === "string" ? result : undefined;
};
const numberValue = (value: unknown, key: string): number | undefined => {
  const result = asRecord(value)[key];
  return typeof result === "number" && Number.isFinite(result) ? result : undefined;
};
const boolValue = (value: unknown, key: string): boolean | undefined => {
  const result = asRecord(value)[key];
  return typeof result === "boolean" ? result : undefined;
};

const estimateTextWidth = (text: string, fontSize: number): number => Math.max(1, Math.ceil([...text].length * fontSize * 0.56));

/** Stable row-major positions; each column/row reserves its widest/tallest variant. */
export const planVariantGrid = (
  variants: VisualStylePlan["variants"],
  options: { originX?: number; originY?: number; gapX?: number; gapY?: number; columns?: number } = {}
): VariantGridPlacement[] => {
  if (!variants.length) return [];
  const columns = Math.max(1, Math.min(options.columns ?? Math.ceil(Math.sqrt(variants.length)), variants.length));
  const gapX = options.gapX ?? 48;
  const gapY = options.gapY ?? 32;
  const widths = variants.map((item) => item.width ?? 100);
  const heights = variants.map((item) => item.height ?? 100);
  const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...widths.filter((_, index) => index % columns === column)));
  const rowHeights = Array.from({ length: Math.ceil(variants.length / columns) }, (_, row) => Math.max(...heights.slice(row * columns, (row + 1) * columns)));
  const xs = columnWidths.map((_, index) => (options.originX ?? 0) + columnWidths.slice(0, index).reduce((sum, width) => sum + width + gapX, 0));
  const ys = rowHeights.map((_, index) => (options.originY ?? 0) + rowHeights.slice(0, index).reduce((sum, height) => sum + height + gapY, 0));
  return variants.map((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return { tuple: item.tuple, x: xs[column], y: ys[row], width: widths[index], height: heights[index], row, column };
  });
};

/** A right-pointing arrow drawn within an 18×18 vector viewport. */
export const arrowIconGeometry = (size = 18): { width: number; height: number; path: string } => {
  const scale = size / 18;
  const at = (value: number) => Number((value * scale).toFixed(3));
  return { width: size, height: size, path: `M ${at(3)} ${at(9)} L ${at(14)} ${at(9)} M ${at(9)} ${at(4)} L ${at(14)} ${at(9)} L ${at(9)} ${at(14)}` };
};

/** Returns a stable, serializable style plan without reading or mutating Figma. */
export const planComponentVisuals = (target: TargetSchema, normalized: NormalizedTarget): VisualStylePlan | undefined => {
  const isButton = target.name?.trim() === "Button";
  const template = asRecord(target.visualTemplate);
  if (!isButton && Object.keys(template).length === 0) return undefined;
  const source = Object.keys(template).length === 0 ? "built-in" : "template";
  const kind = isButton ? "Button" : "custom";
  const stateStyles = isButton ? { ...BUTTON_DEFAULTS.stateStyles, ...asRecord(template.stateStyles) } : asRecord(template.stateStyles);
  const typeStyles = isButton ? { ...BUTTON_DEFAULTS.typeStyles, ...asRecord(template.typeStyles) } : asRecord(template.typeStyles);
  const sizeStyles = isButton ? { ...BUTTON_DEFAULTS.sizeStyles, ...asRecord(template.sizeStyles) } : asRecord(template.sizeStyles);
  const iconStyles = isButton ? { ...BUTTON_DEFAULTS.iconStyles, ...asRecord(template.iconStyles) } : asRecord(template.iconStyles);
  const typography = isButton ? { ...BUTTON_DEFAULTS.typography, ...asRecord(template.typography) } : asRecord(template.typography);
  const labelDefault = normalized.properties.find((property) => property.name === "Label" && property.type === "TEXT")?.defaultValue;
  const labelText = typeof labelDefault === "string" ? labelDefault : "";
  const variants = normalized.variants.map((tuple) => {
    const byName: Record<string, string> = {};
    normalized.dimensions.forEach((dimension, index) => { byName[dimension.name] = tuple[index]; });
    const state = recordValue(stateStyles, byName.State);
    const type = recordValue(typeStyles, byName.Type);
    const size = recordValue(sizeStyles, byName.Size);
    const icon = recordValue(iconStyles, byName.Icon);
    const stateColor = stringValue(state, "color") ?? stringValue(state, "textColor");
    const resolveColor = (value: string | undefined): string | undefined => value === "{state}" ? stateColor : value;
    const fill = resolveColor(stringValue(type, "fill") ?? stringValue(state, "fill"));
    const stroke = resolveColor(stringValue(type, "stroke") ?? stringValue(state, "stroke"));
    const textColor = resolveColor(stringValue(type, "textColor") ?? stringValue(state, "textColor") ?? ((byName.Type === "Ghost" || byName.Type === "Text") ? stateColor : undefined));
    const strokeWeight = numberValue(type, "strokeWeight") ?? numberValue(state, "strokeWeight");
    const gap = numberValue(size, "gap") ?? numberValue(template, "gap") ?? (isButton ? 8 : undefined);
    const fontSize = numberValue(typography, "fontSize") ?? numberValue(size, "fontSize");
    const lineHeight = numberValue(typography, "lineHeight") ?? numberValue(size, "lineHeight");
    const iconVisible = boolValue(icon, "iconVisible");
    const iconSize = numberValue(icon, "iconSize");
    const paddingX = numberValue(size, "paddingX");
    const width = numberValue(size, "width") ?? numberValue(template, "width") ?? (
      paddingX !== undefined && fontSize !== undefined
        ? paddingX * 2 + estimateTextWidth(labelText, fontSize) + (iconVisible && iconSize !== undefined ? iconSize + (gap ?? 0) : 0)
        : undefined
    );
    return {
      tuple,
      ...(fill ? { fill } : {}),
      ...(stroke ? { stroke } : {}),
      ...(strokeWeight !== undefined ? { strokeWeight } : {}),
      ...(textColor ? { textColor } : {}),
      ...(numberValue(state, "opacity") !== undefined ? { opacity: numberValue(state, "opacity") } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(numberValue(size, "height") !== undefined ? { height: numberValue(size, "height") } : {}),
      ...(paddingX !== undefined ? { paddingX } : {}),
      ...(numberValue(size, "paddingY") !== undefined ? { paddingY: numberValue(size, "paddingY") } : {}),
      ...(numberValue(size, "radius") !== undefined ? { radius: numberValue(size, "radius") } : {}),
      ...(gap !== undefined ? { gap } : {}),
      ...(stringValue(typography, "fontFamily") ? { fontFamily: stringValue(typography, "fontFamily") } : {}),
      ...(stringValue(typography, "fontStyle") ? { fontStyle: stringValue(typography, "fontStyle") } : {}),
      ...(fontSize !== undefined ? { fontSize } : {}),
      ...(lineHeight !== undefined ? { lineHeight } : {}),
      ...(iconVisible !== undefined ? { iconVisible } : {}),
      ...(iconSize !== undefined ? { iconSize } : {}),
      ...(numberValue(icon, "iconRotation") !== undefined ? { iconRotation: numberValue(icon, "iconRotation") } : {}),
      layoutMode: (stringValue(template, "layoutMode") as "HORIZONTAL" | "VERTICAL" | undefined) ?? "HORIZONTAL",
      primaryAxisAlignItems: stringValue(template, "primaryAxisAlignItems") ?? "CENTER",
      counterAxisAlignItems: stringValue(template, "counterAxisAlignItems") ?? "CENTER",
    };
  });
  return { source, kind, variants };
};

const hexColor = (value: string): RGB | undefined => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const number = Number.parseInt(match[1], 16);
  return { r: ((number >> 16) & 255) / 255, g: ((number >> 8) & 255) / 255, b: (number & 255) / 255 };
};

const solidPaint = (value: string): Paint | undefined => {
  const color = hexColor(value);
  return color ? { type: "SOLID", color } : undefined;
};

const applyVisualVariant = (component: ComponentNode, label: TextNode | undefined, icon: VectorNode | undefined, style: VisualStylePlan["variants"][number]): void => {
  const frame = component as ComponentNode & Record<string, any>;
  if (style.fill) { const paint = solidPaint(style.fill); if (paint) frame.fills = [paint]; }
  else if (style.fill === undefined && style.stroke) frame.fills = [];
  if (style.stroke) { const paint = solidPaint(style.stroke); if (paint) { frame.strokes = [paint]; frame.strokeWeight = style.strokeWeight ?? 1; } }
  else if (style.stroke === undefined) frame.strokes = [];
  if (style.opacity !== undefined) frame.opacity = style.opacity;
  frame.layoutMode = (style.layoutMode ?? "HORIZONTAL") as ComponentNode["layoutMode"];
  frame.primaryAxisAlignItems = (style.primaryAxisAlignItems ?? "CENTER") as ComponentNode["primaryAxisAlignItems"];
  frame.counterAxisAlignItems = (style.counterAxisAlignItems ?? "CENTER") as ComponentNode["counterAxisAlignItems"];
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  if (style.gap !== undefined) frame.itemSpacing = style.gap;
  if (style.paddingX !== undefined) { frame.paddingLeft = style.paddingX; frame.paddingRight = style.paddingX; }
  if (style.paddingY !== undefined) { frame.paddingTop = style.paddingY; frame.paddingBottom = style.paddingY; }
  if (style.width !== undefined || style.height !== undefined) frame.resize(style.width ?? frame.width, style.height ?? frame.height);
  if (style.radius !== undefined) frame.cornerRadius = style.radius;
  if (label) {
    if (style.textColor) { const paint = solidPaint(style.textColor); if (paint) label.fills = [paint]; }
    if (style.fontFamily && style.fontStyle) label.fontName = { family: style.fontFamily, style: style.fontStyle };
    if (style.fontSize !== undefined) label.fontSize = style.fontSize;
    if (style.lineHeight !== undefined) label.lineHeight = { unit: "PIXELS", value: style.lineHeight };
    label.textAlignHorizontal = "CENTER";
  }
  if (icon) {
    if (style.iconSize !== undefined) icon.resize(style.iconSize, style.iconSize);
    if (style.textColor) { const paint = solidPaint(style.textColor); if (paint) icon.strokes = [paint]; }
    icon.strokeWeight = 1.5;
    icon.visible = style.iconVisible !== false;
    if (style.iconRotation !== undefined) icon.rotation = style.iconRotation;
  }
};

const createDiagnostic = (code: string, message: string, path?: string): ComponentDiagnostic => ({
  code,
  severity: "error",
  ...(path ? { path } : {}),
  message,
});

const visualInvariantDiagnostics = (componentSet: ComponentSetNode, styles: VisualStylePlan["variants"]): ComponentDiagnostic[] => {
  const diagnostics: ComponentDiagnostic[] = [];
  const variants = componentSet.children.filter((child): child is ComponentNode => child.type === "COMPONENT");
  const styleByTuple: Record<string, VisualStylePlan["variants"][number]> = {};
  for (const style of styles) styleByTuple[style.tuple.join("\u0000")] = style;
  const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const variant of variants) {
    if (!Number.isFinite(variant.x) || !Number.isFinite(variant.y) || variant.width <= 0 || variant.height <= 0) {
      diagnostics.push(createDiagnostic("VISUAL_BOUNDS_INVALID", `Variant ${variant.name} has invalid bounds.`));
      continue;
    }
    rectangles.push({ x: variant.x, y: variant.y, width: variant.width, height: variant.height });
    const variantProperties = variant.variantProperties ?? {};
    const tuple = Object.keys(variantProperties).sort((a, b) => a.localeCompare(b)).map((key) => variantProperties[key]);
    const style = styleByTuple[tuple.join("\u0000")];
    if (style) {
      if (style.height !== undefined && variant.height !== style.height) diagnostics.push(createDiagnostic("VISUAL_HEIGHT_MISMATCH", `Variant ${variant.name} height ${variant.height} does not match ${style.height}.`));
      if (style.width !== undefined && variant.width !== style.width) diagnostics.push(createDiagnostic("VISUAL_WIDTH_MISMATCH", `Variant ${variant.name} width ${variant.width} does not match ${style.width}.`));
      if (style.layoutMode && variant.layoutMode !== style.layoutMode) diagnostics.push(createDiagnostic("VISUAL_LAYOUT_MISMATCH", `Variant ${variant.name} is not ${style.layoutMode} auto layout.`));
      if (style.gap !== undefined && variant.itemSpacing !== style.gap) diagnostics.push(createDiagnostic("VISUAL_GAP_MISMATCH", `Variant ${variant.name} gap ${variant.itemSpacing} does not match ${style.gap}.`));
    }
  }
  for (let index = 0; index < rectangles.length; index += 1) {
    for (let other = index + 1; other < rectangles.length; other += 1) {
      const a = rectangles[index];
      const b = rectangles[other];
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) diagnostics.push(createDiagnostic("VISUAL_VARIANT_OVERLAP", "Component-set variants overlap after creation."));
    }
  }
  if (componentSet.width <= 0 || componentSet.height <= 0 || (variants.length > 1 && componentSet.width <= 100 && componentSet.height <= 100)) diagnostics.push(createDiagnostic("VISUAL_SET_BOUNDS_INVALID", "Component-set bounds are not meaningful for its variant grid."));
  return diagnostics;
};

export const createComponentSet = async (target: TargetSchema, options?: {
  dryRun?: boolean;
  parentId?: string;
  x?: number;
  y?: number;
  key?: string;
}): Promise<CreateComponentSetResult> => {
  const validation = validateTargetSchema(target);
  const dryRun = options?.dryRun !== false;
  const warnings: ComponentDiagnostic[] = [];
  const visualPlan = planComponentVisuals(target, validation.normalized);
  const propertySummary = validation.normalized.properties
    .filter((property) => property.type !== "VARIANT")
    .map((property) => ({ name: property.name, type: property.type, bindings: 0 }));
  const base = {
    version: 1 as const,
    dryRun,
    variantCount: 0,
    expectedVariantCount: validation.expectedVariantCount,
    target: validation.normalized,
    ...(visualPlan ? { visualPlan } : {}),
    warnings,
    valid: validation.valid,
  };
  if (!validation.valid) return { ...base, propertySummary, warnings: validation.diagnostics, valid: false };
  if (dryRun) {
    return { ...base, propertySummary, warnings: [...warnings, ...((target.visualTemplate || target.layoutTemplate) ? [
      { code: "TEMPLATE_PREVIEW_ONLY", severity: "warning", message: "Visual/layout templates are recorded for preview; no Figma mutation occurs in dry-run mode." } satisfies ComponentDiagnostic,
    ] : [])], valid: true };
  }

  const created: BaseNode[] = [];
  const fontFamily = visualPlan?.variants[0]?.fontFamily ?? "Inter";
  const fontStyle = visualPlan?.variants[0]?.fontStyle ?? "Regular";
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  let componentSet: ComponentSetNode | undefined;
  try {
    let parent: BaseNode & ChildrenMixin = figma.currentPage;
    if (options?.parentId) {
      const parentNode = await figma.getNodeByIdAsync(options.parentId);
      if (!parentNode || !("appendChild" in parentNode)) throw Object.assign(new Error("parentId must reference a container"), { mutationError: { code: "INVALID_PARENT", message: "parentId must reference a container" } });
      parent = parentNode as BaseNode & ChildrenMixin;
    }

    const styleByTuple: Record<string, VisualStylePlan["variants"][number]> = {};
    for (const style of visualPlan?.variants ?? []) styleByTuple[style.tuple.join("\u0000")] = style;
    const gridByTuple: Record<string, VariantGridPlacement> = {};
    for (const placement of planVariantGrid(visualPlan?.variants ?? [], { originX: 0, originY: 0 })) gridByTuple[placement.tuple.join("\u0000")] = placement;
    const components: ComponentNode[] = [];
    for (const tuple of validation.normalized.variants) {
      const variantProperties: Record<string, string> = {};
      validation.normalized.dimensions.forEach((dimension, index) => { variantProperties[dimension.name] = tuple[index]; });
      const variantName = validation.normalized.dimensions.map((dimension) => `${dimension.name}=${variantProperties[dimension.name]}`).join(", ");
      const component = figma.createComponent();
      created.push(component);
      component.name = variantName;
      parent.appendChild(component);
      components.push(component);

      const labelProperty = validation.normalized.properties.find((property) => property.name === "Label" && property.type === "TEXT");
      let label: TextNode | undefined;
      if (labelProperty) {
        label = figma.createText();
        created.push(label);
        label.name = "Label";
        label.characters = typeof labelProperty.defaultValue === "string" ? labelProperty.defaultValue : "";
        component.appendChild(label);
      }
      const iconProperty = validation.normalized.properties.find((property) => property.name === "Show Icon" && property.type === "BOOLEAN");
      let icon: VectorNode | undefined;
      if (iconProperty) {
        icon = figma.createVector();
        created.push(icon);
        icon.name = "Icon";
        const geometry = arrowIconGeometry(18);
        icon.vectorPaths = [{ windingRule: "NONZERO", data: geometry.path }];
        icon.resize(geometry.width, geometry.height);
        icon.visible = iconProperty.defaultValue !== false;
        component.appendChild(icon);
      }
      const style = styleByTuple[tuple.join("\u0000")];
      if (style) applyVisualVariant(component, label, icon, style);
      const placement = gridByTuple[tuple.join("\u0000")];
      if (placement) { component.x = placement.x; component.y = placement.y; }
      const layout = (target.layoutTemplate ?? {}) as Record<string, unknown>;
      if (!style && typeof layout.layoutMode === "string") component.layoutMode = layout.layoutMode as BaseFrameMixin["layoutMode"];
      if (!style && typeof layout.itemSpacing === "number") component.itemSpacing = layout.itemSpacing;
    }
    if (components.length < 1) throw Object.assign(new Error("Target schema produced no variants"), { mutationError: { code: "INVALID_SCHEMA", message: "Target schema produced no variants" } });
    componentSet = figma.combineAsVariants(components, parent as BaseNode & ChildrenMixin);
    if (validation.normalized.name) componentSet.name = validation.normalized.name;
    if (options?.x !== undefined) componentSet.x = options.x;
    if (options?.y !== undefined) componentSet.y = options.y;
    for (const variant of componentSet.children.filter((child): child is ComponentNode => child.type === "COMPONENT")) {
      const tuple = validation.normalized.dimensions.map((dimension) => parseVariantName(variant.name)[dimension.name] ?? "");
      const placement = gridByTuple[tuple.join("\u0000")];
      if (placement) { variant.x = placement.x; variant.y = placement.y; }
    }
    if (options?.key && "setSharedPluginData" in componentSet) componentSet.setSharedPluginData("codex", "key", options.key);

    const definitions = (componentSet as ComponentSetNode & ComponentPropertiesMixin).componentPropertyDefinitions ?? {};
    const generated = Object.keys(definitions).filter((name) => /^Property [12]$/.test(name));
    if (generated.length > 0) throw Object.assign(new Error(`Figma generated unsupported placeholder properties: ${generated.join(", ")}`), { mutationError: { code: "UNSAFE_NATIVE_SCHEMA", message: "Native Component Set contains generated Property placeholders", details: generated } });

    const owner = componentSet as ComponentSetNode & ComponentPropertiesMixin;
    for (const property of validation.normalized.properties.filter((item) => item.type !== "VARIANT")) {
      if (definitions[property.name]) throw Object.assign(new Error(`Property conflicts with native variant dimension: ${property.name}`), { mutationError: { code: "PROPERTY_CONFLICT", message: `Property conflicts with native variant dimension: ${property.name}` } });
      const defaultValue = property.defaultValue ?? (property.type === "BOOLEAN" ? false : "");
      owner.addComponentProperty(property.name, property.type as ComponentPropertyType, defaultValue);
    }

    for (const variant of componentSet.children.filter((child): child is ComponentNode => child.type === "COMPONENT")) {
      const children = variant.children;
      for (const property of validation.normalized.properties) {
        if (property.type === "TEXT" && property.name === "Label") {
          const text = children.find((child): child is TextNode => child.type === "TEXT" && child.name === "Label");
          if (text) {
            const ref = Object.keys(owner.componentPropertyDefinitions ?? {}).find((name) => name === property.name || name.split("#", 1)[0] === property.name);
            if (ref) (text as TextNode & { componentPropertyReferences?: Record<string, string> }).componentPropertyReferences = { characters: ref };
            const summary = propertySummary.find((item) => item.name === property.name); if (summary) summary.bindings += ref ? 1 : 0;
          }
        }
        if (property.type === "BOOLEAN" && property.name === "Show Icon") {
          const icon = children.find((child) => child.name === "Icon");
          if (icon) {
            const ref = Object.keys(owner.componentPropertyDefinitions ?? {}).find((name) => name === property.name || name.split("#", 1)[0] === property.name);
            if (ref) (icon as SceneNode & { componentPropertyReferences?: Record<string, string> }).componentPropertyReferences = { visible: ref };
            const summary = propertySummary.find((item) => item.name === property.name); if (summary) summary.bindings += ref ? 1 : 0;
          }
        }
      }
    }
    const verification = await verifyComponentSet(componentSet.id);
    const visualDiagnostics = visualInvariantDiagnostics(componentSet, visualPlan?.variants ?? []);
    const expected = validation.expectedVariantCount;
    const verified = verification.healthy && verification.normalized.variants.length === expected && visualDiagnostics.length === 0;
    if (!verified) throw Object.assign(new Error("Postflight visual verification failed"), { mutationError: { code: "VERIFICATION_FAILED", message: "Created component set failed postflight visual verification", details: { verification, visualDiagnostics } } });
    return { ...base, componentSetId: componentSet.id, variantCount: verification.normalized.variants.length, propertySummary, verification, valid: true };
  } catch (error) {
    const removedNodeIds: string[] = [];
    const unrevertedNodeIds: string[] = [];
    const roots: BaseNode[] = componentSet ? [componentSet] : created;
    for (const node of roots) {
      try {
        const id = node.id;
        node.remove();
        removedNodeIds.push(id);
      } catch {
        unrevertedNodeIds.push(node.id);
      }
    }
    const diagnostic = createDiagnostic("CREATE_FAILED", error instanceof Error ? error.message : String(error));
    return { ...base, propertySummary, warnings: [diagnostic], rollback: { attempted: true, completed: unrevertedNodeIds.length === 0, removedNodeIds, unrevertedNodeIds }, valid: false };
  }
};
