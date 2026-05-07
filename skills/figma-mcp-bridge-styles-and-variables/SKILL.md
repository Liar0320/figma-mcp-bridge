---
name: figma-mcp-bridge-styles-and-variables
description: Work with Figma local styles, variables, normalized design tokens, usage mapping, audits, proposals, dry-run create/apply, and exports.
---

# Figma MCP Bridge Styles and Variables

Use this skill for design-system and design-token tasks involving `get_styles`, `get_variable_defs`, `get_design_tokens`, `get_token_usage`, `audit_design_tokens`, `propose_design_tokens`, `create_design_tokens`, `apply_tokens`, and `export_design_tokens`.

## What this skill covers

- Read local paint, text, effect, and grid styles.
- Read variable collections, modes, values, and aliases.
- Explain token organization in the current file.
- Scan token usage and coverage for selection, page, or explicit node IDs.
- Audit token coverage, unbound usage, exact-value-only matches, duplicate token values, and other governance issues.
- Propose tokens from repeated values without writing to Figma.
- Create or apply tokens only after a dry-run plan.
- Export JSON, DTCG, CSS variables, or Tailwind token data.
- Model visual styles and design tokens as related but distinct concepts.

## Tool boundaries

- `get_styles` reads raw local styles. It does not read variable collections.
- `get_variable_defs` reads raw variables and token-like primitives. It does not read paint/text/effect/grid style entities.
- `get_design_tokens` returns a normalized graph that can include both variables and styles, while preserving `source`.
- `get_token_usage` maps node properties to tokens through bound variables, styles, exact values, or unmatched values.
- `audit_design_tokens` is read-only governance reporting.
- `propose_design_tokens` is read-only proposal generation.
- `create_design_tokens` is mutation-capable and must default to dry-run.
- `apply_tokens` is mutation-capable and must default to dry-run.
- `export_design_tokens` is read-only.

## Safety rules

- Do not create or bind tokens while auditing or proposing.
- Do not treat a style token as a Figma variable.
- Preserve aliases instead of flattening them unless explicit resolution is requested.
- For live writes, verify file/page context before mutation and read back after mutation.
