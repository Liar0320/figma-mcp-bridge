import assert from "node:assert/strict";
import { normalizeComponentSetNode, validateComponentPlan } from "../dist-test/src/main/componentTools.js";

const target = {
  dimensions: [
    { name: "State", values: ["Hover", "Default", "Active", "Disabled"] },
    { name: "Type", values: ["Primary", "Ghost", "Text"] },
    { name: "Size", values: ["Small", "Medium", "Large"] },
  ],
};
const plan = validateComponentPlan(target);
assert.equal(plan.valid, true);
assert.equal(plan.expectedVariantCount, 36);
assert.deepEqual(plan.normalized.dimensions.map((item) => item.name), ["Size", "State", "Type"]);

const duplicatePlan = validateComponentPlan({
  dimensions: [{ name: "State", values: ["Default"] }],
  variants: [{ State: "Default" }, { State: "Default" }],
});
assert.equal(duplicatePlan.valid, false);
assert.equal(duplicatePlan.diagnostics[0].code, "DUPLICATE_VARIANT_TUPLE");

const set = {
  id: "20:1",
  type: "COMPONENT_SET",
  name: "Button",
  componentPropertyDefinitions: {
    State: { type: "VARIANT", variantOptions: ["Default", "Hover"] },
  },
  children: [
    { id: "20:3", type: "COMPONENT", name: "State=Default", variantProperties: { State: "Default" } },
    { id: "20:2", type: "COMPONENT", name: "State=Hover", variantProperties: { State: "Hover" } },
  ],
};
const normalized = normalizeComponentSetNode(set);
assert.equal(normalized.healthy, true);
assert.deepEqual(normalized.variants.map((item) => item.id), ["20:3", "20:2"]);

console.log("componentTools.test.mjs: 4 passed");
