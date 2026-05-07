import assert from "node:assert/strict";

import { handleWriteRequest } from "../dist-test/src/main/write.js";

/** Creates a minimal mock Figma node with the mutable fields used by write tests. */
function createBaseNode(id, type, name) {
  const pluginData = new Map();
  return {
    id,
    type,
    name,
    parent: null,
    visible: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 1,
    blendMode: "PASS_THROUGH",
    constraints: { horizontal: "MIN", vertical: "MIN" },
    rotation: 0,
    fills: [],
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "INSIDE",
    dashPattern: [],
    effects: [],
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomRightRadius: 0,
    bottomLeftRadius: 0,
    cornerSmoothing: 0,
    setSharedPluginData(namespace, key, value) {
      pluginData.set(`${namespace}:${key}`, value);
    },
    getSharedPluginData(namespace, key) {
      return pluginData.get(`${namespace}:${key}`) ?? "";
    },
    remove() {
      if (!this.parent || !("children" in this.parent)) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child.id !== this.id);
      this.parent = null;
    },
    resize(width, height) {
      this.width = width;
      this.height = height;
    },
  };
}

/** Builds a mock `figma` runtime that is sufficient for write-tool tests. */
function createMockFigma() {
  let nextId = 1;
  const registry = new Map();
  const createNodeId = () => `1:${nextId++}`;

  const documentNode = {
    id: "document",
    type: "DOCUMENT",
    parent: null,
    children: [],
  };

  const page = Object.assign(createBaseNode("1:0", "PAGE", "Page 1"), {
    type: "PAGE",
    children: [],
    appendChild(child) {
      if (child.parent && "children" in child.parent) {
        child.parent.children = child.parent.children.filter((node) => node.id !== child.id);
      }
      child.parent = this;
      this.children.push(child);
      registry.set(child.id, child);
    },
  });
  page.parent = documentNode;
  documentNode.children.push(page);
  registry.set(page.id, page);

  /** Tracks nodes created during a test so async lookup behaves like the Figma runtime. */
  const attach = (node) => {
    registry.set(node.id, node);
    return node;
  };

  /** Creates a mock rectangle node. */
  const createRectangle = () =>
    attach(createBaseNode(createNodeId(), "RECTANGLE", "Rectangle"));

  /** Creates a mock frame node with child-container behavior. */
  const createFrame = () =>
    attach(
      Object.assign(createBaseNode(createNodeId(), "FRAME", "Frame"), {
        type: "FRAME",
        children: [],
        layoutMode: "NONE",
        layoutWrap: "NO_WRAP",
        itemSpacing: 0,
        primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN",
        primaryAxisSizingMode: "AUTO",
        counterAxisSizingMode: "AUTO",
        counterAxisSpacing: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        clipsContent: false,
        appendChild(child) {
          if (child.parent && "children" in child.parent) {
            child.parent.children = child.parent.children.filter((node) => node.id !== child.id);
          }
          child.parent = this;
          this.children.push(child);
          registry.set(child.id, child);
        },
      })
    );

  /** Creates a mock component node with child-container and instance behavior. */
  const createComponent = () => {
    const component = attach(
      Object.assign(createBaseNode(createNodeId(), "COMPONENT", "Component"), {
        type: "COMPONENT",
        children: [],
        layoutMode: "NONE",
        layoutWrap: "NO_WRAP",
        itemSpacing: 0,
        primaryAxisAlignItems: "MIN",
        counterAxisAlignItems: "MIN",
        primaryAxisSizingMode: "AUTO",
        counterAxisSizingMode: "AUTO",
        counterAxisSpacing: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        clipsContent: false,
        appendChild(child) {
          if (child.parent && "children" in child.parent) {
            child.parent.children = child.parent.children.filter((node) => node.id !== child.id);
          }
          child.parent = this;
          this.children.push(child);
          registry.set(child.id, child);
        },
        createInstance() {
          return attach(
            Object.assign(createBaseNode(createNodeId(), "INSTANCE", `${this.name} Instance`), {
              type: "INSTANCE",
              mainComponent: this,
            })
          );
        },
      })
    );
    return component;
  };

  /** Creates a mock text node with the font APIs used by the write engine. */
  const createText = () =>
    attach(
      Object.assign(createBaseNode(createNodeId(), "TEXT", "Text"), {
        type: "TEXT",
        characters: "",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
        fontWeight: 400,
        textDecoration: "NONE",
        textAlignHorizontal: "LEFT",
        textAlignVertical: "TOP",
        textAutoResize: "NONE",
        lineHeight: { unit: "AUTO" },
        letterSpacing: { unit: "PIXELS", value: 0 },
        getRangeAllFontNames() {
          return [{ family: "Inter", style: "Regular" }];
        },
      })
    );

  return {
    currentPage: page,
    createFrame,
    createComponent,
    createRectangle,
    createText,
    async getNodeByIdAsync(nodeId) {
      return registry.get(nodeId) ?? null;
    },
    async loadFontAsync() {},
  };
}

