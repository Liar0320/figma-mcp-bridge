import assert from "node:assert/strict";

import {
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

testChineseSegmentsArePreserved();
testDuplicatePathsAreDisambiguatedDeterministically();

console.log("tokens.test.mjs: 2 passed");
