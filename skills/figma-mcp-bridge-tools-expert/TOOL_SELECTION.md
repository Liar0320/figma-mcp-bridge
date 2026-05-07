# Tool Selection

| Task | First tool family |
| --- | --- |
| Understand current file or page | `get_metadata`, then `get_design_context` |
| Inspect current selection | `get_selection`, then `get_design_context` |
| Inspect one known node | `get_node` |
| Read local styles | `get_styles` |
| Read variables | `get_variable_defs` |
| Read normalized token graph | `get_design_tokens` |
| Map token usage | `get_token_usage` |
| Audit token governance | `audit_design_tokens` |
| Propose tokens | `propose_design_tokens` |
| Create tokens | `create_design_tokens` dry-run first |
| Apply tokens | `apply_tokens` dry-run first |
| Export token data | `export_design_tokens` |
| Return screenshot data | `get_screenshot` |
| Save screenshots locally | `save_screenshots` |
| Create or update nodes | Write tools or `batch_mutation` |
| Debug failures | Check plugin connection, request parameters, and leader/follower forwarding |
