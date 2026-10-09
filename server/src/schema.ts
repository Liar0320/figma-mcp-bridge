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

const childLayoutFields = {
  layoutSizingHorizontal: z.enum(["FIXED", "HUG", "FILL"]).optional(),
  layoutSizingVertical: z.enum(["FIXED", "HUG", "FILL"]).optional(),
  layoutPositioning: z.enum(["AUTO", "ABSOLUTE"]).optional().describe("In create_scene, ABSOLUTE requires a HORIZONTAL or VERTICAL auto-layout parent; a PAGE or NONE-layout container is invalid."),
  minWidth: z.number().finite().nonnegative().nullable().optional(),
  maxWidth: z.number().finite().nonnegative().nullable().optional(),
  minHeight: z.number().finite().nonnegative().nullable().optional(),
  maxHeight: z.number().finite().nonnegative().nullable().optional(),
};

const containerLayoutFields = {
  layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).optional(),
  primaryAxisSizingMode: z.enum(["AUTO", "FIXED"]).optional(),
  counterAxisSizingMode: z.enum(["AUTO", "FIXED"]).optional(),
  primaryAxisAlignItems: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]).optional(),
  counterAxisAlignItems: z.enum(["MIN", "CENTER", "MAX", "BASELINE"]).optional(),
  layoutWrap: z.enum(["NO_WRAP", "WRAP"]).optional(),
};

const createNodeBase = z.object({
  parentId: figmaNodeId.optional().describe("Omit for current page, or specify the current PAGE ID or a container on that page; other pages are out of scope."),
  name: z.string().min(1).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  key: z.string().min(1).optional(),
  ...childLayoutFields,
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

const componentDimensionOperation = z.object({
  action: z.enum(["rename", "delete"]),
  name: z.string().min(1),
  newName: z.string().min(1).optional(),
  values: z.array(z.string().min(1)).optional(),
  failOnUnsupported: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.action === "rename" && !value.newName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newName"], message: "newName is required when renaming a dimension" });
  }
});

const componentMigrationOptions = {
  dryRun: z.boolean().optional().describe("Plan changes without mutating Figma. Defaults to true."),
  cloneBeforeMutate: z.boolean().optional().describe("Clone affected nodes before mutation. Defaults to true."),
  failOnUnsupported: z.boolean().optional().describe("Fail closed when a Figma API is unavailable. Defaults to true."),
  verify: z.boolean().optional().describe("Run deterministic postflight verification. Defaults to true."),
};

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
  "create_icon",
  "create_component",
  "create_instance",
  "swap_instance_component",
  "combine_as_variants",
  "set_variant_properties",
  "manage_component_properties",
  "set_component_properties",
  "set_exposed_instance",
  "bind_component_properties",
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

const batchMutationCompact = z
  .boolean()
  .optional()
  .default(true)
  .describe("Default true: return execution counts, refs, actual created IDs and failure/cleanup details only. Set false to include per-step results.");

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
const componentDimension = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
});
const componentTargetProperty = z.object({
  name: z.string().min(1),
  type: componentPropertyType,
  defaultValue: componentPropertyValue.optional(),
  variantOptions: z.array(z.string().min(1)).optional(),
  preferredValues: z.array(preferredInstanceSwapValue).optional(),
});
const componentTargetSchema = z.object({
  name: z.string().min(1).optional(),
  dimensions: z.array(componentDimension).optional(),
  properties: z.array(componentTargetProperty).optional(),
  requiredBindings: z.array(z.object({
    property: z.string().min(1),
    nodeName: z.string().min(1).optional(),
    type: componentPropertyType.optional(),
  })).optional(),
  exclusions: z.array(z.record(z.string().min(1), z.string().min(1))).optional(),
  variants: z.array(z.record(z.string().min(1), z.string().min(1))).optional(),
  visualTemplate: z.record(z.string(), z.unknown()).optional(),
  layoutTemplate: z.record(z.string(), z.unknown()).optional(),
});
const createComponentSetOptions = {
  target: componentTargetSchema.describe("Declarative component set schema"),
  dryRun: z.boolean().optional().default(true).describe("Preview only by default; false is the only mutating path"),
  parentId: figmaNodeId.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  key: z.string().min(1).optional(),
};
const componentReliabilityFields = {
  chunkSize: z.number().int().min(1).max(500).optional(),
  baseline: z.string().min(1).optional(),
  journalId: z.string().min(1).optional(),
};
const sceneProps = createNodeBase.omit({ parentId: true, key: true }).extend({
  ...containerLayoutFields,
  fills: z.array(solidPaint).optional(),
  strokes: z.array(solidPaint).optional(),
  cornerRadius: z.number().nonnegative().optional(),
  clipsContent: z.boolean().optional(),
  itemSpacing: z.number().finite().optional(),
  padding: paddingSchema.optional(),
  characters: z.string().optional(),
  style: textStyleSchema.optional(),
  componentId: figmaNodeId.optional(),
  properties: componentPropertyMap.optional(),
}).strict();

