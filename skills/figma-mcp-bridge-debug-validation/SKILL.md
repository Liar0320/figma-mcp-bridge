---
name: figma-mcp-bridge-debug-validation
description: Diagnose Figma MCP Bridge connection, parameter, routing, export, and mutation failures.
---

# Figma MCP Bridge Debug Validation

Use this skill when a Figma MCP Bridge tool fails, times out, returns unexpected data, or appears to use stale plugin/server code.

## Debug order

1. Check whether the Figma plugin is running and connected.
2. Confirm the MCP server is listening on the expected local port.
3. Confirm the active file/page/selection with read-only tools.
4. Validate request parameters: node IDs, paths, colors, format, scale, and `dryRun`.
5. Distinguish server registration, plugin routing, write executor support, and leader/follower forwarding.
6. Rebuild server/plugin if built artifacts are stale.
7. Re-test with a known working read tool before testing the failing tool again.

## Common signals

- `Plugin not connected`: plugin is not running, not connected to the bridge, or the server is not listening.
- `Unknown request type`: server and plugin builds may be out of sync, or plugin routing lacks the request type.
- Path rejection: `save_screenshots` output path is outside the allowed working directory or conflicts with an existing file.
- Format rejection: screenshot format does not match the file extension.
- Write appears to succeed but read-back is unchanged: mutation executor or binding read-back is incomplete.
