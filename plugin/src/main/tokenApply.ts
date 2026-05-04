import { collectDesignTokens, type NormalizedToken, type TokenGroup } from "./tokens";
import { collectTokenUsage, type TokenUsageEntry, type UsageMatchType } from "./tokenUsage";

export type ApplyTokenMatchType = Extract<UsageMatchType, "exactValue" | "style" | "boundVariable">;

export type ApplyTokensOptions = {
  nodeIds?: string[];
  tokenPaths?: string[];
  matchTypes?: ApplyTokenMatchType[];
  dryRun?: boolean;
};

export type ApplyTokenPlanItem = {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  property: string;
  group: TokenGroup;
  tokenPath: string;
  tokenName?: string;
  tokenSource?: NormalizedToken["source"];
  tokenFigmaId?: string;
  matchType: UsageMatchType;
  action: "bind-variable" | "apply-style" | "skip" | "error";
  status: "planned" | "applied" | "skipped" | "error";
  message?: string;
};

export type ApplyTokensContext = {
  fileName: string;
  currentPage: { id: string; name: string };
};

export type ApplyTokensResponse = {
  version: 1;
  dryRun: boolean;
  fileName: string;
  currentPage: { id: string; name: string };
  scope: {
    type: "nodeIds" | "selection" | "currentPage";
    requestedNodeIds?: string[];
    rootNodeIds: string[];
    scannedNodeCount: number;
  };
  summary: {
    consideredUsages: number;
    planned: number;
    applied: number;
    skipped: number;
    errors: number;
  };
  results: ApplyTokenPlanItem[];
};

