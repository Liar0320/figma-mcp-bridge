import { z } from "zod";

/** Figma node IDs use colon-separated format, e.g. "4029:12345". */
export const figmaNodeId = z
  .string()
  .regex(/^\d+:\d+$/, "Node ID must use colon format, e.g. '4029:12345'");

const exportFormat = z.enum(["PNG", "SVG", "JPG", "PDF"]);
const hexColor = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    "Color must be in #RRGGBB or #RRGGBBAA format"
  );

const solidPaint = z.object({
  type: z.literal("SOLID"),
  color: hexColor,
  opacity: z.number().min(0).max(1).optional(),
});

const createNodeBase = z.object({
  parentId: figmaNodeId.optional(),
  name: z.string().min(1).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  key: z.string().min(1).optional(),
});

const textStyleSchema = z.object({
  fontFamily: z.string().min(1).optional(),
  fontStyle: z.string().min(1).optional(),
  fontSize: z.number().positive().optional(),
  textDecoration: z
    .enum(["NONE", "UNDERLINE", "STRIKETHROUGH"])
    .optional(),
  textAlignHorizontal: z
    .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
    .optional(),
  textAlignVertical: z.enum(["TOP", "CENTER", "BOTTOM"]).optional(),
  textAutoResize: z
    .enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"])
    .optional(),
  lineHeight: z
    .object({
      unit: z.enum(["PIXELS", "PERCENT"]).optional(),
      value: z.number().nonnegative().optional(),
    })
    .optional(),
  letterSpacing: z
    .object({
      unit: z.enum(["PIXELS", "PERCENT"]).optional(),
      value: z.number().optional(),
    })
    .optional(),
});

const paddingSchema = z.object({
  top: z.number().nonnegative().optional(),
  right: z.number().nonnegative().optional(),
  bottom: z.number().nonnegative().optional(),
  left: z.number().nonnegative().optional(),
});

const tokenGroup = z.enum(["color", "typography", "effect", "grid", "spacing", "radius", "size", "opacity", "unknown"]);
const tokenSource = z.enum(["variable", "style"]);
const variableType = z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]);
const styleType = z.enum(["paint", "text", "effect", "grid"]);
const designTokenInput = z.object({
  name: z.string().min(1),
  group: tokenGroup,
  source: tokenSource.optional(),
  value: z.unknown(),
  valuesByMode: z.record(z.string(), z.unknown()).optional(),
  variableType: variableType.optional(),
  styleType: styleType.optional(),
  collectionName: z.string().min(1).optional(),
  description: z.string().optional(),
});

const nodeName = z
  .string()
  .refine((value) => value.trim().length > 0, "Name must not be empty or whitespace only");

export const batchOperationType = z.enum([
  "create_frame",
  "create_text",
  "create_rectangle",
  "append_children",
  "set_position",
  "set_size",
  "set_fills",
  "set_strokes",
  "set_corner_radius",
  "set_text_content",
  "set_text_style",
  "set_layout_mode",
  "set_padding",
  "set_item_spacing",
  "set_node_name",
  "rename_node",
  "find_nodes",
  "delete_node",
]);

