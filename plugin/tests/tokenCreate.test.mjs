import assert from "node:assert/strict";

import {
  createStyleForTest,
  planCreateDesignTokens,
  toVariableValueForTest,
  variableNameForCreatedToken,
} from "../dist-test/src/main/tokenCreate.js";

const context = {
  fileName: "Create Test",
  currentPage: { id: "0:1", name: "Page 1" },
};

function testDryRunIsDefaultAndPlansOnly() {
  const response = planCreateDesignTokens(
    {
      tokens: [
        {
          name: "Brand/Primary",
          group: "color",
          value: "#3366ff",
        },
        {
          name: "Spacing/4",
          group: "spacing",
          value: 16,
        },
      ],
    },
    [],
    context,
  );

  assert.equal(response.dryRun, true);
  assert.equal(response.summary.requested, 2);
  assert.equal(response.summary.planned, 2);
  assert.equal(response.summary.created, 0);
  assert.equal(response.results[0].action, "create-variable");
  assert.equal(response.results[0].variableType, "COLOR");
  assert.equal(response.results[0].collectionName, "Design Tokens");
  assert.equal(response.results[1].variableType, "FLOAT");
}

function testConflictsErrorByDefaultAndCanSkip() {
  const existingTokens = [
    {
      path: "color.brand.primary",
      name: "Brand/Primary",
      group: "color",
      source: "variable",
      value: { color: "#3366ff", opacity: 1 },
      figmaId: "VariableID:1:1",
    },
  ];

  const errored = planCreateDesignTokens(
    {
      tokens: [{ name: "Brand/Primary", group: "color", value: "#3366ff" }],
    },
    existingTokens,
    context,
  );
  assert.equal(errored.summary.errors, 1);
  assert.equal(errored.results[0].action, "error");
  assert.match(errored.results[0].message, /already exists/);

  const skipped = planCreateDesignTokens(
    {
      conflictStrategy: "skip",
      tokens: [{ name: "Brand/Primary", group: "color", value: "#3366ff" }],
    },
    existingTokens,
    context,
  );
  assert.equal(skipped.summary.skipped, 1);
  assert.equal(skipped.results[0].action, "skip");
}

function testExplicitDryRunFalseStillPlansForMutationPhase() {
  const response = planCreateDesignTokens(
    {
      dryRun: false,
      collectionName: "Semantic Tokens",
      tokens: [
        {
          name: "Body/Base",
          group: "typography",
          source: "style",
          value: {
            fontName: { family: "Inter", style: "Regular" },
            fontSize: 16,
            lineHeight: { unit: "PIXELS", value: 24 },
            letterSpacing: { unit: "PIXELS", value: 0 },
          },
        },
      ],
    },
    [],
    context,
  );

  assert.equal(response.dryRun, false);
  assert.equal(response.results[0].action, "create-style");
  assert.equal(response.results[0].styleType, "text");
  assert.equal(response.summary.planned, 1);
}

function testColorValueConversionSupportsHexAndOpacityObject() {
  assert.deepEqual(toVariableValueForTest("#3366ff", "COLOR"), {
    r: 0x33 / 255,
    g: 0x66 / 255,
    b: 1,
    a: 1,
  });
  assert.deepEqual(toVariableValueForTest({ color: "#000000", opacity: 0.5 }, "COLOR"), {
    r: 0,
    g: 0,
    b: 0,
    a: 0.5,
  });
}

function testFloatVariableNamesPreserveSemanticGroupOnRoundTrip() {
  assert.equal(variableNameForCreatedToken("radius", "sm", "FLOAT"), "radius/sm");
  assert.equal(variableNameForCreatedToken("radius", "radius/sm", "FLOAT"), "radius/sm");
  assert.equal(variableNameForCreatedToken("spacing", "md", "FLOAT"), "spacing/md");
  assert.equal(variableNameForCreatedToken("size", "card", "FLOAT"), "size/card");
  assert.equal(variableNameForCreatedToken("color", "Brand/Primary", "COLOR"), "Brand/Primary");
}

function testDryRunReportsIncompleteTextStyleAsError() {
  const response = planCreateDesignTokens(
    {
      tokens: [
        {
          name: "Body/Base",
          group: "typography",
          source: "style",
          value: { fontSize: 16 },
        },
      ],
    },
    [],
    context,
  );

  assert.equal(response.summary.errors, 1);
  assert.equal(response.results[0].action, "error");
  assert.match(response.results[0].message, /Text style value must include fontName or fontFamily\/fontStyle/);
}

async function testTextStyleCreationPersistsTypographyFieldsAndLoadsFont() {
  const loadedFonts = [];
  const createdStyles = [];
  globalThis.figma = {
    async loadFontAsync(fontName) {
      loadedFonts.push(fontName);
    },
    createTextStyle() {
      const style = { id: "S:1", name: "" };
      createdStyles.push(style);
      return style;
    },
  };

  const style = await createStyleForTest({
    name: "type/hero/title",
    path: "typography.type.hero.title",
    group: "typography",
    source: "style",
    action: "create-style",
    status: "planned",
    styleType: "text",
    value: {
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 58,
      lineHeight: { unit: "PIXELS", value: 66 },
      letterSpacing: { unit: "PIXELS", value: 1.2 },
      textDecoration: "NONE",
    },
  });

  assert.deepEqual(loadedFonts, [{ family: "Inter", style: "Bold" }]);
  assert.equal(createdStyles.length, 1);
  assert.equal(style.name, "type/hero/title");
  assert.deepEqual(style.fontName, { family: "Inter", style: "Bold" });
  assert.equal(style.fontSize, 58);
  assert.deepEqual(style.lineHeight, { unit: "PIXELS", value: 66 });
  assert.deepEqual(style.letterSpacing, { unit: "PIXELS", value: 1.2 });
  assert.equal(style.textDecoration, "NONE");
}

async function testTextStyleCreationRejectsIncompleteTypographyValue() {
  globalThis.figma = {
    async loadFontAsync() {},
    createTextStyle() {
      throw new Error("createTextStyle should not be called for invalid typography values");
    },
  };

  await assert.rejects(
    createStyleForTest({
      name: "type/body/base",
      path: "typography.type.body.base",
      group: "typography",
      source: "style",
      action: "create-style",
      status: "planned",
      styleType: "text",
      value: { fontSize: 16 },
    }),
    /Text style value must include fontName or fontFamily\/fontStyle/,
  );
}

async function runTests() {
  const tests = [
    ["testDryRunIsDefaultAndPlansOnly", testDryRunIsDefaultAndPlansOnly],
    ["testConflictsErrorByDefaultAndCanSkip", testConflictsErrorByDefaultAndCanSkip],
    ["testExplicitDryRunFalseStillPlansForMutationPhase", testExplicitDryRunFalseStillPlansForMutationPhase],
    ["testColorValueConversionSupportsHexAndOpacityObject", testColorValueConversionSupportsHexAndOpacityObject],
    ["testFloatVariableNamesPreserveSemanticGroupOnRoundTrip", testFloatVariableNamesPreserveSemanticGroupOnRoundTrip],
    ["testDryRunReportsIncompleteTextStyleAsError", testDryRunReportsIncompleteTextStyleAsError],
    ["testTextStyleCreationPersistsTypographyFieldsAndLoadsFont", testTextStyleCreationPersistsTypographyFieldsAndLoadsFont],
    ["testTextStyleCreationRejectsIncompleteTypographyValue", testTextStyleCreationRejectsIncompleteTypographyValue],
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

  console.log(`tokenCreate.test.mjs: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.error(`${failure.name}: ${failure.error}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await runTests();
