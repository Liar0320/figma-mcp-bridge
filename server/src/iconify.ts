import { createRequire } from "node:module";

const DEFAULT_ICON_SET = "lucide";
const ICONIFY_API = "https://api.iconify.design";
const DEFAULT_SOURCE_MODE: IconSourceMode = "fallback";

export type IconSourceMode = "bundled" | "fallback" | "remote";
export type IconSource = "bundled" | "remote";
type IconifyEntry = { body?: string; width?: number | string; height?: number | string };
type IconifyCollection = { icons?: Record<string, IconifyEntry>; width?: number | string; height?: number | string };

const require = createRequire(import.meta.url);
const bundledLucide = require("@iconify-json/lucide/icons.json") as IconifyCollection;

export type ResolvedIcon = {
  iconSet: string;
  name: string;
  source: IconSource;
  sourceUrl?: string;
  svg: string;
};

const safeSegment = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) throw new Error(`${field} contains unsupported characters`);
  return trimmed;
};

const sourceModeFromEnv = (): IconSourceMode => {
  const value = process.env.FIGMA_BRIDGE_ICON_SOURCE?.trim().toLowerCase();
  return value === "bundled" || value === "remote" || value === "fallback" ? value : DEFAULT_SOURCE_MODE;
};

const validateSvg = (svg: string, source: string): void => {
  if (!/^\s*<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new Error(`${source} returned an invalid SVG payload`);
};

const resolveBundled = (iconSet: string, name: string): ResolvedIcon | undefined => {
  if (iconSet !== DEFAULT_ICON_SET) return undefined;
  const entry = bundledLucide.icons?.[name];
  if (!entry?.body) return undefined;
  const width = entry.width ?? bundledLucide.width ?? 24;
  const height = entry.height ?? bundledLucide.height ?? 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${entry.body}</svg>`;
  validateSvg(svg, "Bundled icon");
  return { iconSet, name, source: "bundled", svg };
};

const resolveRemote = async (iconSet: string, name: string): Promise<ResolvedIcon> => {
  const sourceUrl = `${ICONIFY_API}/${encodeURIComponent(iconSet)}/${encodeURIComponent(name)}.svg`;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Iconify icon not found: ${iconSet}:${name} (HTTP ${response.status})`);
  const svg = await response.text();
  validateSvg(svg, "Iconify");
  return { iconSet, name, source: "remote", sourceUrl, svg };
};

/** Resolves a bundled Lucide icon when available, with configurable remote behavior. */
export async function resolveIconifyIcon(iconSet = DEFAULT_ICON_SET, name: string, options?: { sourceMode?: IconSourceMode }): Promise<ResolvedIcon> {
  const resolvedSet = safeSegment(iconSet || DEFAULT_ICON_SET, "iconSet");
  const resolvedName = safeSegment(name, "name");
  const mode = options?.sourceMode ?? sourceModeFromEnv();
  if (mode !== "remote") {
    const bundled = resolveBundled(resolvedSet, resolvedName);
    if (bundled) return bundled;
    if (mode === "bundled") throw new Error(`Bundled icon not found: ${resolvedSet}:${resolvedName}`);
  }
  return resolveRemote(resolvedSet, resolvedName);
}

export { DEFAULT_ICON_SET, DEFAULT_SOURCE_MODE };
