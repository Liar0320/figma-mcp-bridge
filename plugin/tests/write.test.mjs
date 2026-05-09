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
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      registry.set(child.id, child);
    },
  };

  const createPageNode = (id, name) => {
    const pageNode = Object.assign(createBaseNode(id, "PAGE", name), {
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
    documentNode.appendChild(pageNode);
    return pageNode;
  };

  const page = createPageNode("1:0", "Page 1");
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

  /** Creates a mock child-container node with appendChild behavior. */
  const withChildren = (node) =>
    Object.assign(node, {
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
    });

  /** Adds component property definition APIs to component/component-set mocks. */
  const withComponentPropertyDefinitions = (node) => {
    const definitions = {};
    Object.defineProperty(node, "componentPropertyDefinitions", {
      enumerable: true,
      configurable: true,
      get() {
        if (this.type === "COMPONENT" && this.parent?.type === "COMPONENT_SET") {
          throw new Error(
            "in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component"
          );
        }
        return definitions;
      },
    });
    return Object.assign(node, {
      addComponentProperty(propertyName, type, defaultValue, options) {
        const returnedName = type === "VARIANT" ? propertyName : `${propertyName}#${createNodeId()}`;
        definitions[returnedName] = {
          type,
          defaultValue,
          ...(type === "VARIANT" ? { variantOptions: [String(defaultValue)] } : {}),
          ...(options?.preferredValues ? { preferredValues: options.preferredValues } : {}),
        };
        return returnedName;
      },
      editComponentProperty(propertyName, next) {
        const current = definitions[propertyName];
        if (!current) throw new Error(`Unknown component property: ${propertyName}`);
        let returnedName = propertyName;
        if (next.name && next.name !== propertyName) {
          returnedName = current.type === "VARIANT" ? next.name : `${next.name}#${createNodeId()}`;
          delete definitions[propertyName];
        }
        definitions[returnedName] = {
          ...current,
          ...(next.defaultValue !== undefined ? { defaultValue: next.defaultValue } : {}),
          ...(next.preferredValues !== undefined ? { preferredValues: next.preferredValues } : {}),
        };
        return returnedName;
      },
      deleteComponentProperty(propertyName) {
        if (!definitions[propertyName]) {
          throw new Error(`Unknown component property: ${propertyName}`);
        }
        delete definitions[propertyName];
      },
    });
  };

  const parseVariantName = (name) =>
    Object.fromEntries(
      name
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.split("=").map((value) => value.trim()))
        .filter(([property, value]) => property && value)
    );

  /** Creates a mock component node with child-container and instance behavior. */
  const createComponent = () => {
    const component = attach(
      withComponentPropertyDefinitions(
        Object.assign(withChildren(createBaseNode(createNodeId(), "COMPONENT", "Component")), {
          type: "COMPONENT",
          variantProperties: null,
          createInstance() {
            return attach(
              Object.assign(createBaseNode(createNodeId(), "INSTANCE", `${this.name} Instance`), {
                type: "INSTANCE",
                mainComponent: this,
                variantProperties: this.variantProperties,
                componentProperties: {},
                exposedInstances: [],
                isExposedInstance: false,
                setProperties(properties) {
                  for (const [propertyName, value] of Object.entries(properties)) {
                    this.componentProperties[propertyName] = {
                      type: typeof value === "boolean" ? "BOOLEAN" : "TEXT",
                      value,
                    };
                    if (this.variantProperties && propertyName in this.variantProperties) {
                      this.variantProperties = { ...this.variantProperties, [propertyName]: String(value) };
                      this.componentProperties[propertyName].type = "VARIANT";
                    }
                  }
                },
              })
            );
          },
        })
      )
    );
    return component;
  };

  /** Combines local components into a mock Figma component set. */
  const combineAsVariants = (components, parent) => {
    const componentSet = attach(
      withComponentPropertyDefinitions(
        Object.assign(withChildren(createBaseNode(createNodeId(), "COMPONENT_SET", "Component Set")), {
          type: "COMPONENT_SET",
          variantGroupProperties: {},
          exposedInstances: [],
        })
      )
    );
    parent.appendChild(componentSet);
    for (const component of components) {
      component.variantProperties = parseVariantName(component.name);
      for (const [property, value] of Object.entries(component.variantProperties)) {
        const group = componentSet.variantGroupProperties[property] ?? { values: [] };
        if (!group.values.includes(value)) group.values.push(value);
        componentSet.variantGroupProperties[property] = group;
        componentSet.componentPropertyDefinitions[property] = {
          type: "VARIANT",
          defaultValue: group.values[0],
          variantOptions: group.values,
        };
      }
      componentSet.appendChild(component);
    }
    return componentSet;
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
    root: documentNode,
    currentPage: page,
    createTestPage(name = `Page ${documentNode.children.length + 1}`) {
      return createPageNode(createNodeId(), name);
    },
    createFrame,
    createComponent,
    combineAsVariants,
    createRectangle,
    createText,
    async getNodeByIdAsync(nodeId) {
      return registry.get(nodeId) ?? null;
    },
    async loadAllPagesAsync() {},
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

/** Verifies combine_as_variants creates a native component set from local components. */
async function testCombineAsVariantsCreatesComponentSet() {
  globalThis.figma = createMockFigma();

  const defaultComponent = await handleWriteRequest("create_component", undefined, {
    name: "Button / State=Default",
  });
  const hoverComponent = await handleWriteRequest("create_component", undefined, {
    name: "Button / State=Hover",
  });
  const parent = await handleWriteRequest("create_frame", undefined, { name: "Library" });

  const result = await handleWriteRequest("combine_as_variants", undefined, {
    componentIds: [defaultComponent.nodeId, hoverComponent.nodeId],
    parentId: parent.nodeId,
    name: "Button",
    x: 120,
    y: 240,
  });

  assert.equal(result.type, "COMPONENT_SET");
  assert.equal(result.name, "Button");
  assert.equal(result.parentId, parent.nodeId);
  assert.deepEqual(result.sourceComponentIds, [defaultComponent.nodeId, hoverComponent.nodeId]);

  const componentSet = await globalThis.figma.getNodeByIdAsync(result.nodeId);
  assert.equal(componentSet.type, "COMPONENT_SET");
  assert.equal(componentSet.x, 120);
  assert.equal(componentSet.y, 240);
  assert.deepEqual(
    componentSet.children.map((node) => node.id),
    [defaultComponent.nodeId, hoverComponent.nodeId]
  );
}

/** Verifies combine_as_variants rejects fewer than two components before mutation. */
async function testCombineAsVariantsRequiresAtLeastTwoComponents() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, {
    name: "Button / State=Default",
  });

  await assertMutationError(
    handleWriteRequest("combine_as_variants", undefined, {
      componentIds: [component.nodeId],
    }),
    "INVALID_INPUT",
    /componentIds must include at least two component IDs/
  );
}

