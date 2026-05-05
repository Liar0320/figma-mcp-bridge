import type { DesignTokensResponse, NormalizedToken, TokenGroup } from "./tokens";

export type DesignTokenExportFormat = "json" | "dtcg" | "css" | "tailwind";

export type ExportDesignTokensOptions = {
  format?: DesignTokenExportFormat;
  tokenPaths?: string[];
  includeMetadata?: boolean;
  cssSelector?: string;
};

export type ExportDesignTokensResponse = {
  version: 1;
  format: DesignTokenExportFormat;
  fileName: string;
  currentPage: DesignTokensResponse["currentPage"];
  tokenCount: number;
  exportedTokenCount: number;
  contentType: string;
  filename: string;
  content: string;
  warnings: string[];
};

type CssValueResult = {
  value?: string;
  warning?: string;
};

const DEFAULT_FORMAT: DesignTokenExportFormat = "json";
const FORMAT_CONTENT_TYPES: Record<DesignTokenExportFormat, string> = {
  json: "application/json",
  dtcg: "application/json",
  css: "text/css",
  tailwind: "application/json",
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const slugifyFileSegment = (value: string): string =>
  value
    .trim()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "figma-file";

const tokenPathToCssName = (path: string): string =>
  `--${path
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")}`;

const alphaToHex = (opacity: number): string =>
  Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");

const serializeColorCss = (value: Record<string, unknown>): string | undefined => {
  if (typeof value.color !== "string") return undefined;
  const opacity = typeof value.opacity === "number" ? value.opacity : 1;
  if (opacity >= 1) return value.color.toLowerCase();
  return `${value.color.toLowerCase()}${alphaToHex(opacity)}`;
};

const primitiveTokenValue = (token: NormalizedToken): unknown => {
  if (token.value !== undefined) return token.value;
  if (token.valuesByMode) return Object.values(token.valuesByMode)[0];
  return undefined;
};

const cssValueForToken = (token: NormalizedToken): CssValueResult => {
  const value = primitiveTokenValue(token);

  if (token.group === "color") {
    if (isObject(value) && value.type === "COLOR") {
      const color = serializeColorCss(value);
      if (color) return { value: color };
    }
    return { warning: `Skipped ${token.path}: color token has no serializable COLOR value.` };
  }

  if (["spacing", "radius", "size"].includes(token.group)) {
    if (typeof value === "number") return { value: `${value}px` };
    return { warning: `Skipped ${token.path}: ${token.group} token is not numeric.` };
  }

  if (token.group === "opacity") {
    if (typeof value === "number") return { value: String(value) };
    return { warning: `Skipped ${token.path}: opacity token is not numeric.` };
  }

  return { warning: `Skipped ${token.path}: ${token.group} tokens are not supported in CSS export yet.` };
};

const dtcgTypeForGroup = (group: TokenGroup): string => {
  switch (group) {
    case "color":
      return "color";
    case "typography":
      return "typography";
    case "effect":
      return "shadow";
    case "grid":
      return "dimension";
    case "spacing":
    case "radius":
    case "size":
      return "dimension";
    case "opacity":
      return "number";
    default:
      return "unknown";
  }
};

function setNestedToken(root: Record<string, unknown>, token: NormalizedToken, value: unknown): void {
  const parts = token.path.split(".").filter(Boolean);
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    if (!isObject(existing) || "$value" in existing) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1] ?? token.path] = value;
}

function exportJson(tokens: NormalizedToken[], context: ExportContext): string {
  return JSON.stringify(
    {
      version: 1,
      fileName: context.fileName,
      currentPage: context.currentPage,
      summary: context.summary,
      tokens,
    },
    null,
    2,
  );
}

function exportDtcg(tokens: NormalizedToken[], context: ExportContext, includeMetadata: boolean): string {
  const root: Record<string, unknown> = {};
  for (const token of tokens) {
    const entry: Record<string, unknown> = {
      $type: dtcgTypeForGroup(token.group),
      $value: primitiveTokenValue(token),
    };
    if (token.description) entry.$description = token.description;
    if (includeMetadata) {
      entry.$extensions = {
        figma: {
          id: token.figmaId,
          source: token.source,
          styleType: token.styleType,
          collectionId: token.collectionId,
          originalPath: token.originalPath,
          valuesByMode: token.valuesByMode,
          modes: token.modes,
        },
      };
    }
    setNestedToken(root, token, entry);
  }

  if (includeMetadata) {
    root.$extensions = {
      figmaMcpBridge: {
        version: 1,
        fileName: context.fileName,
        currentPage: context.currentPage,
        summary: context.summary,
      },
    };
  }

  return JSON.stringify(root, null, 2);
}

