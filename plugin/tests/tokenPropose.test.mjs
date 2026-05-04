import assert from "node:assert/strict";

import { proposeDesignTokensFromData } from "../dist-test/src/main/tokenPropose.js";

const baseUsage = {
  version: 1,
  fileName: "Proposal Test",
  currentPage: { id: "0:1", name: "Page 1" },
  scope: {
    type: "currentPage",
    rootNodeIds: ["1:1"],
    scannedNodeCount: 3,
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

const baseAudit = {
  version: 1,
  fileName: "Proposal Test",
  currentPage: { id: "0:1", name: "Page 1" },
  scope: baseUsage.scope,
  summary: {
    issueCount: 0,
    bySeverity: {},
    byCode: {},
    coverage: null,
    tokenCount: 0,
    usageCount: 0,
  },
  issues: [],
  recommendations: [],
  source: {
    tokenSummary: { totalTokens: 0, byGroup: {}, bySource: {}, collections: 0, modes: 0 },
    usageSummary: baseUsage.summary,
  },
};

function usageEntry(overrides) {
  return {
    nodeId: "1:2",
    nodeName: "Layer",
    nodeType: "RECTANGLE",
    property: "fills[0].color",
    group: "color",
    value: { color: "#ff0000", opacity: 1 },
    match: { type: "none", confidence: 0, reason: "test" },
    ...overrides,
  };
}

function testRepeatedUnboundValuesBecomeDryRunProposals() {
  const usage = {
    ...baseUsage,
    usages: [
      usageEntry({ nodeId: "1:2", nodeName: "Card" }),
      usageEntry({ nodeId: "1:3", nodeName: "Button" }),
    ],
    summary: {
      totalUsages: 2,
      matchedUsages: 0,
      unmatchedUsages: 2,
      coverage: 0,
      byGroup: { color: { total: 2, matched: 0, unmatched: 2 } },
      byMatchType: { boundVariable: 0, style: 0, exactValue: 0, none: 2 },
    },
  };

  const response = proposeDesignTokensFromData([], usage, baseAudit);

  assert.equal(response.summary.proposalCount, 1);
  assert.equal(response.summary.byReason["repeated-unbound-value"], 1);
  assert.equal(response.proposals[0].reason, "repeated-unbound-value");
  assert.equal(response.proposals[0].occurrences, 2);
  assert.equal(response.proposals[0].creationHint.dryRunRequired, true);
  assert.equal(response.proposals[0].creationHint.variableType, "COLOR");
  assert.deepEqual(
    response.proposals[0].nodes.map((node) => node.nodeName),
    ["Card", "Button"],
  );
}

function testExactMatchesAreExcludedUnlessRequested() {
  const usage = {
    ...baseUsage,
    usages: [
      usageEntry({
        nodeId: "1:2",
        match: { type: "exactValue", tokenPath: "color.brand.danger", confidence: 0.85, reason: "test" },
      }),
      usageEntry({
        nodeId: "1:3",
        match: { type: "exactValue", tokenPath: "color.brand.danger", confidence: 0.85, reason: "test" },
      }),
    ],
    summary: {
      totalUsages: 2,
      matchedUsages: 2,
      unmatchedUsages: 0,
      coverage: 1,
      byGroup: { color: { total: 2, matched: 2, unmatched: 0 } },
      byMatchType: { boundVariable: 0, style: 0, exactValue: 2, none: 0 },
    },
  };

  const excluded = proposeDesignTokensFromData([], usage, baseAudit);
  assert.equal(excluded.summary.proposalCount, 0);

  const included = proposeDesignTokensFromData([], usage, baseAudit, { includeExactValueMatches: true });
  assert.equal(included.summary.proposalCount, 1);
  assert.equal(included.proposals[0].reason, "repeated-exact-value-match");
  assert.deepEqual(included.proposals[0].basedOnTokenPaths, ["color.brand.danger"]);
}

function testDuplicateTokenValuesBecomeConsolidationProposals() {
  const sharedValue = { type: "COLOR", color: "#3366ff", opacity: 1 };
  const tokens = [
    {
      path: "color.brand.primary",
      name: "Brand/Primary",
      group: "color",
      source: "variable",
      value: sharedValue,
      figmaId: "VariableID:1:1",
    },
    {
      path: "color.semantic.action",
      name: "Semantic/Action",
      group: "color",
      source: "variable",
      value: sharedValue,
      figmaId: "VariableID:1:2",
    },
  ];

  const response = proposeDesignTokensFromData(tokens, baseUsage, baseAudit);

  assert.equal(response.summary.proposalCount, 1);
  assert.equal(response.proposals[0].reason, "duplicate-token-consolidation");
  assert.deepEqual(response.proposals[0].basedOnTokenPaths, ["color.brand.primary", "color.semantic.action"]);
}

async function runTests() {
  const tests = [
    ["testRepeatedUnboundValuesBecomeDryRunProposals", testRepeatedUnboundValuesBecomeDryRunProposals],
    ["testExactMatchesAreExcludedUnlessRequested", testExactMatchesAreExcludedUnlessRequested],
    ["testDuplicateTokenValuesBecomeConsolidationProposals", testDuplicateTokenValuesBecomeConsolidationProposals],
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

  console.log(`tokenPropose.test.mjs: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
