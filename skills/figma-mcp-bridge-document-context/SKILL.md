---
name: figma-mcp-bridge-document-context
description: Read Figma document context safely with get_document, get_selection, get_node, get_metadata, and get_design_context.
---

# Figma MCP Bridge Document Context

Use this skill when a task requires understanding the current Figma file, page, selection, or a specific node.

## What this skill covers

- Understand the current page, current selection, or page list.
- Retrieve compact AI-friendly design context at a controlled depth.
- Inspect a single node only after a valid `nodeId` is available.
- Choose between a full tree and a scoped compact tree.

## Default order

- Use `get_metadata` to confirm the active file and page.
- Use `get_selection` to discover the current selection.
- Prefer `get_design_context` for model-friendly context, increasing `depth` only when needed.
- Use `get_document` only when a full current-page tree is required.
- Use `get_node` only when a valid colon-format node ID is already known.

## Safety rules

- Never invent node IDs.
- Figma node IDs must use colon format such as `4029:12345`.
- Treat an empty selection as meaningful state, not as a failure.
- Do not switch from the requested selection scope to the whole page unless the user approves or the task clearly requires it.
