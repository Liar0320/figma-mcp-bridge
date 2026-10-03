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
