# Component reliability acceptance layer

| Capability | Status | Evidence |
|---|---|---|
| Operation journal | Implemented | Session-scoped journal around write dispatch; `get_operation_journal` |
| Rollback/recovery | Implemented with limits | Removes nodes created by journaled operations; native undo reports `RECOVERY_UNSUPPORTED` |
| Matrix chunking/resume | Implemented | `get_component_matrix` with `chunkSize` and cursor |
| Structured component errors | Implemented | Stable error codes in plugin reliability module and write transport |
| Compatibility matrix | Implemented | `componentCompatibilityMatrix` and this table |
| Live smoke harness | Scaffolded | `scripts/component-smoke.mjs`; passes only against a reachable real bridge |
| Visual regression report | Implemented | `get_component_screenshot_report` returns explicit captured/missing/error items |
| Deterministic fixtures | Implemented | `fixtures/components.json` and fixture factory tests |

The journal is session-scoped in plugin memory. Recovery is intentionally limited to created nodes whose IDs are present in a successful journal entry. No screenshot baseline comparison is claimed; the report records capture evidence and baseline identity for an external comparator.
