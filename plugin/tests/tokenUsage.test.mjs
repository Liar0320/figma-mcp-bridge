import assert from "node:assert/strict";

import { summarizeUsage } from "../dist-test/src/main/tokenUsage.js";

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

async function runTests() {
  const tests = [
    ["testEmptyUsageCoverageIsNull", testEmptyUsageCoverageIsNull],
    ["testNonEmptyUsageCoverageIsRatio", testNonEmptyUsageCoverageIsRatio],
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
