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

function setFigmaMock({ root, components = [], componentSets = [] }) {
  globalThis.figma = {
    root: Object.assign(root, {
      findAll(callback) {
        const results = [];
        const visit = (node) => {
          for (const child of node.children ?? []) {
            if (callback(child)) results.push(child);
            visit(child);
          }
        };
        visit(this);
        return results;
      },
    }),
  };
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
  assert.match(result.warnings[0].message, /description unavailable/);
  assert.equal(result.warnings[0].nodeId, "30:1");
}

await testStandaloneComponentAcrossFilePages();
await testComponentSetWithVariantsHierarchy();
await testEmptyFile();
await testMetadataReadFailureIsWarningOnly();

console.log("components.test.mjs: 4 passed");
