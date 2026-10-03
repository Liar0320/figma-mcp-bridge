import assert from "node:assert/strict";
import { measureText } from "../dist-test/src/main/textMeasurement.js";

async function rejects(params, text) {
  await assert.rejects(() => measureText(params), new RegExp(text));
}

await rejects(undefined, "items must contain");
await rejects({ items: [] }, "items must contain");
await rejects({ items: [{ characters: "x", width: 0 }] }, "width must be greater");
await rejects({ items: [{ characters: "x", style: { textAutoResize: "HEIGHT" } }] }, "not supported");
await rejects({ items: [{ characters: "x", width: "20" }] }, "width must be greater");
await rejects({ items: [{ characters: "x", unexpected: true }] }, "not supported");
await rejects({ items: [{ characters: "x" }], unexpected: true }, "Unsupported measurement field");

// These fakes prove temporary-node ownership and cleanup, not typography metrics.
function runtime({ missingFont = false, failCreateAt = 0, failCleanup = false } = {}) {
  let attempts = 0;
  const registry = new Map();
  const selected = { id: "1:99", type: "FRAME" };
  const page = {
    id: "1:1", type: "PAGE", parent: null, children: [], selection: [selected],
    appendChild(node) {
      if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
      node.parent = this;
      this.children.push(node);
    },
  };
  const api = {
    currentPage: page,
    mixed: Symbol("mixed"),
    async loadFontAsync(font) {
      if (missingFont && font.family === "Unavailable") throw new Error("font unavailable");
    },
    async getNodeByIdAsync(id) { return registry.get(id) ?? null; },
    createText() {
      attempts += 1;
      if (attempts === failCreateAt) throw new Error("native creation failed");
      const node = {
        id: `2:${attempts}`, type: "TEXT", name: "Text", parent: null,
        width: 10, height: 16, characters: "", fontName: { family: "Inter", style: "Regular" },
        textAutoResize: "WIDTH_AND_HEIGHT", fontSize: 12,
        setSharedPluginData() {},
        resize(width, height) { this.width = width; this.height = height; },
        remove() {
          if (failCleanup) throw new Error("native cleanup failed");
          if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
          this.parent = null;
          registry.delete(this.id);
        },
      };
      registry.set(node.id, node);
      page.appendChild(node);
      return node;
    },
  };
  globalThis.figma = api;
  return { page, selected, attempts: () => attempts };
}

{
  const mock = runtime({ missingFont: true });
  await assert.rejects(() => measureText({ items: [
    { characters: "Valid font" },
    { characters: "Missing font", style: { fontFamily: "Unavailable" } },
  ] }), (error) => error.mutationError.code === "FONT_LOAD_FAILED");
  assert.equal(mock.attempts(), 0, "font failure must happen before temporary-node creation");
  assert.deepEqual(mock.page.selection, [mock.selected]);
}

{
  const mock = runtime();
  await measureText({ items: [{ characters: "A" }, { characters: "B", width: 120 }] });
  assert.deepEqual(mock.page.children, [], "successful measurement leaves no scene nodes");
  assert.deepEqual(mock.page.selection, [mock.selected]);
}

{
  const mock = runtime({ failCreateAt: 2 });
  await assert.rejects(() => measureText({ items: [{ characters: "A" }, { characters: "B" }] }), /native creation failed/);
  assert.deepEqual(mock.page.children, [], "a later failure must not leak earlier temporary nodes");
  assert.deepEqual(mock.page.selection, [mock.selected]);
}

{
  const mock = runtime({ failCleanup: true });
  await assert.rejects(() => measureText({ items: [{ characters: "A" }] }), (error) => {
    assert.equal(error.mutationError.code, "CLEANUP_FAILED");
    assert.equal(error.mutationError.details.nodeId, "2:1");
    return true;
  });
  assert.equal(mock.page.children[0].id, "2:1", "failed cleanup is reported, not falsely claimed complete");
  assert.deepEqual(mock.page.selection, [mock.selected]);
}

console.log("textMeasurement boundary tests passed");
