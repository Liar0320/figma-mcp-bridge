# Intake Audit

## Repository identity

`figma-mcp-bridge` is not an MCP server that calls the Figma HTTP API directly. It has two cooperating parts:

- Figma plugin: runs inside Figma, reads the current file, selection, nodes, styles, variables, and screenshot exports, and performs approved write operations.
- MCP server: exposes tools over stdio. The leader process owns the plugin WebSocket connection, while followers forward requests to the leader through `POST /rpc`.

## Tool audit

| Area | Conclusion |
| --- | --- |
| Core tool families | 1. Document and node context: `get_document`, `get_selection`, `get_node`, `get_metadata`, `get_design_context`. 2. Design-system data: `get_styles`, `get_variable_defs`, `get_design_tokens`, `get_token_usage`, `audit_design_tokens`, `propose_design_tokens`, `create_design_tokens`, `apply_tokens`, `export_design_tokens`. 3. Screenshot export: `get_screenshot`, `save_screenshots`. 4. Writes: `create_frame`, `create_text`, `create_rectangle`, `append_children`, `find_nodes`, setters, `delete_node`, and `batch_mutation`. |
| Primary workflow | Confirm page/selection first, read design context, inspect a node only after a valid `nodeId`, read tokens when needed, choose base64 vs local screenshot export, and verify mutation targets before writes. |
| Error-prone parameters | `nodeId` must use colon format. `get_node` accepts one `nodeId`. `get_screenshot.nodeIds` is optional and falls back to current selection. `save_screenshots.items[].outputPath` must stay inside the server working directory. Format must match the file extension. Existing files are not overwritten. Colors must use `#RRGGBB` or `#RRGGBBAA`. `batch_mutation` temporary refs must be declared before use. |
| Common failures | Plugin disconnected, empty selection, hyphen-format node ID, missing node, invalid export path, format/extension mismatch, target file already exists, leader unavailable, follower forwarding failure, write setter called without a verified `nodeId`, or assuming batch mutations roll back automatically. |
| Limits | The bridge works only with the currently open Figma file/page context. It does not fetch remote files through the Figma REST API. The plugin connects only to `ws://localhost:1994/ws`. Writes cannot target arbitrary closed files. `delete_node` is irreversible. |

## Typical call chains

### Read current design context

`get_metadata` -> `get_selection` or `get_document` -> `get_design_context` -> `get_node` only when deeper node detail is needed.

### Read design tokens

Confirm the active file/page -> `get_styles` for local styles -> `get_variable_defs` for collections, modes, values, and aliases -> `get_design_tokens` for the normalized graph.

### Export images

Determine target nodes from selection or explicit `nodeIds` -> choose `get_screenshot` for base64 or `save_screenshots` for local files -> validate format, extension, output path, and overwrite behavior.

### Write nodes

Confirm the target node source with `get_selection`, `find_nodes`, or a known ID -> use a single setter for one property -> use `batch_mutation` with `tmp:` refs for multi-step operations -> verify hex color format.

### Diagnose failures

Check plugin connection first, then node IDs, output path, format, and request shape. Finally distinguish plugin errors from leader/follower forwarding errors.

## Misuse patterns to prevent

- Calling `get_node` before obtaining a trustworthy node ID.
- Writing Figma IDs with hyphen format instead of colon format.
- Pulling the full document tree when a scoped design context is enough.
- Using `get_screenshot` when the task requires local file output.
- Passing absolute or out-of-scope paths to `save_screenshots`.
- Forgetting that the plugin must be running and connected to the local bridge.
- Calling write setters without a verified target node.
- Using `rgb(...)` instead of supported hex colors.
- Referencing `tmp:` nodes in `batch_mutation` before declaring them.
- Assuming partial batch failures roll back earlier operations.
