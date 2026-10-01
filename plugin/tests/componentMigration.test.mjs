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
