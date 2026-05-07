# Figma MCP Bridge Repo Skills

These repo-local skills capture practical operating rules for `figma-mcp-bridge`. They are not a rewritten README; they are task-triggered guidance for selecting tools, sequencing calls, avoiding unsafe writes, and debugging the local plugin bridge.

## Why the skills are split

- The main risk is workflow misuse: read context first, choose the correct node scope, inspect tokens when needed, perform writes only with verified targets, and export screenshots only after deciding whether data should be returned or saved.
- High-risk parameters include `nodeId`, `nodeIds`, `outputPath`, `format`, `scale`, color formats, and plugin connection state.
- `save_screenshots` has local file side effects, while write tools directly mutate the current Figma file. These require different safety rules.

## Skill list

- `figma-mcp-bridge-tools-expert`: entry skill for tool selection, call ordering, and global safety rules.
- `figma-mcp-bridge-document-context`: page tree, current selection, node detail, metadata, and design context reads.
- `figma-mcp-bridge-styles-and-variables`: local styles, variables, normalized token graph, usage mapping, audits, proposals, dry-run create/apply, and exports.
- `figma-mcp-bridge-screenshot-export`: screenshot return vs local save behavior and path constraints.
- `figma-mcp-bridge-write-tools`: create/update/delete tools, setters, `find_nodes`, and `batch_mutation`.
- `figma-mcp-bridge-debug-validation`: connection, parameter, leader/follower forwarding, and common failure diagnosis.

## Supporting docs

- `INTAKE_AUDIT.md`: tool families, primary workflows, misuse points, and known limitations.
- `VALIDATION_CHECKLIST.md`: structure checks, content checks, repo checks, and sample regression prompts.

## Reuse guidance

- Use these skills directly from this repository.
- If migrating them to another agent skill directory, copy the whole `skills/` tree so linked references remain valid.
- When the project adds token tools, export formats, or plugin connection modes, update `INTAKE_AUDIT.md` and the relevant workflow docs before changing individual `SKILL.md` files.