function exportCss(tokens: NormalizedToken[], selector: string): { content: string; warnings: string[]; count: number } {
  const warnings: string[] = [];
  const lines: string[] = [`${selector} {`];
  let count = 0;

  for (const token of tokens) {
    const result = cssValueForToken(token);
    if (result.value) {
      lines.push(`  ${tokenPathToCssName(token.path)}: ${result.value};`);
      count += 1;
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  lines.push("}");
  return { content: lines.join("\n"), warnings, count };
}

const putTailwindValue = (
  extend: Record<string, Record<string, unknown>>,
  section: string,
  token: NormalizedToken,
  value: unknown,
): void => {
  if (!extend[section]) extend[section] = {};
  const key = token.path.split(".").slice(1).join(".") || token.name;
  extend[section][key] = value;
};

function exportTailwind(tokens: NormalizedToken[]): { content: string; warnings: string[]; count: number } {
  const extend: Record<string, Record<string, unknown>> = {};
  const warnings: string[] = [];
  let count = 0;

  for (const token of tokens) {
    const css = cssValueForToken(token);
    if (!css.value) {
      if (token.group !== "effect" && token.group !== "grid") {
        warnings.push(`Skipped ${token.path}: ${token.group} token cannot be represented in Tailwind theme export.`);
      }
      continue;
    }

    if (token.group === "color") putTailwindValue(extend, "colors", token, css.value);
    else if (token.group === "spacing" || token.group === "size") putTailwindValue(extend, "spacing", token, css.value);
    else if (token.group === "radius") putTailwindValue(extend, "borderRadius", token, css.value);
    else if (token.group === "opacity") putTailwindValue(extend, "opacity", token, Number(css.value));
    else continue;
    count += 1;
  }

  return { content: JSON.stringify({ theme: { extend } }, null, 2), warnings, count };
}

type ExportContext = {
  fileName: string;
  currentPage: DesignTokensResponse["currentPage"];
  summary: DesignTokensResponse["summary"];
};

export function exportDesignTokens(
  tokens: NormalizedToken[],
  context: ExportContext,
  options: ExportDesignTokensOptions = {},
): ExportDesignTokensResponse {
  const format = options.format ?? DEFAULT_FORMAT;
  const includeMetadata = options.includeMetadata ?? true;
  const cssSelector = options.cssSelector ?? ":root";
  const requestedPaths = new Set(options.tokenPaths ?? []);
  const filteredTokens = requestedPaths.size
    ? tokens.filter((token) => requestedPaths.has(token.path))
    : tokens;
  const warnings: string[] = [];

  if (requestedPaths.size) {
    const foundPaths = new Set(filteredTokens.map((token) => token.path));
    for (const path of requestedPaths) {
      if (!foundPaths.has(path)) warnings.push(`Token path not found: ${path}`);
    }
  }

  let content: string;
  let exportedTokenCount = filteredTokens.length;

  if (format === "json") {
    content = exportJson(filteredTokens, context);
  } else if (format === "dtcg") {
    content = exportDtcg(filteredTokens, context, includeMetadata);
  } else if (format === "css") {
    const result = exportCss(filteredTokens, cssSelector);
    content = result.content;
    warnings.push(...result.warnings);
    exportedTokenCount = result.count;
  } else {
    const result = exportTailwind(filteredTokens);
    content = result.content;
    warnings.push(...result.warnings);
    exportedTokenCount = result.count;
  }

  const extension = format === "css" ? "css" : "json";
  return {
    version: 1,
    format,
    fileName: context.fileName,
    currentPage: context.currentPage,
    tokenCount: tokens.length,
    exportedTokenCount,
    contentType: FORMAT_CONTENT_TYPES[format],
    filename: `${slugifyFileSegment(context.fileName)}-design-tokens.${extension}`,
    content,
    warnings,
  };
}
