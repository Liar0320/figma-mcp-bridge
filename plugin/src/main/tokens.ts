export type TokenSource = "variable" | "style" | "inferred";

export type TokenGroup =
  | "color"
  | "typography"
  | "effect"
  | "grid"
  | "spacing"
  | "radius"
  | "size"
  | "opacity"
  | "unknown";

export type StyleTokenType = "paint" | "text" | "effect" | "grid";

export type NormalizedToken = {
  path: string;
  /** Human-readable source path preserving the original Figma token name. */
  originalPath: string;
  name: string;
  group: TokenGroup;
  source: TokenSource;
  value?: unknown;
  valuesByMode?: Record<string, unknown>;
  modes?: { id: string; name: string }[];
  figmaId?: string;
  collectionId?: string;
  styleType?: StyleTokenType;
  aliasOf?: string;
  description?: string;
  usageCount?: number;
  confidence?: number;
};

export type DesignTokensResponse = {
  version: 1;
  fileName: string;
  currentPage: { id: string; name: string };
  tokens: NormalizedToken[];
  summary: {
    total: number;
    bySource: Record<TokenSource, number>;
    byGroup: Partial<Record<TokenGroup, number>>;
  };
};

export type LocalVariableCollectionDefinition = {
  id: string;
  name: string;
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
  variables: Variable[];
};

const FLOAT_GROUP_PATTERNS: Array<[TokenGroup, RegExp]> = [
  ["spacing", /(^|[/\s_.-])(space|spacing|gap|padding|margin|inset)([/\s_.-]|$)/i],
  ["radius", /(^|[/\s_.-])(radius|rounded|corner)([/\s_.-]|$)/i],
  ["opacity", /(^|[/\s_.-])(opacity|alpha)([/\s_.-]|$)/i],
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const clampByte = (value: number): number =>
  Math.min(255, Math.max(0, Math.round(value * 255)));

const toHex = (color: RGB | RGBA): string =>
  `#${[clampByte(color.r), clampByte(color.g), clampByte(color.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

const serializeColor = (color: RGB | RGBA): { type: "COLOR"; color: string; opacity: number } => ({
  type: "COLOR",
  color: toHex(color),
  opacity: "a" in color ? color.a : 1,
});

export function normalizeTokenSegment(segment: string): string {
  return segment
    .trim()
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function normalizeTokenPath(group: TokenGroup, figmaName: string): string {
  const parts = figmaName
    .split("/")
    .map(normalizeTokenSegment)
    .filter(Boolean);
  const pathParts = parts[0] === group ? parts.slice(1) : parts;
  return [group, ...pathParts].join(".");
}

function hashTokenIdentity(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function tokenDisambiguator(token: NormalizedToken, index: number): string {
  const identity = token.figmaId ?? `${token.source}:${token.group}:${token.name}:${index}`;
  const suffix = normalizeTokenSegment(identity.split(/[:/]/).filter(Boolean).pop() ?? identity);
  return suffix || hashTokenIdentity(identity);
}

export function disambiguateTokenPaths(tokens: NormalizedToken[]): NormalizedToken[] {
  const pathCounts = new Map<string, number>();
  for (const token of tokens) {
    pathCounts.set(token.path, (pathCounts.get(token.path) ?? 0) + 1);
  }

  const usedPaths = new Set<string>();
  return tokens.map((token, index) => {
    const hasCollision = (pathCounts.get(token.path) ?? 0) > 1;
    const basePath = hasCollision
      ? `${token.path}.${tokenDisambiguator(token, index)}`
      : token.path;

    let path = basePath;
    let attempt = 1;
    while (usedPaths.has(path)) {
      path = `${basePath}.${hashTokenIdentity(`${token.source}:${token.group}:${token.name}:${index}:${attempt}`)}`;
      attempt += 1;
    }
    usedPaths.add(path);

    return path === token.path
      ? token
      : {
          ...token,
          path,
        };
  });
}

function groupFromVariable(variable: Variable): TokenGroup {
  switch (variable.resolvedType) {
    case "COLOR":
      return "color";
    case "FLOAT": {
      for (const [group, pattern] of FLOAT_GROUP_PATTERNS) {
        if (pattern.test(variable.name)) return group;
      }
      return "size";
    }
    case "STRING":
    case "BOOLEAN":
      return "unknown";
    default:
      return "unknown";
  }
}

export function serializeVariableValue(value: VariableValue): unknown {
  if (isObject(value)) {
    if (value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
      return { type: "VARIABLE_ALIAS", id: value.id };
    }
    if (
      typeof value.r === "number" &&
      typeof value.g === "number" &&
      typeof value.b === "number"
    ) {
      return serializeColor(value as RGBA);
    }
  }
  return value;
}

function defaultValueForModes(
  valuesByMode: Record<string, unknown>,
  defaultModeId: string,
): unknown {
  return valuesByMode[defaultModeId] ?? Object.values(valuesByMode)[0];
}

function annotateVariableApiError(stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `Figma variable API failed while ${stage}. ` +
      `The bridge/plugin connection is alive, but Figma's variables API did not complete for the target file. ` +
      `Original error: ${message}`,
  );
}

