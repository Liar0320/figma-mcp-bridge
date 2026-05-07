# Development Workflow

This repository has two runtime parts:

- `server/`: Node.js + TypeScript MCP server published as `@gethopp/figma-mcp-bridge`.
- `plugin/`: Figma plugin built with Vite + React + TypeScript.

The plugin connects to the local MCP server over `ws://localhost:1994/ws`. AI tools talk to the MCP server over stdio. Multiple MCP server processes coordinate with a leader/follower model so one leader owns the WebSocket connection and followers forward tool calls over HTTP `/rpc`.

## Local Setup

Build the server:

```bash
cd server
npm install
npm run build
```

Build the plugin:

```bash
cd plugin
npm install
npm run build
```

The plugin README path for Figma development import is:

```text
plugin/manifest.json
```

A local MCP client configuration can point directly at the built server:

```json
{
  "figma-bridge": {
    "command": "node",
    "args": ["/absolute/path/to/figma-mcp-bridge/server/dist/index.js"]
  }
}
```

## Validation Commands

Run these before opening a PR that changes server, plugin, tools, or docs describing tool behavior:

```bash
cd server && npm run build
cd ../plugin && npm run build
npm test
```

The plugin test command currently covers write tools and the design-token workflow: token graph, usage mapping, audit, proposal, creation, application, and export.

For docs-only PRs, also run from the repository root:

```bash
git diff --check
```

## Common Troubleshooting

### Plugin not connected

Check in this order:

1. The MCP server process is running.
2. Port `1994` is available.
3. The Figma plugin is imported from the current `plugin/manifest.json`.
4. The plugin has been rebuilt after source changes.
5. The plugin is open in the target Figma file and can reach `ws://localhost:1994/ws`.

### Invalid node IDs

MCP tool inputs must use Figma colon IDs such as `4029:12345`. Do not pass hyphen IDs such as `4029-12345`.

### Write-tool safety

Write tools modify the current Figma page. Always discover or confirm target IDs before using setters or `delete_node`. Use `batch_mutation` when newly created nodes must be referenced later in the same operation, and declare temporary refs with the `tmp:` prefix before using them.

### Local file side effects

`save_screenshots` writes files on the MCP server machine. Its output paths are constrained by the server working directory and should be reviewed before execution.
