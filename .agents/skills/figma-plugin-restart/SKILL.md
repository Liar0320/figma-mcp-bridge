---
name: figma-plugin-restart
description: Restart the Figma MCP Bridge development plugin inside Figma Desktop after plugin runtime changes, then verify a fresh WebSocket connection and changed behavior.
---

# Restart Figma MCP Bridge

Use for this repository's Figma Desktop development plugin. Build changed `plugin/` code before restarting; do not confuse restarting the MCP server or observing an already-connected plugin with a plugin reload.

## Fast path

1. Focus Figma with `osascript -e 'tell application "System Events" to set frontmost of process "Figma" to true'`. Inspect the Figma window and locate the **Figma MCP Bridge** panel. `tell application "Figma" to activate` alone did not reliably enable computer-use clicks.
2. Close the panel. If it is active, try `osascript -e 'tell application "System Events" to key code 53'` (Escape), then **inspect the window**. If the panel remains, click its visible **X**. Do not infer closure from a successful keystroke or click command. If the X is off-screen, move the Figma window into view (for example, `osascript -e 'tell application "System Events" to tell process "Figma" to set position of window "Untitled" to {100, 100}'`; use the actual window title), then inspect and click the X. Use fresh screenshot/window coordinates, never cached absolute coordinates.
3. Relaunch through Figma's **Plugins → Development → Figma MCP Bridge** menu:
   ```sh
   osascript -e 'tell application "System Events" to tell process "Figma" to click menu item "Figma MCP Bridge" of menu 1 of menu item "Development" of menu 1 of menu bar item "Plugins" of menu bar 1'
   ```
4. Inspect the reopened panel: require **WebSocket Connected** with the green indicator. Then exercise the task's changed plugin path. If either closure or reopening is unobserved, do not report a restart.

## MCP server restart and stale Leader cleanup

When server-side runtime code changes (for example `server/src/leader.ts`, `server/src/tools.ts`, or `server/src/iconify.ts`), restarting only the Figma plugin is insufficient. The active MCP Leader may still be an older process, especially when multiple OMP/MCP sessions share port `1994`.

1. Confirm the repository branch and build the server from the intended worktree:
   ```sh
   git status --short --branch
   npm --prefix server run build
   ```
2. Inspect the active listener and its supervisor:
   ```sh
   lsof -nP -iTCP:1994 -sTCP:LISTEN
   ps -p <leader-pid> -o pid=,ppid=,lstart=,command=
   ps -p <parent-pid> -o pid=,ppid=,command=
   ```
3. Stop the stale Leader and its `npm exec @gethopp/figma-mcp-bridge` supervisor. Killing only the child may cause the supervisor to immediately respawn the same stale build. Recheck port `1994` after each stop; repeat until the intended MCP session is the sole active Leader.
4. Verify the new runtime before using mounted MCP tools. Query a behavior that identifies the changed build, not only `list_files` or an existing WebSocket connection. For bundled Iconify code, `create_icon({ name: "activity", dryRun: true })` must return `source: "bundled"` and omit `sourceUrl` when `FIGMA_BRIDGE_ICON_SOURCE=bundled`.
5. If the MCP session is a follower, it may proxy to another Leader. Inspect the Leader's `/rpc` behavior directly when diagnosing routing, and avoid starting an unrelated second Leader on port `1994`.
6. After server runtime verification, restart the Figma plugin using the Fast path above only when `plugin/` runtime code changed. A server-only restart does not require a plugin restart.

Successful process termination is not proof of replacement. Require a fresh Leader process, the expected build behavior, and (for plugin changes) a newly observed **WebSocket Connected** panel before reporting the restart as verified.

## UI control fallback

Read `skill://computer-use`, then the version-matched `orca skills get computer-use` guide before `orca computer` commands. Use `orca computer get-app-state --app com.figma.Desktop --json` and inspect its screenshot; its accessibility tree may contain only the outer Figma window. Coordinate clicks can fail with `window_not_focused` even after `--restore-window`. Do not repeat the same failed click. macOS System Events can focus Figma and operate the menu; if direct panel clicking remains blocked, use a native CoreGraphics mouse event only at a freshly observed, on-screen X after confirming Figma is frontmost. A successful input call is not proof—inspect the resulting screenshot. Do not click by guessed coordinates or alter the design canvas.

The previously observed Figma window was partly off-screen, so Escape left the panel open. Moving the window on-screen and clicking the visible X closed it; menu relaunch then displayed **WebSocket Connected**. Treat window placement and Escape behavior as variable, not invariants.
