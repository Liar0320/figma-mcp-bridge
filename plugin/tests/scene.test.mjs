import assert from "node:assert/strict";
import test from "node:test";

import { createScene } from "../dist-test/src/main/scene.js";

function mockSceneFigma() {
  let nextId = 1;
  const registry = new Map();
  const document = { id: "0:0", type: "DOCUMENT", parent: null, children: [], appendChild(node) { node.parent = this; this.children.push(node); } };
  const container = (id, type, name) => ({
    id, type, name, parent: null, children: [], layoutMode: "NONE",
    appendChild(node) {
      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = this;
      this.children.push(node);
    },
  });
  const page = container("0:1", "PAGE", "Page");
  document.appendChild(page);
  const node = (type) => {
    const created = {
      id: `1:${nextId++}`, type, name: type, parent: null, x: 0, y: 0, width: 100, height: 100,
      resize(width, height) { this.width = width; this.height = height; },
      remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
      setSharedPluginData() {}, getSharedPluginData() { return ""; },
      ...(type === "FRAME" ? { children: [], layoutMode: "NONE", appendChild: container("", type, "").appendChild } : {}),
    };
    registry.set(created.id, created);
    return created;
  };
  registry.set(page.id, page);
  registry.set(document.id, document);
  return {
    currentPage: page, document,
    createFrame: () => node("FRAME"),
    createRectangle: () => node("RECTANGLE"),
    async getNodeByIdAsync(id) { return registry.get(id) ?? null; },
    async loadFontAsync() {},
    createTestPage() { const other = container(`2:${nextId++}`, "PAGE", "Other"); document.appendChild(other); registry.set(other.id, other); return other; },
  };
}

const frame = (mode, child = { ref: "child", type: "RECTANGLE", props: { width: 24, height: 24, layoutPositioning: "ABSOLUTE" } }) => ({
  ref: "parent", type: "FRAME", props: { name: "Parent", width: 200, height: 120, ...(mode === undefined ? {} : { layoutMode: mode }) }, children: [child],
});

test("preflight rejects ABSOLUTE under NONE before mutation with actionable dependency", async () => {
  globalThis.figma = mockSceneFigma();
  for (const mode of ["NONE", undefined]) {
    const nodes = [frame(mode)];
    for (const dryRun of [true, false]) {
      await assert.rejects(() => createScene({ nodes, dryRun }), (error) => {
        assert.equal(error.mutationError?.code, "INVALID_LAYOUT_DEPENDENCY");
        assert.deepEqual(error.mutationError.details, {
          childRef: "child", parentRef: "parent", path: ["parent", "child"],
          parentProps: { layoutMode: "NONE" }, childProps: { layoutPositioning: "ABSOLUTE" },
        });
        return true;
      });
      assert.equal(globalThis.figma.currentPage.children.length, 0);
    }
  }
});

test("top-level ABSOLUTE requires an auto-layout parent on PAGE and existing containers", async () => {
  globalThis.figma = mockSceneFigma();
  const page = globalThis.figma.currentPage;
  const host = await createScene({ nodes: [{ ref: "host", type: "FRAME", props: { name: "Host" } }], dryRun: false });
  const absolute = [{ ref: "overlay", type: "RECTANGLE", props: { name: "Overlay", width: 24, height: 24, layoutPositioning: "ABSOLUTE" } }];
  for (const parentId of [undefined, page.id, host.refs.host]) {
    const ref = parentId ?? page.id;
    const count = page.children.length;
    const hostChildren = (await globalThis.figma.getNodeByIdAsync(host.refs.host)).children.length;
    for (const dryRun of [true, false]) {
      await assert.rejects(() => createScene({ parentId, nodes: absolute, dryRun }), (error) => {
        assert.equal(error.mutationError?.code, "INVALID_LAYOUT_DEPENDENCY");
        assert.deepEqual(error.mutationError.details, {
          childRef: "overlay", parentRef: ref, path: [ref, "overlay"],
          parentProps: { layoutMode: "NONE" }, childProps: { layoutPositioning: "ABSOLUTE" },
        });
        return true;
      });
      assert.equal(page.children.length, count);
      assert.equal((await globalThis.figma.getNodeByIdAsync(host.refs.host)).children.length, hostChildren);
    }
  }
  for (const mode of ["HORIZONTAL", "VERTICAL"]) {
    const target = await createScene({ nodes: [{ ref: "host", type: "FRAME", props: { layoutMode: mode } }], dryRun: false });
    const dry = await createScene({ parentId: target.refs.host, nodes: absolute, dryRun: true });
    assert.equal(dry.nodeCount, 1);
    const live = await createScene({ parentId: target.refs.host, nodes: absolute, dryRun: false });
    const child = await globalThis.figma.getNodeByIdAsync(live.refs.overlay);
    assert.equal(child.parent.id, target.refs.host);
    assert.equal(child.layoutPositioning, "ABSOLUTE");
  }
});

