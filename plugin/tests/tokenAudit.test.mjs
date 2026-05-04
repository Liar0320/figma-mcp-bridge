import assert from "node:assert/strict";

import { auditDesignTokens } from "../dist-test/src/main/tokenAudit.js";

const baseUsage = {
  version: 1,
  fileName: "Audit Test",
  currentPage: { id: "0:1", name: "Page 1" },
  scope: {
    type: "currentPage",
    rootNodeIds: ["1:1"],
    scannedNodeCount: 2,
  },
  usages: [],
  summary: {
    totalUsages: 0,
    matchedUsages: 0,
    unmatchedUsages: 0,
    coverage: null,
    byGroup: {},
    byMatchType: { boundVariable: 0, style: 0, exactValue: 0, none: 0 },
  },
};

function testAuditFlagsLowCoverageAndUnboundUsage() {
  const tokens = [
    {
      path: "color.brand.primary",
      originalPath: "Brand/Primary",
      name: "Brand/Primary",
      group: "color",
      source: "variable",
      value: { type: "COLOR", color: "#3366ff", opacity: 1 },
      figmaId: "VariableID:1:1",
    },
  ];
  const usage = {
    ...baseUsage,
    usages: [
      {
        nodeId: "1:2",
        nodeName: "Hardcoded Rectangle",
        nodeType: "RECTANGLE",
        property: "fills[0].color",
        group: "color",
        value: { color: "#ff0000", opacity: 1 },
        match: { type: "none", confidence: 0, reason: "test" },
      },
    ],
    summary: {
      totalUsages: 1,
      matchedUsages: 0,
      unmatchedUsages: 1,
      coverage: 0,
      byGroup: { color: { total: 1, matched: 0, unmatched: 1 } },
      byMatchType: { boundVariable: 0, style: 0, exactValue: 0, none: 1 },
    },
  };

  const audit = auditDesignTokens(tokens, usage, { includeUnusedTokens: false });

  assert.equal(audit.summary.coverage, 0);
  assert.equal(audit.summary.byCode.LOW_COVERAGE, 1);
  assert.equal(audit.summary.byCode.UNBOUND_USAGE, 1);
  assert.equal(audit.summary.bySeverity.warning, 2);
  assert.equal(audit.recommendations[0].priority, "high");
}

function testAuditFlagsDuplicateTokenValuesAndExactValueOnly() {
  const sharedValue = { type: "COLOR", color: "#3366ff", opacity: 1 };
  const tokens = [
    {
      path: "color.brand.primary",
      originalPath: "Brand/Primary",
      name: "Brand/Primary",
      group: "color",
      source: "variable",
      value: sharedValue,
      figmaId: "VariableID:1:1",
    },
    {
      path: "color.semantic.action",
      originalPath: "Semantic/Action",
      name: "Semantic/Action",
      group: "color",
      source: "variable",
      value: sharedValue,
      figmaId: "VariableID:1:2",
    },
  ];
  const usage = {
    ...baseUsage,
    usages: [
      {
        nodeId: "1:2",
        nodeName: "Button",
        nodeType: "RECTANGLE",
        property: "fills[0].color",
        group: "color",
        value: { color: "#3366ff", opacity: 1 },
        match: {
          type: "exactValue",
          tokenPath: "color.brand.primary",
          tokenFigmaId: "VariableID:1:1",
          confidence: 0.85,
          reason: "test",
        },
      },
    ],
    summary: {
      totalUsages: 1,
      matchedUsages: 1,
      unmatchedUsages: 0,
      coverage: 1,
      byGroup: { color: { total: 1, matched: 1, unmatched: 0 } },
      byMatchType: { boundVariable: 0, style: 0, exactValue: 1, none: 0 },
    },
  };

  const audit = auditDesignTokens(tokens, usage, { includeUnusedTokens: false });

  assert.equal(audit.summary.byCode.EXACT_VALUE_ONLY, 1);
  assert.equal(audit.summary.byCode.DUPLICATE_TOKEN_VALUE, 1);
  assert.equal(audit.summary.bySeverity.info, 2);
  assert.deepEqual(audit.issues.find((issue) => issue.code === "DUPLICATE_TOKEN_VALUE").tokenPaths, [
    "color.brand.primary",
    "color.semantic.action",
  ]);
}

async function runTests() {
  const tests = [
    ["testAuditFlagsLowCoverageAndUnboundUsage", testAuditFlagsLowCoverageAndUnboundUsage],
    ["testAuditFlagsDuplicateTokenValuesAndExactValueOnly", testAuditFlagsDuplicateTokenValuesAndExactValueOnly],
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

  console.log(`tokenAudit.test.mjs: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
