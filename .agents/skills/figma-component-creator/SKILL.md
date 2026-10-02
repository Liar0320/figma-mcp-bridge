---
name: figma-component-creator
description: create new native Figma components and component sets through figma-mcp-bridge. Use when the user asks to create a component, a variant family, or a reusable component pattern. Inspect the file's components and design assets first, plan and validate a declarative schema, create only after reviewing the dry run where available, bind matching existing styles/tokens, and verify the created component or set. Do not use this skill to normalize or redesign an existing component.
---

# Figma Component Creator

Create new, reusable Figma components through `figma-mcp-bridge`. Prefer the existing file's component conventions and style assets. Keep the declared variant schema, visible design, native property bindings, and postflight evidence aligned.

## Use this skill when

- The user asks to create a new component or component set.
- The user asks to turn a design into a reusable component or variant family.
- The user asks to establish a repeatable component-creation workflow for a new design.

For cleanup of an existing component without a redesign, use `figma-component-normalizer`. For an existing set's structural migration or repair, use the dedicated plan/migrate/repair tools rather than creating a replacement implicitly.

## Operating contract

- Treat this as creation, not permission to redesign unrelated content or replace existing components.
- Resolve the target Figma file and parent first. If multiple files are connected, use `list_files` and pass the selected `fileKey` to every file-scoped call.
- Inspect local component patterns, variables, styles, and relevant nodes before proposing visual values.
- Reuse matching local styles/tokens. Do not create new design tokens unless the user explicitly asks to extend the design system.
- Use dry-run/validation when the tool provides it. `create_component_set` defaults to dry-run and mutates only with `dryRun: false`; `create_component` and low-level node creation have no dry-run, so finish inspection and the layout/style plan first and track every created node ID.
- Do not claim a property or style is bound merely because its visible value matches. Verify a native component-property reference or Figma style/variable binding.
- Stop and report missing information or unsupported structure; do not return a partial or fabricated component.

## Resolve context and inspect assets

1. Use `list_files` if the intended file is ambiguous or multiple files are connected. Use `get_metadata`, `get_selection`, and `get_design_context` to resolve the canvas context.
2. Check `get_components` / `get_local_components` for existing naming, property, and variant conventions. Search relevant examples with `find_nodes` or inspect exact nodes with `get_node`.
3. Read `get_design_tokens`, `get_styles`, and `get_variable_defs` before choosing colors or typography. Prefer existing semantic paint/text styles and variables.
4. Confirm whether the user wants a component set, one component, or both. Do not assume that every property is a variant dimension.

## Define the component contract

Describe the component before creating it:

- **Name and purpose**: a short semantic component name.
- **Variant dimensions**: named dimensions and allowed values, e.g. `Size`, `State`, or `Type`.
- **Variant matrix**: whether all combinations are valid. Use `variants` for an explicit sparse matrix or `exclusions` for excluded tuples; do not generate invalid combinations just to complete a Cartesian product.
- **Component properties**: content/state controls such as `TEXT`, `BOOLEAN`, `INSTANCE_SWAP`, and `VARIANT`; give defaults and `preferredValues` where required.
- **Required bindings**: declare the property-to-node bindings that must exist, with the expected node name and type.
- **Visual/layout intent**: fills, strokes, typography, sizing behavior (Hug/Fill/Fixed), alignment, padding, gap, radius, icon semantics, and state behavior.
- **Placement**: choose an explicit parent and position only if needed; otherwise use the current page without altering other nodes.

Compute the expected variant count before writing: complete matrix count is the product of each dimension's value count, minus exclusions. With explicit `variants`, count those tuples after exclusions. If the count is unexpectedly large or the sparse rules are unclear, reduce or clarify the schema before creation.

### Declarative schema example

This is a schema example, not a universal visual specification. Reconcile names and styles with the current file before use:

```json
{
  "name": "Button",
  "dimensions": [
    { "name": "Type", "values": ["Primary", "Ghost", "Text"] },
    { "name": "State", "values": ["Default", "Hover", "Active", "Disabled"] },
    { "name": "Size", "values": ["Small", "Medium", "Large"] },
    { "name": "Icon", "values": ["None", "Right", "Up"] }
  ],
  "properties": [
    { "name": "Label", "type": "TEXT", "defaultValue": "Button" }
  ],
  "requiredBindings": [
    { "property": "Label", "nodeName": "Label", "type": "TEXT" }
  ]
}
```