/** Verifies combine_as_variants reports NOT_FOUND for missing component IDs. */
async function testCombineAsVariantsMissingComponentReportsNotFound() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, {
    name: "Button / State=Default",
  });

  await assertMutationError(
    handleWriteRequest("combine_as_variants", undefined, {
      componentIds: [component.nodeId, "1:404"],
    }),
    "NOT_FOUND",
    /componentIds\[1\] was not found/
  );
}

/** Verifies combine_as_variants rejects non-component source nodes. */
async function testCombineAsVariantsRejectsNonComponentSource() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, {
    name: "Button / State=Default",
  });
  const frame = await handleWriteRequest("create_frame", undefined, { name: "Not a Component" });

  await assertMutationError(
    handleWriteRequest("combine_as_variants", undefined, {
      componentIds: [component.nodeId, frame.nodeId],
    }),
    "INVALID_COMPONENT",
    /componentIds\[1\] must reference a COMPONENT node/
  );
}

/** Verifies batch_mutation can combine components into variants via tmp: refs. */
async function testBatchCombineAsVariantsSupportsTmpRefs() {
  globalThis.figma = createMockFigma();

  const result = await handleWriteRequest("batch_mutation", undefined, {
    operations: [
      {
        type: "create_component",
        ref: "tmp:default",
        params: { name: "Button / State=Default" },
      },
      {
        type: "create_component",
        ref: "tmp:hover",
        params: { name: "Button / State=Hover" },
      },
      {
        type: "combine_as_variants",
        ref: "tmp:button-set",
        params: {
          componentIds: ["tmp:default", "tmp:hover"],
          name: "Button",
        },
      },
    ],
  });

  assert.equal(result.executedCount, 3);
  assert.equal(result.results[2].type, "COMPONENT_SET");
  assert.equal(result.results[2].name, "Button");
  assert.ok(result.createdRefs["tmp:button-set"]);
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

/** Verifies default find_nodes scope remains the current page. */
async function testFindNodesDefaultScopeStaysOnCurrentPage() {
  globalThis.figma = createMockFigma();

  await handleWriteRequest("create_frame", undefined, { name: "Button Current" });
  const componentsPage = globalThis.figma.createTestPage("Components");
  const remoteButton = globalThis.figma.createComponent();
  remoteButton.name = "Button Remote";
  componentsPage.appendChild(remoteButton);

  const result = await handleWriteRequest("find_nodes", undefined, { name: "Button" });

  assert.equal(result.summary.scope, "currentPage");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].name, "Button Current");
  assert.equal(result.matches[0].pageId, globalThis.figma.currentPage.id);
  assert.deepEqual(result.matches[0].path, ["Page 1", "Button Current"]);
}

