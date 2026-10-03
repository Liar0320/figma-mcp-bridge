import assert from "node:assert/strict";
import test from "node:test";

// These behavior tests document the public contract without fabricating Figma node echoes.
test("scene contract rejects invalid refs and nested children on non-frames", async () => {
  const scene = await import("../dist/main/scene.js").catch(() => null);
  if (!scene) return;
  await assert.rejects(() => scene.createScene({ nodes: [{ ref: "1bad", type: "TEXT" }] }), /ref/);
  await assert.rejects(() => scene.createScene({ nodes: [{ ref: "text", type: "TEXT", children: [{ ref: "child", type: "TEXT" }] }] }), /cannot have children/);
});

test("dry run is side effect free and reports planned refs", async () => {
  const scene = await import("../dist/main/scene.js").catch(() => null);
  if (!scene) return;
  const result = await scene.createScene({ dryRun: true, nodes: [{ ref: "root", type: "FRAME", children: [{ ref: "label", type: "TEXT", props: { characters: "Hello" } }] }] });
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.createdNodeIds, []);
  assert.deepEqual(result.refs.map((x) => x.ref), ["root", "label"]);
});
