# Component Tools Capability Roadmap

## Goal

Build a reliable Figma component/variant mutation layer that can create, migrate, validate, and recover component sets without corrupting Figma metadata.

Target model:

```text
Button
├── Type: Primary | Ghost | Text
├── State: Default | Hover | Active | Disabled
├── Size: Small | Medium | Large
├── Icon: None | Right | Up
├── Label: TEXT
└── Show Icon: BOOLEAN
```

## Status legend

- `Existing` — exposed and usable for the basic case.
- `Partial` — exposed, but incomplete or unsafe for complex component sets.
- `Planned` — capability required but not implemented.
- `Blocked` — depends on Figma/plugin API behavior that must be resolved first.

## Capability table

| ID | Capability | Status | Priority | Scope | Acceptance criteria |
|---|---|---:|---:|---|---|
| CT-01 | Inspect component-set health | Existing | P0 | Detect serialization errors, duplicate variant tuples, invalid property names, missing dimensions, orphaned variants, and unsupported property definitions before writes. | Returns deterministic `healthy`, `warnings`, `errors`, and affected node IDs. Never reports a damaged set as healthy. |
| CT-02 | Read normalized component schema | Existing | P0 | Normalize Component Set, variant dimensions, component properties, child bindings, and instance-swap candidates into a stable schema. | Same valid Figma structure produces the same schema independent of property ordering or node order. |
| CT-03 | Validate component schema before mutation | Existing | P0 | Validate dimension names, allowed values, duplicate tuples, required child bindings, and property types. | Invalid plans fail before any Figma mutation. Error includes path, node ID, and repair suggestion. |
| CT-04 | Plan component migration | Existing | P0 | Generate a dry-run migration plan from current structure to target schema. | Plan lists create, rename, reparent, bind, delete, and verify operations. No mutation occurs during planning. |
| CT-05 | Atomic mutation transaction | Existing | P0 | Execute component mutations with preflight, checkpoints, postflight, and rollback/compensation. | On failure, no partial target structure remains, or response explicitly identifies unreverted nodes. |
| CT-06 | Create empty Component Set with declared schema | Partial | P0 | Create a Component Set whose variant dimensions are established before variants are added. | New set exposes exactly declared dimensions and no generated `Property 1`/`Property 2` placeholders. |
| CT-07 | Create a complete variant matrix | Partial | P0 | Create all valid combinations from declared dimensions, with optional sparse-matrix exclusions. | For 3 × 4 × 3 × 3, creates 108 unique tuples; count and tuple set are verified afterward. |
| CT-08 | Create sparse variant matrix | Existing | P1 | Create only supported combinations and record excluded tuples. | Exclusions are explicit, deterministic, and cannot create duplicate Figma variants. |
| CT-09 | Set variant properties without rename parsing | Partial | P0 | Update native variant properties directly instead of encoding changes only through node names. | Existing dimensions retain identity; no dimension swaps or `Property N` drift after update. |
| CT-10 | Rename variant dimensions safely | Partial | P0 | Rename `Style`→`Type`, `icon`→`Icon`, etc. while preserving values and instances. | All variants and instance references remain valid after rename; references report zero unresolved properties. |
| CT-11 | Delete a variant dimension safely | Blocked | P0 | Remove an axis such as `Icon` after collapsing or mapping its values. | Target tuple set is deduplicated; instances are remapped or explicitly reported before deletion. |
| CT-12 | Merge component sets | Partial | P1 | Merge compatible sets while reconciling dimensions, values, properties, and conflicts. | Merge either completes with a validated schema or performs no mutation. |
| CT-13 | Split component set by dimension | Partial | P1 | Split a damaged or oversized set into independent sets such as `Button / Core` and `Button / Text`. | Each output is independently healthy and contains the expected tuples and properties. |
| CT-14 | Bind TEXT component property to text nodes | Partial | P0 | Bind `Label` to every intended text node across variants. | Changing `Label` on an instance updates visible text in every supported variant. |
| CT-15 | Bind BOOLEAN property to visibility | Partial | P0 | Bind `Show Icon` to icon visibility across variants. | Toggling property changes visibility without changing layout or variant identity. |
| CT-16 | Bind INSTANCE_SWAP property | Partial | P0 | Expose an icon instance as a configurable `INSTANCE_SWAP` property. | Instance accepts a compatible local component; invalid replacements fail validation without mutation. |
| CT-17 | Set preferred INSTANCE_SWAP values | Partial | P1 | Store compatible preferred icon components for instance property UI. | Preferred values resolve to local components and survive serialization. |
| CT-18 | Expose nested instance safely | Partial | P1 | Expose eligible nested instances only when Figma constraints permit it. | Ineligible nodes return a typed reason; eligible nodes are exposed without corrupting parent metadata. |
| CT-19 | Preserve auto-layout while binding content | Partial | P0 | Update text/icon bindings without breaking sizing, padding, gaps, or alignment. | Before/after layout invariants are checked for every variant. |
| CT-20 | Preserve visual styles during migration | Partial | P0 | Copy fills, strokes, opacity, radius, typography, spacing, and icon geometry. | Screenshot or serialized-style comparison stays within configured tolerances. |
| CT-21 | Migrate instances and callers | Partial | P0 | Find instances of old components and remap them to target variants/properties. | Every caller is classified as migrated, intentionally unchanged, or blocked; no silent orphaning. |
| CT-22 | Detect incompatible instance migration | Partial | P0 | Identify missing values, unsupported property types, and detached nested instances. | Migration stops before writes or returns explicit per-instance remediation. |
| CT-23 | Component-set repair mode | Partial | P0 | Recover from `Component set has existing errors` by reading raw nodes, rebuilding a clean set, and preserving recoverable visuals. | Damaged source remains untouched; rebuilt set passes health validation. |
| CT-24 | Clone-before-mutate mode | Existing | P0 | Clone a source component set and operate only on the clone. | Source node IDs and metadata remain unchanged; response returns source/target mapping. |
| CT-25 | Dry-run mutation report | Existing | P0 | Return planned operations, affected nodes, conflicts, and expected counts. | Dry-run output is sufficient for human review and contains no hidden writes. |
| CT-26 | Post-mutation verification | Partial | P0 | Re-read target set and verify schema, bindings, counts, layout, and serialization health. | Write tool fails if postflight invariants are not met. |
| CT-27 | Idempotent reconciliation | Partial | P1 | Reapply the same target schema without duplicate nodes or properties. | Second run produces zero changes or only deterministic repairs. |
| CT-28 | Operation journal and recovery | Partial | P1 | Persist mutation intent, created IDs, deleted IDs, and compensation actions. | Interrupted operations can resume or roll back from a journal. |
| CT-29 | Batch limits and chunking | Partial | P1 | Split large component operations into safe chunks while preserving transaction state. | 108+ variant plans do not exceed MCP/plugin limits and remain resumable. |
| CT-30 | Multi-file-safe component mutations | Existing | P1 | Require `fileKey` when multiple Figma sessions are connected. | Mutation fails closed without a target file and never writes to an arbitrary session. |
| CT-31 | Structured component errors | Partial | P0 | Replace generic internal errors with stable error codes and paths. | Callers can distinguish validation, Figma API, serialization, conflict, timeout, and rollback failures. |
| CT-32 | Component migration test fixture | Partial | P0 | Add deterministic fixture data for healthy, sparse, duplicate, and corrupted sets. | Tests cover schema validation, migration plan, rollback, bindings, and postflight verification. |
| CT-33 | Live Figma smoke harness | Partial | P0 | Run representative mutations against a connected Figma plugin instance. | Smoke scenario proves create → bind → instantiate → set properties → verify. |
| CT-34 | Visual regression screenshots | Partial | P1 | Capture source and target variants for visual comparison. | Differences are reported by variant and region; unrelated nodes are excluded. |
| CT-35 | Compatibility matrix by Figma API capability | Partial | P1 | Record which operations work for Component, Component Set, Variant, Instance, and nested Instance. | Unsupported operations are rejected before mutation with actionable guidance. |

