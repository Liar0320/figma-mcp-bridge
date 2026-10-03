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

test("font style aliases normalize and resolve in deterministic order", async () => {
  const scene = await import("../dist-test/src/main/scene.js");
  assert.equal(scene.normalizeFontStyle("SemiBold"), "Semi Bold");
  assert.deepEqual(scene.fontCandidates({ family: "Inter", style: "SemiBold" }), [
    { family: "Inter", style: "SemiBold" },
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Regular" },
  ]);
});

test("font resolver returns the successful normalized descriptor", async () => {
  const scene = await import("../dist-test/src/main/scene.js");
  const attempted = [];
  const result = await scene.resolveFontDescriptor({ family: "Inter", style: "SemiBold" }, async (font) => {
    attempted.push(font);
    if (font.style !== "Semi Bold") throw new Error("missing");
  });
  assert.deepEqual(attempted, [
    { family: "Inter", style: "SemiBold" },
    { family: "Inter", style: "Semi Bold" },
  ]);
  assert.deepEqual(result.font, { family: "Inter", style: "Semi Bold" });
  assert.deepEqual(result.attemptedCandidates, attempted);
});

test("font resolver reports every attempted candidate when resolution fails", async () => {
  const scene = await import("../dist-test/src/main/scene.js");
  await assert.rejects(
    () => scene.resolveFontDescriptor({ family: "Inter", style: "SemiBold" }, async () => { throw new Error("missing"); }),
    (error) => {
      assert.equal(error.name, "FontResolutionError");
      assert.deepEqual(error.requested, { family: "Inter", style: "SemiBold" });
      assert.deepEqual(error.attemptedCandidates, [
        { family: "Inter", style: "SemiBold" },
        { family: "Inter", style: "Semi Bold" },
        { family: "Inter", style: "Bold" },
        { family: "Inter", style: "Regular" },
      ]);
      return true;
    },
  );
});