const DEFAULT_MATCH_TYPES: ApplyTokenMatchType[] = ["exactValue"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const buildResponse = (
  dryRun: boolean,
  context: ApplyTokensContext,
  scope: ApplyTokensResponse["scope"],
  results: ApplyTokenPlanItem[],
): ApplyTokensResponse => ({
  version: 1,
  dryRun,
  fileName: context.fileName,
  currentPage: context.currentPage,
  scope,
  summary: {
    consideredUsages: results.length,
    planned: results.filter((item) => item.status === "planned").length,
    applied: results.filter((item) => item.status === "applied").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    errors: results.filter((item) => item.status === "error").length,
  },
  results,
});

const styleActionForGroup = (group: TokenGroup): boolean => ["color", "typography", "effect", "grid"].includes(group);

function actionForUsage(usage: TokenUsageEntry, token: NormalizedToken | undefined): ApplyTokenPlanItem["action"] {
  if (!token) return "skip";
  if (!usage.match.tokenPath) return "skip";
  if (!token.figmaId && !usage.match.tokenFigmaId) return "skip";
  if (token.source === "variable") return "bind-variable";
  if (token.source === "style" && styleActionForGroup(token.group)) return "apply-style";
  return "skip";
}

export function planApplyTokens(
  options: ApplyTokensOptions,
  usages: TokenUsageEntry[],
  tokens: NormalizedToken[],
  context: ApplyTokensContext,
  scope: ApplyTokensResponse["scope"],
): ApplyTokensResponse {
  const dryRun = options.dryRun !== false;
  const allowedMatchTypes = new Set(options.matchTypes ?? DEFAULT_MATCH_TYPES);
  const allowedTokenPaths = options.tokenPaths ? new Set(options.tokenPaths) : undefined;
  const tokensByPath = new Map(tokens.map((token) => [token.path, token]));

  const results: ApplyTokenPlanItem[] = [];
  for (const usage of usages) {
    if (!allowedMatchTypes.has(usage.match.type as ApplyTokenMatchType)) continue;
    if (!usage.match.tokenPath) continue;
    if (allowedTokenPaths && !allowedTokenPaths.has(usage.match.tokenPath)) continue;

    const token = tokensByPath.get(usage.match.tokenPath);
    const action = actionForUsage(usage, token);
    const base: ApplyTokenPlanItem = {
      nodeId: usage.nodeId,
      nodeName: usage.nodeName,
      nodeType: usage.nodeType,
      property: usage.property,
      group: usage.group,
      tokenPath: usage.match.tokenPath,
      tokenName: usage.match.tokenName ?? token?.name,
      tokenSource: usage.match.tokenSource ?? token?.source,
      tokenFigmaId: usage.match.tokenFigmaId ?? token?.figmaId,
      matchType: usage.match.type,
      action,
      status: action === "skip" ? "skipped" : action === "error" ? "error" : "planned",
    };

    if (action === "error") {
      results.push({
        ...base,
        status: "error",
        message: token ? `Token ${token.path} cannot be applied to ${usage.property}` : "Matched token was not found in token graph",
      });
    } else if (usage.match.type === "boundVariable" || usage.match.type === "style") {
      results.push({
        ...base,
        action: "skip",
        status: "skipped",
        message: `Usage already has ${usage.match.type} token reference`,
      });
    } else {
      results.push(base);
    }
  }

  return buildResponse(dryRun, context, scope, results);
}

const getVariableById = async (id: string): Promise<Variable> => {
  const variable = await figma.variables.getVariableByIdAsync(id);
  if (!variable) throw new Error(`Variable not found: ${id}`);
  return variable;
};

const getStyleById = async (id: string): Promise<BaseStyle> => {
  const style = await figma.getStyleByIdAsync(id);
  if (!style) throw new Error(`Style not found: ${id}`);
  return style;
};

const paintIndexFromProperty = (property: string, field: "fills" | "strokes"): number | undefined => {
  const match = property.match(new RegExp(`^${field}\\[(\\d+)\\]\\.color$`));
  return match ? Number(match[1]) : undefined;
};

const clonePaints = (value: unknown): Paint[] => Array.isArray(value) ? [...(value as Paint[])] : [];

async function applyVariableToNode(node: SceneNode, item: ApplyTokenPlanItem): Promise<void> {
  if (!item.tokenFigmaId) throw new Error("tokenFigmaId is required");
  const variable = await getVariableById(item.tokenFigmaId);
  const asBindable = node as SceneNode & { setBoundVariable?: (field: string, variable: Variable) => void };

  const fillIndex = paintIndexFromProperty(item.property, "fills");
  if (fillIndex !== undefined) {
    const fills = clonePaints((node as unknown as Record<string, unknown>).fills);
    const paint = fills[fillIndex];
    if (!paint || paint.type !== "SOLID") throw new Error(`No solid fill at index ${fillIndex}`);
    fills[fillIndex] = figma.variables.setBoundVariableForPaint(paint, "color", variable);
    (node as unknown as { fills: Paint[] }).fills = fills;
    return;
  }

  const strokeIndex = paintIndexFromProperty(item.property, "strokes");
  if (strokeIndex !== undefined) {
    const strokes = clonePaints((node as unknown as Record<string, unknown>).strokes);
    const paint = strokes[strokeIndex];
    if (!paint || paint.type !== "SOLID") throw new Error(`No solid stroke at index ${strokeIndex}`);
    strokes[strokeIndex] = figma.variables.setBoundVariableForPaint(paint, "color", variable);
    (node as unknown as { strokes: Paint[] }).strokes = strokes;
    return;
  }

  if (typeof asBindable.setBoundVariable === "function") {
    asBindable.setBoundVariable(item.property, variable);
    return;
  }

  throw new Error(`Node does not support variable binding for ${item.property}`);
}

async function applyStyleToNode(node: SceneNode, item: ApplyTokenPlanItem): Promise<void> {
  if (!item.tokenFigmaId) throw new Error("tokenFigmaId is required");
  await getStyleById(item.tokenFigmaId);
  if (item.property.startsWith("fills[")) {
    (node as unknown as { fillStyleId: string }).fillStyleId = item.tokenFigmaId;
    return;
  }
  if (item.property.startsWith("strokes[")) {
    (node as unknown as { strokeStyleId: string }).strokeStyleId = item.tokenFigmaId;
    return;
  }
  if (item.property === "typography") {
    if (node.type !== "TEXT") throw new Error("typography style can only be applied to TEXT nodes");
    (node as TextNode).textStyleId = item.tokenFigmaId;
    return;
  }
  if (item.property === "effectStyleId") {
    (node as unknown as { effectStyleId: string }).effectStyleId = item.tokenFigmaId;
    return;
  }
  if (item.property === "gridStyleId") {
    (node as unknown as { gridStyleId: string }).gridStyleId = item.tokenFigmaId;
    return;
  }
  throw new Error(`Unsupported style application target ${item.property}`);
}

async function applyPlanItem(item: ApplyTokenPlanItem): Promise<ApplyTokenPlanItem> {
  if (item.action === "skip" || item.status === "skipped" || item.status === "error") return item;
  const node = await figma.getNodeByIdAsync(item.nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE" || !("visible" in node)) {
    return { ...item, status: "error", message: `Node not found or unsupported: ${item.nodeId}` };
  }

  try {
    if (item.action === "bind-variable") await applyVariableToNode(node, item);
    else if (item.action === "apply-style") await applyStyleToNode(node, item);
    else throw new Error(`Unsupported action ${item.action}`);
    return { ...item, status: "applied" };
  } catch (error) {
    return { ...item, status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyTokens(options: ApplyTokensOptions = {}): Promise<ApplyTokensResponse> {
  const dryRun = options.dryRun !== false;
  const [usageResponse, tokens] = await Promise.all([
    collectTokenUsage(options.nodeIds),
    collectDesignTokens(),
  ]);
  const context = { fileName: usageResponse.fileName, currentPage: usageResponse.currentPage };
  const planned = planApplyTokens(options, usageResponse.usages, tokens, context, usageResponse.scope);
  if (dryRun) return planned;

  const results = await Promise.all(planned.results.map((item) => applyPlanItem(item)));
  return buildResponse(false, context, usageResponse.scope, results);
}
