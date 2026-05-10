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
const applyTokenMatchType = z.enum(["exactValue", "style", "boundVariable"]);
const designTokenExportFormat = z.enum(["json", "dtcg", "css", "tailwind"]);
const componentPropertyType = z.enum(["BOOLEAN", "TEXT", "INSTANCE_SWAP", "VARIANT"]);
const componentPropertyValue = z.union([z.string(), z.boolean()]);
const componentPropertyMap = z.record(z.string().min(1), componentPropertyValue);
const variantPropertyMap = z.record(z.string().min(1), z.string().min(1));
const findNodesScope = z.enum(["currentPage", "allPages"]);
const findNodesNameMatch = z.enum(["contains", "exact", "regex"]);
const findNodesType = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const preferredInstanceSwapValue = z.object({
  type: z.enum(["COMPONENT", "COMPONENT_SET"]),
  key: z.string().min(1),
});
const componentPropertyOperation = z.object({
  action: z.enum(["add", "edit", "delete"]),
  propertyName: z.string().min(1),
  propertyType: componentPropertyType.optional(),
  defaultValue: componentPropertyValue.optional(),
  newName: z.string().min(1).optional(),
  preferredValues: z.array(preferredInstanceSwapValue).optional(),
});
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
  "create_component",
  "create_instance",
  "combine_as_variants",
  "set_variant_properties",
  "manage_component_properties",
  "set_component_properties",
  "set_exposed_instance",
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

const fileKeyField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "The fileKey/session id of the Figma file to query. Required when multiple files are connected. Use list_files to see connected files."
  );

const withFileKey = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, fileKey: fileKeyField });

const localComponentsPaginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Maximum number of top-level inventory entries (component sets + standalone components) to return. Omit for backwards-compatible full inventory."
    ),
  pageId: figmaNodeId
    .optional()
    .describe("Restrict local component inventory to a single page."),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("Pagination cursor returned by a previous bounded local component inventory call."),
  maxDurationMs: z
    .number()
    .int()
    .min(100)
    .max(25000)
    .optional()
    .describe("Best-effort scan time budget in milliseconds before returning partial results and warnings."),
};

