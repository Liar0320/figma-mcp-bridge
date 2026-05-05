import assert from "node:assert/strict";

import { collectTokenUsage, summarizeUsage } from "../dist-test/src/main/tokenUsage.js";

function testEmptyUsageCoverageIsNull() {
  const summary = summarizeUsage([]);

  assert.equal(summary.totalUsages, 0);
  assert.equal(summary.matchedUsages, 0);
  assert.equal(summary.unmatchedUsages, 0);
  assert.equal(summary.coverage, null);
}

function testNonEmptyUsageCoverageIsRatio() {
  const summary = summarizeUsage([
    {
      nodeId: "1:1",
      nodeName: "Tokenized",
      nodeType: "RECTANGLE",
      property: "fills[0].color",
      group: "color",
      value: { color: "#ffffff", opacity: 1 },
      match: { type: "style", confidence: 1, reason: "test" },
    },
    {
      nodeId: "1:2",
      nodeName: "Hardcoded",
      nodeType: "RECTANGLE",
      property: "fills[0].color",
      group: "color",
      value: { color: "#000000", opacity: 1 },
      match: { type: "none", confidence: 0, reason: "test" },
    },
  ]);

  assert.equal(summary.totalUsages, 2);
  assert.equal(summary.matchedUsages, 1);
  assert.equal(summary.unmatchedUsages, 1);
  assert.equal(summary.coverage, 0.5);
}

async function testUniformCornerRadiusBindingsReadBackAsBoundVariable() {
  const node = {
    id: "1:3",
    name: "Card",
    type: "RECTANGLE",
    visible: true,
    cornerRadius: 16,
    boundVariables: {
      topLeftRadius: { id: "VariableID:1:3" },
      topRightRadius: { id: "VariableID:1:3" },
      bottomRightRadius: { id: "VariableID:1:3" },
      bottomLeftRadius: { id: "VariableID:1:3" },
    },
  };
  globalThis.figma = {
    root: { name: "Usage Test" },
    currentPage: {
      id: "0:1",
      name: "Page 1",
      selection: [node],
      children: [node],
    },
    variables: {
      async getLocalVariableCollectionsAsync() {
        return [{
          id: "CollectionID:1:1",
          name: "Tokens",
          defaultModeId: "mode:1",
          modes: [{ modeId: "mode:1", name: "Default" }],
          variableIds: ["VariableID:1:3"],
        }];
      },
      async getVariableByIdAsync(id) {
        return {
          id,
          name: "radius/md",
          resolvedType: "FLOAT",
          valuesByMode: { "mode:1": 16 },
          description: "",
        };
      },
    },
    async getLocalPaintStylesAsync() { return []; },
    async getLocalTextStylesAsync() { return []; },
    async getLocalEffectStylesAsync() { return []; },
    async getLocalGridStylesAsync() { return []; },
  };

  const response = await collectTokenUsage();
  const radiusUsage = response.usages.find((usage) => usage.property === "cornerRadius");

  assert.equal(radiusUsage?.match.type, "boundVariable");
  assert.equal(radiusUsage?.match.tokenFigmaId, "VariableID:1:3");
}

async function runTests() {
  const tests = [
    ["testEmptyUsageCoverageIsNull", testEmptyUsageCoverageIsNull],
    ["testNonEmptyUsageCoverageIsRatio", testNonEmptyUsageCoverageIsRatio],
    ["testUniformCornerRadiusBindingsReadBackAsBoundVariable", testUniformCornerRadiusBindingsReadBackAsBoundVariable],
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

  console.log(`tokenUsage.test.mjs: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
