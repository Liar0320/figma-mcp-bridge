import assert from "node:assert/strict";

import {
  collectVariableTokens,
  disambiguateTokenPaths,
  normalizeTokenPath,
  normalizeTokenSegment,
} from "../dist-test/src/main/tokens.js";

function makeToken(overrides) {
  return {
    path: "color.duplicate",
    originalPath: "Duplicate",
    name: "Duplicate",
    group: "color",
    source: "variable",
    ...overrides,
  };
}

function testChineseSegmentsArePreserved() {
  assert.equal(normalizeTokenSegment("中性色"), "中性色");
  assert.equal(normalizeTokenSegment("一级黑"), "一级黑");
  assert.equal(normalizeTokenPath("color", "中性色/一级黑"), "color.中性色.一级黑");
  assert.equal(normalizeTokenPath("color", "主色/蓝色描边"), "color.主色.蓝色描边");
  assert.equal(normalizeTokenPath("color", "主色变体/Hover"), "color.主色变体.hover");
}

function testDuplicatePathsAreDisambiguatedDeterministically() {
  const tokens = disambiguateTokenPaths([
    makeToken({ figmaId: "VariableID:1:101", name: "Foo Bar", originalPath: "Foo Bar" }),
    makeToken({ figmaId: "VariableID:1:202", name: "Foo-Bar", originalPath: "Foo-Bar" }),
    makeToken({ path: "color.中性色.一级黑", name: "中性色/一级黑", originalPath: "中性色/一级黑" }),
  ]);

  assert.deepEqual(
    tokens.map((token) => token.path),
    ["color.duplicate.101", "color.duplicate.202", "color.中性色.一级黑"],
  );
  assert.equal(new Set(tokens.map((token) => token.path)).size, tokens.length);
}

function testGroupPrefixedNamesDoNotDuplicateGroup() {
  assert.equal(normalizeTokenPath("radius", "radius/sm"), "radius.sm");
  assert.equal(normalizeTokenPath("spacing", "spacing/md"), "spacing.md");
  assert.equal(normalizeTokenPath("size", "size/card"), "size.card");
}

async function testCollectVariableTokensUsesBulkVariableApi() {
  let getLocalVariablesCalls = 0;
  let getVariableByIdCalls = 0;

  globalThis.figma = {
    variables: {
      async getLocalVariableCollectionsAsync() {
        return [{
          id: "VariableCollectionId:1:1",
          name: "Tokens",
          defaultModeId: "mode:1",
          modes: [{ modeId: "mode:1", name: "Default" }],
          variableIds: ["VariableID:1:1", "VariableID:1:2"],
        }];
      },
      async getLocalVariablesAsync() {
        getLocalVariablesCalls += 1;
        return [
          {
            id: "VariableID:1:1",
            name: "radius/card",
            resolvedType: "FLOAT",
            valuesByMode: { "mode:1": 24 },
            variableCollectionId: "VariableCollectionId:1:1",
            description: "",
          },
          {
            id: "VariableID:1:2",
            name: "color/brand",
            resolvedType: "COLOR",
            valuesByMode: { "mode:1": { r: 1, g: 0.5, b: 0, a: 1 } },
            variableCollectionId: "VariableCollectionId:1:1",
            description: "",
          },
        ];
      },
      async getVariableByIdAsync() {
        getVariableByIdCalls += 1;
        throw new Error("per-variable API should not be called when bulk API is available");
      },
    },
  };

  const tokens = await collectVariableTokens();

  assert.equal(getLocalVariablesCalls, 1);
  assert.equal(getVariableByIdCalls, 0);
  assert.deepEqual(tokens.map((token) => token.path), ["radius.card", "color.brand"]);
}

testChineseSegmentsArePreserved();
testDuplicatePathsAreDisambiguatedDeterministically();
testGroupPrefixedNamesDoNotDuplicateGroup();
await testCollectVariableTokensUsesBulkVariableApi();

console.log("tokens.test.mjs: 4 passed");
