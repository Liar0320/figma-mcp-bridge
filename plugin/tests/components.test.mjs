import assert from "node:assert/strict";

import { collectLocalComponents } from "../dist-test/src/main/components.js";

function makeDocument(name = "Component Test File") {
  const root = { id: "0:0", type: "DOCUMENT", name, parent: null, children: [] };
  const pageA = { id: "1:1", type: "PAGE", name: "Components", parent: root, children: [] };
  const pageB = { id: "1:2", type: "PAGE", name: "Other Page", parent: root, children: [] };
  root.children.push(pageA, pageB);
  return { root, pageA, pageB };
}

function append(parent, child) {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

function component(id, name, overrides = {}) {
  return {
    id,
    type: "COMPONENT",
    name,
    parent: null,
    children: [],
    key: `key-${id}`,
    description: "",
    variantProperties: null,
    componentPropertyDefinitions: {},
    ...overrides,
  };
}

function componentSet(id, name, overrides = {}) {
  return {
    id,
    type: "COMPONENT_SET",
    name,
    parent: null,
    children: [],
    key: `key-${id}`,
    description: "",
    componentPropertyDefinitions: {},
    ...overrides,
  };
}

function setFigmaMock({ root, loadAllPagesAsync } = {}) {
  const calls = [];
  const visitChildren = (node, callback, results = []) => {
    for (const child of node.children ?? []) {
      if (callback(child)) results.push(child);
      visitChildren(child, callback, results);
    }
    return results;
  };
  for (const page of root.children ?? []) {
    page.findAll = function findAll(callback) {
      calls.push(`page.findAll:${this.id}`);
      return visitChildren(this, callback);
    };
    page.loadAsync = async function loadAsync() {
      calls.push(`page.loadAsync:${this.id}`);
      if (this.loadError) throw this.loadError;
    };
  }
  globalThis.figma = {
    async loadAllPagesAsync() {
      calls.push("loadAllPagesAsync");
      if (loadAllPagesAsync) await loadAllPagesAsync();
    },
    async getNodeByIdAsync(id) {
      calls.push(`getNodeByIdAsync:${id}`);
      return root.children.find((page) => page.id === id) ?? null;
    },
    root: Object.assign(root, {
      findAll(callback) {
        calls.push("findAll");
        return visitChildren(this, callback);
      },
    }),
  };
  return { calls };
}

async function testStandaloneComponentAcrossFilePages() {
  const { root, pageB } = makeDocument();
  const button = append(
    pageB,
    component("10:1", "Button", {
      description: "Primary button",
      componentPropertyDefinitions: {
        "Label#10:2": { type: "TEXT", defaultValue: "Save" },
      },
    })
  );
  setFigmaMock({ root, components: [button] });

  const result = await collectLocalComponents();

  assert.equal(result.fileName, "Component Test File");
  assert.equal(result.summary.componentCount, 1);
  assert.equal(result.summary.componentSetCount, 0);
  assert.equal(result.summary.standaloneComponentCount, 1);
  assert.deepEqual(result.standaloneComponents.map((item) => item.name), ["Button"]);
  assert.equal(result.standaloneComponents[0].pageId, "1:2");
  assert.equal(result.standaloneComponents[0].pageName, "Other Page");
  assert.equal(result.standaloneComponents[0].componentPropertyDefinitions["Label#10:2"].defaultValue, "Save");
  assert.equal(result.warnings.length, 0);
}

async function testComponentSetWithVariantsHierarchy() {
  const { root, pageA } = makeDocument();
  const buttonSet = append(
    pageA,
    componentSet("20:1", "Button", {
      description: "Button variants",
      componentPropertyDefinitions: {
        Size: { type: "VARIANT", defaultValue: "Small", variantOptions: ["Small", "Large"] },
        State: { type: "VARIANT", defaultValue: "Default", variantOptions: ["Default", "Hover"] },
      },
    })
  );
  const small = append(buttonSet, component("20:2", "Size=Small, State=Default", {
    variantProperties: { Size: "Small", State: "Default" },
  }));
  const large = append(buttonSet, component("20:3", "Size=Large, State=Hover", {
    variantProperties: { Size: "Large", State: "Hover" },
  }));
  setFigmaMock({ root, components: [small, large], componentSets: [buttonSet] });

  const result = await collectLocalComponents();

  assert.equal(result.summary.componentCount, 2);
  assert.equal(result.summary.componentSetCount, 1);
  assert.equal(result.summary.variantCount, 2);
  assert.equal(result.summary.standaloneComponentCount, 0);
  assert.equal(result.componentSets[0].name, "Button");
  assert.deepEqual(result.componentSets[0].variants.map((item) => item.componentId), ["20:2", "20:3"]);
  assert.deepEqual(result.componentSets[0].variants[1].variantProperties, { Size: "Large", State: "Hover" });
  assert.equal(result.componentSets[0].variants[1].componentSetId, "20:1");
}

async function testEmptyFile() {
  const { root } = makeDocument("Empty File");
  setFigmaMock({ root });

  const result = await collectLocalComponents();

  assert.equal(result.fileName, "Empty File");
  assert.equal(result.summary.componentCount, 0);
  assert.equal(result.summary.componentSetCount, 0);
  assert.deepEqual(result.componentSets, []);
  assert.deepEqual(result.standaloneComponents, []);
  assert.deepEqual(result.components, []);
  assert.deepEqual(result.warnings, []);
}

async function testMetadataReadFailureIsWarningOnly() {
  const { root, pageA } = makeDocument();
  const broken = append(pageA, component("30:1", "Broken Component"));
  Object.defineProperty(broken, "description", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("description unavailable");
    },
  });
  const healthy = append(pageA, component("30:2", "Healthy Component"));
  setFigmaMock({ root, components: [broken, healthy] });

  const result = await collectLocalComponents();

  assert.equal(result.summary.componentCount, 1);
  assert.equal(result.summary.warningCount, 1);
  assert.deepEqual(result.components.map((item) => item.name), ["Healthy Component"]);
  assert.equal(result.warnings[0].code, "NODE_SERIALIZE_FAILED");
  assert.match(result.warnings[0].message, /description unavailable/);
  assert.equal(result.warnings[0].nodeId, "30:1");
  assert.equal(result.warnings[0].nodeName, "Broken Component");
  assert.equal(result.warnings[0].pageId, "1:1");
  assert.equal(result.warnings[0].pageName, "Components");
  assert.match(result.warnings[0].details.message, /description unavailable/);
}

