---
name: figma-mcp-bridge-tools-expert
description: Entry skill for selecting Figma MCP Bridge tools, sequencing calls, and applying safety rules.
---

# Figma MCP Bridge Tools Expert

Use this skill as the default entry point for Figma MCP Bridge tasks.

## Default sequence

1. Confirm active context with `get_metadata`.
2. Inspect `get_selection` when the task refers to the current selection.
3. Use `get_design_context` for compact design understanding.
4. Use `get_node` only with a verified colon-format node ID.
5. Use token tools only when the task involves styles, variables, tokens, coverage, audits, proposals, creation, application, or export.
6. Use screenshot tools only after deciding between base64 return and local file output.
7. Use write tools only after verifying target scope and side effects.

## High-risk areas

- Node IDs must use colon format.
- File outputs must stay inside the server working directory.
- Colors must use supported hex formats.
- Write operations mutate the current Figma file.
- Token creation and application are document-level side effects.
- `delete_node` is irreversible.

## Response standard

Report the active scope, selected tool family, validation performed, and any remaining risks. Do not claim a write succeeded without read-back verification when read-back is available.