/** Asserts a write request rejects with the expected structured mutation error. */
async function assertMutationError(promise, code, messagePattern) {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.mutationError?.code, code);
      if (messagePattern) {
        assert.match(error.mutationError?.message ?? "", messagePattern);
      }
      return true;
    }
  );
}


/** Verifies create_component creates a first-class Figma Component with shared create fields. */
async function testCreateComponentCreatesNamedComponent() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("create_component", undefined, {
    name: "Button / Primary",
    x: 24,
    y: 32,
    width: 160,
    height: 48,
    fills: [{ type: "SOLID", color: "#3366FF" }],
    strokes: [{ type: "SOLID", color: "#003399" }],
    cornerRadius: 12,
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    padding: { top: 10, right: 16, bottom: 10, left: 16 },
  });

  assert.equal(result.type, "COMPONENT");
  assert.equal(result.name, "Button / Primary");
  assert.equal(result.parentId, globalThis.figma.currentPage.id);

  const component = await globalThis.figma.getNodeByIdAsync(result.nodeId);
  assert.equal(component.type, "COMPONENT");
  assert.equal(component.x, 24);
  assert.equal(component.y, 32);
  assert.equal(component.width, 160);
  assert.equal(component.height, 48);
  assert.equal(component.cornerRadius, 12);
  assert.equal(component.layoutMode, "HORIZONTAL");
  assert.equal(component.itemSpacing, 8);
  assert.equal(component.paddingLeft, 16);
}

/** Verifies create_instance instantiates a local component and applies placement fields. */
async function testCreateInstanceFromLocalComponent() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, {
    name: "Button / Primary",
  });
  const result = await handleWriteRequest("create_instance", undefined, {
    componentId: component.nodeId,
    name: "CTA Button",
    x: 200,
    y: 80,
  });

  assert.equal(result.type, "INSTANCE");
  assert.equal(result.name, "CTA Button");
  assert.equal(result.parentId, globalThis.figma.currentPage.id);

  const instance = await globalThis.figma.getNodeByIdAsync(result.nodeId);
  assert.equal(instance.type, "INSTANCE");
  assert.equal(instance.mainComponent.id, component.nodeId);
  assert.equal(instance.x, 200);
  assert.equal(instance.y, 80);
}

/** Verifies create_instance reports a clear NOT_FOUND error for missing components. */
async function testCreateInstanceMissingComponentReportsNotFound() {
  globalThis.figma = createMockFigma();

  await assertMutationError(
    handleWriteRequest("create_instance", undefined, { componentId: "1:404" }),
    "NOT_FOUND",
    /componentId was not found/
  );
}

/** Verifies create_instance rejects non-component source nodes with a clear structured error. */
async function testCreateInstanceRejectsNonComponentSource() {
  globalThis.figma = createMockFigma();

  const frame = await handleWriteRequest("create_frame", undefined, { name: "Not a Component" });

  await assertMutationError(
    handleWriteRequest("create_instance", undefined, { componentId: frame.nodeId }),
    "INVALID_COMPONENT",
    /componentId must reference a COMPONENT node/
  );
}

/** Verifies batch_mutation can create a component and instantiate it via tmp: refs. */
async function testBatchCreateComponentAndInstanceSupportsTmpRef() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_component",
        ref: "tmp:button",
        params: { name: "Button / Primary" },
      },
      {
        type: "create_instance",
        ref: "tmp:button-instance",
        params: { componentId: "tmp:button", name: "Button Instance" },
      },
    ],
  });

  assert.equal(result.executedCount, 2);
  assert.equal(result.results[0].type, "COMPONENT");
  assert.equal(result.results[1].type, "INSTANCE");
  assert.ok(result.createdRefs["tmp:button"]);
  assert.ok(result.createdRefs["tmp:button-instance"]);
}