## Recommended implementation order

### Phase 1 — Safety and observability

1. CT-01 Component-set health inspection
2. CT-02 Normalized component schema
3. CT-03 Schema validation
4. CT-25 Dry-run mutation report
5. CT-31 Structured component errors
6. CT-26 Post-mutation verification

### Phase 2 — Clean creation path


## Phase 1 implemented safe operations

The first safe phase exposes four read/planning MCP tools:

- `inspect_component_set` reads a `COMPONENT_SET`, normalizes dimensions, properties, and variant tuples, and emits stable diagnostic codes for serialization failures, missing dimensions, orphan children, and duplicate tuples.
- `validate_component_plan` validates a declarative target schema without contacting or mutating Figma. It deterministically expands a complete matrix (for example, 3 × 4 × 3 × 3 = 108 tuples), rejects duplicate tuples, and orders diagnostics and tuples stably.
- `plan_component_migration` compares the inspected set with a target schema and returns a deterministic dry-run list of create/delete/rename operations. It never mutates Figma.
- `verify_component_set` re-reads the set and reports schema, variant-count, property, and serialization-health checks. Damaged sets remain unhealthy and are not repaired automatically.

These tools intentionally do not implement mutation, rollback, or live Button migration. A damaged or unsupported read returns explicit structured diagnostics rather than fake success.

