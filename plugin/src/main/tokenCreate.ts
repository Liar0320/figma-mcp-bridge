import { collectDesignTokens, normalizeTokenPath, type NormalizedToken, type TokenGroup } from "./tokens";

export type CreateDesignTokenSource = "variable" | "style";
export type CreateDesignTokenVariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
export type CreateDesignTokenStyleType = "paint" | "text" | "effect" | "grid";
export type CreateDesignTokenConflictStrategy = "error" | "skip";
export type CreateDesignTokenCollectionStrategy = "upsert-by-name" | "create-new";
export type CreateDesignTokenModeStrategy = "use-default" | "create-missing";

export type CreateDesignTokenInput = {
  name: string;
  group: TokenGroup;
  source?: CreateDesignTokenSource;
  value: unknown;
  valuesByMode?: Record<string, unknown>;
  variableType?: CreateDesignTokenVariableType;
  styleType?: CreateDesignTokenStyleType;
  collectionName?: string;
  description?: string;
};

export type CreateDesignTokensOptions = {
  tokens: CreateDesignTokenInput[];
  dryRun?: boolean;
  collectionName?: string;
  collectionStrategy?: CreateDesignTokenCollectionStrategy;
  modeStrategy?: CreateDesignTokenModeStrategy;
  conflictStrategy?: CreateDesignTokenConflictStrategy;
};

export type CreateDesignTokenPlanItem = {
  name: string;
  path: string;
  group: TokenGroup;
  source: CreateDesignTokenSource;
  action: "create-variable" | "create-style" | "skip" | "error";
  status: "planned" | "created" | "skipped" | "error";
  value: unknown;
  valuesByMode?: Record<string, unknown>;
  variableType?: CreateDesignTokenVariableType;
  styleType?: CreateDesignTokenStyleType;
  collectionName?: string;
  existingTokenPath?: string;
  figmaId?: string;
  message?: string;
};

export type CreateDesignTokensContext = {
  fileName: string;
  currentPage: { id: string; name: string };
};

export type CreateDesignTokensResponse = {
  version: 1;
  dryRun: boolean;
  fileName: string;
  currentPage: { id: string; name: string };
  summary: {
    requested: number;
    planned: number;
    created: number;
    skipped: number;
    errors: number;
  };
  results: CreateDesignTokenPlanItem[];
};

const DEFAULT_COLLECTION_NAME = "Design Tokens";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const inferSource = (token: CreateDesignTokenInput): CreateDesignTokenSource => {
  if (token.source) return token.source;
  if (["typography", "effect", "grid"].includes(token.group)) return "style";
  return "variable";
};

const inferVariableType = (token: CreateDesignTokenInput): CreateDesignTokenVariableType | undefined => {
  if (token.variableType) return token.variableType;
  switch (token.group) {
    case "color":
      return "COLOR";
    case "spacing":
    case "radius":
    case "size":
    case "opacity":
      return "FLOAT";
    default:
      if (typeof token.value === "string") return "STRING";
      if (typeof token.value === "boolean") return "BOOLEAN";
      if (typeof token.value === "number") return "FLOAT";
      return undefined;
  }
};