type SceneNodeInput = {
  ref: string;
  type: "FRAME" | "TEXT" | "RECTANGLE" | "INSTANCE";
  props?: z.infer<typeof sceneProps>;
  children?: SceneNodeInput[];
};

const sceneNode: z.ZodType<SceneNodeInput> = z.lazy(() => z.object({
  ref: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  type: z.enum(["FRAME", "TEXT", "RECTANGLE", "INSTANCE"]),
  props: sceneProps.optional(),
  children: z.array(sceneNode).max(100).optional(),
}).strict());

// Bound the recursive input before Zod descends into it.
const sceneNodes = z.preprocess((value, ctx) => {
  if (!Array.isArray(value)) return value;
  const pending = value.map((node) => ({ node, depth: 1 }));
  const refs = new Set<string>();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > 100 || depth > 16) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scenes are limited to 100 nodes and 16 levels" });
      return z.NEVER;
    }
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    if (typeof node.ref === "string") {
      if (refs.has(node.ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate scene ref: ${node.ref}` });
        return z.NEVER;
      }
      refs.add(node.ref);
    }
    if (Array.isArray(node.children)) {
      if (node.type !== "FRAME" && node.children.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only FRAME scene nodes accept children" });
        return z.NEVER;
      }
      if (pending.length + count + node.children.length > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Scenes are limited to 100 nodes" });
        return z.NEVER;
      }
      for (const child of node.children) pending.push({ node: child, depth: depth + 1 });
    }
  }
  return value;
}, z.array(sceneNode).min(1).max(100));

const measurementStyle = textStyleSchema.pick({
  fontFamily: true,
  fontStyle: true,
  fontSize: true,
  lineHeight: true,
  letterSpacing: true,
  textDecoration: true,
}).strict();

const layoutIssueCode = z.enum([
  "OUT_OF_BOUNDS", "CLIPPED_CONTENT", "TEXT_TRUNCATION", "TEXT_OVERLAP",
  "SMALL_TOUCH_TARGET", "LOW_CONTRAST",
]);

export const toolInputSchemas = {
  create_icon: withFileKey({
    iconSet: z.string().min(1).max(64).optional().default("lucide").describe("Iconify icon set prefix. Defaults to lucide."),
    name: z.string().min(1).max(128).describe("Icon name within the Iconify icon set, for example activity or arrow-right."),
    size: z.number().finite().positive().max(4096).optional().default(24),
    color: hexColor.optional().describe("Optional replacement for SVG currentColor."),
    parentId: figmaNodeId.optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    nodeName: z.string().min(1).max(200).optional(),
    dryRun: z.boolean().optional().default(true).describe("Preview only by default; false creates the Figma node."),
  }).strict(),
  create_scene: withFileKey({
    parentId: figmaNodeId.optional().describe("Omit for current page, or specify the current PAGE ID or a container on that page; other pages are out of scope."),
    nodes: sceneNodes.describe("Nested scene with globally unique local refs; at most 100 nodes and 16 levels. Only FRAME nodes accept children. ABSOLUTE requires a HORIZONTAL or VERTICAL auto-layout parent; current PAGE and NONE-layout parents fail preflight."),
    position: z.enum(["auto"]).optional().describe("Automatically place the first root frame in a collision-free canvas slot; explicit root x/y values are not allowed with auto."),
    dryRun: z.boolean().optional().default(true).describe("Preflight the entire scene without creating nodes. Only false creates persistent nodes."),
  }).strict(),
  measure_text: withFileKey({
    items: z.array(z.object({
      ref: z.string().min(1).optional(),
      characters: z.string(),
      width: z.number().finite().positive().optional(),
      style: measurementStyle.optional(),
    }).strict()).min(1).max(50),
  }).strict(),
  validate_layout: withFileKey({
    rootIds: z.array(figmaNodeId).min(1).max(20),
    maxNodes: z.number().int().min(1).max(2000).optional(),
    maxIssues: z.number().int().min(1).max(500).optional(),
    minTouchTarget: z.number().finite().positive().optional(),
    interactiveNodeIds: z.array(figmaNodeId).max(2000).optional(),
    ignore: z.array(z.object({ nodeId: figmaNodeId, code: layoutIssueCode }).strict()).max(2000).optional(),
  }).strict(),
  find_canvas_slot: withFileKey({
    width: z.number().positive().describe("Expected width of the new frame"),
    height: z.number().positive().optional().describe("Expected height of the new frame; defaults to width"),
    direction: z.enum(["right", "bottom"]).optional().describe("Preferred packing direction; defaults to right"),
    spacing: z.number().nonnegative().optional().describe("Gap between existing bounds and the new frame; defaults to 80"),
    nearNodeId: figmaNodeId.optional().describe("If provided, calculates a slot directly adjacent to this reference node"),
  }).strict(),
  create_component_set: withFileKey(createComponentSetOptions),
  inspect_component_set: withFileKey({
    componentSetId: figmaNodeId.describe("COMPONENT_SET node ID to inspect"),
  }),
  validate_component_plan: withFileKey({
    target: componentTargetSchema.describe("Declarative target component schema; validation never mutates Figma"),
  }),
  plan_component_migration: withFileKey({
    componentSetId: figmaNodeId.describe("COMPONENT_SET node ID to inspect and plan against"),
    target: componentTargetSchema.describe("Declarative target component schema; planning is always a dry run"),
  }),
  verify_component_set: withFileKey({
    componentSetId: figmaNodeId.describe("COMPONENT_SET node ID to verify"),
  }),
  get_document: withFileKey({}),
  get_selection: withFileKey({}),
  get_styles: withFileKey({}),
  get_metadata: withFileKey({}),
  get_local_components: withFileKey(localComponentsPaginationFields),
  get_components: withFileKey(localComponentsPaginationFields),
  get_component_matrix: withFileKey({ ...localComponentsPaginationFields, ...componentReliabilityFields }),
  get_operation_journal: withFileKey({}),
  rollback_operation: withFileKey({ journalId: z.string().min(1) }),
  resume_operation: withFileKey({
    journalId: z.string().min(1).describe("Journal entry to resume after a recoverable interruption"),
    dryRun: z.boolean().optional().describe("Inspect the resumable plan without mutating Figma"),
  }),
  get_component_screenshot_report: withFileKey({
    nodeIds: z.array(figmaNodeId).min(1),
    format: exportFormat.optional(),
    baseline: z.string().min(1).optional(),
  }),
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
              "Path inside the MCP server working directory (relative paths resolve there). Absolute paths outside that directory and existing output files are rejected.",
            ),
          format: exportFormat.optional(),
          scale: z.number().optional(),
        })
      )
      .min(1),
    format: exportFormat.optional(),
    scale: z.number().optional(),
  }),
  migrate_component_set: withFileKey({
    componentSetId: figmaNodeId,
    targetComponentSetId: figmaNodeId.optional(),
    dimensions: z.array(componentDimensionOperation).optional(),
    instancePolicy: z.enum(["remap", "classify", "skip"]).optional(),
    operations: z.array(z.record(z.string(), z.unknown())).optional(),
    ...componentMigrationOptions,
  }),
  repair_component_set: withFileKey({
    componentSetId: figmaNodeId,
    dimensions: z.array(componentDimensionOperation).optional(),
    repairVariants: z.boolean().optional(),
    repairInstances: z.boolean().optional(),
    operations: z.array(z.record(z.string(), z.unknown())).optional(),
    ...componentMigrationOptions,
  }),
  clone_component_set: withFileKey({
    componentSetId: figmaNodeId,
    parentId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    ...componentMigrationOptions,
  }),
  merge_component_sets: withFileKey({
    componentSetIds: z.array(figmaNodeId).min(2),
    targetComponentSetId: figmaNodeId.optional(),
    dedupe: z.boolean().optional(),
    ...componentMigrationOptions,
  }),
  split_component_set: withFileKey({
    componentSetId: figmaNodeId,
    groups: z.array(z.object({ name: z.string().min(1), componentIds: z.array(figmaNodeId).min(1) })).min(1),
    deleteSource: z.boolean().optional(),
    ...componentMigrationOptions,
  }),
  migrate_instances: withFileKey({
    instanceIds: z.array(figmaNodeId).min(1).optional(),
    sourceComponentSetId: figmaNodeId.optional(),
    targetComponentSetId: figmaNodeId,
    classification: z.enum(["variant", "property", "unmapped", "unsupported"]).optional(),
    remap: z.record(z.string(), z.string()).optional(),
    preserveOverrides: z.boolean().optional(),
    ...componentMigrationOptions,
  }),
  reconcile_component_set: withFileKey({
    componentSetId: figmaNodeId,
    expected: z.record(z.string(), z.unknown()),
    ...componentMigrationOptions,
  }),
  create_frame: createNodeBase.extend({
    fileKey: fileKeyField,
    position: z.enum(["auto"]).optional().describe("Automatically place the frame in a collision-free slot; explicit x/y values are not allowed with auto."),
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    ...containerLayoutFields,
    clipsContent: z.boolean().optional(),
    itemSpacing: z.number().optional(),
    padding: paddingSchema.optional(),
  }),
  create_component: createNodeBase.extend({
    fileKey: fileKeyField,
    fills: z.array(solidPaint).optional(),
    strokes: z.array(solidPaint).optional(),
    cornerRadius: z.number().nonnegative().optional(),
    ...containerLayoutFields,
    clipsContent: z.boolean().optional(),
    itemSpacing: z.number().optional(),
    padding: paddingSchema.optional(),
  }),
  create_instance: withFileKey({
    componentId: figmaNodeId.describe(
      "A COMPONENT node to instantiate. Supports components on any page in the current file (cross-page)."
    ),
    parentId: figmaNodeId.optional(),
    name: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    key: z.string().min(1).optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    ...childLayoutFields,
    ...containerLayoutFields,
  }),
  swap_instance_component: withFileKey({
    instanceId: figmaNodeId.describe("The current-page INSTANCE node to replace"),
    componentId: figmaNodeId.describe("A COMPONENT node, or a COMPONENT_SET when variantProperties identifies a concrete variant"),
    preserveOverrides: z
      .boolean()
      .optional()
      .describe("Preserve existing instance overrides where Figma supports it. Default true."),
    preserveBounds: z
      .boolean()
      .optional()
      .describe("Restore the instance x/y/width/height after swapping. Default true."),
    variantProperties: variantPropertyMap
      .optional()
      .describe("Variant dimension/value pairs used when componentId references a COMPONENT_SET, or applied after swapping."),
    properties: componentPropertyMap
      .optional()
      .describe("Component property values to apply after swapping via instance.setProperties(...)."),
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
  bind_component_properties: withFileKey({
    componentId: figmaNodeId.describe("A COMPONENT or COMPONENT_SET that owns the definitions"),
    instanceId: figmaNodeId.optional().describe("Optional INSTANCE receiving values after definitions are bound"),
    bindings: z.array(z.object({
      propertyName: z.string().min(1),
      propertyType: componentPropertyType.optional(),
      defaultValue: componentPropertyValue.optional(),
      preferredValues: z.array(preferredInstanceSwapValue).optional(),
      value: componentPropertyValue.optional(),
    })).min(1).max(50),
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
    ...containerLayoutFields,
    ...childLayoutFields,
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
    compact: z.boolean().optional().default(true).describe("Default true: return match metadata without serialized node trees. Set false to include full node data."),
  }),
  delete_node: withFileKey({
    nodeId: figmaNodeId,
  }),
  batch_mutation: withFileKey({
    operations: z.array(batchOperation).min(1).max(100),
    failureMode: z.enum(["best-effort", "atomic"]).optional().default("best-effort"),
    compact: batchMutationCompact,
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
  create_icon: (_nodeIds, params) => ({ ...params }),
  create_scene: (_nodeIds, params) => ({ ...params }),
  measure_text: (_nodeIds, params) => ({ ...params }),
  validate_layout: (_nodeIds, params) => ({ ...params }),
  find_canvas_slot: (_nodeIds, params) => ({ ...params }),
  inspect_component_set: (nodeIds, params) => ({ componentSetId: nodeIds?.[0], ...params }),
  validate_component_plan: (_nodeIds, params) => ({ ...params }),
  plan_component_migration: (nodeIds, params) => ({ componentSetId: nodeIds?.[0], ...params }),
  verify_component_set: (nodeIds, params) => ({ componentSetId: nodeIds?.[0], ...params }),
  get_document: (_nodeIds, params) => ({ ...params }),
  get_selection: (_nodeIds, params) => ({ ...params }),
  get_styles: (_nodeIds, params) => ({ ...params }),
  get_metadata: (_nodeIds, params) => ({ ...params }),
  get_local_components: (_nodeIds, params) => ({ ...params }),
  get_components: (_nodeIds, params) => ({ ...params }),
  get_component_matrix: (_nodeIds, params) => ({ ...params }),
  get_operation_journal: (_nodeIds, params) => ({ ...params }),
  rollback_operation: (_nodeIds, params) => ({ ...params }),
  resume_operation: (_nodeIds, params) => ({ ...params }),
  get_component_screenshot_report: (nodeIds, params) => ({ nodeIds, ...params }),
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
  create_component_set: (_nodeIds, params) => ({ ...params }),
  migrate_component_set: (_nodeIds, params) => ({ ...params }),
  repair_component_set: (_nodeIds, params) => ({ ...params }),
  clone_component_set: (_nodeIds, params) => ({ ...params }),
  merge_component_sets: (_nodeIds, params) => ({ ...params }),
  split_component_set: (_nodeIds, params) => ({ ...params }),
  migrate_instances: (_nodeIds, params) => ({ ...params }),
  reconcile_component_set: (_nodeIds, params) => ({ ...params }),
  create_frame: (_nodeIds, params) => ({ ...params }),
  create_component: (_nodeIds, params) => ({ ...params }),
  create_instance: (_nodeIds, params) => ({ ...params }),
  swap_instance_component: (_nodeIds, params) => ({ ...params }),
  combine_as_variants: (_nodeIds, params) => ({ ...params }),
  set_variant_properties: (_nodeIds, params) => ({ ...params }),
  manage_component_properties: (_nodeIds, params) => ({ ...params }),
  set_component_properties: (_nodeIds, params) => ({ ...params }),
  set_exposed_instance: (_nodeIds, params) => ({ ...params }),
  bind_component_properties: (_nodeIds, params) => ({ ...params }),
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
