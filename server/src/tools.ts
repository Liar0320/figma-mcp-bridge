import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Node } from "./node.js";
import { toolInputSchemas } from "./schema.js";
import type { BridgeResponse } from "./types.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ExportFormat = "PNG" | "SVG" | "JPG" | "PDF";

export interface ScreenshotSender {
  sendWithParams(
    requestType: string,
    nodeIds?: string[],
    params?: Record<string, unknown>
  ): Promise<BridgeResponse>;
}

interface ScreenshotExport {
  nodeId: string;
  nodeName: string;
  format: ExportFormat;
  base64: string;
  width: number;
  height: number;
}

interface SaveScreenshotItemInput {
  nodeId: string;
  outputPath: string;
  format?: ExportFormat;
  scale?: number;
}

interface SaveScreenshotItemResult {
  index: number;
  nodeId: string;
  nodeName?: string;
  outputPath: string;
  format?: ExportFormat;
  width?: number;
  height?: number;
  bytesWritten?: number;
  success: boolean;
  error?: string;
}

type WriteToolName = keyof Pick<
  typeof toolInputSchemas,
  | "create_frame"
  | "create_component"
  | "create_instance"
  | "combine_as_variants"
  | "set_variant_properties"
  | "manage_component_properties"
  | "set_component_properties"
  | "set_exposed_instance"
  | "create_text"
  | "create_rectangle"
  | "append_children"
  | "find_nodes"
  | "batch_mutation"
  | "set_position"
  | "set_size"
  | "set_fills"
  | "set_strokes"
  | "set_corner_radius"
  | "set_text_content"
  | "set_text_style"
  | "set_layout_mode"
  | "set_padding"
  | "set_item_spacing"
  | "set_node_name"
  | "rename_node"
  | "delete_node"
>;

