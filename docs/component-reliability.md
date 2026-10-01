# Component reliability acceptance layer

| Capability | Status | Evidence |
|---|---|---|
| Operation journal | Implemented | Session-scoped journal around write dispatch; `get_operation_journal` |
| Rollback/recovery | Implemented with limits | Removes nodes created by journaled operations; native undo reports `RECOVERY_UNSUPPORTED` |
| Matrix chunking/resume | Implemented | `get_component_matrix` with `chunkSize` and cursor |
| Structured component errors | Implemented | Stable error codes in plugin reliability module and write transport |
| Compatibility matrix | Implemented | `componentCompatibilityMatrix` and this table |
| Live smoke harness | Implemented | `scripts/component-smoke.mjs`; calls `/ping`, `/rpc`, creates Button with 108 tuples, binds Label/Show Icon, sets six values, reads, reconciles, injects a failure, and saves PNGs; no live plugin means exit 2 |
| Visual regression report | Implemented | `get_component_screenshot_report` plus `scripts/visual-compare.mjs` compare deterministic variant/region manifests by SHA-256 |
| Deterministic fixtures | Implemented | `fixtures/components.json` and fixture factory tests |

The journal is session-scoped in plugin memory. Recovery is intentionally limited to created nodes whose IDs are present in a successful journal entry. No screenshot baseline comparison is claimed; the report records capture evidence and baseline identity for an external comparator.


## Figma API capability matrix

The plugin publishes `componentCompatibilityMatrix` and marks unsupported operations explicitly: remote library import and native undo recovery are unsupported; pixel-level diffing is performed by the runner after `exportAsync`, not by the Figma API. Unsupported operations fail closed with a diagnostic or `RECOVERY_UNSUPPORTED`.

## Button acceptance harness

Run `npm run component:smoke` from `plugin/` with a real bridge and connected Figma plugin. Set `COMPONENT_SMOKE_OUTPUT` for artifacts and `COMPONENT_SMOKE_BASELINE` for a baseline directory. The harness exits non-zero when the bridge, plugin, RPC response, 108-variant schema, property bindings, six instance updates, reconciliation, deliberate failure, or screenshot capture is missing.
