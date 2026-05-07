# Troubleshooting

## Plugin connection

Check that the MCP server is running and that the Figma plugin was launched from the expected `plugin/manifest.json`. The plugin connects only to the local bridge WebSocket.

## Stale builds

If a new tool exists in source but direct MCP calls return `Unknown request type`, compare server and plugin build artifacts. Rebuild both packages and reload the plugin in Figma.

## Node ID errors

Node IDs must use colon format. Hyphen-format IDs are invalid.

## Screenshot export errors

Check current selection, explicit `nodeIds`, output path scope, file extension, export format, and whether the target file already exists.

## Write errors

Verify the target node through a read tool before mutation. For batch writes, validate temporary refs, operation order, and batch size.

## Token write errors

Run dry-run first. For real writes, verify active context before mutation and read back with `get_design_tokens`, `get_variable_defs`, or `get_token_usage` afterward.
