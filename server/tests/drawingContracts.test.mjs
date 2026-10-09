import assert from "node:assert/strict";
import test from "node:test";
import { toolInputSchemas } from "../dist/schema.js";

test("scene rejects duplicate refs across different branches", () => {
  const nodes = [
    { ref: "first", type: "FRAME", children: [{ ref: "label", type: "TEXT" }] },
    { ref: "second", type: "FRAME", children: [{ ref: "label", type: "TEXT" }] },
  ];
  const result = toolInputSchemas.create_scene.safeParse({ nodes });
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /Duplicate scene ref/);
});

test("scene rejects a deeply nested payload before recursive parsing can overflow", () => {
  let node = { ref: "leaf", type: "TEXT" };
  for (let index = 0; index < 10000; index += 1) {
    node = { ref: `frame${index}`, type: "FRAME", children: [node] };
  }
  const result = toolInputSchemas.create_scene.safeParse({ nodes: [node] });
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /16 levels/);
});

test("scene limits the total tree rather than each branch independently", () => {
  const nodes = Array.from({ length: 10 }, (_, branch) => ({
    ref: `branch${branch}`,
    type: "FRAME",
    children: Array.from({ length: 10 }, (_, index) => ({ ref: `item${branch}_${index}`, type: "TEXT" })),
  }));
  const result = toolInputSchemas.create_scene.safeParse({ nodes });
  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /100 nodes/);
});

test("scene fails closed on unknown props and unsupported child ownership", () => {
  for (const nodes of [
    [{ ref: "root", type: "FRAME", props: { widht: 320 } }],
    [{ ref: "label", type: "TEXT", children: [{ ref: "child", type: "TEXT" }] }],
    [{ ref: "root", type: "FRAME", props: { parentId: "1:2" } }],
  ]) {
    assert.equal(toolInputSchemas.create_scene.safeParse({ nodes }).success, false);
  }
});

test("canvas slot and automatic frame placement schemas enforce supported bounds", () => {
  const schema = toolInputSchemas.find_canvas_slot;
  for (const input of [
    { width: 0 },
    { width: 320, height: 0 },
    { width: 320, direction: "left" },
    { width: 320, spacing: -1 },
    { width: 320, nearNodeId: "1-2" },
  ]) {
    assert.equal(schema.safeParse(input).success, false);
  }
  assert.equal(schema.safeParse({ width: 320, height: 480, spacing: 80, direction: "bottom", nearNodeId: "1:2" }).success, true);
  assert.equal(toolInputSchemas.create_scene.safeParse({
    position: "auto",
    nodes: [{ ref: "root", type: "FRAME", props: { width: 320, height: 480 } }],
  }).success, true);
  assert.equal(toolInputSchemas.create_frame.safeParse({ position: "auto" }).success, true);
});

test("create_scene accepts ICON nodes with bounded Iconify props", () => {
  const result = toolInputSchemas.create_scene.safeParse({
    nodes: [{ ref: "icon", type: "ICON", props: { name: "activity", size: 20, color: "#3D6DFF" } }],
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.nodes[0].props.iconSet, "lucide");
});

test("measurement rejects zero or infinite widths and unsupported auto-resize overrides", () => {
  for (const item of [
    { characters: "Long label", width: 0 },
    { characters: "Long label", width: Infinity },
    { characters: "Long label", style: { textAutoResize: "NONE" } },
  ]) {
    assert.equal(toolInputSchemas.measure_text.safeParse({ items: [item] }).success, false);
  }
});

test("diagnostics require explicit roots and bounded traversal", () => {
  for (const input of [
    {},
    { rootIds: [] },
    { rootIds: ["1-2"] },
    { rootIds: ["1:2"], maxNodes: 2001 },
    { rootIds: ["1:2"], ignore: [{ nodeId: "1:3", code: "IGNORE_ALL" }] },
  ]) {
    assert.equal(toolInputSchemas.validate_layout.safeParse(input).success, false);
  }
});
