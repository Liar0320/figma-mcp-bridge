import { collectDesignTokens, normalizeTokenPath, normalizeTokenSegment, type NormalizedToken, type TokenGroup } from "./tokens";

export type CreateDesignTokenSource = "variable" | "style";
export type CreateDesignTokenVariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
export type CreateDesignTokenStyleType = "paint" | "text" | "effect" | "grid";
export type CreateDesignTokenConflictStrategy = "error" | "skip" | "allow-same-value-different-group";
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

export type CreateDesignTokenWarning = {
  code: "CROSS_GROUP_SAME_VALUE_FLOAT_TOKEN";
  message: string;
  tokenPath?: string;
  group?: TokenGroup;
  value?: unknown;
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
  warnings?: CreateDesignTokenWarning[];
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
  warnings?: CreateDesignTokenWarning[];
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

export function variableNameForCreatedToken(group: TokenGroup, name: string, variableType: CreateDesignTokenVariableType): string {
  if (variableType !== "FLOAT") return name;
  if (!["spacing", "radius", "size", "opacity"].includes(group)) return name;
  const firstSegment = normalizeTokenSegment(name.split("/")[0] ?? "");
  return firstSegment === group ? name : `${group}/${name}`;
}

const toFontName = (value: unknown): FontName => {
  if (!isObject(value)) {
    throw new Error("Text style value must be an object");
  }

  if (isObject(value.fontName)) {
    const family = value.fontName.family;
    const style = value.fontName.style;
    if (typeof family === "string" && family.trim() && typeof style === "string" && style.trim()) {
      return { family, style };
    }
  }

  if (typeof value.fontFamily === "string" && value.fontFamily.trim() && typeof value.fontStyle === "string" && value.fontStyle.trim()) {
    return { family: value.fontFamily, style: value.fontStyle };
  }

  throw new Error("Text style value must include fontName or fontFamily/fontStyle");
};

const toLineHeight = (value: unknown): LineHeight | undefined => {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.unit !== "string") {
    throw new Error("Text style lineHeight must be an object with unit");
  }
  if (value.unit === "AUTO") return { unit: "AUTO" };
  if (value.unit !== "PIXELS" && value.unit !== "PERCENT") {
    throw new Error("Text style lineHeight.unit must be PIXELS, PERCENT, or AUTO");
  }
  if (typeof value.value !== "number" || value.value < 0) {
    throw new Error("Text style lineHeight.value must be a nonnegative number");
  }
  return { unit: value.unit, value: value.value };
};

const toLetterSpacing = (value: unknown): LetterSpacing | undefined => {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.unit !== "string") {
    throw new Error("Text style letterSpacing must be an object with unit");
  }
  if (value.unit !== "PIXELS" && value.unit !== "PERCENT") {
    throw new Error("Text style letterSpacing.unit must be PIXELS or PERCENT");
  }
  if (typeof value.value !== "number") {
    throw new Error("Text style letterSpacing.value must be a number");
  }
  return { unit: value.unit, value: value.value };
};

const validateTextStyleValue = (value: unknown): void => {
  if (!isObject(value)) throw new Error("Text style value must be an object");
  toFontName(value);
  if (typeof value.fontSize !== "number" || value.fontSize <= 0) {
    throw new Error("Text style value must include a positive fontSize");
  }
  toLineHeight(value.lineHeight);
  toLetterSpacing(value.letterSpacing);
};

const applyOptionalTextStyleFields = (style: TextStyle, value: Record<string, unknown>): void => {
  if (typeof value.fontSize === "number") style.fontSize = value.fontSize;
  if (typeof value.textDecoration === "string") style.textDecoration = value.textDecoration as TextDecoration;
  if (typeof value.textCase === "string") style.textCase = value.textCase as TextCase;
  if (typeof value.paragraphIndent === "number") style.paragraphIndent = value.paragraphIndent;
  if (typeof value.paragraphSpacing === "number") style.paragraphSpacing = value.paragraphSpacing;

  const lineHeight = toLineHeight(value.lineHeight);
  if (lineHeight) style.lineHeight = lineHeight;

  const letterSpacing = toLetterSpacing(value.letterSpacing);
  if (letterSpacing) style.letterSpacing = letterSpacing;
};