The `create_component_set` tool accepts the validated target schema and defaults to `dryRun: true`. Dry-run expands the deterministic Cartesian matrix without mutation; `dryRun: false` creates a new native set, verifies its variant count/schema, and compensates by removing operation-created nodes when native operations fail. Unsupported property bindings fail closed rather than returning partial success.
1. CT-06 Declared-schema Component Set creation
2. CT-07 Complete variant matrix creation
3. CT-08 Sparse matrix support
4. CT-14 TEXT binding
5. CT-15 BOOLEAN visibility binding
6. CT-16 INSTANCE_SWAP binding
7. CT-19 Auto-layout preservation

### Phase 3 — Migration and repair

1. CT-24 Clone-before-mutate
2. CT-04 Migration planner
3. CT-05 Atomic transaction
4. CT-10 Dimension rename
5. CT-11 Dimension deletion
6. CT-12 Set merge
7. CT-13 Set split
8. CT-23 Repair mode
9. CT-21 Instance migration

### Phase 4 — Reliability at scale

1. CT-27 Idempotent reconciliation
2. CT-28 Operation journal
3. CT-29 Chunking and resume
4. CT-33 Live smoke harness
5. CT-34 Visual regression
6. CT-35 Compatibility matrix

## Proposed tool surface

The existing low-level tools should remain available. Add higher-level tools instead of forcing callers to orchestrate unsafe sequences manually:

| Tool | Purpose |
|---|---|
| `inspect_component_set` | Health and normalized schema inspection. |
| `validate_component_plan` | Validate a target schema without writing. |
| `plan_component_migration` | Produce a dry-run migration plan. |
| `create_component_set` | Create a declared-schema set and variant matrix. |
| `bind_component_properties` | Bind TEXT, BOOLEAN, INSTANCE_SWAP, and nested instance properties. |
| `migrate_component_set` | Clone, transform, verify, and optionally remap instances. |
| `repair_component_set` | Rebuild a clean set from a damaged source. |
| `verify_component_set` | Run schema, binding, layout, and serialization checks. |
| `rollback_component_operation` | Compensate a journaled operation. |

## Initial Button acceptance test

A clean test fixture MUST prove:

1. Create `Button` with 108 unique variant tuples.
2. Expose dimensions exactly as `Type`, `State`, `Size`, and `Icon`.
3. Bind `Label: TEXT` to every variant's text node.
4. Bind `Show Icon: BOOLEAN` to icon visibility.
5. Preserve icon direction values `None`, `Right`, and `Up`.
6. Preserve the existing size metrics and state colors.
7. Create an instance and set:
   ```text
   Type = Primary
   State = Hover
   Size = Medium
   Icon = Right
   Label = Continue
   Show Icon = true
   ```
8. Re-read the instance and verify all six values.
9. Run the same reconciliation twice; the second run MUST be a no-op.
10. Inject a deliberate failure and verify no partially-created Component Set remains.

## Non-goals for the first implementation

- Arbitrary Figma UI automation.
- REST API synchronization.
- Cross-file component publishing.
- Automatic visual redesign.
- Silent repair of unrelated damaged nodes.
