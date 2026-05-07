# Safety Rules

## General rules

- Confirm active file/page context before acting.
- Prefer selection-scoped reads when the user refers to the current selection.
- Never invent node IDs.
- Use colon-format node IDs such as `4029:12345`.
- Keep read-only tools read-only.
- Treat local file writes and Figma mutations as side effects.

## Screenshot rules

- Use `get_screenshot` for returned image data.
- Use `save_screenshots` only when local file output is required.
- Validate output path, format, extension, and overwrite behavior.

## Write rules

- Verify the target node before mutation.
- Use dry-run where available.
- Use `batch_mutation` for multi-step operations with temporary refs.
- Read back after mutation when practical.
- Do not delete nodes without explicit target confirmation.

## Token rules

- Audit and proposal tools must not write.
- Creation and application tools must default to dry-run.
- Real token writes require explicit `dryRun=false`.
- Verify applied tokens with `get_token_usage` or a relevant read-back tool.
