# Validation Checklist

## Structure checks

- [ ] Every skill directory has a `SKILL.md` file.
- [ ] Each `SKILL.md` frontmatter contains only the fields expected by the project convention.
- [ ] Every referenced document path exists.
- [ ] `skills/README.md` matches the actual directory structure.

## Content checks

- [ ] The entry skill explains default call order instead of only listing tool names.
- [ ] The document-context skill explains when to use `get_design_context` and when to use `get_document`.
- [ ] The styles-and-variables skill clearly separates `get_styles`, `get_variable_defs`, and normalized token tools.
- [ ] The screenshot skill clearly separates `get_screenshot` and `save_screenshots`.
- [ ] The write-tools skill documents mutation boundaries and target verification.
- [ ] The debug skill covers connection state, parameters, paths, and export conflicts.
- [ ] All repository-facing prose is written in English.

## Repository checks

- [ ] No unnecessary dependency was introduced.
- [ ] Server/plugin runtime behavior was not changed by documentation-only edits.
- [ ] Server build passes when server code or schemas changed.
- [ ] Plugin build passes when plugin code changed.
- [ ] Plugin tests pass when plugin behavior changed.

## Regression prompts

1. I only want to inspect the currently selected node. Which tool should I use?
2. I already have a node ID and want detailed structure and style information.
3. I need to read this file's color tokens and variable aliases.
4. I want to export two nodes to local files. Why is `outputPath` rejected?
5. Why does MCP say the plugin is disconnected or the request timed out?

## Completion standard

- The skill set explains how the tools are divided.
- The skill set prevents common `nodeId`, `outputPath`, and connection-state mistakes.
- The structure can be adapted to other MCP bridge repositories.
- The content is operational guidance, not a duplicate of the README.