/** Verifies set_node_name renames an existing node and returns the updated snapshot. */
async function testSetNodeNameRenamesExistingNode() {
  globalThis.figma = createMockFigma();

  const frame = await handleWriteRequest("create_frame", undefined, {
    name: "Frame 6960",
  });
  const result = await handleWriteRequest("set_node_name", [frame.nodeId], {
    name: "ServiceHighlight / Shipping",
  });

  assert.equal(result.nodeId, frame.nodeId);
  assert.equal(result.name, "ServiceHighlight / Shipping");
  assert.equal(result.node.name, "ServiceHighlight / Shipping");

  const renamed = await globalThis.figma.getNodeByIdAsync(frame.nodeId);
  assert.equal(renamed.name, "ServiceHighlight / Shipping");
}

/** Verifies the rename_node alias shares the same behavior as set_node_name. */
async function testRenameNodeAliasRenamesExistingNode() {
  globalThis.figma = createMockFigma();

  const text = await handleWriteRequest("create_text", undefined, {
    name: "Frame 6957",
    characters: "Fast shipping",
  });
  const result = await handleWriteRequest("rename_node", [text.nodeId], {
    name: "Content / Shipping",
  });

  assert.equal(result.nodeId, text.nodeId);
  assert.equal(result.name, "Content / Shipping");
}

/** Verifies whitespace-only node names are rejected before mutation. */
async function testSetNodeNameRejectsWhitespaceOnlyName() {
  globalThis.figma = createMockFigma();

  const frame = await handleWriteRequest("create_frame", undefined, {
    name: "Original Name",
  });

  await assertMutationError(
    handleWriteRequest("set_node_name", [frame.nodeId], { name: "   \t" }),
    "INVALID_INPUT",
    /name must not be empty or whitespace only/
  );

  const unchanged = await globalThis.figma.getNodeByIdAsync(frame.nodeId);
  assert.equal(unchanged.name, "Original Name");
}

/** Verifies missing node IDs report a clear NOT_FOUND error for rename requests. */
async function testSetNodeNameMissingNodeReportsNotFound() {
  globalThis.figma = createMockFigma();

  await assertMutationError(
    handleWriteRequest("set_node_name", ["1:404"], { name: "Missing" }),
    "NOT_FOUND",
    /nodeId was not found/
  );
}

/** Verifies batch_mutation supports renaming nodes via tmp: references. */
async function testBatchSetNodeNameSupportsTmpRef() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_frame",
        ref: "tmp:shipping",
        params: { name: "Frame 6960" },
      },
      {
        type: "set_node_name",
        nodeId: "tmp:shipping",
        params: { name: "ServiceHighlight / Shipping" },
      },
    ],
  });

  assert.equal(result.executedCount, 2);
  assert.equal(result.results[1].name, "ServiceHighlight / Shipping");

  const renamed = await globalThis.figma.getNodeByIdAsync(result.createdRefs["tmp:shipping"]);
  assert.equal(renamed.name, "ServiceHighlight / Shipping");
}

/** Verifies ordered batch execution and reference creation across many steps. */
async function testLargeOrderedBatch() {
  globalThis.figma = createMockFigma();

  const operations = [
    {
      type: "create_frame",
      ref: "tmp:root",
      params: {
        name: "Batch Root",
        width: 1200,
        height: 800,
        layoutMode: "VERTICAL",
        itemSpacing: 8,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      },
    },
    ...Array.from({ length: 35 }, (_, index) => ({
      type: "create_rectangle",
      ref: `tmp:rect-${index}`,
      params: {
        parentId: "tmp:root",
        name: `Rect ${index}`,
        width: 100 + index,
        height: 40,
      },
    })),
    ...Array.from({ length: 35 }, (_, index) => ({
      type: "set_corner_radius",
      nodeId: `tmp:rect-${index}`,
      params: {
        cornerRadius: (index % 6) + 2,
      },
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      type: "create_text",
      ref: `tmp:text-${index}`,
      params: {
        parentId: "tmp:root",
        name: `Label ${index}`,
        characters: `Item ${index}`,
      },
    })),
  ];

  const result = await handleWriteRequest("batch_mutation", undefined, { operations });

  assert.equal(result.executedCount, operations.length);
  assert.equal(result.results.length, operations.length);
  assert.ok(result.createdRefs["tmp:root"]);
  assert.ok(result.createdRefs["tmp:rect-34"]);
  assert.ok(result.createdRefs["tmp:text-19"]);

  const rootId = result.createdRefs["tmp:root"];
  const root = await globalThis.figma.getNodeByIdAsync(rootId);
  assert.ok(root);
  assert.equal(root.type, "FRAME");
  assert.equal(root.children.length, 55);

  const lastRect = await globalThis.figma.getNodeByIdAsync(result.createdRefs["tmp:rect-34"]);
  assert.equal(lastRect.cornerRadius, 6);
}

