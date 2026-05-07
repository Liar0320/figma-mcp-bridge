# Multi-file routing

## Goal

Prevent MCP calls from mixing Figma document/plugin contexts when multiple plugin instances are connected to the same local bridge. This fixes the core risk in issue #10: read and mutation tools should not silently target the wrong Figma file.

## Scope

- Track multiple plugin WebSocket connections in the server bridge.
- Expose `list_files` so clients can discover connected files and their `fileKey` values.
- Add optional `fileKey` to every Figma-backed MCP tool input schema, including design-token and mutation tools.
- Route direct MCP calls and follower `/rpc` calls to the selected file connection when `fileKey` is provided.
- Fail closed when multiple files are connected and a tool call omits `fileKey`.
- Preserve single-file backward compatibility: if exactly one file is connected, existing calls without `fileKey` continue to work.
- Publish plugin connection identity with saved-file `figma.fileKey`, a plugin-session fallback for unsaved files, and the file name in the WebSocket query.

## Behavior

1. One connected Figma file:
   - Existing tool calls can omit `fileKey`.
   - Calls route to the only connected plugin instance.
2. Multiple connected Figma files:
   - Calls without `fileKey` return an explicit error.
   - The error lists connected files and instructs the caller to use `list_files`.
   - Calls with `fileKey` route to the matching plugin instance.
3. Unsaved files:
   - If Figma does not provide `figma.fileKey`, the plugin uses a generated session key.
   - This avoids treating multiple `Untitled` files as the same target.

## Client workflow

```text
1. Run the plugin in each Figma file you want to query or mutate.
2. Call list_files.
3. Pick the intended fileKey.
4. Pass fileKey to read, screenshot, design-token, or write tools.
5. For write/token mutation workflows, keep using dry-run-first behavior where available.
```

## Acceptance criteria

- With one file connected, existing calls can omit `fileKey`.
- With multiple files connected, omitting `fileKey` returns an explicit error listing connected files.
- Passing `fileKey` routes to the intended Figma plugin instance.
- All read/token/write tools preserve `fileKey` in both MCP direct calls and follower `/rpc` forwarding.
- Mutation tools cannot silently run against an arbitrary connected file in multi-file mode.

## Local verification

```bash
cd server && npm test
cd ../plugin && npm run build
npm test
```

## Manual live verification checklist

- Connect one Figma file and verify existing calls still work without `fileKey`.
- Connect two Figma files and verify `list_files` returns two entries.
- With two files connected, call a read tool without `fileKey` and verify it fails closed.
- Call read/token tools with each file's `fileKey` and verify responses come from the intended file.
- For write-capable tools, run dry-run paths first where available, then make a small scoped edit using an explicit `fileKey` and verify the edit lands in the target file only.