async function readLocalVariableCollections(): Promise<VariableCollection[]> {
  try {
    return await figma.variables.getLocalVariableCollectionsAsync();
  } catch (error) {
    throw annotateVariableApiError("reading local variable collections", error);
  }
}

async function readLocalVariables(): Promise<Variable[]> {
  const variablesApi = figma.variables as typeof figma.variables & {
    getLocalVariablesAsync?: () => Promise<Variable[]>;
  };

  if (typeof variablesApi.getLocalVariablesAsync !== "function") {
    throw new Error("getLocalVariablesAsync is not available");
  }

  try {
    return await variablesApi.getLocalVariablesAsync();
  } catch (error) {
    throw annotateVariableApiError("reading local variables", error);
  }
}

async function readVariablesById(variableIds: string[]): Promise<Variable[]> {
  try {
    const variables = await Promise.all(
      variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
    );
    return variables.filter((variable): variable is Variable => variable !== null);
  } catch (error) {
    throw annotateVariableApiError("reading local variables by id", error);
  }
}

function getVariableCollectionId(variable: Variable): string | undefined {
  return (variable as unknown as { variableCollectionId?: string }).variableCollectionId;
}

export async function collectLocalVariableDefinitions(): Promise<LocalVariableCollectionDefinition[]> {
  const collections = await readLocalVariableCollections();
  const variableIds = collections.flatMap((collection) => collection.variableIds);

  let variables: Variable[];
  try {
    variables = await readLocalVariables();
  } catch (error) {
    if (error instanceof Error && error.message === "getLocalVariablesAsync is not available") {
      variables = await readVariablesById(variableIds);
    } else {
      throw error;
    }
  }

  const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
  const variablesByCollectionId = new Map<string, Variable[]>();

  for (const variable of variables) {
    const collectionId = getVariableCollectionId(variable);
    if (!collectionId) continue;
    const group = variablesByCollectionId.get(collectionId) ?? [];
    group.push(variable);
    variablesByCollectionId.set(collectionId, group);
  }

  return collections.map((collection) => {
    const collectionVariables =
      collection.variableIds.length > 0
        ? collection.variableIds
            .map((id) => variablesById.get(id))
            .filter((variable): variable is Variable => variable !== undefined)
        : (variablesByCollectionId.get(collection.id) ?? []);

    return {
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({
        modeId: mode.modeId,
        name: mode.name,
      })),
      variables: collectionVariables,
    };
  });
}

