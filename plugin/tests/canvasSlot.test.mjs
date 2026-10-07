import assert from "node:assert/strict";
import test from "node:test";

import { findCanvasSlot } from "../dist-test/src/main/canvasSlot.js";

function mockFigma(children = []) {
  const page = {
    id: "0:1",
    type: "PAGE",
    name: "Page 1",
    children,
  };

  return {
    currentPage: page,
    async getNodeByIdAsync(id) {
      if (id === page.id) return page;
      const find = (node) => {
        if (node.id === id) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = find(child);
            if (found) return found;
          }
        }
        return null;
      };
      for (const child of children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    },
  };
}

function createFrame(id, x, y, width, height, locked = false) {
  return {
    id,
    type: "FRAME",
    name: `Frame ${id}`,
    x,
    y,
    width,
    height,
    locked,
    parent: null,
  };
}

test("empty canvas returns origin", async () => {
  globalThis.figma = mockFigma([]);
  const result = await findCanvasSlot({ width: 375, height: 812 });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.strategy, "empty_canvas");
});

test("right packing places frame to the right of existing frames", async () => {
  const existing = createFrame("1:1", 0, 0, 375, 812);
  globalThis.figma = mockFigma([existing]);

  const result = await findCanvasSlot({ width: 375, height: 812, direction: "right" });
  assert.equal(result.x, 375 + 80); // width + default spacing
  assert.equal(result.y, 0); // aligned to top baseline
  assert.equal(result.strategy, "right_of_max_bounds");
});

test("custom spacing is respected", async () => {
  const existing = createFrame("1:1", 0, 0, 375, 812);
  globalThis.figma = mockFigma([existing]);

  const result = await findCanvasSlot({ width: 375, height: 812, spacing: 120 });
  assert.equal(result.x, 375 + 120);
  assert.equal(result.y, 0);
});

test("bottom packing places frame below existing frames", async () => {
  const existing = createFrame("1:1", 0, 0, 375, 812);
  globalThis.figma = mockFigma([existing]);

  const result = await findCanvasSlot({ width: 375, height: 812, direction: "bottom" });
  assert.equal(result.x, 0);
  assert.equal(result.y, 812 + 80); // height + default spacing
  assert.equal(result.strategy, "bottom_of_max_bounds");
});

test("wraps to new row when exceeding threshold", async () => {
  const existing = createFrame("1:1", 0, 0, 4950, 812);
  globalThis.figma = mockFigma([existing]);

  const result = await findCanvasSlot({ width: 375, direction: "right" });
  assert.equal(result.x, 0);
  assert.equal(result.y, 812 + 80);
  assert.equal(result.strategy, "wrapped_to_new_row");
});

test("locked frames are excluded from collision detection", async () => {
  const locked = createFrame("1:1", 0, 0, 375, 812, true);
  globalThis.figma = mockFigma([locked]);

  const result = await findCanvasSlot({ width: 375 });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.strategy, "empty_canvas");
});

test("large background plates are excluded", async () => {
  const background = createFrame("1:1", 0, 0, 10000, 10000);
  const foreground = createFrame("1:2", 100, 100, 375, 812);
  globalThis.figma = mockFigma([background, foreground]);

  const result = await findCanvasSlot({ width: 375, direction: "right" });
  assert.equal(result.x, 100 + 375 + 80);
  assert.equal(result.y, 100);
});

test("nearNodeId places adjacent to reference node", async () => {
  const reference = createFrame("1:1", 100, 200, 375, 812);
  globalThis.figma = mockFigma([reference]);
  reference.parent = globalThis.figma.currentPage;
  const result = await findCanvasSlot({ width: 375, nearNodeId: "1:1" });
  assert.equal(result.x, 100 + 375 + 80);
  assert.equal(result.y, 200);
  assert.equal(result.strategy, "adjacent_to_reference");
  assert.ok(result.referenceBounds);
});

test("nearNodeId falls back to a global shelf when adjacency would overlap another node", async () => {
  const reference = createFrame("1:1", 0, 0, 100, 100);
  const blocker = createFrame("1:2", 180, 0, 100, 100);
  globalThis.figma = mockFigma([reference, blocker]);
  reference.parent = globalThis.figma.currentPage;
  blocker.parent = globalThis.figma.currentPage;
  const result = await findCanvasSlot({ width: 100, height: 100, spacing: 80, nearNodeId: "1:1" });
  assert.equal(result.x, 360);
  assert.equal(result.y, 0);
  assert.equal(result.strategy, "right_of_max_bounds");
  assert.match(result.warning, /collided/);
});

test("nearNodeId rejects node not on current page", async () => {
  const otherPageNode = createFrame("1:1", 0, 0, 375, 812);
  otherPageNode.parent = { id: "0:2", type: "PAGE", name: "Other Page" };

  globalThis.figma = mockFigma([]);
  globalThis.figma.getNodeByIdAsync = async (id) => {
    if (id === "1:1") return otherPageNode;
    return null;
  };

  await assert.rejects(
    () => findCanvasSlot({ width: 375, nearNodeId: "1:1" }),
    (error) => {
      assert.equal(error.mutationError?.code, "OUT_OF_SCOPE");
      return true;
    }
  );
});

test("nearNodeId rejects not found node", async () => {
  globalThis.figma = mockFigma([]);

  await assert.rejects(
    () => findCanvasSlot({ width: 375, nearNodeId: "9:999" }),
    (error) => {
      assert.equal(error.mutationError?.code, "NOT_FOUND");
      return true;
    }
  );
});

test("multiple frames continue on the lowest active shelf", async () => {
  const frame1 = createFrame("1:1", 0, 100, 375, 812);
  const frame2 = createFrame("1:2", 500, 50, 375, 812);
  globalThis.figma = mockFigma([frame1, frame2]);

  const result = await findCanvasSlot({ width: 375, direction: "right" });
  assert.equal(result.x, 500 + 375 + 80);
  assert.equal(result.y, 100); // continue on the lowest shelf
});

test("continues horizontally after wrapping to a new shelf", async () => {
  const existing = createFrame("1:1", 0, 0, 4950, 812);
  const first = createFrame("1:2", 0, 892, 375, 812);
  globalThis.figma = mockFigma([existing, first]);

  const result = await findCanvasSlot({ width: 375, direction: "right" });
  assert.equal(result.x, 455);
  assert.equal(result.y, 892);
  assert.equal(result.strategy, "right_of_max_bounds");
});

test("calculates auto slots within a parent container", async () => {
  const parent = createFrame("1:1", 0, 0, 1200, 800);
  parent.children = [
    createFrame("1:2", 0, 0, 400, 500),
  ];
  parent.children[0].parent = parent;
  globalThis.figma = mockFigma([]);
  const result = await findCanvasSlot(
    { width: 400, height: 500, direction: "right" },
    parent,
  );
  assert.deepEqual(
    { x: result.x, y: result.y, strategy: result.strategy },
    { x: 480, y: 0, strategy: "right_of_max_bounds" },
  );
});

test("height defaults to width when omitted", async () => {
  globalThis.figma = mockFigma([]);
  const result = await findCanvasSlot({ width: 375 });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});

test("slices are ignored in collision detection", async () => {
  const slice = { id: "1:1", type: "SLICE", x: 0, y: 0, width: 375, height: 812 };
  globalThis.figma = mockFigma([slice]);

  const result = await findCanvasSlot({ width: 375 });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.strategy, "empty_canvas");
});
