# Style and Token Patterns

## What `get_styles` returns

`get_styles` reads local Figma styles: paint, text, effect, and grid styles. It is useful for answering which local styles exist and what their core visual properties are.

## What `get_variable_defs` returns

`get_variable_defs` reads variable collections, modes, variable IDs, names, resolved types, values by mode, and aliases. It is useful for understanding collections, mode values, and variable alias relationships.

## What `get_design_tokens` returns

`get_design_tokens` returns a normalized token graph.

- Each token has a stable `path`, such as `color.brand.primary`.
- Each token preserves `source: "variable" | "style" | "inferred"`.
- Variable tokens keep collection, mode, value, and alias metadata.
- Style tokens keep style type and a summary of original style properties.
- The summary groups counts by source and token group.

Use it for AI-facing design-system summaries, token overviews, and source/group breakdowns.

## Interpreting variable values

- `type: "VARIABLE_ALIAS"` means the value references another variable.
- `type: "COLOR"` means the plugin returned a structured color object.
- Do not assume all modes have the same value shape. Inspect each mode separately.

## Recommended response pattern

1. Decide whether the user needs raw data or a normalized token graph.
2. Use `get_design_tokens` for a unified design-system overview.
3. Use `get_styles` for raw style summaries.
4. Use `get_variable_defs` for collection, mode, and variable detail.
5. Mention aliases explicitly when token relationships matter.
6. Do not call `source: "style"` tokens Figma variables.
