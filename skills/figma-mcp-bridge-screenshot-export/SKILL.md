---
name: figma-mcp-bridge-screenshot-export
description: Choose and validate screenshot export tools: get_screenshot and save_screenshots.
---

# Figma MCP Bridge Screenshot Export

Use this skill when a task needs screenshots from the current Figma file.

## What this skill covers

- Export the current selection or explicit node IDs.
- Choose between returning image data and saving local files.
- Validate `format`, `scale`, `nodeIds`, and `outputPath`.
- Explain common screenshot export failures.

## Tool choice

- Use `get_screenshot` when the caller only needs image data.
- Use `save_screenshots` when the caller needs local files written by the MCP server.
- If `nodeIds` is omitted, both paths rely on the current selection.
- `save_screenshots` is a batch API whose core input is `items[]`.
- `outputPath` must be inside the server working directory and existing files are not overwritten.

## Safety rules

- Confirm whether the target comes from selection or explicit IDs.
- Use colon-format node IDs.
- Keep file extension and export format aligned.
- Treat local file writes as side effects.
