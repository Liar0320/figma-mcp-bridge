# Export Patterns

## Choose the tool first

| Need | Tool |
| --- | --- |
| Return image data for further processing | `get_screenshot` |
| Save screenshots directly to local files | `save_screenshots` |

## `get_screenshot` rules

- Parameters: `nodeIds?`, `format?`, `scale?`.
- Default `format` is `PNG`.
- Default `scale` is `2`.
- When `nodeIds` is omitted, the current selection is exported.
- The result is base64 data and does not write to disk.

## `save_screenshots` rules

- Parameters: `items[]`; each item must include `nodeId` and `outputPath`.
- Each item may override `format` and `scale`.
- Top-level `format` and `scale` are defaults.
- The server validates the path, asks the plugin to export, then writes the file.

## Common failures

- No `nodeIds` were provided and the current selection is empty.
- The `nodeId` does not exist or does not use colon format.
- `outputPath` is outside the MCP server working directory.
- `format` conflicts with the file extension.
- The target file already exists.

## Recommended sequence

1. Confirm whether targets come from selection or explicit IDs.
2. If local files are required, confirm filename and extension.
3. Decide whether a custom `scale` is needed.
4. On failure, check connection and node existence first, then path and format.