export async function collectVariableTokens(): Promise<NormalizedToken[]> {
  const collections = await collectLocalVariableDefinitions();
  const tokens: NormalizedToken[] = [];

  for (const collection of collections) {
    const modes = collection.modes.map((mode) => ({
      id: mode.modeId,
      name: mode.name,
    }));

    for (const variable of collection.variables) {
      const group = groupFromVariable(variable);
      const valuesByMode = Object.fromEntries(
        Object.entries(variable.valuesByMode).map(([modeId, value]) => [
          modeId,
          serializeVariableValue(value),
        ]),
      );
      const firstAlias = Object.values(valuesByMode).find(
        (value) => isObject(value) && value.type === "VARIABLE_ALIAS" && typeof value.id === "string",
      ) as { type: "VARIABLE_ALIAS"; id: string } | undefined;

      tokens.push({
        path: normalizeTokenPath(group, variable.name),
        originalPath: variable.name,
        name: variable.name,
        group,
        source: "variable",
        value: defaultValueForModes(valuesByMode, collection.defaultModeId),
        valuesByMode,
        modes,
        figmaId: variable.id,
        collectionId: collection.id,
        aliasOf: firstAlias?.id,
        description: variable.description || undefined,
      });
    }
  }

  return tokens;
}

function serializePaintStyleValue(style: PaintStyle): unknown {
  return {
    paints: style.paints.map((paint) => {
      if (paint.type === "SOLID") {
        return {
          type: paint.type,
          color: serializeColor(paint.color),
          opacity: paint.opacity,
          boundVariables: paint.boundVariables,
        };
      }
      return paint;
    }),
  };
}

function serializeTextStyleValue(style: TextStyle): unknown {
  return {
    fontName: style.fontName,
    fontSize: style.fontSize,
    textDecoration: style.textDecoration,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    paragraphIndent: style.paragraphIndent,
    paragraphSpacing: style.paragraphSpacing,
    textCase: style.textCase,
    boundVariables: style.boundVariables,
  };
}

export async function collectStyleTokens(): Promise<NormalizedToken[]> {
  const [paintStyles, textStyles, effectStyles, gridStyles] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);

  return [
    ...paintStyles.map((style): NormalizedToken => ({
      path: normalizeTokenPath("color", style.name),
      originalPath: style.name,
      name: style.name,
      group: "color",
      source: "style",
      styleType: "paint",
      value: serializePaintStyleValue(style),
      figmaId: style.id,
      description: style.description || undefined,
    })),
    ...textStyles.map((style): NormalizedToken => ({
      path: normalizeTokenPath("typography", style.name),
      originalPath: style.name,
      name: style.name,
      group: "typography",
      source: "style",
      styleType: "text",
      value: serializeTextStyleValue(style),
      figmaId: style.id,
      description: style.description || undefined,
    })),
    ...effectStyles.map((style): NormalizedToken => ({
      path: normalizeTokenPath("effect", style.name),
      originalPath: style.name,
      name: style.name,
      group: "effect",
      source: "style",
      styleType: "effect",
      value: { effects: style.effects, boundVariables: style.boundVariables },
      figmaId: style.id,
      description: style.description || undefined,
    })),
    ...gridStyles.map((style): NormalizedToken => ({
      path: normalizeTokenPath("grid", style.name),
      originalPath: style.name,
      name: style.name,
      group: "grid",
      source: "style",
      styleType: "grid",
      value: { layoutGrids: style.layoutGrids },
      figmaId: style.id,
      description: style.description || undefined,
    })),
  ];
}

export function summarizeTokens(tokens: NormalizedToken[]): DesignTokensResponse["summary"] {
  const bySource: Record<TokenSource, number> = {
    variable: 0,
    style: 0,
    inferred: 0,
  };
  const byGroup: Partial<Record<TokenGroup, number>> = {};

  for (const token of tokens) {
    bySource[token.source] += 1;
    byGroup[token.group] = (byGroup[token.group] ?? 0) + 1;
  }

  return {
    total: tokens.length,
    bySource,
    byGroup,
  };
}

export async function collectDesignTokens(): Promise<NormalizedToken[]> {
  const [variableTokens, styleTokens] = await Promise.all([
    collectVariableTokens(),
    collectStyleTokens(),
  ]);
  return disambiguateTokenPaths([...variableTokens, ...styleTokens]);
}
