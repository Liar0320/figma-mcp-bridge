import { collectDesignTokens, type NormalizedToken, type TokenGroup } from "./tokens";

type UsageMatchType = "boundVariable" | "style" | "exactValue" | "none";

type TokenUsageMatch = {
  type: UsageMatchType;
  tokenPath?: string;
  tokenName?: string;
  tokenSource?: NormalizedToken["source"];
  tokenFigmaId?: string;
  confidence: number;
  reason: string;
};

type TokenUsageEntry = {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  property: string;
  group: TokenGroup;
  value: unknown;
  match: TokenUsageMatch;
};

type TokenUsageWarning = {
  code: "NODE_NOT_FOUND" | "UNSUPPORTED_ROOT_NODE" | "EMPTY_SCAN";
  message: string;
  nodeId?: string;
  nodeType?: string;
};

type TokenUsageResponse = {
  version: 1;
  fileName: string;
  currentPage: { id: string; name: string };
  scope: {
    type: "nodeIds" | "selection" | "currentPage";
    requestedNodeIds?: string[];
    rootNodeIds: string[];
    scannedNodeCount: number;
  };
  usages: TokenUsageEntry[];
  summary: {
    totalUsages: number;
    matchedUsages: number;
    unmatchedUsages: number;
    coverage: number | null;
    byGroup: Partial<Record<TokenGroup, { total: number; matched: number; unmatched: number }>>;
    byMatchType: Record<UsageMatchType, number>;
  };
  warnings?: TokenUsageWarning[];
};

type PaintUsageContext = "fills" | "strokes";

type TokenIndexes = {
  byFigmaId: Map<string, NormalizedToken>;
  colorByValue: Map<string, NormalizedToken>;
  floatByGroupAndValue: Map<string, NormalizedToken>;
  textStyleByFingerprint: Map<string, NormalizedToken>;
};

const MAX_SCANNED_NODES = 1000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isMixed = (value: unknown): value is symbol => typeof value === "symbol";

const clampByte = (value: number): number =>
  Math.min(255, Math.max(0, Math.round(value * 255)));