test("valid layout combinations preflight and render with native parent/child state", async () => {
  for (const mode of ["HORIZONTAL", "VERTICAL"]) {
    globalThis.figma = mockSceneFigma();
    const nodes = [frame(mode)];
    const before = await createScene({ nodes, dryRun: true });
    assert.equal(before.nodeCount, 2);
    assert.equal(globalThis.figma.currentPage.children.length, 0);
    const result = await createScene({ nodes, dryRun: false });
    const parent = await globalThis.figma.getNodeByIdAsync(result.refs.parent);
    const child = await globalThis.figma.getNodeByIdAsync(result.refs.child);
    assert.equal(parent.layoutMode, mode);
    assert.equal(child.layoutPositioning, "ABSOLUTE");
    assert.equal(child.parent, parent);
    assert.deepEqual(globalThis.figma.currentPage.children, [parent]);
  }
  globalThis.figma = mockSceneFigma();
  const ordinary = [frame("NONE", { ref: "child", type: "RECTANGLE", props: { width: 24, height: 24 } })];
  const result = await createScene({ nodes: ordinary, dryRun: false });
  assert.equal((await globalThis.figma.getNodeByIdAsync(result.refs.child)).parent.id, result.refs.parent);
});

test("FILL on either axis works under either auto-layout direction", async () => {
  for (const mode of ["HORIZONTAL", "VERTICAL"]) {
    for (const axis of ["Horizontal", "Vertical"]) {
      globalThis.figma = mockSceneFigma();
      const child = { ref: "child", type: "FRAME", props: { [`layoutSizing${axis}`]: "FILL" } };
      const nodes = [frame(mode, child)];
      const preview = await createScene({ nodes, dryRun: true });
      assert.equal(preview.nodeCount, 2);
      assert.equal(globalThis.figma.currentPage.children.length, 0);
      const result = await createScene({ nodes, dryRun: false });
      const parent = await globalThis.figma.getNodeByIdAsync(result.refs.parent);
      const created = await globalThis.figma.getNodeByIdAsync(result.refs.child);
      assert.equal(parent.layoutMode, mode);
      assert.equal(created.parent, parent);
      assert.equal(created[`layoutSizing${axis}`], "FILL");
    }
  }
});

test("FILL still requires auto-layout and rejects parent HUG on the same axis", async () => {
  for (const axis of ["Horizontal", "Vertical"]) {
    for (const [mode, sizing, message] of [
      ["NONE", undefined, /requires auto-layout parent/],
      ["HORIZONTAL", "HUG", /conflicts with parent HUG/],
      ["VERTICAL", "HUG", /conflicts with parent HUG/],
    ]) {
      globalThis.figma = mockSceneFigma();
      const child = { ref: "child", type: "FRAME", props: { [`layoutSizing${axis}`]: "FILL" } };
      const nodes = [{ ...frame(mode, child), props: { ...frame(mode).props, [`layoutSizing${axis}`]: sizing } }];
      for (const dryRun of [true, false]) {
        await assert.rejects(() => createScene({ nodes, dryRun }), (error) => {
          assert.equal(error.mutationError?.code, "INVALID_INPUT");
          assert.match(error.message, message);
          return true;
        });
        assert.equal(globalThis.figma.currentPage.children.length, 0);
      }
    }
  }
});