export const toolInputSchemas = {
  get_document: withFileKey({}),
  get_selection: withFileKey({}),
  get_styles: withFileKey({}),
  get_metadata: withFileKey({}),
  get_local_components: withFileKey(localComponentsPaginationFields),
  get_components: withFileKey(localComponentsPaginationFields),
  get_variable_defs: withFileKey({}),
  get_design_tokens: withFileKey({}),

  get_node: withFileKey({
    nodeId: figmaNodeId.describe("The node ID to fetch"),
  }),

  get_design_context: withFileKey({
    depth: z
      .number()
      .optional()
      .describe("How many levels deep to traverse the node tree (default 2)"),
  }),

  get_token_usage: withFileKey({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional node IDs to scan. If omitted, scans current selection when non-empty, otherwise the current page."
      ),
  }),

  audit_design_tokens: withFileKey({
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

  propose_design_tokens: withFileKey({
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

  export_design_tokens: withFileKey({
    format: designTokenExportFormat
      .optional()
      .describe("Export format. Defaults to json."),
    tokenPaths: z
      .array(z.string().min(1))
      .optional()
      .describe("Optional token paths to include. If omitted, exports all tokens."),
    includeMetadata: z
      .boolean()
      .optional()
      .describe("Whether to include metadata/extensions where supported. Default true."),
    cssSelector: z
      .string()
      .min(1)
      .optional()
      .describe("CSS selector for css format. Default :root."),
  }),

  create_design_tokens: withFileKey({
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
      .enum(["error", "skip", "allow-same-value-different-group"])
      .optional()
      .describe("What to do if a token path/value already exists. Default error. Cross-group same-value FLOAT tokens are warnings by default."),
  }),

  apply_tokens: withFileKey({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional node IDs to update. If omitted, scans current selection when non-empty, otherwise the current page."
      ),
    tokenPaths: z
      .array(z.string().min(1))
      .optional()
      .describe("Optional token paths to apply. If omitted, all exact-value matches are considered."),
    matchTypes: z
      .array(applyTokenMatchType)
      .optional()
      .describe("Usage match types to consider. Default exactValue; style and boundVariable matches are skipped as already applied."),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview apply plan only by default. Set explicitly to false to bind variables/apply styles in Figma."),
    failureMode: z
      .enum(["best-effort", "atomic", "grouped"])
      .optional()
      .describe("How to proceed after mutation failures. Default best-effort. atomic stops after first failure; grouped reports failures by token group."),
  }),

  get_screenshot: withFileKey({
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

  save_screenshots: withFileKey({
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
    fileKey: fileKeyField,
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    itemSpacing: z.number().optional(),
    padding: paddingSchema.optional(),
  }),
  create_component: createNodeBase.extend({
    fileKey: fileKeyField,
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
    itemSpacing: z.number().optional(),
    padding: paddingSchema.optional(),
  }),
  create_instance: withFileKey({
    componentId: figmaNodeId,
    parentId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    key: z.string().min(1).optional(),
  }),
  combine_as_variants: withFileKey({
    componentIds: z.array(figmaNodeId).min(2),
    parentId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    key: z.string().min(1).optional(),
  }),
  set_variant_properties: withFileKey({
    componentId: figmaNodeId.describe("A COMPONENT node inside a COMPONENT_SET"),
    variantProperties: variantPropertyMap.describe("Variant dimension/value pairs, e.g. { State: \"Hover\", Size: \"Large\" }"),
    replace: z.boolean().optional().describe("Replace all current variant properties instead of merging with existing values. Default false."),
  }),
  manage_component_properties: withFileKey({
    componentId: figmaNodeId.describe("A COMPONENT or COMPONENT_SET node that owns component property definitions"),
    operations: z.array(componentPropertyOperation).min(1).max(50),
  }),
  set_component_properties: withFileKey({
    instanceId: figmaNodeId.describe("An INSTANCE node whose variant/component properties should be configured"),
    properties: componentPropertyMap.describe("Component property values keyed by property name"),
  }),
  set_exposed_instance: withFileKey({
    instanceId: figmaNodeId.describe("A nested INSTANCE node inside a component/component set"),
    isExposed: z.boolean(),
  }),
  create_text: createNodeBase.extend({
    fileKey: fileKeyField,
    characters: z.string().optional(),
    style: textStyleSchema.optional(),
    fills: z.array(solidPaint).optional(),
  }),
  create_rectangle: createNodeBase.extend({
    fileKey: fileKeyField,
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
  }),
  append_children: withFileKey({
    parentId: figmaNodeId,
    childIds: z.array(figmaNodeId).min(1),
  }),
  set_position: withFileKey({
    nodeId: figmaNodeId,
    x: z.number(),
    y: z.number(),
  }),
  set_size: withFileKey({
    nodeId: figmaNodeId,
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  set_fills: withFileKey({
    nodeId: figmaNodeId,
    fills: z.array(solidPaint),
  }),
  set_strokes: withFileKey({
    nodeId: figmaNodeId,
    strokes: z.array(solidPaint),
  }),
  set_corner_radius: withFileKey({
    nodeId: figmaNodeId,
    cornerRadius: z.number().nonnegative(),
  }),
  set_text_content: withFileKey({
    nodeId: figmaNodeId,
    characters: z.string(),
  }),
  set_text_style: withFileKey({
    nodeId: figmaNodeId,
    style: textStyleSchema,
  }),
  set_layout_mode: withFileKey({
    nodeId: figmaNodeId,
    layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]),
  }),
  set_padding: withFileKey({
    nodeId: figmaNodeId,
    top: z.number().nonnegative().optional(),
    right: z.number().nonnegative().optional(),
    bottom: z.number().nonnegative().optional(),
    left: z.number().nonnegative().optional(),
  }),
  set_item_spacing: withFileKey({
    nodeId: figmaNodeId,
    itemSpacing: z.number(),
  }),
  set_node_name: withFileKey({
    nodeId: figmaNodeId,
    name: nodeName,
  }),
  rename_node: withFileKey({
    nodeId: figmaNodeId,
    name: nodeName,
  }),
  find_nodes: withFileKey({
    query: z
      .string()
      .min(1)
      .optional()
      .describe("Legacy search string or JSON-encoded filters. Plain strings match node names by substring."),
    nodeId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    parentId: figmaNodeId.optional(),
    scope: findNodesScope.optional().describe("Search scope. Defaults to currentPage for backwards compatibility."),
    pageId: figmaNodeId.optional().describe("Optional page ID. When provided, searches only that page."),
    type: findNodesType
      .optional()
      .describe("Optional Figma node type or list of types, e.g. COMPONENT, COMPONENT_SET, FRAME, TEXT, INSTANCE."),
    nameMatch: findNodesNameMatch.optional().describe("Name matching mode. Defaults to contains."),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum number of matches to return. Default 100, max 500."),
    includeHidden: z.boolean().optional().describe("Whether to include hidden nodes. Defaults to true for compatibility."),
  }),
  delete_node: withFileKey({
    nodeId: figmaNodeId,
  }),
  batch_mutation: withFileKey({
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
  get_document: (_nodeIds, params) => ({ ...params }),
  get_selection: (_nodeIds, params) => ({ ...params }),
  get_styles: (_nodeIds, params) => ({ ...params }),
  get_metadata: (_nodeIds, params) => ({ ...params }),
  get_local_components: (_nodeIds, params) => ({ ...params }),
  get_components: (_nodeIds, params) => ({ ...params }),
  get_variable_defs: (_nodeIds, params) => ({ ...params }),
  get_design_tokens: (_nodeIds, params) => ({ ...params }),
  get_node: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_design_context: (_nodeIds, params) => ({ ...params }),
  get_token_usage: (nodeIds, params) => ({ nodeIds, ...params }),
  audit_design_tokens: (nodeIds, params) => ({ nodeIds, ...params }),
  propose_design_tokens: (nodeIds, params) => ({ nodeIds, ...params }),
  export_design_tokens: (_nodeIds, params) => ({ ...params }),
  create_design_tokens: (_nodeIds, params) => ({ ...params }),
  apply_tokens: (nodeIds, params) => ({ nodeIds, ...params }),
  get_screenshot: (nodeIds, params) => ({ nodeIds, ...params }),
  save_screenshots: (_nodeIds, params) => ({ ...params }),
  create_frame: (_nodeIds, params) => ({ ...params }),
  create_component: (_nodeIds, params) => ({ ...params }),
  create_instance: (_nodeIds, params) => ({ ...params }),
  combine_as_variants: (_nodeIds, params) => ({ ...params }),
  set_variant_properties: (_nodeIds, params) => ({ ...params }),
  manage_component_properties: (_nodeIds, params) => ({ ...params }),
  set_component_properties: (_nodeIds, params) => ({ ...params }),
  set_exposed_instance: (_nodeIds, params) => ({ ...params }),
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
