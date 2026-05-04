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
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function normalizeTokenPath(group: TokenGroup, figmaName: string): string {
  const parts = figmaName
    .split("/")
    .map(normalizeTokenSegment)
    .filter(Boolean);
  return [group, ...parts].join(".");
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

export async function collectVariableTokens(): Promise<NormalizedToken[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const tokens: NormalizedToken[] = [];

  for (const collection of collections) {
    const variables = await Promise.all(
      collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
    );
    const modes = collection.modes.map((mode) => ({
      id: mode.modeId,
      name: mode.name,
    }));

    for (const variable of variables) {
      if (!variable) continue;
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
  return [...variableTokens, ...styleTokens];
}