const batchOperation = z.object({
  type: batchOperationType,
  nodeId: z.string().optional(),
  nodeIds: z.array(z.string()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  ref: z.string().min(1).optional(),
});

export const toolInputSchemas = {
  get_node: z.object({
    nodeId: figmaNodeId.describe("The node ID to fetch"),
  }),

  get_design_context: z.object({
    depth: z
      .number()
      .optional()
      .describe("How many levels deep to traverse the node tree (default 2)"),
  }),

  get_token_usage: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional node IDs to scan. If omitted, scans current selection when non-empty, otherwise the current page."
      ),
  }),

  audit_design_tokens: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional node IDs to audit. If omitted, audits current selection when non-empty, otherwise the current page."
      ),
    minCoverage: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Coverage threshold for LOW_COVERAGE audit issue. Default 0.8."),
    includeUnusedTokens: z
      .boolean()
      .optional()
      .describe("Whether to include UNUSED_TOKEN findings for tokens not referenced in the scanned scope. Default true."),
  }),

  propose_design_tokens: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional node IDs to analyze. If omitted, analyzes current selection when non-empty, otherwise the current page."
      ),
    minOccurrences: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Minimum repeated occurrences required for a value-based token proposal. Default 2."),
    includeExactValueMatches: z
      .boolean()
      .optional()
      .describe("Whether to include proposals for repeated exact-value matches to existing tokens. Default false."),
    includeDuplicateTokenValues: z
      .boolean()
      .optional()
      .describe("Whether to include duplicate existing token value consolidation proposals. Default true."),
    maxProposals: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum proposals to return. Default 50."),
  }),

  create_design_tokens: z.object({
    tokens: z
      .array(designTokenInput)
      .min(1)
      .max(100)
      .describe("Design tokens to create. Defaults to dry-run preview; actual creation requires dryRun=false."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview only by default. Set explicitly to false to create variables/styles in Figma."),
    collectionName: z
      .string()
      .min(1)
      .optional()
      .describe("Default variable collection name. Default Design Tokens."),
    collectionStrategy: z
      .enum(["upsert-by-name", "create-new"])
      .optional()
      .describe("How to choose/create a variable collection. Default upsert-by-name."),
    modeStrategy: z
      .enum(["use-default", "create-missing"])
      .optional()
      .describe("Mode handling strategy. First implementation writes default mode values."),
    conflictStrategy: z
      .enum(["error", "skip"])
      .optional()
      .describe("What to do if a token path/value already exists. Default error."),
  }),

  get_screenshot: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional list of node IDs to export (colon-separated format, e.g. '4029:12345'). If empty, exports the current selection"
      ),
    format: exportFormat
      .optional()
      .describe("Export format: PNG (default) or SVG or JPG or PDF"),
    scale: z
      .number()
      .optional()
      .describe("Export scale for raster formats (default 2)"),
  }),

  save_screenshots: z.object({
    items: z
      .array(
        z.object({
          nodeId: figmaNodeId.describe("The node ID to export"),
          outputPath: z
            .string()
            .min(1)
            .describe(
              "Output file path (relative paths resolve from the MCP server current working directory)",
            ),
          format: exportFormat.optional(),
          scale: z.number().optional(),
        })
      )
      .min(1),
    format: exportFormat.optional(),
    scale: z.number().optional(),
  }),
  create_frame: createNodeBase.extend({
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    itemSpacing: z.number().optional(),
    padding: paddingSchema.optional(),
  }),
  create_text: createNodeBase.extend({
    characters: z.string().optional(),
    style: textStyleSchema.optional(),
    fills: z.array(solidPaint).optional(),
  }),
  create_rectangle: createNodeBase.extend({
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
  }),
  append_children: z.object({
    parentId: figmaNodeId,
    childIds: z.array(figmaNodeId).min(1),
  }),
  set_position: z.object({
    nodeId: figmaNodeId,
    x: z.number(),
    y: z.number(),
  }),
  set_size: z.object({
    nodeId: figmaNodeId,
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  set_fills: z.object({
    nodeId: figmaNodeId,
    fills: z.array(solidPaint),
  }),
  set_strokes: z.object({
    nodeId: figmaNodeId,
    strokes: z.array(solidPaint),
  }),
  set_corner_radius: z.object({
    nodeId: figmaNodeId,
    cornerRadius: z.number().nonnegative(),
  }),
  set_text_content: z.object({
    nodeId: figmaNodeId,
    characters: z.string(),
  }),
  set_text_style: z.object({
    nodeId: figmaNodeId,
    style: textStyleSchema,
  }),
  set_layout_mode: z.object({
    nodeId: figmaNodeId,
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]),
  }),
  set_padding: z.object({
    nodeId: figmaNodeId,
    top: z.number().nonnegative().optional(),
    right: z.number().nonnegative().optional(),
    bottom: z.number().nonnegative().optional(),
    left: z.number().nonnegative().optional(),
  }),
  set_item_spacing: z.object({
    nodeId: figmaNodeId,
    itemSpacing: z.number(),
  }),
  set_node_name: z.object({
    nodeId: figmaNodeId,
    name: nodeName,
  }),
  rename_node: z.object({
    nodeId: figmaNodeId,
    name: nodeName,
  }),
  find_nodes: z.object({
    nodeId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    parentId: figmaNodeId.optional(),
  }),
  delete_node: z.object({
    nodeId: figmaNodeId,
  }),
  batch_mutation: z.object({
    operations: z.array(batchOperation).min(1).max(100),
  }),
} as const;

type ToolName = keyof typeof toolInputSchemas;

/**
 * Maps the RPC wire format { tool, nodeIds?, params? } to each tool's
 * expected input shape. Typed as Record<ToolName, ...> so adding a schema
 * without a mapper is a compile error.
 */
const rpcToArgs: Record<
  ToolName,
  (nodeIds?: string[], params?: Record<string, unknown>) => unknown
> = {
  get_node: (nodeIds) => ({ nodeId: nodeIds?.[0] }),
  get_design_context: (_nodeIds, params) => ({ ...params }),
  get_token_usage: (nodeIds, params) => ({ nodeIds, ...params }),
  audit_design_tokens: (nodeIds, params) => ({ nodeIds, ...params }),
  propose_design_tokens: (nodeIds, params) => ({ nodeIds, ...params }),
  create_design_tokens: (_nodeIds, params) => ({ ...params }),
  get_screenshot: (nodeIds, params) => ({ nodeIds, ...params }),
  save_screenshots: (_nodeIds, params) => ({ ...params }),
  create_frame: (_nodeIds, params) => ({ ...params }),
  create_text: (_nodeIds, params) => ({ ...params }),
  create_rectangle: (_nodeIds, params) => ({ ...params }),
  append_children: (_nodeIds, params) => ({ ...params }),
  set_position: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_size: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_fills: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_strokes: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_corner_radius: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_text_content: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_text_style: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_layout_mode: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_padding: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_item_spacing: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_node_name: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  rename_node: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  find_nodes: (_nodeIds, params) => ({ ...params }),
  delete_node: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  batch_mutation: (_nodeIds, params) => ({ ...params }),
};

/**
 * Validate an RPC request against the corresponding tool's input schema.
 * Returns an error string on failure, null if valid or no schema exists for the tool.
 */
export function validateRpc(
  tool: string,
  nodeIds?: string[],
  params?: Record<string, unknown>,
): string | null {
  if (!(tool in toolInputSchemas)) return null;

  const name = tool as ToolName;
  const result = toolInputSchemas[name].safeParse(
    rpcToArgs[name](nodeIds, params),
  );
  return result.success ? null : result.error.issues[0].message;
}
