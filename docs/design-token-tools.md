# Design Token Tools

Figma MCP Bridge exposes design-token capabilities as a staged workflow. Keep read-only analysis separate from dry-run write plans and real Figma mutations.

## Tool Matrix

| Stage | Tool | Side effects | Use when |
| --- | --- | --- | --- |
| Raw styles | `get_styles` | None | You need local paint, text, effect, or grid styles as Figma styles. |
| Raw variables | `get_variable_defs` | None | You need variable collections, modes, values, aliases, and raw Figma variable IDs. |
| Normalized graph | `get_design_tokens` | None | You need a stable AI-friendly token graph across variables and styles. |
| Usage mapping | `get_token_usage` | None | You need to know whether selected/page/specific nodes use tokens, styles, exact values, or no match. |
| Audit | `audit_design_tokens` | None | You need coverage, consistency issues, and recommendations. |
| Proposal | `propose_design_tokens` | None | You need candidate tokens from repeated unbound values or duplicate token values. |
| Creation | `create_design_tokens` | Dry-run by default; writes only with `dryRun=false` | You have reviewed a token list and want to create variables/styles. |
| Application | `apply_tokens` | Dry-run by default; writes only with `dryRun=false` | You want to bind variables or apply styles to matching node properties. |
| Export | `export_design_tokens` | None | You need JSON, DTCG JSON, CSS variables, or Tailwind theme token output. |

## Match Types

`get_token_usage` and downstream audit/proposal tools distinguish these states:

- `boundVariable`: the Figma node property is actually bound to a variable.
- `style`: the property uses a local Figma style.
- `exactValue`: the property value equals a token value, but is not bound to it.
- `none`: no known token/style match was found.

Do not treat `exactValue` as an applied token. It is useful for migration proposals, not proof of governance compliance.

## Dry-run Write Rules

`create_design_tokens` and `apply_tokens` are write workflows. They must be run in this order:

1. Run with the default `dryRun=true`.
2. Review the returned plan, target nodes, target token paths, conflict strategy, and warnings.
3. Confirm the Figma context with `get_metadata`, `get_selection`, `get_design_context`, or explicit `nodeIds` as needed.
4. Re-run with `dryRun=false` only when the plan is correct.
5. Re-read tokens or usage after the write to verify the result.

## Export Formats

`export_design_tokens` supports:

- `json`: normalized project-native token payload.
- `dtcg`: W3C Design Tokens Community Group style JSON.
- `css`: CSS custom properties for supported token groups.
- `tailwind`: Tailwind theme token object for supported token groups.

Unsupported token groups in a format should be reported as warnings rather than silently converted incorrectly.
