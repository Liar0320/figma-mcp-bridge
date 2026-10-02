import assert from "node:assert/strict";
import { normalizeComponentSetNode, validateComponentPlan, createComponentSet, arrowIconGeometry, planVariantGrid, shouldCreateIconNode } from "../dist-test/src/main/componentTools.js";

const buttonTarget = {
  name: "Button",
  dimensions: [
    { name: "Type", values: ["Primary", "Ghost", "Text"] },
    { name: "State", values: ["Default", "Hover", "Active", "Disabled"] },
    { name: "Size", values: ["Small", "Medium", "Large"] },
    { name: "Icon", values: ["None", "Right", "Up"] },
  ],
  properties: [
    { name: "Label", type: "TEXT", defaultValue: "Continue" },
  ],
};
assert.equal(shouldCreateIconNode("Right", false), true);
assert.equal(shouldCreateIconNode("Up", false), true);
assert.equal(shouldCreateIconNode("None", true), false);
assert.equal(shouldCreateIconNode(undefined, true), true);
assert.equal(shouldCreateIconNode(undefined, false), false);
const buttonValidation = validateComponentPlan(buttonTarget);
assert.deepEqual(buttonValidation.normalized.properties.map((property) => property.name), ["Label"]);
const { planComponentVisuals } = await import("../dist-test/src/main/componentTools.js");
const visualPlan = planComponentVisuals(buttonTarget, buttonValidation.normalized);
assert.equal(visualPlan?.source, "built-in");
assert.equal(visualPlan?.variants.length, 108);
const tupleVariant = (plan, values) => plan?.variants.find((item) => item.tuple.every((value, index) => value === values[buttonValidation.normalized.dimensions[index].name]));
const primaryDefaultSmall = tupleVariant(visualPlan, { Type: "Primary", State: "Default", Size: "Small", Icon: "None" });
assert.equal(primaryDefaultSmall?.primaryAxisSizingMode, "AUTO");
assert.deepEqual(primaryDefaultSmall && {
  fill: primaryDefaultSmall.fill,
  height: primaryDefaultSmall.height,
  paddingX: primaryDefaultSmall.paddingX,
  paddingY: primaryDefaultSmall.paddingY,
  radius: primaryDefaultSmall.radius,
  gap: primaryDefaultSmall.gap,
  fontSize: primaryDefaultSmall.fontSize,
  lineHeight: primaryDefaultSmall.lineHeight,
  iconVisible: primaryDefaultSmall.iconVisible,
}, {
  fill: "#3D6DFF", height: 32, paddingX: 16, paddingY: 6, radius: 20, gap: 8,
  fontSize: 14, lineHeight: 20, iconVisible: false,
});
const ghostHoverMedium = tupleVariant(visualPlan, { Type: "Ghost", State: "Hover", Size: "Medium", Icon: "Right" });
assert.equal(ghostHoverMedium?.stroke, "#6691FF");
assert.equal(ghostHoverMedium?.textColor, "#6691FF");
assert.equal(ghostHoverMedium?.iconRotation, 0);
assert.equal(ghostHoverMedium?.iconVisible, true);
const textDisabledLargeUp = tupleVariant(visualPlan, { Type: "Text", State: "Disabled", Size: "Large", Icon: "Up" });
assert.equal(textDisabledLargeUp?.opacity, 0.3);
assert.equal(textDisabledLargeUp?.iconRotation, 90);

const dryRunResult = await createComponentSet(buttonTarget);
assert.equal(dryRunResult.dryRun, true);
assert.equal(dryRunResult.valid, true);
assert.equal(dryRunResult.variantCount, 0);
assert.equal(dryRunResult.visualPlan?.variants.length, 108);
assert.equal(textDisabledLargeUp?.iconSize, 18);
const grid = planVariantGrid([
  { tuple: ["A"], width: 32, height: 20 },
  { tuple: ["B"], width: 40, height: 22 },
  { tuple: ["C"], width: 36, height: 24 },
], { columns: 2, gapX: 8, gapY: 4 });
assert.deepEqual(grid.map(({ x, y, row, column }) => ({ x, y, row, column })), [
  { x: 0, y: 0, row: 0, column: 0 },
  { x: 44, y: 0, row: 0, column: 1 },
  { x: 0, y: 26, row: 1, column: 0 },
]);
const arrow = arrowIconGeometry(18);
assert.equal(arrow.width, 18);
assert.match(arrow.path, /^M 3 9 L 14 9/);
assert.notEqual(arrow.path, "");

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

const excludedPlan = validateComponentPlan({
  dimensions: [{ name: "State", values: ["Default", "Hover"] }],
  exclusions: [{ State: "Hover" }],
});
assert.equal(excludedPlan.valid, true);
assert.equal(excludedPlan.expectedVariantCount, 1);
assert.deepEqual(excludedPlan.normalized.variants, [["Default"]]);

const invalidSwapPlan = validateComponentPlan({
  dimensions: [{ name: "State", values: ["Default"] }],
  properties: [{ name: "Icon", type: "INSTANCE_SWAP", defaultValue: "" }],
});
assert.equal(invalidSwapPlan.valid, false);
assert.ok(invalidSwapPlan.diagnostics.some((item) => item.code === "INSTANCE_SWAP_PREFERRED_VALUES_REQUIRED"));

const validSwapPlan = validateComponentPlan({
  dimensions: [{ name: "State", values: ["Default"] }],
  properties: [{ name: "Icon", type: "INSTANCE_SWAP", defaultValue: "", preferredValues: [{ type: "COMPONENT", key: "icon-key" }] }],
  requiredBindings: [{ property: "Icon", type: "INSTANCE_SWAP" }],
});
assert.equal(validSwapPlan.valid, true);

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
