import assert from "node:assert/strict";
import test from "node:test";
import { buildReconciliationPlan, classifyInstances, planDimensionChange, verifyPostflight } from "../dist-test/src/main/componentMigration.js";

test("classifies instances deterministically with exact, variant, key, unmapped precedence", () => {
  const targets = [
    { id: "1:2", name: "Default", type: "COMPONENT", key: "k1", variantProperties: { State: "Default" } },
    { id: "1:3", name: "Hover", type: "COMPONENT", key: "k2", variantProperties: { State: "Hover" } },
  ];
  const result = classifyInstances([
    { id: "1:9", name: "u", mainComponentId: "missing", mainComponentKey: "k2", variantProperties: { State: "Hover" } },
    { id: "1:8", name: "x", mainComponentId: "missing", mainComponentKey: "nope" },
    { id: "1:7", name: "e", mainComponentId: "1:2" },
  ], targets);
  assert.deepEqual(result.map((x) => [x.id, x.classification, x.targetComponentId]), [
    ["1:7", "exact", "1:2"], ["1:8", "unmapped", undefined], ["1:9", "variant", "1:3"],
  ]);
});

test("dimension plan refuses deletion by emitting explicit guarded action", () => {
  const actions = planDimensionChange({ id: "1:1", name: "Button", type: "COMPONENT", width: 100, height: 40 }, { width: null, rename: "Button/Primary" });
  assert.deepEqual(actions, [
    { type: "rename", nodeId: "1:1", from: "Button", to: "Button/Primary" },
    { type: "delete-dimension", nodeId: "1:1", dimension: "width" },
  ]);
});

test("reconciliation and postflight are idempotent and deterministic", () => {
  const instances = [{ id: "1:4", name: "old", mainComponentId: "old", mainComponentKey: "new-key" }];
  const targets = [{ id: "1:5", name: "new", type: "COMPONENT", key: "new-key" }];
  const a = buildReconciliationPlan(instances, targets);
  const b = buildReconciliationPlan(instances, targets);
  assert.deepEqual(a, b);
  assert.equal(a.actions[0].type, "remap-instance");
  assert.equal(verifyPostflight(targets, targets).ok, true);
  assert.equal(verifyPostflight(targets, [{ ...targets[0], name: "wrong" }]).ok, false);
});

test("merge and split plans clone sources before combine operations", async () => {
  const mod = await import("../dist-test/src/main/componentMigration.js");
  const source = { id: "set:source", name: "Source", type: "COMPONENT_SET" };
  const target = { id: "set:target", name: "Target", type: "COMPONENT_SET" };
  const merged = mod.planMergeComponentSets(source, target, ["v2", "v1", "v1"]);
  assert.deepEqual(merged.actions, [
    { type: "clone", sourceId: "set:source" },
    { type: "merge-set", sourceSetId: "set:source", targetSetId: "set:target" },
    { type: "split-set", sourceSetId: "set:source", componentIds: ["v1", "v2"] },
  ]);
  const split = mod.planSplitComponentSet(source, ["v3", "v1", "v3"]);
  assert.deepEqual(split.actions, [
    { type: "clone", sourceId: "set:source" },
    { type: "split-set", sourceSetId: "set:source", componentIds: ["v1", "v3"] },
  ]);
});

test("reconciliation second run is a true no-op after remapping", () => {
  const targets = [
    { id: "target:default", name: "Default", type: "COMPONENT", key: "target-key", variantProperties: { State: "Default" } },
  ];
  const first = buildReconciliationPlan([
    { id: "instance:1", name: "Instance", mainComponentId: "legacy", mainComponentKey: "target-key", variantProperties: { State: "Default" } },
  ], targets);
  assert.equal(first.actions.length, 1);
  const remappedState = [{ id: "instance:1", name: "Instance", mainComponentId: "target:default", mainComponentKey: "target-key", variantProperties: { State: "Default" } }];
  const second = buildReconciliationPlan(remappedState, targets);
  assert.deepEqual(second.actions, []);
  assert.deepEqual(second.warnings, []);
});

test("repair planning is idempotent when current snapshot already matches desired schema", async () => {
  const mod = await import("../dist-test/src/main/componentMigration.js");
  const current = { id: "set:1", name: "Button", type: "COMPONENT_SET", width: 120, height: 40 };
  const desired = { id: "set:1", name: "Button", type: "COMPONENT_SET", width: 120, height: 40 };
  const plan = mod.repairComponentSet(current, desired);
  assert.deepEqual(plan.actions, []);
  assert.equal(plan.deterministicKey, "[]");
});

test("dimension rename and delete collapse duplicate values deterministically", async () => {
  const mod = await import("../dist-test/src/main/componentMigration.js");
  const renamed = mod.planDimensionRename([
    { name: "State", values: ["Default", "Hover"] },
    { name: "Interaction", values: ["Hover", "Pressed"] },
  ], "State", "Interaction");
  assert.deepEqual(renamed.dimensions, [{ name: "Interaction", values: ["Default", "Hover", "Pressed"] }]);
  const deleted = mod.planDimensionDelete([
    { name: "State", values: ["Default", "Hover"] },
    { name: "Size", values: ["Small", "Large"] },
  ], "State", "Default");
  assert.deepEqual(deleted.remap, { Hover: "Default" });
  assert.deepEqual(deleted.dimensions, [{ name: "Size", values: ["Small", "Large"] }]);
});
