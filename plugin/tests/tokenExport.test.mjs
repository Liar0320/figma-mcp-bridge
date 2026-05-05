import assert from "node:assert/strict";

import { exportDesignTokens } from "../dist-test/src/main/tokenExport.js";

const context = {
  fileName: "Brand Tokens",
  currentPage: { id: "0:1", name: "Tokens" },
  summary: {
    total: 4,
    byGroup: { color: 2, spacing: 1, typography: 1 },
    bySource: { variable: 3, style: 1 },
    duplicatePaths: [],
  },
};

const tokens = [
  {
    path: "color.brand.primary",
    originalPath: "Brand/Primary",
    name: "Primary",
    group: "color",
    source: "variable",
    figmaId: "VariableID:1:1",
    variableType: "COLOR",
    collectionName: "Brand",
    value: { type: "COLOR", color: "#3366FF", opacity: 1 },
  },
  {
    path: "color.overlay.scrim",
    originalPath: "Overlay/Scrim",
    name: "Scrim",
    group: "color",
    source: "variable",
    figmaId: "VariableID:1:2",
    variableType: "COLOR",
    value: { type: "COLOR", color: "#000000", opacity: 0.5 },
  },
  {
    path: "spacing.md",
    originalPath: "Spacing/Md",
    name: "Md",
    group: "spacing",
    source: "variable",
    figmaId: "VariableID:1:3",
    variableType: "FLOAT",
    value: 16,
  },
  {
    path: "typography.body",
    originalPath: "Body",
    name: "Body",
    group: "typography",
    source: "style",
    figmaId: "S:1",
    styleType: "text",
    value: { fontSize: 16, fontFamily: "Inter" },
  },
];

function testDefaultJsonExportIncludesAllTokens() {
  const result = exportDesignTokens(tokens, context);
  const content = JSON.parse(result.content);

  assert.equal(result.format, "json");
  assert.equal(result.contentType, "application/json");
  assert.equal(result.filename, "brand-tokens-design-tokens.json");
  assert.equal(result.tokenCount, 4);
  assert.equal(result.exportedTokenCount, 4);
  assert.equal(content.tokens.length, 4);
  assert.equal(content.summary.total, 4);
}

function testDtcgExportWithMetadataAndFiltering() {
  const result = exportDesignTokens(tokens, context, {
    format: "dtcg",
    tokenPaths: ["color.brand.primary", "missing.token"],
  });
  const content = JSON.parse(result.content);

  assert.equal(result.exportedTokenCount, 1);
  assert.deepEqual(result.warnings, ["Token path not found: missing.token"]);
  assert.equal(content.color.brand.primary.$type, "color");
  assert.deepEqual(content.color.brand.primary.$value, { type: "COLOR", color: "#3366FF", opacity: 1 });
  assert.equal(content.color.brand.primary.$extensions.figma.id, "VariableID:1:1");
  assert.equal(content.$extensions.figmaMcpBridge.fileName, "Brand Tokens");
}

function testCssExportSerializesSupportedTokens() {
  const result = exportDesignTokens(tokens, context, {
    format: "css",
    cssSelector: ".theme",
  });

  assert.equal(result.contentType, "text/css");
  assert.equal(result.filename, "brand-tokens-design-tokens.css");
  assert.equal(result.exportedTokenCount, 3);
  assert.match(result.content, /^\.theme \{/);
  assert.match(result.content, /--color-brand-primary: #3366ff;/);
  assert.match(result.content, /--color-overlay-scrim: #00000080;/);
  assert.match(result.content, /--spacing-md: 16px;/);
  assert.deepEqual(result.warnings, [
    "Skipped typography.body: typography tokens are not supported in CSS export yet.",
  ]);
}

function testTailwindExportMapsThemeSections() {
  const result = exportDesignTokens(tokens, context, { format: "tailwind" });
  const content = JSON.parse(result.content);

  assert.equal(result.exportedTokenCount, 3);
  assert.equal(content.theme.extend.colors["brand.primary"], "#3366ff");
  assert.equal(content.theme.extend.colors["overlay.scrim"], "#00000080");
  assert.equal(content.theme.extend.spacing.md, "16px");
  assert.deepEqual(result.warnings, [
    "Skipped typography.body: typography token cannot be represented in Tailwind theme export.",
  ]);
}

testDefaultJsonExportIncludesAllTokens();
testDtcgExportWithMetadataAndFiltering();
testCssExportSerializesSupportedTokens();
testTailwindExportMapsThemeSections();

console.log("tokenExport.test.mjs: 4 passed");