const createStyle = async (item: CreateDesignTokenPlanItem): Promise<BaseStyle> => {
  if (item.styleType === "paint") {
    const style = figma.createPaintStyle();
    style.name = item.name;
    style.paints = [toSolidPaint(item.value)];
    return style;
  }
  if (item.styleType === "text") {
    if (!isObject(item.value)) throw new Error("Text style value must be an object");
    const fontName = toFontName(item.value);
    if (typeof item.value.fontSize !== "number" || item.value.fontSize <= 0) {
      throw new Error("Text style value must include a positive fontSize");
    }
    await figma.loadFontAsync(fontName);
    const style = figma.createTextStyle();
    style.name = item.name;
    style.fontName = fontName;
    applyOptionalTextStyleFields(style, item.value);
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
export const createStyleForTest = createStyle;

export function planCreateDesignTokens(
  options: CreateDesignTokensOptions,
  existingTokens: NormalizedToken[],
  context: CreateDesignTokensContext,
): CreateDesignTokensResponse {
  const dryRun = options.dryRun !== false;
  const conflictStrategy = options.conflictStrategy ?? "error";
  const existingByPath = new Map<string, NormalizedToken>(existingTokens.map((token) => [token.path, token]));
  const existingByValue = new Map<string, NormalizedToken[]>();
  for (const existingToken of existingTokens) {
    const value = existingToken.value ?? existingToken.valuesByMode;
    if (value === undefined) continue;
    const key = stableStringify(value);
    const bucket = existingByValue.get(key) ?? [];
    bucket.push(existingToken);
    existingByValue.set(key, bucket);
  }

  const results: CreateDesignTokenPlanItem[] = options.tokens.map((token) => {
    const source = inferSource(token);
    const path = normalizeTokenPath(token.group, token.name);
    const existing = existingByPath.get(path);
    const valueKey = stableStringify(token.valuesByMode ?? token.value);
    const sameValueTokens = existingByValue.get(valueKey) ?? [];
    const variableType = source === "variable" ? inferVariableType(token) : undefined;
    const styleType = source === "style" ? inferStyleType(token) : undefined;
    const collectionName = token.collectionName ?? options.collectionName ?? DEFAULT_COLLECTION_NAME;
    const sameGroupValueToken = sameValueTokens.find((existingToken) => existingToken.group === token.group);
    const crossGroupFloatTokens = variableType === "FLOAT"
      ? sameValueTokens.filter((existingToken) => existingToken.group !== token.group && ["spacing", "radius", "size", "opacity"].includes(existingToken.group))
      : [];
    const crossGroupWarnings: CreateDesignTokenWarning[] = crossGroupFloatTokens.map((existingToken) => ({
      code: "CROSS_GROUP_SAME_VALUE_FLOAT_TOKEN",
      tokenPath: existingToken.path,
      group: existingToken.group,
      value: existingToken.value ?? existingToken.valuesByMode,
      message: `Same FLOAT value already exists in ${existingToken.group} token ${existingToken.path}; treating as semantic overlap warning, not a blocking conflict.`,
    }));

    if (existing || sameGroupValueToken || (sameValueTokens.length > 0 && crossGroupWarnings.length === 0)) {
      const message = existing
        ? `Token path already exists: ${path}`
        : "A token with the same value already exists";
      const blockingToken = existing ?? sameGroupValueToken ?? sameValueTokens[0];
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
        existingTokenPath: blockingToken?.path,
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

    if (source === "style" && styleType === "text") {
      try {
        validateTextStyleValue(token.value);
      } catch (error) {
        return {
          name: token.name,
          path,
          group: token.group,
          source,
          action: "error",
          status: "error",
          value: token.value,
          valuesByMode: token.valuesByMode,
          styleType,
          message: error instanceof Error ? error.message : String(error),
        };
      }
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
      existingTokenPath: crossGroupWarnings[0]?.tokenPath,
      warnings: crossGroupWarnings.length > 0 ? crossGroupWarnings : undefined,
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

  const warnings = results.flatMap((item) => item.warnings ?? []);

  return {
    version: 1,
    dryRun,
    fileName: context.fileName,
    currentPage: context.currentPage,
    summary: {
      requested: options.tokens.length,
      ...counts,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
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
          const variableName = variableNameForCreatedToken(item.group, item.name, item.variableType);
          const variable = figma.variables.createVariable(variableName, collection, item.variableType);
          variable.setValueForMode(collection.defaultModeId, toVariableValue(firstTokenValue(item as CreateDesignTokenInput), item.variableType));
          item.status = "created";
          item.figmaId = variable.id;
        } else if (item.action === "create-style") {
          const style = await createStyle(item);
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