const inferStyleType = (token: CreateDesignTokenInput): CreateDesignTokenStyleType | undefined => {
  if (token.styleType) return token.styleType;
  switch (token.group) {
    case "color":
      return "paint";
    case "typography":
      return "text";
    case "effect":
      return "effect";
    case "grid":
      return "grid";
    default:
      return undefined;
  }
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const firstTokenValue = (token: CreateDesignTokenInput): unknown => {
  if (token.valuesByMode) return Object.values(token.valuesByMode)[0];
  return token.value;
};

const rgbaFromHex = (hex: string, opacity = 1): RGBA => {
  const normalized = hex.replace(/^#/, "");
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const alphaFromHex = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : opacity;
  return { r, g, b, a: alphaFromHex };
};

const toVariableValue = (value: unknown, variableType: CreateDesignTokenVariableType): VariableValue => {
  if (variableType === "COLOR") {
    if (isObject(value) && typeof value.color === "string") {
      return rgbaFromHex(value.color, typeof value.opacity === "number" ? value.opacity : 1);
    }
    if (typeof value === "string" && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
      return rgbaFromHex(value);
    }
    throw new Error("COLOR variable value must be #RRGGBB/#RRGGBBAA or { color, opacity }");
  }
  if (variableType === "FLOAT") {
    if (typeof value !== "number") throw new Error("FLOAT variable value must be a number");
    return value;
  }
  if (variableType === "STRING") {
    if (typeof value !== "string") throw new Error("STRING variable value must be a string");
    return value;
  }
  if (typeof value !== "boolean") throw new Error("BOOLEAN variable value must be a boolean");
  return value;
};

const toSolidPaint = (value: unknown): SolidPaint => {
  if (isObject(value) && typeof value.color === "string") {
    return { type: "SOLID", color: rgbaFromHex(value.color), opacity: typeof value.opacity === "number" ? value.opacity : 1 };
  }
  if (typeof value === "string" && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
    return { type: "SOLID", color: rgbaFromHex(value) };
  }
  throw new Error("Paint style value must be #RRGGBB/#RRGGBBAA or { color, opacity }");
};

const findCollectionByName = async (name: string): Promise<VariableCollection | undefined> => {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.find((collection) => collection.name === name);
};

const ensureCollection = async (
  name: string,
  strategy: CreateDesignTokenCollectionStrategy,
): Promise<VariableCollection> => {
  const existing = await findCollectionByName(name);
  if (existing && strategy === "upsert-by-name") return existing;
  if (existing && strategy === "create-new") {
    return figma.variables.createVariableCollection(`${name} ${new Date().toISOString()}`);
  }
  return figma.variables.createVariableCollection(name);
};

const createStyle = (item: CreateDesignTokenPlanItem): BaseStyle => {
  if (item.styleType === "paint") {
    const style = figma.createPaintStyle();
    style.name = item.name;
    style.paints = [toSolidPaint(item.value)];
    return style;
  }
  if (item.styleType === "text") {
    const style = figma.createTextStyle();
    style.name = item.name;
    if (isObject(item.value) && typeof item.value.fontSize === "number") style.fontSize = item.value.fontSize;
    return style;
  }
  if (item.styleType === "effect") {
    const style = figma.createEffectStyle();
    style.name = item.name;
    if (isObject(item.value) && Array.isArray(item.value.effects)) style.effects = item.value.effects as Effect[];
    return style;
  }
  const style = figma.createGridStyle();
  style.name = item.name;
  if (isObject(item.value) && Array.isArray(item.value.layoutGrids)) style.layoutGrids = item.value.layoutGrids as LayoutGrid[];
  return style;
};

export const toVariableValueForTest = toVariableValue;

export function planCreateDesignTokens(
  options: CreateDesignTokensOptions,
  existingTokens: NormalizedToken[],
  context: CreateDesignTokensContext,
): CreateDesignTokensResponse {
  const dryRun = options.dryRun !== false;
  const conflictStrategy = options.conflictStrategy ?? "error";
  const existingByPath = new Map<string, NormalizedToken>(existingTokens.map((token) => [token.path, token]));
  const existingValueKeys = new Set(existingTokens.map((token) => stableStringify(token.value ?? token.valuesByMode)));

  const results: CreateDesignTokenPlanItem[] = options.tokens.map((token) => {
    const source = inferSource(token);
    const path = normalizeTokenPath(token.group, token.name);
    const existing = existingByPath.get(path);
    const valueKey = stableStringify(token.valuesByMode ?? token.value);
    const duplicateValue = existingValueKeys.has(valueKey);
    const variableType = source === "variable" ? inferVariableType(token) : undefined;
    const styleType = source === "style" ? inferStyleType(token) : undefined;
    const collectionName = token.collectionName ?? options.collectionName ?? DEFAULT_COLLECTION_NAME;

    if (existing || duplicateValue) {
      const message = existing
        ? `Token path already exists: ${path}`
        : "A token with the same value already exists";
      return {
        name: token.name,
        path,
        group: token.group,
        source,
        action: conflictStrategy === "skip" ? "skip" : "error",
        status: conflictStrategy === "skip" ? "skipped" : "error",
        value: token.value,
        valuesByMode: token.valuesByMode,
        variableType,
        styleType,
        collectionName: source === "variable" ? collectionName : undefined,
        existingTokenPath: existing?.path,
        message,
      };
    }

    if (source === "variable" && !variableType) {
      return {
        name: token.name,
        path,
        group: token.group,
        source,
        action: "error",
        status: "error",
        value: token.value,
        valuesByMode: token.valuesByMode,
        collectionName,
        message: "Unable to infer variableType; provide COLOR, FLOAT, STRING, or BOOLEAN",
      };
    }

    if (source === "style" && !styleType) {
      return {
        name: token.name,
        path,
        group: token.group,
        source,
        action: "error",
        status: "error",
        value: token.value,
        valuesByMode: token.valuesByMode,
        message: "Unable to infer styleType; provide paint, text, effect, or grid",
      };
    }

    return {
      name: token.name,
      path,
      group: token.group,
      source,
      action: source === "variable" ? "create-variable" : "create-style",
      status: "planned",
      value: token.value,
      valuesByMode: token.valuesByMode,
      variableType,
      styleType,
      collectionName: source === "variable" ? collectionName : undefined,
    };
  });

  return buildResponse(options, context, dryRun, results);
}

function buildResponse(
  options: CreateDesignTokensOptions,
  context: CreateDesignTokensContext,
  dryRun: boolean,
  results: CreateDesignTokenPlanItem[],
): CreateDesignTokensResponse {
  const counts = results.reduce(
    (acc, item) => {
      if (item.status === "planned") acc.planned += 1;
      if (item.status === "created") acc.created += 1;
      if (item.status === "skipped") acc.skipped += 1;
      if (item.status === "error") acc.errors += 1;
      return acc;
    },
    { planned: 0, created: 0, skipped: 0, errors: 0 },
  );

  return {
    version: 1,
    dryRun,
    fileName: context.fileName,
    currentPage: context.currentPage,
    summary: {
      requested: options.tokens.length,
      ...counts,
    },
    results,
  };
}

export async function createDesignTokens(options: CreateDesignTokensOptions): Promise<CreateDesignTokensResponse> {
  const dryRun = options.dryRun !== false;
  const collectionStrategy = options.collectionStrategy ?? "upsert-by-name";
  const existingTokens = await collectDesignTokens();
  const context = {
    fileName: figma.root.name,
    currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
  };
  const response = planCreateDesignTokens(options, existingTokens, context);
  const results = response.results;

  if (!dryRun) {
    const collectionCache = new Map<string, VariableCollection>();
    for (const item of results) {
      if (item.status !== "planned") continue;
      try {
        if (item.action === "create-variable") {
          if (!item.variableType || !item.collectionName) throw new Error("Missing variableType or collectionName");
          let collection = collectionCache.get(item.collectionName);
          if (!collection) {
            collection = await ensureCollection(item.collectionName, collectionStrategy);
            collectionCache.set(item.collectionName, collection);
          }
          const variable = figma.variables.createVariable(item.name, collection, item.variableType);
          variable.setValueForMode(collection.defaultModeId, toVariableValue(firstTokenValue(item as CreateDesignTokenInput), item.variableType));
          item.status = "created";
          item.figmaId = variable.id;
        } else if (item.action === "create-style") {
          const style = createStyle(item);
          item.status = "created";
          item.figmaId = style.id;
        }
      } catch (error) {
        item.status = "error";
        item.message = error instanceof Error ? error.message : String(error);
      }
    }
  }

  return buildResponse(options, context, dryRun, results);
}
