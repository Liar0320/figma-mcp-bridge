import assert from "node:assert/strict";

import { applyPlanItemForTest, planApplyTokens } from "../dist-test/src/main/tokenApply.js";

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
  {
    path: "radius.md",
    name: "Radius/Md",
    group: "radius",
    source: "variable",
    value: 16,
    figmaId: "VariableID:1:3",
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

function testDryRunWarnsTextStyleAsyncRuntimeConstraint() {
  const response = planApplyTokens({}, [exactTypographyUsage], tokens, context, scope);

  assert.equal(response.summary.planned, 1);
  assert.equal(response.warnings?.[0]?.code, "DYNAMIC_PAGE_TEXT_STYLE_ASYNC_REQUIRED");
  assert.match(response.warnings[0].message, /setTextStyleIdAsync/);
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

async function testTextStyleApplicationUsesAsyncApi() {
  const calls = [];
  globalThis.figma = {
    async getStyleByIdAsync(id) {
      return { id, type: "TEXT", name: "Body/Base" };
    },
    async getNodeByIdAsync(id) {
      return {
        id,
        type: "TEXT",
        visible: true,
        async setTextStyleIdAsync(styleId) {
          calls.push(styleId);
        },
        set textStyleId(_styleId) {
          throw new Error("sync textStyleId setter should not be used in dynamic-page mode");
        },
      };
    },
  };

  const result = await applyPlanItemForTest({
    ...planApplyTokens({ dryRun: false }, [exactTypographyUsage], tokens, context, scope).results[0],
    status: "planned",
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(calls, ["S:1:2"]);
}

function testPartialSuccessMetadataIncludesGroups() {
  const response = planApplyTokens({ dryRun: false, failureMode: "grouped" }, [exactFillUsage, exactTypographyUsage], tokens, context, scope);

  assert.equal(response.failureMode, "grouped");
  assert.equal(response.summary.partialSuccess, false);
  assert.deepEqual(response.summary.plannedGroups.sort(), ["color", "typography"]);
}

const exactRadiusUsage = {
  nodeId: "1:3",
  nodeName: "Card",
  nodeType: "RECTANGLE",
  property: "cornerRadius",
  group: "radius",
  value: 16,
  match: {
    type: "exactValue",
    tokenPath: "radius.md",
    tokenName: "Radius/Md",
    tokenSource: "variable",
    tokenFigmaId: "VariableID:1:3",
    confidence: 0.8,
    reason: "cornerRadius exactly matches a radius token value",
  },
};

async function testNoopFloatBindingReturnsError() {
  globalThis.figma = {
    variables: {
      async getVariableByIdAsync(id) {
        return { id, name: "Radius/Md" };
      },
    },
    async getNodeByIdAsync(id) {
      return {
        id,
        type: "RECTANGLE",
        visible: true,
        boundVariables: {},
        setBoundVariable() {
          // Simulate a Figma API no-op / unsupported field path that does not throw.
        },
      };
    },
  };

  const result = await applyPlanItemForTest({
    ...planApplyTokens({ dryRun: false }, [exactRadiusUsage], tokens, context, scope).results[0],
    status: "planned",
  });

  assert.equal(result.status, "error");
  assert.match(result.message, /Variable binding verification failed for cornerRadius/);
}

async function testCornerRadiusBindsIndividualRadiusFields() {
  const calls = [];
  const node = {
    id: "1:3",
    type: "RECTANGLE",
    visible: true,
    boundVariables: {},
    setBoundVariable(field, variable) {
      calls.push(field);
      this.boundVariables[field] = { id: variable.id };
    },
  };
  globalThis.figma = {
    variables: {
      async getVariableByIdAsync(id) {
        return { id, name: "Radius/Md" };
      },
    },
    async getNodeByIdAsync() {
      return node;
    },
  };

  const result = await applyPlanItemForTest({
    ...planApplyTokens({ dryRun: false }, [exactRadiusUsage], tokens, context, scope).results[0],
    status: "planned",
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(calls, ["topLeftRadius", "topRightRadius", "bottomRightRadius", "bottomLeftRadius"]);
}

async function runTests() {
  const tests = [
    ["testDryRunIsDefaultAndPlansOnly", testDryRunIsDefaultAndPlansOnly],
    ["testPlansStyleApplication", testPlansStyleApplication],
    ["testDryRunWarnsTextStyleAsyncRuntimeConstraint", testDryRunWarnsTextStyleAsyncRuntimeConstraint],
    ["testFiltersByTokenPathAndMatchType", testFiltersByTokenPathAndMatchType],
    ["testMissingFigmaIdSkips", testMissingFigmaIdSkips],
    ["testExplicitDryRunFalseStillPlansForMutationPhase", testExplicitDryRunFalseStillPlansForMutationPhase],
    ["testTextStyleApplicationUsesAsyncApi", testTextStyleApplicationUsesAsyncApi],
    ["testPartialSuccessMetadataIncludesGroups", testPartialSuccessMetadataIncludesGroups],
    ["testNoopFloatBindingReturnsError", testNoopFloatBindingReturnsError],
    ["testCornerRadiusBindsIndividualRadiusFields", testCornerRadiusBindsIndividualRadiusFields],
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
