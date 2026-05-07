---
name: figma-mcp-bridge-write-tools
description: Safely use Figma mutation tools for creating, updating, deleting, finding, and batching node changes.
---

# Figma MCP Bridge Write Tools

Use this skill when a task may modify the current Figma file.

## What this skill covers

- Create frames, text, rectangles, and first-class Figma Components.
- Create Instances from local Components via `componentId` (remote `componentKey` import, variants, and Component Sets are out of scope).
- Append existing nodes to a parent.
- Find nodes by name, key, parent, or ID.
- Set position, size, fills, strokes, radius, text content, text style, layout mode, padding, item spacing, and node name.
- Delete nodes.
- Execute `batch_mutation` for ordered multi-step writes.

## Safety rules

- Verify file/page context before writing.
- Verify target `nodeId` through selection, `find_nodes`, or a previous read response.
- Use colon-format node IDs.
- Use `#RRGGBB` or `#RRGGBBAA` colors.
- Treat `delete_node` as irreversible.
- For `batch_mutation`, declare `tmp:` refs before using them.
- Read back after writes when practical.
