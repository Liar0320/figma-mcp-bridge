import assert from "node:assert/strict";

import { planApplyTokens } from "../dist-test/src/main/tokenApply.js";

const context = {
  fileName: "Apply Test",
  currentPage: { id: "0:1", name: "Page 1" },
};

const scope = {
  type: "nodeIds",
  requestedNodeIds: ["1:1"],
  rootNodeIds: ["1:1"],
  scannedNodeCount: 1,
};

const tokens = [
  {
    path: "color.brand.primary",
    name: "Brand/Primary",
    group: "color",
    source: "variable",
    value: { color: "#3366ff", opacity: 1 },
    figmaId: "VariableID:1:1",
  },
  {
    path: "typography.body.base",
    name: "Body/Base",
    group: "typography",
    source: "style",
    styleType: "text",
    value: { fontSize: 16 },
    figmaId: "S:1:2",
  },
  {
    path: "spacing.4",
    name: "Spacing/4",
    group: "spacing",
    source: "variable",
    value: 16,
  },
];

const exactFillUsage = {
  nodeId: "1:1",
  nodeName: "Button",
  nodeType: "RECTANGLE",
  property: "fills[0].color",
  group: "color",
  value: { color: "#3366ff", opacity: 1 },
  match: {
    type: "exactValue",
    tokenPath: "color.brand.primary",
    tokenName: "Brand/Primary",
    tokenSource: "variable",
    tokenFigmaId: "VariableID:1:1",
    confidence: 1,
    reason: "Exact color value match",
  },
};

const exactTypographyUsage = {
  nodeId: "1:2",
  nodeName: "Label",
  nodeType: "TEXT",
  property: "typography",
  group: "typography",
  value: { fontSize: 16 },
  match: {
    type: "exactValue",
    tokenPath: "typography.body.base",
    tokenName: "Body/Base",
    tokenSource: "style",
    tokenFigmaId: "S:1:2",
    confidence: 1,
    reason: "Exact text style fingerprint match",
  },
};

function testDryRunIsDefaultAndPlansOnly() {
  const response = planApplyTokens({}, [exactFillUsage], tokens, context, scope);

  assert.equal(response.dryRun, true);
  assert.equal(response.summary.consideredUsages, 1);
  assert.equal(response.summary.planned, 1);
  assert.equal(response.summary.applied, 0);
  assert.equal(response.results[0].action, "bind-variable");
  assert.equal(response.results[0].status, "planned");
}

function testPlansStyleApplication() {
  const response = planApplyTokens({}, [exactTypographyUsage], tokens, context, scope);

  assert.equal(response.summary.planned, 1);
  assert.equal(response.results[0].action, "apply-style");
  assert.equal(response.results[0].tokenFigmaId, "S:1:2");
}

function testFiltersByTokenPathAndMatchType() {
  const boundUsage = {
    ...exactFillUsage,
    match: { ...exactFillUsage.match, type: "boundVariable", reason: "Already bound" },
  };

  const response = planApplyTokens(
    { tokenPaths: ["color.brand.primary"], matchTypes: ["boundVariable"] },
    [exactFillUsage, exactTypographyUsage, boundUsage],
    tokens,
    context,
    scope,
  );

  assert.equal(response.summary.consideredUsages, 1);
  assert.equal(response.summary.skipped, 1);
  assert.equal(response.results[0].action, "skip");
  assert.match(response.results[0].message, /already has boundVariable/);
}

function testMissingFigmaIdSkips() {
  const usage = {
    ...exactFillUsage,
    property: "cornerRadius",
    group: "spacing",
    match: {
      ...exactFillUsage.match,
      tokenPath: "spacing.4",
      tokenName: "Spacing/4",
      tokenSource: "variable",
      tokenFigmaId: undefined,
    },
  };

  const response = planApplyTokens({}, [usage], tokens, context, scope);

  assert.equal(response.summary.skipped, 1);
  assert.equal(response.results[0].action, "skip");
  assert.equal(response.results[0].status, "skipped");
}

function testExplicitDryRunFalseStillPlansForMutationPhase() {
  const response = planApplyTokens({ dryRun: false }, [exactFillUsage], tokens, context, scope);

  assert.equal(response.dryRun, false);
  assert.equal(response.summary.planned, 1);
  assert.equal(response.summary.applied, 0);
  assert.equal(response.results[0].action, "bind-variable");
}

async function runTests() {
  const tests = [
    ["testDryRunIsDefaultAndPlansOnly", testDryRunIsDefaultAndPlansOnly],
    ["testPlansStyleApplication", testPlansStyleApplication],
    ["testFiltersByTokenPathAndMatchType", testFiltersByTokenPathAndMatchType],
    ["testMissingFigmaIdSkips", testMissingFigmaIdSkips],
    ["testExplicitDryRunFalseStillPlansForMutationPhase", testExplicitDryRunFalseStillPlansForMutationPhase],
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
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
    }
  }

  console.log(`tokenApply.test.mjs: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