async function testLoadAllPagesBeforeTraversingDynamicPageDocument() {
  const { root, pageB } = makeDocument();
  append(pageB, component("40:1", "Remote Page Component"));
  const { calls } = setFigmaMock({ root });

  const result = await collectLocalComponents();

  assert.equal(result.summary.componentCount, 1);
  assert.equal(calls[0], "loadAllPagesAsync");
  assert.deepEqual(calls.slice(1), ["findAll", "findAll"]);
}

async function testLoadAllPagesFailureIsWarningOnly() {
  const { root, pageA } = makeDocument();
  append(pageA, component("50:1", "Still Traversed Component"));
  setFigmaMock({
    root,
    async loadAllPagesAsync() {
      throw new Error("load failed");
    },
  });

  const result = await collectLocalComponents();

  assert.equal(result.summary.componentCount, 1);
  assert.equal(result.summary.warningCount, 1);
  assert.equal(result.warnings[0].code, "PAGE_LOAD_FAILED");
  assert.match(result.warnings[0].message, /load failed/);
  assert.match(result.warnings[0].details.message, /load failed/);
}

async function testBoundedLimitReturnsPartialResultWithoutFullPageLoad() {
  const { root, pageA, pageB } = makeDocument();
  append(pageA, component("60:1", "First"));
  append(pageB, component("60:2", "Second"));
  const { calls } = setFigmaMock({ root });

  const result = await collectLocalComponents({ limit: 1, maxDurationMs: 5000 });

  assert.equal(result.summary.returnedCount, 1);
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.truncated, true);
  assert.equal(result.summary.nextCursor, "1");
  assert.equal(result.summary.pagesLoaded, 1);
  assert.equal(result.summary.pagesSkipped, 1);
  assert.equal(result.warnings[0].code, "SKIPPED_LIMIT");
  assert.equal(calls.includes("loadAllPagesAsync"), false);
}

async function testBoundedPageIdScansOnlyRequestedPage() {
  const { root, pageA, pageB } = makeDocument();
  append(pageA, component("70:1", "Ignored"));
  append(pageB, component("70:2", "Target"));
  const { calls } = setFigmaMock({ root });

  const result = await collectLocalComponents({ pageId: "1:2", limit: 10 });

  assert.deepEqual(result.components.map((item) => item.name), ["Target"]);
  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.pagesLoaded, 1);
  assert.equal(result.summary.pagesSkipped, 1);
  assert.ok(calls.includes("getNodeByIdAsync:1:2"));
  assert.ok(calls.includes("page.loadAsync:1:2"));
  assert.equal(calls.includes("page.loadAsync:1:1"), false);
  assert.equal(calls.includes("loadAllPagesAsync"), false);
}

async function testBoundedPageLoadFailureIsStructuredWarning() {
  const { root, pageA, pageB } = makeDocument();
  append(pageA, component("80:1", "Healthy"));
  append(pageB, component("80:2", "Broken Page Component"));
  pageB.loadError = new Error("page load failed");
  setFigmaMock({ root });

  const result = await collectLocalComponents({ limit: 10, maxDurationMs: 5000 });

  assert.deepEqual(result.components.map((item) => item.name), ["Healthy"]);
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.pagesLoaded, 1);
  assert.equal(result.summary.pagesFailed, 1);
  assert.equal(result.warnings[0].code, "PAGE_LOAD_FAILED");
  assert.match(result.warnings[0].details.message, /page load failed/);
}

await testStandaloneComponentAcrossFilePages();
await testComponentSetWithVariantsHierarchy();
await testEmptyFile();
await testMetadataReadFailureIsWarningOnly();
await testLoadAllPagesBeforeTraversingDynamicPageDocument();
await testLoadAllPagesFailureIsWarningOnly();
await testBoundedLimitReturnsPartialResultWithoutFullPageLoad();
await testBoundedPageIdScansOnlyRequestedPage();
await testBoundedPageLoadFailureIsStructuredWarning();

console.log("components.test.mjs: 9 passed");