/** Verifies all-pages search can find typed nodes outside the current page. */
async function testFindNodesAllPagesTypeFilterIncludesRemotePages() {
  globalThis.figma = createMockFigma();

  await handleWriteRequest("create_frame", undefined, { name: "Button Frame" });
  const componentsPage = globalThis.figma.createTestPage("Components");
  const remoteButton = globalThis.figma.createComponent();
  remoteButton.name = "Button / Primary";
  componentsPage.appendChild(remoteButton);

  const result = await handleWriteRequest("find_nodes", undefined, {
    scope: "allPages",
    name: "Button",
    type: "COMPONENT",
  });

  assert.equal(result.summary.scope, "allPages");
  assert.equal(result.summary.totalMatched, 1);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].type, "COMPONENT");
  assert.equal(result.matches[0].name, "Button / Primary");
  assert.equal(result.matches[0].pageId, componentsPage.id);
  assert.equal(result.matches[0].pageName, "Components");
  assert.deepEqual(result.matches[0].path, ["Components", "Button / Primary"]);
}

/** Verifies pageId, exact matching, and component-set type filters compose. */
async function testFindNodesPageIdExactComponentSetFilter() {
  globalThis.figma = createMockFigma();

  const componentsPage = globalThis.figma.createTestPage("Components");
  const primary = globalThis.figma.createComponent();
  primary.name = "State=Default";
  componentsPage.appendChild(primary);
  const hover = globalThis.figma.createComponent();
  hover.name = "State=Hover";
  componentsPage.appendChild(hover);
  const buttonSet = globalThis.figma.combineAsVariants([primary, hover], componentsPage);
  buttonSet.name = "Button";

  const result = await handleWriteRequest("find_nodes", undefined, {
    pageId: componentsPage.id,
    name: "Button",
    nameMatch: "exact",
    type: ["COMPONENT_SET"],
  });

  assert.equal(result.summary.pageId, componentsPage.id);
  assert.equal(result.summary.totalMatched, 1);
  assert.equal(result.matches[0].nodeId, buttonSet.id);
  assert.equal(result.matches[0].type, "COMPONENT_SET");
  assert.deepEqual(result.matches[0].path, ["Components", "Button"]);
}

