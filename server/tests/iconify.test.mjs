import assert from "node:assert/strict";
import test from "node:test";
import { toolInputSchemas, validateRpc } from "../dist/schema.js";
import { resolveIconifyIcon } from "../dist/iconify.js";

test("create_icon defaults to the lucide icon set and dry-run", () => {
  const result = toolInputSchemas.create_icon.safeParse({ name: "activity" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.iconSet, "lucide");
    assert.equal(result.data.size, 24);
    assert.equal(result.data.dryRun, true);
  }
});

test("create_icon rejects malformed node IDs and colors", () => {
  assert.equal(toolInputSchemas.create_icon.safeParse({ name: "activity", parentId: "1-2" }).success, false);
  assert.equal(toolInputSchemas.create_icon.safeParse({ name: "activity", color: "blue" }).success, false);
  assert.equal(validateRpc("create_icon", undefined, { name: "activity" }), null);
});

test("resolveIconifyIcon validates and returns an Iconify SVG", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<svg viewBox="0 0 24 24"></svg>', {
    status: 200,
    headers: { "content-type": "image/svg+xml" },
  })) ;
  try {
    const icon = await resolveIconifyIcon("lucide", "activity");
    assert.equal(icon.sourceUrl, "https://api.iconify.design/lucide/activity.svg");
    assert.match(icon.svg, /^<svg/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