`create_component_set` has a built-in visual preset when `target.name` is exactly `Button`; its defaults are code-defined, not automatically linked to the file's styles. Review the returned visual plan and apply existing matching styles after creation. The built-in icon child is a generated arrow, not an arbitrary icon library asset.

## Applying visual values and linking styles

Creation APIs can apply visual values immediately, but their current schemas do not accept local Figma style IDs:

- `create_component` and `create_frame` accept position/size plus raw fills, strokes, corner radius, layout mode, item spacing, and padding.
- `create_text` accepts text-format fields such as family, weight/style, size, line height, alignment, plus raw fills.
- `create_component_set.visualTemplate` also describes raw values used to create variants.
- `set_text_style` sets text-format fields; it does not attach a local text-style ID.

Therefore distinguish **initial appearance** from **style linkage**. Set raw values during node creation to establish the visual result. To make a local paint/text style or variable the source of truth, create the nodes, preview `apply_tokens`, apply exact-value matches with `dryRun: false`, then verify `get_token_usage` reports `style` or `boundVariable`. Do not describe raw-value initialization as a native style binding.

## Component and Visual Guide layout

For a newly created reusable component or family, make two sibling page-level deliverables by default:

1. The canonical `COMPONENT` or `COMPONENT_SET`, which owns the real content, properties, and variants.
2. A `<Name> — Visual Guide` frame, which documents representative combinations and usage. Keep it separate from the canonical component/set; it is not part of the component's source hierarchy.

Use the guide to make the variant model scannable. The existing Button guide uses a title/subtitle, separate Primary/Ghost/Text cards, Size columns, State rows, actual Button instances, focused icon samples, and a short icon note. Reuse that structure for Button-like families; adapt the axes and cards to other components rather than copying irrelevant sections.

Build a clear layer hierarchy:

```text
Button (COMPONENT_SET)
Button — Visual Guide (FRAME)
├─ Header (FRAME, vertical auto layout)
│  ├─ Title
│  └─ Subtitle
├─ Type cards (FRAME, horizontal auto layout)
│  ├─ Primary buttons (FRAME/card)
│  │  ├─ Type heading
│  │  ├─ Size headings: Small / Medium / Large
│  │  ├─ State rows: Default / Hover / Active / Disabled
│  │  │  └─ Actual Button instances in the matching size columns
│  │  └─ Representative icon samples
│  ├─ Ghost buttons (FRAME/card)
│  └─ Text buttons (FRAME/card)
└─ Usage note
```

Layout rules:

- Inspect page bounds first; place the component/set and guide in clear, non-overlapping zones. Do not reuse old absolute coordinates from another file.
- Use nested horizontal/vertical auto-layout frames for the guide, cards, rows, and headings. Use the document's spacing styles/variables when available; otherwise choose a small consistent spacing scale for outer padding, card padding, and row/column gaps.
- Keep a stable row label column and aligned size columns. Use representative instances for each meaningful Type × State × Size combination; show extra icon variants in a small focused sample row instead of duplicating the full matrix for every icon.
- Create guide samples with `create_instance` from actual variant `COMPONENT` nodes (resolve variant IDs with component inventory/matrix tools); `create_instance.componentId` must not be the `COMPONENT_SET` ID. Do not draw fake button frames that drift from the canonical component.
- Use semantic layer names. Keep the guide's copy and sample dimensions consistent with the component schema. Capture a screenshot of the source component/variants and the completed guide.

Create both deliverables by default for a new reusable component or family. Omit the guide only when the user explicitly asks for the canonical component alone or says not to create documentation samples.


## Create workflow

The numbered steps below are for a variant family. For a standalone component, use this path:

### Standalone component path

1. Plan the component name, parent, position, dimensions, auto-layout, raw visual values, child hierarchy, and style/token matches before writing.
2. Create the component root with `create_component`, supplying position/size and raw fills/strokes, corner radius, auto-layout mode, gap, and padding as needed.
3. Create text, nested frames, or real component instances under its `parentId` with `create_text`, `create_frame`, and `create_instance`. Use `append_children` only when nodes were created elsewhere and need to be moved under the component.
4. If the root or children need existing local style links, use the `apply_tokens` preview/mutation workflow below. Add native component properties with the relevant binding tools and verify their references.
5. Re-read the component and its children with `get_node`/`get_design_context`, check token usage, and capture a screenshot. The standalone path has no component-set verifier or automatic rollback; track created IDs and remove only nodes created by this attempt if cleanup is needed, otherwise report the incomplete state.