/** Verifies regex matching, hidden filtering, and limit reporting. */
async function testFindNodesRegexHiddenAndLimit() {
  globalThis.figma = createMockFigma();

  await handleWriteRequest("create_frame", undefined, { name: "Icon/Add" });
  const hidden = await handleWriteRequest("create_frame", undefined, { name: "Icon/Remove" });
  const hiddenNode = await globalThis.figma.getNodeByIdAsync(hidden.nodeId);
  hiddenNode.visible = false;
  await handleWriteRequest("create_frame", undefined, { name: "Icon/Edit" });

  const result = await handleWriteRequest("find_nodes", undefined, {
    name: "^Icon/",
    nameMatch: "regex",
    includeHidden: false,
    limit: 1,
  });

  assert.equal(result.summary.totalMatched, 2);
  assert.equal(result.summary.returned, 1);
  assert.equal(result.summary.truncated, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].name, "Icon/Add");
}

/** Verifies invalid regex filters fail with a structured input error. */
async function testFindNodesInvalidRegexFails() {
  globalThis.figma = createMockFigma();

  await assertMutationError(
    handleWriteRequest("find_nodes", undefined, { name: "[", nameMatch: "regex" }),
    "INVALID_INPUT",
    /Invalid name regex/
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


/** Verifies variant properties can be merged onto a component inside a component set. */
async function testSetVariantPropertiesRenamesVariantComponent() {
  globalThis.figma = createMockFigma();

  const defaultVariant = await handleWriteRequest("create_component", undefined, {
    name: "State=Default, Size=Small",
  });
  const hoverVariant = await handleWriteRequest("create_component", undefined, {
    name: "State=Hover, Size=Small",
  });
  await handleWriteRequest("combine_as_variants", undefined, {
    componentIds: [defaultVariant.nodeId, hoverVariant.nodeId],
    name: "Button",
  });

  const result = await handleWriteRequest("set_variant_properties", undefined, {
    componentId: hoverVariant.nodeId,
    variantProperties: { Size: "Large" },
  });

  assert.equal(result.type, "COMPONENT");
  assert.equal(result.name, "State=Hover, Size=Large");
  assert.deepEqual(result.variantProperties, { State: "Hover", Size: "Large" });
}

/** Verifies component property definitions can be added and edited on a component. */
async function testManageComponentPropertiesAddEditDelete() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, { name: "Button" });
  const addResult = await handleWriteRequest("manage_component_properties", undefined, {
    componentId: component.nodeId,
    operations: [
      { action: "add", propertyName: "Label", propertyType: "TEXT", defaultValue: "Submit" },
      { action: "add", propertyName: "Enabled", propertyType: "BOOLEAN", defaultValue: true },
    ],
  });

  const labelName = addResult.operations[0].returnedName;
  assert.match(labelName, /^Label#/);
  assert.equal(addResult.node.componentPropertyDefinitions[labelName].defaultValue, "Submit");

  const editResult = await handleWriteRequest("manage_component_properties", undefined, {
    componentId: component.nodeId,
    operations: [
      { action: "edit", propertyName: labelName, newName: "ButtonLabel", defaultValue: "Continue" },
    ],
  });
  const renamed = editResult.operations[0].returnedName;
  assert.match(renamed, /^ButtonLabel#/);
  assert.equal(editResult.node.componentPropertyDefinitions[renamed].defaultValue, "Continue");

  const deleteResult = await handleWriteRequest("manage_component_properties", undefined, {
    componentId: component.nodeId,
    operations: [{ action: "delete", propertyName: renamed }],
  });
  assert.equal(deleteResult.node.componentPropertyDefinitions[renamed], undefined);
}

/** Verifies instance component properties can be set through setProperties. */
async function testSetComponentPropertiesOnInstance() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, { name: "Button" });
  const instance = await handleWriteRequest("create_instance", undefined, {
    componentId: component.nodeId,
  });

  const result = await handleWriteRequest("set_component_properties", undefined, {
    instanceId: instance.nodeId,
    properties: { Label: "Buy", Enabled: true },
  });

  assert.equal(result.type, "INSTANCE");
  assert.deepEqual(result.componentProperties, { Label: "Buy", Enabled: true });
  assert.equal(result.node.componentProperties.Label.value, "Buy");
  assert.equal(result.node.componentProperties.Enabled.value, true);
}