test("scene parent resolution accepts current PAGE and frame, rejects invalid or out-of-scope targets", async () => {
  globalThis.figma = mockSceneFigma();
  const page = globalThis.figma.currentPage;
  const nodes = [{ ref: "root", type: "FRAME", props: { name: "Scene" } }];
  for (const parentId of [undefined, page.id]) {
    assert.equal((await createScene({ parentId, nodes, dryRun: true })).nodeCount, 1);
    const result = await createScene({ parentId, nodes, dryRun: false });
    assert.equal((await globalThis.figma.getNodeByIdAsync(result.refs.root)).parent, page);
  }
  const parent = await createScene({ nodes: [{ ref: "host", type: "FRAME" }], dryRun: false });
  const nested = await createScene({ parentId: parent.refs.host, nodes, dryRun: false });
  assert.equal((await globalThis.figma.getNodeByIdAsync(nested.refs.root)).parent.id, parent.refs.host);
  const rectangle = globalThis.figma.createRectangle();
  page.appendChild(rectangle);
  const otherPage = globalThis.figma.createTestPage();
  const foreignFrame = globalThis.figma.createFrame();
  otherPage.appendChild(foreignFrame);
  const count = page.children.length;
  for (const [parentId, code] of [
    ["9:999", "NOT_FOUND"], [globalThis.figma.document.id, "INVALID_PARENT"],
    [rectangle.id, "INVALID_PARENT"], [otherPage.id, "OUT_OF_SCOPE"], [foreignFrame.id, "OUT_OF_SCOPE"],
  ]) {
    for (const dryRun of [true, false]) {
      await assert.rejects(() => createScene({ parentId, nodes, dryRun }), (error) => {
        assert.equal(error.mutationError?.code, code);
        return true;
      });
      assert.equal(page.children.length, count);
    }
  }
});

// These behavior tests document the public contract without fabricating Figma node echoes.
test("scene contract rejects invalid refs and nested children on non-frames", async () => {
  globalThis.figma = mockSceneFigma();
  await assert.rejects(() => createScene({ nodes: [{ ref: "1bad", type: "TEXT" }] }), /ref/);
  await assert.rejects(() => createScene({ nodes: [{ ref: "text", type: "TEXT", children: [{ ref: "child", type: "TEXT" }] }] }), /cannot have children/);
});

test("dry run is side effect free and reports planned refs", async () => {
  globalThis.figma = mockSceneFigma();
  const result = await createScene({ dryRun: true, nodes: [{ ref: "root", type: "FRAME", children: [{ ref: "label", type: "TEXT", props: { characters: "Hello" } }] }] });
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


test("create_scene auto-position reports plan without mutating and applies it on creation", async () => {
  globalThis.figma = mockSceneFigma();
  const existing = globalThis.figma.createFrame();
  existing.x = 20;
  existing.y = 40;
  existing.width = 300;
  existing.height = 500;
  globalThis.figma.currentPage.appendChild(existing);
  const nodes = [{ ref: "root", type: "FRAME", props: { width: 240, height: 320 } }];
  const dry = await createScene({ position: "auto", nodes, dryRun: true });
  assert.deepEqual(dry.plannedPosition, { x: 400, y: 40, strategy: "right_of_max_bounds" });
  assert.equal(globalThis.figma.currentPage.children.length, 1);
  const live = await createScene({ position: "auto", nodes, dryRun: false });
  const created = await globalThis.figma.getNodeByIdAsync(live.refs.root);
  assert.equal(created.x, 400);
  assert.equal(created.y, 40);
});

test("create_scene auto-position rejects explicit coordinates and non-frame roots", async () => {
  globalThis.figma = mockSceneFigma();
  await assert.rejects(
    () => createScene({ position: "auto", nodes: [{ ref: "root", type: "FRAME", props: { x: 12 } }] }),
    /cannot be combined/
  );
  await assert.rejects(
    () => createScene({ position: "auto", nodes: [{ ref: "root", type: "RECTANGLE" }] }),
    /exactly one root FRAME/
  );
});
