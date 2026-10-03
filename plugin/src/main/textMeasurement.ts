import { handleWriteRequest } from "./write";

type TextStyle = {
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  lineHeight?: { unit?: "PIXELS" | "PERCENT"; value?: number };
  letterSpacing?: { unit?: "PIXELS" | "PERCENT"; value?: number };
  textDecoration?: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
};

type MeasureItem = {
  ref?: string;
  characters: string;
  width?: number;
  style?: TextStyle;
};

const DEFAULT_FONT = { family: "Inter", style: "Regular" } as const;
const ALLOWED_STYLE: Record<string, true> = {
  fontFamily: true,
  fontStyle: true,
  fontSize: true,
  lineHeight: true,
  letterSpacing: true,
  textDecoration: true,
};

function fail(message: string, details?: unknown): never {
  throw Object.assign(new Error(message), {
    mutationError: { code: "INVALID_INPUT", message, details },
  });
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function styleOf(value: unknown, field: string): TextStyle {
  if (value === undefined) return {};
  const raw = object(value, field);
  for (const key of Object.keys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_STYLE, key)) fail(`${field}.${key} is not supported for text measurement`);
  }
  if (raw.fontFamily !== undefined && (typeof raw.fontFamily !== "string" || !raw.fontFamily)) {
    fail(`${field}.fontFamily must be a non-empty string`);
  }
  if (raw.fontStyle !== undefined && (typeof raw.fontStyle !== "string" || !raw.fontStyle)) {
    fail(`${field}.fontStyle must be a non-empty string`);
  }
  if (raw.fontSize !== undefined && (typeof raw.fontSize !== "number" || !Number.isFinite(raw.fontSize) || raw.fontSize <= 0)) {
    fail(`${field}.fontSize must be greater than 0`);
  }
  for (const key of ["lineHeight", "letterSpacing"] as const) {
    if (raw[key] === undefined) continue;
    const value = object(raw[key], `${field}.${key}`);
    for (const name of Object.keys(value)) if (name !== "unit" && name !== "value") fail(`${field}.${key}.${name} is not supported`);
    if (value.unit !== undefined && value.unit !== "PIXELS" && value.unit !== "PERCENT") fail(`${field}.${key}.unit is invalid`);
    if (value.value !== undefined && (typeof value.value !== "number" || !Number.isFinite(value.value))) fail(`${field}.${key}.value must be a finite number`);
    if (key === "lineHeight" && value.value !== undefined && value.value < 0) fail(`${field}.lineHeight.value must be non-negative`);
  }
  if (raw.textDecoration !== undefined && !["NONE", "UNDERLINE", "STRIKETHROUGH"].includes(String(raw.textDecoration))) {
    fail(`${field}.textDecoration is invalid`);
  }
  return raw as TextStyle;
}

function validate(params: Record<string, unknown> | undefined): MeasureItem[] {
  if (!params || !Array.isArray(params.items) || params.items.length < 1 || params.items.length > 50) {
    fail("items must contain between 1 and 50 entries");
  }
  for (const key of Object.keys(params)) {
    if (key !== "items") fail(`Unsupported measurement field: ${key}`);
  }
  return params.items.map((raw, index) => {
    const item = object(raw, `items[${index}]`);
    for (const key of Object.keys(item)) {
      if (!["ref", "characters", "width", "style"].includes(key)) {
        fail(`items[${index}].${key} is not supported`);
      }
    }
    if (item.ref !== undefined && (typeof item.ref !== "string" || !item.ref)) fail(`items[${index}].ref must be a non-empty string`);
    if (typeof item.characters !== "string") fail(`items[${index}].characters must be a string`);
    if (item.width !== undefined && (typeof item.width !== "number" || !Number.isFinite(item.width) || item.width <= 0)) fail(`items[${index}].width must be greater than 0`);
    return { ref: item.ref as string | undefined, characters: item.characters as string, width: item.width as number | undefined, style: styleOf(item.style, `items[${index}].style`) };
  });
}

/** Measures text with temporary native Figma TextNodes; every temporary node is removed before return. */
export async function measureText(params: Record<string, unknown> | undefined): Promise<{
  items: Array<{ ref?: string; width: number; height: number; font: { family: string; style: string } }>;
}> {
  const items = validate(params);
  const normalized = items.map((item) => ({
    ...item,
    style: { ...item.style, fontFamily: item.style?.fontFamily ?? DEFAULT_FONT.family, fontStyle: item.style?.fontStyle ?? DEFAULT_FONT.style, fontSize: item.style?.fontSize ?? 12 },
  }));

  const fonts = new Map<string, FontName>();
  for (const item of normalized) {
    const font = { family: item.style.fontFamily, style: item.style.fontStyle };
    fonts.set(JSON.stringify(font), font);
  }
  for (const font of fonts.values()) {
    try {
      await figma.loadFontAsync(font);
    } catch (error) {
      const message = `Unable to load font ${font.family} ${font.style}`;
      throw Object.assign(new Error(message), {
        mutationError: { code: "FONT_LOAD_FAILED", message, details: { font, cause: String(error) } },
      });
    }
  }

  const measured: Array<{ ref?: string; width: number; height: number; font: FontName }> = [];
  for (const item of normalized) {
    let nodeId: string | undefined;
    let measurementError: unknown;
    try {
      const result = await handleWriteRequest("create_text", undefined, {
        characters: item.characters,
        ...(item.width === undefined ? {} : { width: item.width }),
        style: { ...item.style, textAutoResize: item.width === undefined ? "WIDTH_AND_HEIGHT" : "HEIGHT" },
        compact: true,
      }) as { nodeId: string };
      nodeId = result.nodeId;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.type !== "TEXT" || node.fontName === figma.mixed) {
        throw new Error("Temporary text node has no measurable native font");
      }
      measured.push({ ref: item.ref, width: node.width, height: node.height, font: node.fontName });
    } catch (error) {
      measurementError = error;
    } finally {
      if (nodeId !== undefined) {
        try {
          await handleWriteRequest("delete_node", [nodeId], { nodeId });
        } catch (error) {
          const message = `Failed to remove temporary text node ${nodeId}`;
          throw Object.assign(new Error(message), {
            mutationError: {
              code: "CLEANUP_FAILED",
              message,
              details: {
                nodeId,
                cause: String(error),
                ...(measurementError === undefined ? {} : { measurementError: String(measurementError) }),
              },
            },
          });
        }
      }
    }
    if (measurementError !== undefined) throw measurementError;
  }
  return { items: measured };
}