/** Verifies nested instances can be marked as exposed. */
async function testSetExposedInstance() {
  globalThis.figma = createMockFigma();

  const component = await handleWriteRequest("create_component", undefined, { name: "Icon" });
  const instance = await handleWriteRequest("create_instance", undefined, {
    componentId: component.nodeId,
  });

  const result = await handleWriteRequest("set_exposed_instance", undefined, {
    instanceId: instance.nodeId,
    isExposed: true,
  });

  assert.equal(result.type, "INSTANCE");
  assert.equal(result.isExposedInstance, true);
  assert.equal(result.node.isExposedInstance, true);
}

/** Verifies variant property writes reject non-variant components. */
async function testSetVariantPropertiesRejectsStandaloneComponent() {
  globalThis.figma = createMockFigma();
  const component = await handleWriteRequest("create_component", undefined, { name: "Standalone" });

  await assertMutationError(
    handleWriteRequest("set_variant_properties", undefined, {
      componentId: component.nodeId,
      variantProperties: { State: "Hover" },
    }),
    "INVALID_COMPONENT",
    /inside a COMPONENT_SET/
  );
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
    ["testCombineAsVariantsCreatesComponentSet", testCombineAsVariantsCreatesComponentSet],
    ["testCombineAsVariantsRequiresAtLeastTwoComponents", testCombineAsVariantsRequiresAtLeastTwoComponents],
    ["testCombineAsVariantsMissingComponentReportsNotFound", testCombineAsVariantsMissingComponentReportsNotFound],
    ["testCombineAsVariantsRejectsNonComponentSource", testCombineAsVariantsRejectsNonComponentSource],
    ["testBatchCombineAsVariantsSupportsTmpRefs", testBatchCombineAsVariantsSupportsTmpRefs],
    ["testSetVariantPropertiesRenamesVariantComponent", testSetVariantPropertiesRenamesVariantComponent],
    ["testManageComponentPropertiesAddEditDelete", testManageComponentPropertiesAddEditDelete],
    ["testSetComponentPropertiesOnInstance", testSetComponentPropertiesOnInstance],
    ["testSetExposedInstance", testSetExposedInstance],
    ["testSetVariantPropertiesRejectsStandaloneComponent", testSetVariantPropertiesRejectsStandaloneComponent],
    ["testBatchCreateComponentAndInstanceSupportsTmpRef", testBatchCreateComponentAndInstanceSupportsTmpRef],
    ["testBatchSetNodeNameSupportsTmpRef", testBatchSetNodeNameSupportsTmpRef],
    ["testLargeOrderedBatch", testLargeOrderedBatch],
    ["testPartialFailure", testPartialFailure],
    ["testBatchValidationFailure", testBatchValidationFailure],
    ["testFindNodesJsonQuery", testFindNodesJsonQuery],
    ["testFindNodesQuerySubstringFallback", testFindNodesQuerySubstringFallback],
    ["testFindNodesDefaultScopeStaysOnCurrentPage", testFindNodesDefaultScopeStaysOnCurrentPage],
    ["testFindNodesAllPagesTypeFilterIncludesRemotePages", testFindNodesAllPagesTypeFilterIncludesRemotePages],
    ["testFindNodesPageIdExactComponentSetFilter", testFindNodesPageIdExactComponentSetFilter],
    ["testFindNodesRegexHiddenAndLimit", testFindNodesRegexHiddenAndLimit],
    ["testFindNodesInvalidRegexFails", testFindNodesInvalidRegexFails],
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