/** Verifies batch execution stops cleanly and reports partial progress on failure. */
async function testPartialFailure() {
  globalThis.figma = createMockFigma();

  const operations = [
    {
      type: "create_frame",
      ref: "tmp:root",
      params: { name: "Root" },
    },
    ...Array.from({ length: 80 }, (_, index) => ({
      type: "create_rectangle",
      ref: `tmp:item-${index}`,
      params: {
        parentId: "tmp:root",
        name: `Item ${index}`,
      },
    })),
    {
      type: "set_corner_radius",
      nodeId: "tmp:missing",
      params: { cornerRadius: 10 },
    },
    {
      type: "create_text",
      ref: "tmp:after-failure",
      params: {
        parentId: "tmp:root",
        characters: "must not run",
      },
    },
  ];

  const result = await handleWriteRequest("batch_mutation", undefined, { operations });

  assert.equal(result.executedCount, 81);
  assert.equal(result.failedStepIndex, 81);
  assert.equal(result.failure.code, "UNKNOWN_REFERENCE");
  assert.equal(result.results.length, 81);
  assert.ok(result.createdRefs["tmp:root"]);
  assert.ok(result.createdRefs["tmp:item-79"]);
  assert.equal(result.createdRefs["tmp:after-failure"], undefined);

  const root = await globalThis.figma.getNodeByIdAsync(result.createdRefs["tmp:root"]);
  assert.ok(root);
  assert.equal(root.children.length, 80);
}

/** Verifies batch validation rejects invalid resolved params before executeWrite runs. */
async function testBatchValidationFailure() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_frame",
        ref: "tmp:root",
        params: { name: "Root", width: 100, height: 100 },
      },
      {
        type: "set_size",
        nodeId: "tmp:root",
        params: { width: -10, height: 50 },
      },
    ],
  });

  assert.equal(result.executedCount, 1);
  assert.equal(result.failedStepIndex, 1);
  assert.equal(result.failure.code, "INVALID_INPUT");
  assert.match(result.failure.message, /width must be greater than 0/);
  assert.equal(result.results.length, 1);

  const root = await globalThis.figma.getNodeByIdAsync(result.createdRefs["tmp:root"]);
  assert.ok(root);
  assert.equal(root.width, 100);
  assert.equal(root.height, 100);
}

/** Verifies find_nodes accepts JSON query filters from the MCP tool contract. */
async function testFindNodesJsonQuery() {
  globalThis.figma = createMockFigma();

  const root = await handleWriteRequest("create_frame", undefined, {
    name: "Cards",
    key: "cards-root",
  });
  await handleWriteRequest("create_rectangle", undefined, {
    parentId: root.nodeId,
    name: "Hero Card",
    key: "hero-card",
  });
  await handleWriteRequest("create_text", undefined, {
    parentId: root.nodeId,
    name: "Hero Title",
    characters: "Title",
  });

  const result = await handleWriteRequest("find_nodes", undefined, {
    query: JSON.stringify({ parentId: root.nodeId, key: "hero-card" }),
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].name, "Hero Card");
  assert.equal(result.matches[0].parentId, root.nodeId);
  assert.equal(result.matches[0].key, "hero-card");
}

/** Verifies non-JSON query strings fall back to name substring matching. */
async function testFindNodesQuerySubstringFallback() {
  globalThis.figma = createMockFigma();

  await handleWriteRequest("create_frame", undefined, { name: "Card Shell" });
  await handleWriteRequest("create_text", undefined, {
    name: "Card Title",
    characters: "Title",
  });
  await handleWriteRequest("create_rectangle", undefined, { name: "Badge" });

  const result = await handleWriteRequest("find_nodes", undefined, {
    query: "Card",
  });

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((node) => node.name).sort(),
    ["Card Shell", "Card Title"]
  );
}