### 1. Validate the schema

Call `validate_component_plan` with the full target schema. It is read-only and checks declared dimensions, variant tuples, required bindings, property conflicts, and the deterministic expected count. Fix every error diagnostic before continuing.

### 2. Review the creation dry run

Call `create_component_set` with the same target, `dryRun: true`, and the selected `parentId`/placement if applicable. Review:

- normalized dimensions, properties, and variant tuples;
- `expectedVariantCount` and deterministic matrix coverage;
- the visual plan and warnings, including any template-preview-only warning;
- names and required property bindings.

Do not treat a dry-run as a completed creation. If it is wrong, revise the schema and rerun both planning calls.

### 3. Create the set

Only after the plan is correct, call `create_component_set` with `dryRun: false`. Pass the same target and placement. The tool performs postflight checks and attempts to remove nodes it created if the native operation fails.

Require a successful response with `valid: true`, a `componentSetId`, the expected `variantCount`, healthy `verification`, and no required-binding or visual invariant errors. If the tool reports rollback failure or an unhealthy result, inspect the returned node IDs and report the exact state; do not silently retry and create duplicates.

### 4. Bind existing styles and tokens

Creation APIs may write raw visual values, but they do not automatically attach local paint/text styles. To make existing styles the source of truth:

1. Call `apply_tokens` with `nodeIds` listing the created component/set and any child nodes that need local style links; scope to relevant `tokenPaths` when known. Keep the default exact-value match unless there is evidence for another match type.
2. Review the dry-run plan. Check that each planned node/property maps to the intended token and that no unrelated values are included.
3. Call `apply_tokens` with `dryRun: false` only after the plan is correct.
4. Re-read `get_token_usage` (and `audit_design_tokens` when useful) to confirm style/variable matches, not merely exact-value matches.

Use existing local text styles by matching the intended typography values. Use existing color styles for fills and strokes. If a value has no exact existing match, leave it unchanged and report it rather than binding a near match. Create tokens only under an explicit user request and only after reviewing `create_design_tokens`' dry-run.

### 5. Build the companion Visual Guide

After creating the canonical set/component and binding its existing styles, create the guide frame as a sibling under the intended page/section. Use `create_frame`, `create_text`, and `create_instance` with clear parent IDs; use auto-layout and padding tools to maintain the hierarchy. Add only representative variants and real instances. Verify the guide does not overlap the source and that its samples match the intended component properties.


### 6. Verify the result

For a component set, call `verify_component_set` with `componentSetId` and confirm the set is healthy, all declared variants exist exactly once, and normalized properties match the contract.

For a standalone component, re-read the node and child tree with `get_node`/`get_design_context`; confirm the node is a `COMPONENT`, the expected children/properties exist, and visual bounds are valid.

For either path, confirm required native property references and style/variable bindings, then capture a representative screenshot. For a stateful set, inspect default and non-default states. Report remaining unbound values and audit warnings.


## Current tool limits

Use tool schemas read from the mounted MCP tool documentation; do not guess additional template fields.

- `create_component_set` creates a deterministic native component set and variant matrix. Its generated child structure is intentionally limited: it creates a `Label` child for the recognized `Label` text property, and an arrow `Icon` child for the recognized `Show Icon` boolean or `Icon` variant dimension.
- Its `visualTemplate` supports state/type/size/icon style maps plus typography and basic layout fields implemented by the plugin. Map keys must match the target's actual dimension values. It is not a general arbitrary nested-layer tree schema.
- `layoutTemplate` currently supports only basic layout mode and item spacing in the generic path. Do not promise arbitrary padding, media, nested components, or custom icon composition through this field.
- For a custom nested visual tree, first build the real frame/component and children with the available node/component tools, bind native properties with the relevant component-property tools, then combine variants with `combine_as_variants` if a variant set is needed. Inspect and validate the real nodes; do not substitute empty placeholders.
- `requiredBindings` is a postflight requirement, not a request to invent a binding the generator cannot implement. If the required binding is unsupported, use an appropriate native property-binding flow or stop and report the limitation.

## Response

Report the created component or component-set name and node ID, variant/property counts when applicable, style/token binding results, verification outcome, screenshot evidence for the source and guide, and any remaining unbound values or tool limits. Keep the component's visual source of truth explicit: which local styles/tokens designers should edit to change its appearance.
