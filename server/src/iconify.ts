const DEFAULT_ICON_SET = "lucide";
const ICONIFY_API = "https://api.iconify.design";

export type ResolvedIcon = {
  iconSet: string;
  name: string;
  sourceUrl: string;
  svg: string;
};

const safeSegment = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    throw new Error(`${field} contains unsupported characters`);
  }
  return trimmed;
};

/** Fetches one Iconify SVG and fails closed on invalid or non-SVG responses. */
export async function resolveIconifyIcon(iconSet = DEFAULT_ICON_SET, name: string): Promise<ResolvedIcon> {
  const resolvedSet = safeSegment(iconSet || DEFAULT_ICON_SET, "iconSet");
  const resolvedName = safeSegment(name, "name");
  const sourceUrl = `${ICONIFY_API}/${encodeURIComponent(resolvedSet)}/${encodeURIComponent(resolvedName)}.svg`;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Iconify icon not found: ${resolvedSet}:${resolvedName} (HTTP ${response.status})`);
  }
  const svg = await response.text();
  if (!/^\s*<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new Error("Iconify returned an invalid SVG payload");
  }
  return { iconSet: resolvedSet, name: resolvedName, sourceUrl, svg };
}

export { DEFAULT_ICON_SET };