/** Registers all read and write MCP tools exposed by the bridge server. */
export function registerTools(server: McpServer, node: Node): void {
  server.tool(
    "list_files",
    "List Figma files currently connected to the bridge plugin. Use fileKey from this list when multiple files are connected.",
    async (): Promise<ToolResult> => {
      return renderResponse(async () => ({
        type: "list_files",
        requestId: "",
        data: await node.listConnectedFiles(),
      }));
    }
  );

  server.tool(
    "get_document",
    "Get the current Figma page document tree",
    toolInputSchemas.get_document.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_document", undefined, fileKey));
    }
  );

  server.tool(
    "get_selection",
    "Get the currently selected nodes in Figma",
    toolInputSchemas.get_selection.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_selection", undefined, fileKey));
    }
  );

  server.tool(
    "get_node",
    "Get a specific Figma node by ID. Must use colon format, e.g. '4029:12345', never use hyphens.",
    toolInputSchemas.get_node.shape,
    async ({ nodeId, fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_node", [nodeId], fileKey));
    }
  );

  server.tool(
    "get_styles",
    "Get all local styles in the document",
    toolInputSchemas.get_styles.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_styles", undefined, fileKey));
    }
  );

  server.tool(
    "get_metadata",
    "Get metadata about the current Figma document including file name, pages, and current page info",
    toolInputSchemas.get_metadata.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_metadata", undefined, fileKey));
    }
  );

  server.tool(
    "get_design_context",
    "Get the design context for the current selection or page. Returns a summarized tree structure optimized for understanding the current design context.",
    toolInputSchemas.get_design_context.shape,
    async ({ depth, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (depth !== undefined && depth > 0) {
        params.depth = depth;
      }
      return renderResponse(() =>
        node.sendWithParams("get_design_context", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_variable_defs",
    "Get all local variable definitions including variable collections, modes, and variable values. Variables are Figma's system for design tokens (colors, numbers, strings, booleans).",
    toolInputSchemas.get_variable_defs.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_variable_defs", undefined, fileKey));
    }
  );

  server.tool(
    "get_design_tokens",
    "Get normalized design tokens from local Figma variables and styles. Returns AI-friendly token paths, values, modes, sources, and summary counts.",
    toolInputSchemas.get_design_tokens.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_design_tokens", undefined, fileKey));
    }
  );

  server.tool(
    "get_token_usage",
    "Scan the current selection, current page, or specific nodes for design token usage. Maps node properties to local variables/styles and exact token value matches.",
    toolInputSchemas.get_token_usage.shape,
    async ({ nodeIds, fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.sendWithParams("get_token_usage", nodeIds, undefined, fileKey));
    }
  );

  server.tool(
    "audit_design_tokens",
    "Audit design token coverage and consistency for the current selection, current page, or specific nodes. Returns read-only issues and recommendations based on token graph and usage mapping.",
    toolInputSchemas.audit_design_tokens.shape,
    async ({ nodeIds, minCoverage, includeUnusedTokens, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (minCoverage !== undefined) params.minCoverage = minCoverage;
      if (includeUnusedTokens !== undefined) params.includeUnusedTokens = includeUnusedTokens;
      return renderResponse(() => node.sendWithParams("audit_design_tokens", nodeIds, params, fileKey));
    }
  );

  server.tool(
    "propose_design_tokens",
    "Propose new or consolidated design tokens from repeated unbound values and audit findings. Read-only; does not create variables or styles.",
    toolInputSchemas.propose_design_tokens.shape,
    async ({ nodeIds, minOccurrences, includeExactValueMatches, includeDuplicateTokenValues, maxProposals, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (minOccurrences !== undefined) params.minOccurrences = minOccurrences;
      if (includeExactValueMatches !== undefined) params.includeExactValueMatches = includeExactValueMatches;
      if (includeDuplicateTokenValues !== undefined) params.includeDuplicateTokenValues = includeDuplicateTokenValues;
      if (maxProposals !== undefined) params.maxProposals = maxProposals;
      return renderResponse(() => node.sendWithParams("propose_design_tokens", nodeIds, params, fileKey));
    }
  );

  server.tool(
    "export_design_tokens",
    "Export normalized Figma design tokens as JSON, DTCG JSON, CSS variables, or Tailwind theme tokens. Read-only; does not modify Figma.",
    toolInputSchemas.export_design_tokens.shape,
    async ({ format, tokenPaths, includeMetadata, cssSelector, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (format !== undefined) params.exportFormat = format;
      if (tokenPaths !== undefined) params.tokenPaths = tokenPaths;
      if (includeMetadata !== undefined) params.includeMetadata = includeMetadata;
      if (cssSelector !== undefined) params.cssSelector = cssSelector;
      return renderResponse(() => node.sendWithParams("export_design_tokens", undefined, params, fileKey));
    }
  );

  server.tool(
    "create_design_tokens",
    "Create Figma design tokens from a reviewed token list. Defaults to dry-run preview; actual creation requires dryRun=false.",
    toolInputSchemas.create_design_tokens.shape,
    async ({ tokens, dryRun, collectionName, collectionStrategy, modeStrategy, conflictStrategy, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = { tokens };
      if (dryRun !== undefined) params.dryRun = dryRun;
      if (collectionName !== undefined) params.collectionName = collectionName;
      if (collectionStrategy !== undefined) params.collectionStrategy = collectionStrategy;
      if (modeStrategy !== undefined) params.modeStrategy = modeStrategy;
      if (conflictStrategy !== undefined) params.conflictStrategy = conflictStrategy;
      return renderResponse(() => node.sendWithParams("create_design_tokens", undefined, params, fileKey));
    }
  );

  server.tool(
    "apply_tokens",
    "Apply existing Figma design tokens to matching node properties. Defaults to dry-run preview; actual binding/style application requires dryRun=false.",
    toolInputSchemas.apply_tokens.shape,
    async ({ nodeIds, tokenPaths, matchTypes, dryRun, failureMode, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (tokenPaths !== undefined) params.tokenPaths = tokenPaths;
      if (matchTypes !== undefined) params.matchTypes = matchTypes;
      if (dryRun !== undefined) params.dryRun = dryRun;
      if (failureMode !== undefined) params.failureMode = failureMode;
      return renderResponse(() => node.sendWithParams("apply_tokens", nodeIds, params, fileKey));
    }
  );

  server.tool(
    "get_screenshot",
    "Export a screenshot of the selected nodes or specific nodes by ID. Returns base64-encoded image data.",
    toolInputSchemas.get_screenshot.shape,
    async ({ nodeIds, format, scale, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (format) params.format = format;
      if (scale !== undefined && scale > 0) params.scale = scale;
      return renderResponse(() =>
        node.sendWithParams("get_screenshot", nodeIds, params, fileKey)
      );
    }
  );

  server.tool(
    "save_screenshots",
    "Export screenshots for multiple nodes and save them directly to the local filesystem. Returns metadata only (no base64).",
    toolInputSchemas.save_screenshots.shape,
    async ({ items, format, scale, fileKey }): Promise<ToolResult> => {
      try {
        const sender: ScreenshotSender = {
          sendWithParams: (requestType, nodeIds, params) =>
            node.sendWithParams(requestType, nodeIds, params, fileKey),
        };
        const result = await executeSaveScreenshots(sender, items, format, scale);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /** Registers a write tool that validates input against the shared schema map. */
  const registerWriteTool = <N extends WriteToolName>(
    name: N,
    description: string,
    handler: (
      args: Omit<z.infer<(typeof toolInputSchemas)[N]>, "fileKey">,
      fileKey?: string
    ) => Promise<BridgeResponse>
  ): void => {
    server.tool(
      name,
      description,
      toolInputSchemas[name].shape,
      async (args: z.infer<(typeof toolInputSchemas)[N]>): Promise<ToolResult> => {
        const { fileKey, ...params } = args as z.infer<(typeof toolInputSchemas)[N]> & { fileKey?: string };
        return renderResponse(() =>
          handler(params as Omit<z.infer<(typeof toolInputSchemas)[N]>, "fileKey">, fileKey)
        );
      }
    );
  };

  registerWriteTool("create_frame", "Create a frame.", (args, fileKey) =>
    node.sendWithParams("create_frame", undefined, args, fileKey)
  );
  registerWriteTool("create_component", "Create a Figma component.", (args, fileKey) =>
    node.sendWithParams("create_component", undefined, args, fileKey)
  );
  registerWriteTool(
    "create_instance",
    "Create an instance from a local Figma component. componentId must reference a COMPONENT node on the current page.",
    (args, fileKey) => node.sendWithParams("create_instance", undefined, args, fileKey)
  );
  registerWriteTool(
    "combine_as_variants",
    "Combine two or more local Figma components into a native Component Set / Variants node using figma.combineAsVariants(...).",
    (args, fileKey) => node.sendWithParams("combine_as_variants", undefined, args, fileKey)
  );
  registerWriteTool(
    "set_variant_properties",
    "Set or update variant properties such as State=Hover or Size=Large on a COMPONENT inside a COMPONENT_SET by renaming the variant.",
    (args, fileKey) => node.sendWithParams("set_variant_properties", undefined, args, fileKey)
  );
  registerWriteTool(
    "manage_component_properties",
    "Add, edit, or delete component property definitions on a COMPONENT or COMPONENT_SET. Supports BOOLEAN, TEXT, INSTANCE_SWAP, and VARIANT definitions where allowed by Figma.",
    (args, fileKey) => node.sendWithParams("manage_component_properties", undefined, args, fileKey)
  );
  registerWriteTool(
    "set_component_properties",
    "Set component or variant property values on an INSTANCE via instance.setProperties(...).",
    (args, fileKey) => node.sendWithParams("set_component_properties", undefined, args, fileKey)
  );
  registerWriteTool(
    "set_exposed_instance",
    "Set whether a nested instance is exposed to its containing component/component set.",
    (args, fileKey) => node.sendWithParams("set_exposed_instance", undefined, args, fileKey)
  );
  registerWriteTool("create_text", "Create a text node.", (args, fileKey) =>
    node.sendWithParams("create_text", undefined, args, fileKey)
  );
  registerWriteTool("create_rectangle", "Create a rectangle.", (args, fileKey) =>
    node.sendWithParams("create_rectangle", undefined, args, fileKey)
  );
  registerWriteTool("append_children", "Append existing child nodes to a parent.", (args, fileKey) =>
    node.sendWithParams("append_children", undefined, args, fileKey)
  );
  registerWriteTool("find_nodes", "Find nodes on the current page.", (args, fileKey) =>
    node.sendWithParams("find_nodes", undefined, args, fileKey)
  );
  registerWriteTool("batch_mutation", "Execute write operations in order.", (args, fileKey) =>
    node.sendWithParams("batch_mutation", undefined, args, fileKey)
  );

  registerWriteTool("set_position", "Set node position.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_position", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("set_size", "Set node size.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_size", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("set_fills", "Set node fills.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_fills", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("set_strokes", "Set node strokes.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_strokes", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "set_corner_radius",
    "Set uniform corner radius.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("set_corner_radius", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "set_text_content",
    "Set text content.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("set_text_content", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("set_text_style", "Set text style.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_text_style", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "set_layout_mode",
    "Set auto-layout mode.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("set_layout_mode", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("set_padding", "Set auto-layout padding.", ({ nodeId, ...args }, fileKey) =>
    node.sendWithParams("set_padding", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "set_item_spacing",
    "Set auto-layout item spacing.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("set_item_spacing", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "set_node_name",
    "Rename an existing Figma node.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("set_node_name", [String(nodeId)], args, fileKey)
  );
  registerWriteTool(
    "rename_node",
    "Alias for set_node_name. Rename an existing Figma node.",
    ({ nodeId, ...args }, fileKey) =>
      node.sendWithParams("rename_node", [String(nodeId)], args, fileKey)
  );
  registerWriteTool("delete_node", "Delete a node.", ({ nodeId }, fileKey) =>
    node.sendWithParams("delete_node", [String(nodeId)], undefined, fileKey)
  );
}

export async function executeSaveScreenshots(
  sender: ScreenshotSender,
  items: SaveScreenshotItemInput[],
  format?: ExportFormat,
  scale?: number
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  hasErrors: boolean;
  results: SaveScreenshotItemResult[];
}> {
  const results: SaveScreenshotItemResult[] = [];

  for (const [index, item] of items.entries()) {
    const result = await saveScreenshotItemToFile(
      sender,
      item,
      index,
      process.cwd(),
      format,
      scale
    );
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return {
    total: results.length,
    succeeded,
    failed,
    hasErrors: failed > 0,
    results,
  };
}

async function renderResponse(
  fn: () => Promise<BridgeResponse>
): Promise<ToolResult> {
  try {
    const resp = await fn();
    if (resp.error) {
      return {
        content: [{ type: "text", text: resp.error }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(resp.data) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
}

function resolveAndValidateOutputPath(
  outputPath: string,
  workspaceRoot: string
): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(resolvedRoot, outputPath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);
  const escapesRoot =
    relativePath.startsWith("..") || path.isAbsolute(relativePath);
  if (escapesRoot) {
    throw new Error(
      `outputPath must be inside the MCP server working directory: ${resolvedRoot}`
    );
  }
  return resolvedPath;
}

function inferFormatFromPath(outputPath: string): ExportFormat | null {
  const ext = path.extname(outputPath).toLowerCase();
  switch (ext) {
    case ".png":
      return "PNG";
    case ".svg":
      return "SVG";
    case ".jpg":
    case ".jpeg":
      return "JPG";
    case ".pdf":
      return "PDF";
    default:
      return null;
  }
}

function resolveExportFormat(
  format: ExportFormat | undefined,
  inferredFormat: ExportFormat | null
): ExportFormat {
  if (format && inferredFormat && format !== inferredFormat) {
    throw new Error(
      `format ${format} conflicts with outputPath extension (${inferredFormat})`
    );
  }
  return format ?? inferredFormat ?? "PNG";
}

function getSingleScreenshotExport(data: unknown): ScreenshotExport {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid screenshot response from plugin");
  }

  const exports = (data as { exports?: unknown }).exports;
  if (!Array.isArray(exports) || exports.length === 0) {
    throw new Error("No screenshot export returned by plugin");
  }

  const first = exports[0];
  if (
    !first ||
    typeof first !== "object" ||
    typeof (first as { nodeId?: unknown }).nodeId !== "string" ||
    typeof (first as { nodeName?: unknown }).nodeName !== "string" ||
    typeof (first as { base64?: unknown }).base64 !== "string" ||
    typeof (first as { width?: unknown }).width !== "number" ||
    typeof (first as { height?: unknown }).height !== "number"
  ) {
    throw new Error("Malformed screenshot export payload");
  }

  return first as ScreenshotExport;
}

async function saveScreenshotItemToFile(
  sender: ScreenshotSender,
  item: SaveScreenshotItemInput,
  index: number,
  workspaceRoot: string,
  defaultFormat?: ExportFormat,
  defaultScale?: number
): Promise<SaveScreenshotItemResult> {
  let resolvedOutputPath = item.outputPath;

  try {
    resolvedOutputPath = resolveAndValidateOutputPath(
      item.outputPath,
      workspaceRoot
    );
    const inferredFormat = inferFormatFromPath(resolvedOutputPath);
    const resolvedFormat = resolveExportFormat(
      item.format ?? defaultFormat,
      inferredFormat
    );
    const resolvedScale = resolveScale(item.scale, defaultScale);

    const params: Record<string, unknown> = { format: resolvedFormat };
    if (resolvedScale !== undefined) {
      params.scale = resolvedScale;
    }

    const resp = await sender.sendWithParams(
      "get_screenshot",
      [item.nodeId],
      params
    );
    if (resp.error) {
      throw new Error(resp.error);
    }

    const screenshotExport = getSingleScreenshotExport(resp.data);
    const bytesWritten = await writeBase64ToFile(
      screenshotExport.base64,
      resolvedOutputPath
    );

    return {
      index,
      nodeId: screenshotExport.nodeId,
      nodeName: screenshotExport.nodeName,
      outputPath: resolvedOutputPath,
      format: resolvedFormat,
      width: screenshotExport.width,
      height: screenshotExport.height,
      bytesWritten,
      success: true,
    };
  } catch (err) {
    return {
      index,
      nodeId: item.nodeId,
      outputPath: resolvedOutputPath,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function writeBase64ToFile(
  base64: string,
  outputPath: string
): Promise<number> {
  const bytes = Buffer.from(base64, "base64");
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, bytes, { flag: "wx" });
  } catch (err) {
    if (isNodeError(err) && err.code === "EEXIST") {
      throw new Error(`File already exists at outputPath: ${outputPath}`);
    }
    throw err;
  }
  return bytes.length;
}

function resolveScale(
  itemScale?: number,
  defaultScale?: number
): number | undefined {
  const resolvedScale = itemScale ?? defaultScale;
  if (resolvedScale === undefined || resolvedScale <= 0) {
    return undefined;
  }
  return resolvedScale;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error;
}
