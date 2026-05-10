import assert from "node:assert/strict";

import { serializeNode } from "../dist-test/src/main/serializer.js";

function baseNode(id, type, name) {
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
  };
}

function frame(id, name) {
  return Object.assign(baseNode(id, "FRAME", name), {
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
      child.parent = this;
      this.children.push(child);
    },
  });
}

function component(id, name) {
  return Object.assign(baseNode(id, "COMPONENT", name), {
    children: [],
    key: `key-${id}`,
    description: "",
    variantProperties: null,
    componentPropertyDefinitions: {},
  });
}

function componentSet(id, name) {
  return Object.assign(baseNode(id, "COMPONENT_SET", name), {
    children: [],
    key: `key-${id}`,
    description: "",
    componentPropertyDefinitions: {},
    variantGroupProperties: { Size: { values: ["Small", "Large"] } },
  });
}

function testComponentMetadataGetterFailureIsFieldLevelDiagnostic() {
  const root = frame("1:1", "Root");
  const broken = component("2:1", "Broken Variant");
  const healthy = component("2:2", "Healthy Component");

  Object.defineProperty(broken, "variantProperties", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("in get_variantProperties: Component set for node has existing errors");
    },
  });

  root.appendChild(broken);
  root.appendChild(healthy);

  const result = serializeNode(root);

  assert.equal(result.children.length, 2);
  assert.equal(result.children[0].id, "2:1");
  assert.equal(result.children[0].name, "Broken Variant");
  assert.equal(result.children[1].id, "2:2");
  assert.equal(result.children[1].variantProperties, null);
  assert.equal(result.children[0].serializationErrors.length, 1);
  assert.deepEqual(result.children[0].serializationErrors[0], {
    code: "NODE_SERIALIZE_FAILED",
    field: "variantProperties",
    message: "in get_variantProperties: Component set for node has existing errors",
  });
}

function testComponentSetMetadataFailuresDoNotDropHealthyFields() {
  const set = componentSet("3:1", "Button");

  Object.defineProperty(set, "componentPropertyDefinitions", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("component definitions unavailable");
    },
  });

  const result = serializeNode(set);

  assert.equal(result.id, "3:1");
  assert.deepEqual(result.variantGroupProperties, { Size: { values: ["Small", "Large"] } });
  assert.equal(result.componentPropertyDefinitions, undefined);
  assert.equal(result.serializationErrors.length, 1);
  assert.deepEqual(result.serializationErrors[0], {
    code: "NODE_SERIALIZE_FAILED",
    field: "componentPropertyDefinitions",
    message: "component definitions unavailable",
  });
}

testComponentMetadataGetterFailureIsFieldLevelDiagnostic();
testComponentSetMetadataFailuresDoNotDropHealthyFields();

console.log("serializer.test.mjs: 2 passed");