/** Verifies failed create steps in a batch do not leave behind unreported root-level nodes. */
async function testBatchCreateFailureDoesNotLeakNodes() {
  globalThis.figma = createMockFigma();

  const parent = await handleWriteRequest("create_frame", undefined, {
    name: "Modal Root",
  });

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_frame",
        ref: "tmp:overlay",
        params: {
          parentId: parent.nodeId,
          name: "Overlay",
          width: 800,
          height: 600,
        },
      },
      {
        type: "create_frame",
        ref: "tmp:modal",
        params: {
          parentId: parent.nodeId,
          name: "Modal",
          strokes: [{ type: "IMAGE", color: "#D9DEE8" }],
        },
      },
    ],
  });

  assert.equal(result.executedCount, 1);
  assert.equal(result.failedStepIndex, 1);
  assert.equal(result.failure.code, "UNSUPPORTED_PAINT");
  assert.equal(result.results.length, 1);
  assert.ok(result.createdRefs["tmp:overlay"]);
  assert.equal(result.createdRefs["tmp:modal"], undefined);

  const root = await globalThis.figma.getNodeByIdAsync(parent.nodeId);
  assert.ok(root);
  assert.deepEqual(
    root.children.map((node) => node.name),
    ["Overlay"]
  );

  const pageChildren = globalThis.figma.currentPage.children.map((node) => node.name);
  assert.deepEqual(pageChildren, ["Modal Root"]);
}

/** Verifies mutation tools can target prior batch results through tmp: refs in nodeId. */
async function testBatchSetStrokesSupportsTmpRef() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_frame",
        ref: "tmp:modal",
        params: {
          name: "Modal",
          width: 320,
          height: 180,
        },
      },
      {
        type: "set_strokes",
        nodeId: "tmp:modal",
        params: {
          strokes: [{ type: "SOLID", color: "#D9DEE8" }],
        },
      },
    ],
  });

  assert.equal(result.executedCount, 2);
  assert.equal(result.results.length, 2);
  assert.ok(result.createdRefs["tmp:modal"]);

  const modal = await globalThis.figma.getNodeByIdAsync(result.createdRefs["tmp:modal"]);
  assert.ok(modal);
  assert.equal(modal.strokes.length, 1);
  assert.equal(modal.strokes[0].type, "SOLID");
}

/** Runs the write-tool test cases and reports a simple pass/fail summary. */
async function runTests() {
  const tests = [
    ["testSetNodeNameRenamesExistingNode", testSetNodeNameRenamesExistingNode],
    ["testRenameNodeAliasRenamesExistingNode", testRenameNodeAliasRenamesExistingNode],
    ["testSetNodeNameRejectsWhitespaceOnlyName", testSetNodeNameRejectsWhitespaceOnlyName],
    ["testSetNodeNameMissingNodeReportsNotFound", testSetNodeNameMissingNodeReportsNotFound],
    ["testCreateComponentCreatesNamedComponent", testCreateComponentCreatesNamedComponent],
    ["testCreateInstanceFromLocalComponent", testCreateInstanceFromLocalComponent],
    ["testCreateInstanceMissingComponentReportsNotFound", testCreateInstanceMissingComponentReportsNotFound],
    ["testCreateInstanceRejectsNonComponentSource", testCreateInstanceRejectsNonComponentSource],
    ["testBatchCreateComponentAndInstanceSupportsTmpRef", testBatchCreateComponentAndInstanceSupportsTmpRef],
    ["testBatchSetNodeNameSupportsTmpRef", testBatchSetNodeNameSupportsTmpRef],
    ["testLargeOrderedBatch", testLargeOrderedBatch],
    ["testPartialFailure", testPartialFailure],
    ["testBatchValidationFailure", testBatchValidationFailure],
    ["testFindNodesJsonQuery", testFindNodesJsonQuery],
    ["testFindNodesQuerySubstringFallback", testFindNodesQuerySubstringFallback],
    ["testBatchCreateFailureDoesNotLeakNodes", testBatchCreateFailureDoesNotLeakNodes],
    ["testBatchSetStrokesSupportsTmpRef", testBatchSetStrokesSupportsTmpRef],
  ];
  const failures = [];
  let passed = 0;

  for (const [name, test] of tests) {
    try {
      await test();
      passed += 1;
    } catch (error) {
      failures.push({
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(
    `write.test.mjs: ${passed} passed, ${failures.length} failed`
  );
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
