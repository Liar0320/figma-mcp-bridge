# Engineering Review Guidelines for Figma MCP Bridge

> Project: `figma-mcp-bridge`
> Audience: engineers, reviewers, and testers
> Goal: keep MCP tool behavior stable, safe, and maintainable through explicit design, local validation, and focused reviews.

## 1. Core principles

This guide defines how humans develop and review this project.

1. Define the requirement boundary before coding. Every tool, field, and write capability must document its use case, inputs, outputs, side effects, and failure behavior.
2. Keep read, audit, dry-run, and write paths separate. Read-only tools must never mutate the Figma file.
3. Validate manually before review. Engineers must build, test, and manually exercise the relevant plugin/server path before requesting review.
4. Prefer small focused PRs. Do not mix unrelated read, audit, write, export, and documentation changes.
5. Make risks explicit. Any capability that mutates Figma, creates tokens, binds variables, deletes nodes, or writes local files must call out that side effect in code, docs, and PR notes.

## 2. Layer responsibilities

| Area | Responsibility | Engineering constraint |
| --- | --- | --- |
| `server/src/schema.ts` | MCP input schemas | Validate all external inputs with Zod. High-risk parameters such as node IDs, colors, format, scale, and `dryRun` need explicit constraints. |
| `server/src/tools.ts` | Tool registration and request forwarding | Tool descriptions must state whether the tool is read-only, side-effectful, or dry-run-first. |
| `server/src/bridge.ts` | WebSocket request management and timeouts | Business tools must not bypass the bridge. Timeout and error semantics should be consistent. |
| `server/src/leader.ts`, `follower.ts`, `node.ts`, `election.ts` | Leader/follower forwarding and health checks | Do not put business logic in the clustering or forwarding layer. |
| `plugin/src/main/code.ts` | Figma plugin request dispatcher | Every request type needs an explicit branch, error handling, and stable response shape. |
| `plugin/src/main/serializer.ts` | Node, style, and variable serialization | Keep payload size controlled. Do not return unbounded Figma objects. |
| `plugin/src/main/write.ts` | Node creation, updates, deletion, and batch mutation | Centralize all Figma mutations in the write engine. |
| `plugin/src/main/token*.ts` | Token graph, usage, audit, propose, create, apply, and export | Keep read-only, dry-run, and real mutation stages separate. `propose` and `export` must not write to Figma. |
| `plugin/tests/*.test.mjs` | Plugin behavior tests | Add tests for new tools, fields, and mutation paths. |

## 3. Tool categories

### 3.1 Read-only tools

Read-only tools can inspect the current Figma file, page, selection, nodes, styles, variables, and token governance state. They must not modify Figma or write local files.

Examples: `get_document`, `get_selection`, `get_node`, `get_styles`, `get_metadata`, `get_design_context`, `get_variable_defs`, `get_design_tokens`, `get_token_usage`, `audit_design_tokens`, `propose_design_tokens`, and `export_design_tokens`.

Requirements:

1. Return stable field names and response shapes.
2. Handle empty selections, empty pages, and missing nodes with clear errors or valid empty results.
3. Never call mutating Figma APIs from read-only tools.
4. Audit and proposal tools may recommend actions, but must not create or bind tokens.

### 3.2 Local file side-effect tools

These tools do not mutate Figma, but they write local files. The current example is `save_screenshots`.

Requirements:

1. Constrain `outputPath` to controlled locations.
2. Define file overwrite behavior clearly.
3. Return the saved path, format, scale, and node ID.
4. PR notes must identify the local file side effect.

### 3.3 Figma mutation tools

Mutation tools modify the current Figma file.

Examples: `create_frame`, `create_text`, `create_rectangle`, `append_children`, `set_position`, `set_size`, `set_fills`, `set_strokes`, `set_corner_radius`, `set_text_content`, `set_text_style`, `set_layout_mode`, `set_padding`, `set_item_spacing`, `set_node_name`, `rename_node`, `delete_node`, `batch_mutation`, `create_design_tokens` with `dryRun=false`, and `apply_tokens` with `dryRun=false`.

Requirements:

1. Validate mutation inputs strictly.
2. Tools that can dry-run should default to dry-run.
3. Irreversible operations such as `delete_node` need dedicated tests and documentation.
4. `batch_mutation` must define operation order, temporary reference rules, and failure behavior.
5. If partial failure does not roll back prior operations, document that behavior explicitly.

## 4. Parameter standards

### 4.1 Node IDs

Figma node IDs passed to tools must use colon format, for example `4029:12345`. Hyphen format such as `4029-12345` is invalid.

Requirements:

1. Use a shared schema such as `^\d+:\d+$` where applicable.
2. Error messages must show the expected format.
3. Documentation examples must use colon-format IDs.

### 4.2 Colors

Color parameters must use `#RRGGBB` or `#RRGGBBAA`.

Requirements:

1. Reject `rgb()`, `rgba()`, named colors, and short hex.
2. Keep alpha semantics consistent: use either `#RRGGBBAA` or a separate `opacity` field.
3. Tests must cover invalid color input.

### 4.3 Dry-run

Tools that may create, bind, apply, or batch-modify resources must support a dry-run design when practical.

Requirements:

1. Prefer `dryRun=true` as the default.
2. Dry-run responses must describe planned nodes, properties, tokens, or styles.
3. Real execution must require explicit `dryRun=false`.

### 4.4 Batch mutation references

Temporary references in `batch_mutation` must be declared before use.

```json
{ "ref": "tmp:card" }
```

Later operations may refer to the created node with:

```json
{ "nodeId": "tmp:card" }
```

Requirements:

1. Declare temporary references before using them.
2. Do not treat bare strings such as `"card"` as temporary references.
3. Limit each batch to at most 100 operations.
4. Test out-of-order refs, duplicate refs, and missing refs.

## 5. New tool development workflow

1. Write the tool design first: name, category, use case, input parameters, response shape, dry-run behavior, failure modes, side effects, and required docs/tests.
2. Add or update the server schema.
3. Register the server tool with a clear English description.
4. Add plugin request routing in `plugin/src/main/code.ts`.
5. Implement read logic or mutation logic in the correct plugin module.
6. Add tests for schema, routing, success, empty input, invalid input, and failure behavior.
7. Build and test the affected server and plugin packages.
8. Document the behavior in the relevant existing documentation or skill file.

## 6. Review checklist

- [ ] The PR has one clear capability or fix.
- [ ] Public names, descriptions, comments, logs, docs, commits, branches, and PR text are in English.
- [ ] Tool category is clear: read-only, local file side effect, Figma mutation, dry-run planner, or actual executor.
- [ ] Inputs are validated with shared schemas when possible.
- [ ] `nodeId` examples use colon format.
- [ ] Colors use supported hex formats.
- [ ] Dry-run-first tools default to safe behavior.
- [ ] Figma mutations are centralized in the write engine.
- [ ] Token proposal/export paths remain read-only.
- [ ] Tests cover the new or changed behavior.
- [ ] Server and plugin builds pass when affected.
- [ ] PR notes mention validation commands and any remaining risks.

## 7. Merge standard

A change is ready to merge when it is small, English-first, locally validated, tested for the affected behavior, and explicit about side effects and failure semantics.