const colorToHex = (color: RGB | RGBA): string =>
  `#${[clampByte(color.r), clampByte(color.g), clampByte(color.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

const normalizeOpacity = (opacity: unknown): number =>
  typeof opacity === "number" ? Number(opacity.toFixed(4)) : 1;

const colorKey = (color: string, opacity: unknown = 1): string =>
  `${color.toLowerCase()}@${normalizeOpacity(opacity)}`;

const floatKey = (group: TokenGroup, value: number): string => `${group}:${Number(value.toFixed(4))}`;

const serializeColorValue = (color: RGB | RGBA, opacity?: number): { color: string; opacity: number } => ({
  color: colorToHex(color),
  opacity: normalizeOpacity(opacity ?? ("a" in color ? color.a : 1)),
});

const createMatch = (
  type: UsageMatchType,
  token: NormalizedToken | undefined,
  confidence: number,
  reason: string,
): TokenUsageMatch => ({
  type,
  tokenPath: token?.path,
  tokenName: token?.name,
  tokenSource: token?.source,
  tokenFigmaId: token?.figmaId,
  confidence,
  reason,
});

const extractAliasId = (value: unknown): string | undefined => {
  if (isObject(value) && value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
    return value.id;
  }
  return undefined;
};

const valueColorKey = (value: unknown): string | undefined => {
  if (!isObject(value)) return undefined;
  if (value.type === "COLOR" && typeof value.color === "string") {
    return colorKey(value.color, value.opacity);
  }
  if (typeof value.color === "string" && typeof value.opacity === "number") {
    return colorKey(value.color, value.opacity);
  }
  return undefined;
};

const firstTokenValue = (token: NormalizedToken): unknown => {
  if (token.value !== undefined) return token.value;
  if (token.valuesByMode) return Object.values(token.valuesByMode)[0];
  return undefined;
};

const getTextFingerprint = (value: unknown): string | undefined => {
  if (!isObject(value)) return undefined;
  const fontName = value.fontName;
  const fontSize = value.fontSize;
  const lineHeight = value.lineHeight;
  const letterSpacing = value.letterSpacing;
  if (!isObject(fontName) || typeof fontSize !== "number") return undefined;
  return JSON.stringify({ fontName, fontSize, lineHeight, letterSpacing });
};

const nodeTextFingerprint = (node: TextNode): string | undefined => {
  if (isMixed(node.fontName) || isMixed(node.fontSize)) return undefined;
  return JSON.stringify({
    fontName: node.fontName,
    fontSize: node.fontSize,
    lineHeight: isMixed(node.lineHeight) ? "mixed" : node.lineHeight,
    letterSpacing: isMixed(node.letterSpacing) ? "mixed" : node.letterSpacing,
  });
};

const buildIndexes = (tokens: NormalizedToken[]): TokenIndexes => {
  const byFigmaId = new Map<string, NormalizedToken>();
  const colorByValue = new Map<string, NormalizedToken>();
  const floatByGroupAndValue = new Map<string, NormalizedToken>();
  const textStyleByFingerprint = new Map<string, NormalizedToken>();

  for (const token of tokens) {
    if (token.figmaId) byFigmaId.set(token.figmaId, token);

    const value = firstTokenValue(token);
    const aliasId = extractAliasId(value);
    if (aliasId && byFigmaId.has(aliasId)) {
      const aliasTarget = byFigmaId.get(aliasId);
      if (aliasTarget) byFigmaId.set(token.figmaId ?? token.path, aliasTarget);
    }

    if (token.group === "color") {
      const key = valueColorKey(value);
      if (key && !colorByValue.has(key)) colorByValue.set(key, token);

      if (isObject(value) && Array.isArray(value.paints)) {
        const firstPaint = value.paints.find((paint) => isObject(paint) && paint.type === "SOLID");
        if (isObject(firstPaint)) {
          const nestedColor = valueColorKey(firstPaint.color);
          if (nestedColor && !colorByValue.has(nestedColor)) colorByValue.set(nestedColor, token);
        }
      }
    }

    if (["spacing", "radius", "size", "opacity"].includes(token.group) && typeof value === "number") {
      const key = floatKey(token.group, value);
      if (!floatByGroupAndValue.has(key)) floatByGroupAndValue.set(key, token);
    }

    if (token.group === "typography" && token.source === "style") {
      const fingerprint = getTextFingerprint(value);
      if (fingerprint && !textStyleByFingerprint.has(fingerprint)) {
        textStyleByFingerprint.set(fingerprint, token);
      }
    }
  }

  return { byFigmaId, colorByValue, floatByGroupAndValue, textStyleByFingerprint };
};

const boundVariableId = (source: unknown, field: string): string | undefined => {
  if (!isObject(source)) return undefined;
  const boundVariables = source.boundVariables;
  if (!isObject(boundVariables)) return undefined;
  const binding = boundVariables[field];
  if (isObject(binding) && typeof binding.id === "string") return binding.id;
  if (Array.isArray(binding)) {
    const first = binding.find((item) => isObject(item) && typeof item.id === "string");
    if (isObject(first)) return first.id as string;
  }
  return undefined;
};

const styleIdFromNode = (node: SceneNode, field: string): string | undefined => {
  const value = (node as unknown as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const addPaintUsages = (
  usages: TokenUsageEntry[],
  node: SceneNode,
  context: PaintUsageContext,
  indexes: TokenIndexes,
): void => {
  const paints = (node as unknown as Record<string, unknown>)[context];
  if (!Array.isArray(paints)) return;

  const styleField = context === "fills" ? "fillStyleId" : "strokeStyleId";
  const styleId = styleIdFromNode(node, styleField);
  const styleToken = styleId ? indexes.byFigmaId.get(styleId) : undefined;

  paints.forEach((paint, index) => {
    if (!isObject(paint) || paint.visible === false || paint.type !== "SOLID" || !isObject(paint.color)) {
      return;
    }

    const serialized = serializeColorValue(paint.color as unknown as RGB | RGBA, paint.opacity as number | undefined);
    const variableId = boundVariableId(paint, "color") ?? boundVariableId(node, context);
    const variableToken = variableId ? indexes.byFigmaId.get(variableId) : undefined;
    const exactToken = indexes.colorByValue.get(colorKey(serialized.color, serialized.opacity));

    let match: TokenUsageMatch;
    if (variableToken) {
      match = createMatch("boundVariable", variableToken, 1, `Paint ${context}[${index}] is bound to variable ${variableId}`);
    } else if (styleToken) {
      match = createMatch("style", styleToken, 1, `Node ${styleField} references style ${styleId}`);
    } else if (exactToken) {
      match = createMatch("exactValue", exactToken, 0.85, "Paint color exactly matches an existing color token value");
    } else {
      match = createMatch("none", undefined, 0, "No bound variable, style, or exact color token match found");
    }

    usages.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      property: `${context}[${index}].color`,
      group: "color",
      value: serialized,
      match,
    });
  });
};

const addFloatUsage = (
  usages: TokenUsageEntry[],
  node: SceneNode,
  property: string,
  group: TokenGroup,
  value: unknown,
  indexes: TokenIndexes,
): void => {
  if (typeof value !== "number" || value === 0) return;
  const variableId = boundVariableId(node, property);
  const variableToken = variableId ? indexes.byFigmaId.get(variableId) : undefined;
  const exactToken = indexes.floatByGroupAndValue.get(floatKey(group, value));

  const match = variableToken
    ? createMatch("boundVariable", variableToken, 1, `${property} is bound to variable ${variableId}`)
    : exactToken
      ? createMatch("exactValue", exactToken, 0.8, `${property} exactly matches a ${group} token value`)
      : createMatch("none", undefined, 0, `No variable binding or exact ${group} token match found`);

  usages.push({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    property,
    group,
    value,
    match,
  });
};

const addTextUsage = (usages: TokenUsageEntry[], node: SceneNode, indexes: TokenIndexes): void => {
  if (node.type !== "TEXT") return;
  const textNode = node as TextNode;
  const styleId = styleIdFromNode(node, "textStyleId");
  const styleToken = styleId ? indexes.byFigmaId.get(styleId) : undefined;
  const fingerprint = nodeTextFingerprint(textNode);
  const exactToken = fingerprint ? indexes.textStyleByFingerprint.get(fingerprint) : undefined;

  const match = styleToken
    ? createMatch("style", styleToken, 1, `Text node references textStyleId ${styleId}`)
    : exactToken
      ? createMatch("exactValue", exactToken, 0.75, "Typography fingerprint exactly matches a text style token")
      : createMatch("none", undefined, 0, "No text style reference or exact typography token match found");

  usages.push({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    property: "typography",
    group: "typography",
    value: {
      fontName: isMixed(textNode.fontName) ? "mixed" : textNode.fontName,
      fontSize: isMixed(textNode.fontSize) ? "mixed" : textNode.fontSize,
      lineHeight: isMixed(textNode.lineHeight) ? "mixed" : textNode.lineHeight,
      letterSpacing: isMixed(textNode.letterSpacing) ? "mixed" : textNode.letterSpacing,
    },
    match,
  });
};

const addStyleReferenceUsage = (
  usages: TokenUsageEntry[],
  node: SceneNode,
  styleField: string,
  property: string,
  group: TokenGroup,
  indexes: TokenIndexes,
): void => {
  const styleId = styleIdFromNode(node, styleField);
  if (!styleId) return;
  const styleToken = indexes.byFigmaId.get(styleId);
  usages.push({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    property,
    group,
    value: { styleId },
    match: styleToken
      ? createMatch("style", styleToken, 1, `Node ${styleField} references style ${styleId}`)
      : createMatch("none", undefined, 0, `Node references style ${styleId}, but no local style token was found`),
  });
};

const addNodeUsages = (usages: TokenUsageEntry[], node: SceneNode, indexes: TokenIndexes): void => {
  addPaintUsages(usages, node, "fills", indexes);
  addPaintUsages(usages, node, "strokes", indexes);
  addTextUsage(usages, node, indexes);
  addStyleReferenceUsage(usages, node, "effectStyleId", "effectStyleId", "effect", indexes);
  addStyleReferenceUsage(usages, node, "gridStyleId", "gridStyleId", "grid", indexes);

  addFloatUsage(usages, node, "cornerRadius", "radius", (node as unknown as Record<string, unknown>).cornerRadius, indexes);
  addFloatUsage(usages, node, "itemSpacing", "spacing", (node as unknown as Record<string, unknown>).itemSpacing, indexes);
  addFloatUsage(usages, node, "paddingTop", "spacing", (node as unknown as Record<string, unknown>).paddingTop, indexes);
  addFloatUsage(usages, node, "paddingRight", "spacing", (node as unknown as Record<string, unknown>).paddingRight, indexes);
  addFloatUsage(usages, node, "paddingBottom", "spacing", (node as unknown as Record<string, unknown>).paddingBottom, indexes);
  addFloatUsage(usages, node, "paddingLeft", "spacing", (node as unknown as Record<string, unknown>).paddingLeft, indexes);
};

const collectSceneNodes = (roots: readonly SceneNode[]): SceneNode[] => {
  const nodes: SceneNode[] = [];
  const visit = (node: SceneNode): void => {
    if (nodes.length >= MAX_SCANNED_NODES) return;
    if ("visible" in node && node.visible === false) return;
    nodes.push(node);
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  for (const root of roots) visit(root);
  return nodes;
};

const resolveScopeRoots = async (
  nodeIds?: string[],
): Promise<{ type: TokenUsageResponse["scope"]["type"]; roots: SceneNode[]; warnings: TokenUsageWarning[] }> => {
  const warnings: TokenUsageWarning[] = [];

  if (nodeIds && nodeIds.length > 0) {
    const nodes = await Promise.all(nodeIds.map((id) => figma.getNodeByIdAsync(id)));
    const roots: SceneNode[] = [];

    nodes.forEach((node, index) => {
      const nodeId = nodeIds[index];
      if (!node) {
        warnings.push({
          code: "NODE_NOT_FOUND",
          nodeId,
          message: `Requested nodeId was not found: ${nodeId}`,
        });
        return;
      }

      if (node.type === "DOCUMENT" || node.type === "PAGE" || !("visible" in node)) {
        warnings.push({
          code: "UNSUPPORTED_ROOT_NODE",
          nodeId,
          nodeType: node.type,
          message: `Requested nodeId ${nodeId} has unsupported root node type ${node.type}; pass scene node IDs or omit nodeIds to scan the current selection/page.`,
        });
        return;
      }

      roots.push(node);
    });

    return { type: "nodeIds", roots, warnings };
  }

  if (figma.currentPage.selection.length > 0) {
    return { type: "selection", roots: [...figma.currentPage.selection], warnings };
  }

  return { type: "currentPage", roots: [...figma.currentPage.children], warnings };
};

export async function collectTokenUsage(nodeIds?: string[]): Promise<TokenUsageResponse> {
  const tokens = await collectDesignTokens();
  const indexes = buildIndexes(tokens);
  const { type, roots, warnings } = await resolveScopeRoots(nodeIds);
  const nodes = collectSceneNodes(roots);
  const usages: TokenUsageEntry[] = [];

  for (const node of nodes) addNodeUsages(usages, node, indexes);

  if (nodes.length === 0) {
    warnings.push({
      code: "EMPTY_SCAN",
      message: "No scannable nodes were found; token coverage is not applicable for an empty scan.",
    });
  }

  const response: TokenUsageResponse = {
    version: 1,
    fileName: figma.root.name,
    currentPage: {
      id: figma.currentPage.id,
      name: figma.currentPage.name,
    },
    scope: {
      type,
      requestedNodeIds: nodeIds,
      rootNodeIds: roots.map((node) => node.id),
      scannedNodeCount: nodes.length,
    },
    usages,
    summary: summarizeUsage(usages),
  };

  if (warnings.length > 0) response.warnings = warnings;
  return response;
}

export function summarizeUsage(usages: TokenUsageEntry[]): TokenUsageResponse["summary"] {
  const byGroup: TokenUsageResponse["summary"]["byGroup"] = {};
  const byMatchType: Record<UsageMatchType, number> = {
    boundVariable: 0,
    style: 0,
    exactValue: 0,
    none: 0,
  };

  for (const usage of usages) {
    byMatchType[usage.match.type] += 1;
    const group = byGroup[usage.group] ?? { total: 0, matched: 0, unmatched: 0 };
    group.total += 1;
    if (usage.match.type === "none") group.unmatched += 1;
    else group.matched += 1;
    byGroup[usage.group] = group;
  }

  const matchedUsages = usages.filter((usage) => usage.match.type !== "none").length;
  const totalUsages = usages.length;
  const unmatchedUsages = totalUsages - matchedUsages;

  return {
    totalUsages,
    matchedUsages,
    unmatchedUsages,
    coverage: totalUsages === 0 ? null : Number((matchedUsages / totalUsages).toFixed(4)),
    byGroup,
    byMatchType,
  };
}
