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

export type CreateComponentSetResult = {
  version: 1;
  dryRun: boolean;
  componentSetId?: string;
  variantCount: number;
  expectedVariantCount: number;
  target: NormalizedTarget;
  propertySummary: Array<{ name: string; type: string; bindings: number }>;
  warnings: ComponentDiagnostic[];
  verification?: ComponentSetVerification;
  rollback?: { attempted: boolean; completed: boolean; removedNodeIds: string[] };
  valid: boolean;
};

const createDiagnostic = (code: string, message: string, path?: string): ComponentDiagnostic => ({
  code,
  severity: "error",
  ...(path ? { path } : {}),
  message,
});

/** Creates a new native component set only after validating and expanding the complete target matrix. */
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
  const propertySummary = validation.normalized.properties
    .filter((property) => property.type !== "VARIANT")
    .map((property) => ({ name: property.name, type: property.type, bindings: 0 }));
  const base = {
    version: 1 as const,
    dryRun,
    variantCount: 0,
    expectedVariantCount: validation.expectedVariantCount,
    target: validation.normalized,
    propertySummary,
    warnings,
    valid: validation.valid,
  };
  if (!validation.valid) return { ...base, warnings: validation.diagnostics, valid: false };
  if (dryRun) {
    return {
      ...base,
      warnings: [...warnings, ...((target.visualTemplate || target.layoutTemplate) ? [
        { code: "TEMPLATE_PREVIEW_ONLY", severity: "warning", message: "Visual/layout templates are recorded for preview; no Figma mutation occurs in dry-run mode." } satisfies ComponentDiagnostic,
      ] : [])],
      valid: true,
    };
  }

  const created: BaseNode[] = [];
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  let componentSet: ComponentSetNode | undefined;
  try {
    let parent: BaseNode & ChildrenMixin = figma.currentPage;
    if (options?.parentId) {
      const parentNode = await figma.getNodeByIdAsync(options.parentId);
      if (!parentNode || !("appendChild" in parentNode)) throw Object.assign(new Error("parentId must reference a container"), { mutationError: { code: "INVALID_PARENT", message: "parentId must reference a container" } });
      parent = parentNode as BaseNode & ChildrenMixin;
    }

    const components: ComponentNode[] = [];
    for (const tuple of validation.normalized.variants) {
      const variantProperties: Record<string, string> = {};
      validation.normalized.dimensions.forEach((dimension, index) => { variantProperties[dimension.name] = tuple[index]; });
      const variantName = validation.normalized.dimensions.map((dimension) => `${dimension.name}=${variantProperties[dimension.name]}`).join(", ");
      const component = figma.createComponent();
      created.push(component);
      component.name = variantName;
      if (options?.x !== undefined) component.x = options.x;
      if (options?.y !== undefined) component.y = options.y;
      parent.appendChild(component);
      components.push(component);

      const labelProperty = validation.normalized.properties.find((property) => property.name === "Label" && property.type === "TEXT");
      if (labelProperty) {
        const label = figma.createText();
        created.push(label);
        label.name = "Label";
        label.characters = typeof labelProperty.defaultValue === "string" ? labelProperty.defaultValue : "";
        component.appendChild(label);
      }
      const iconProperty = validation.normalized.properties.find((property) => property.name === "Show Icon" && property.type === "BOOLEAN");
      if (iconProperty) {
        const icon = figma.createRectangle();
        created.push(icon);
        icon.name = "Icon";
        icon.visible = iconProperty.defaultValue !== false;
        icon.resize(16, 16);
        component.appendChild(icon);
      }
      const layout = (target.layoutTemplate ?? {}) as Record<string, unknown>;
      if (typeof layout.layoutMode === "string") component.layoutMode = layout.layoutMode as BaseFrameMixin["layoutMode"];
      if (typeof layout.itemSpacing === "number") component.itemSpacing = layout.itemSpacing;
    }
    if (components.length < 1) throw Object.assign(new Error("Target schema produced no variants"), { mutationError: { code: "INVALID_SCHEMA", message: "Target schema produced no variants" } });
    componentSet = figma.combineAsVariants(components, parent as BaseNode & ChildrenMixin);
    if (validation.normalized.name) componentSet.name = validation.normalized.name;
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
            const ref = Object.keys(owner.componentPropertyDefinitions ?? {}).find((name) => name === property.name);
            if (ref) (text as TextNode & { componentPropertyReferences?: Record<string, string> }).componentPropertyReferences = { characters: ref };
            const summary = propertySummary.find((item) => item.name === property.name); if (summary) summary.bindings += text ? 1 : 0;
          }
        }
        if (property.type === "BOOLEAN" && property.name === "Show Icon") {
          const icon = children.find((child) => child.name === "Icon");
          if (icon) {
            const ref = Object.keys(owner.componentPropertyDefinitions ?? {}).find((name) => name === property.name);
            if (ref) (icon as SceneNode & { componentPropertyReferences?: Record<string, string> }).componentPropertyReferences = { visible: ref };
            const summary = propertySummary.find((item) => item.name === property.name); if (summary) summary.bindings += icon ? 1 : 0;
          }
        }
      }
    }
    const verification = await verifyComponentSet(componentSet.id);
    const expected = validation.expectedVariantCount;
    const verified = verification.healthy && verification.normalized.variants.length === expected;
    if (!verified) throw Object.assign(new Error("Postflight verification failed"), { mutationError: { code: "VERIFICATION_FAILED", message: "Created component set failed postflight verification", details: verification } });
    return { ...base, componentSetId: componentSet.id, variantCount: verification.normalized.variants.length, propertySummary, verification, valid: true };
  } catch (error) {
    const removedNodeIds: string[] = [];
    const roots: BaseNode[] = componentSet ? [componentSet] : created;
    for (const node of roots) { try { const id = node.id; node.remove(); removedNodeIds.push(id); } catch { /* best-effort compensation */ } }
    const diagnostic = createDiagnostic("CREATE_FAILED", error instanceof Error ? error.message : String(error));
    return { ...base, warnings: [diagnostic], rollback: { attempted: true, completed: removedNodeIds.length === roots.length, removedNodeIds }, valid: false };
  }
};
