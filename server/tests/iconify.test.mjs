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
  assert.equal(toolInputSchemas.batch_mutation.safeParse({ operations: [{ type: "create_icon", params: { svg: "<svg></svg>" } }] }).success, true);
});

test("bundled Lucide resolution is offline and reports bundled source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network must not be used"); };
  try {
    const icon = await resolveIconifyIcon("lucide", "activity", { sourceMode: "bundled" });
    assert.equal(icon.source, "bundled");
    assert.equal(icon.sourceUrl, undefined);
    assert.match(icon.svg, /currentColor/);
  } finally { globalThis.fetch = originalFetch; }
});

test("bundled mode fails clearly for unknown icons without fetching", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network must not be used"); };
  try { await assert.rejects(() => resolveIconifyIcon("lucide", "not-a-real-icon", { sourceMode: "bundled" }), /Bundled icon not found/); }
  finally { globalThis.fetch = originalFetch; }
});

test("remote mode preserves Iconify URL and validation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<svg viewBox="0 0 24 24"></svg>', { status: 200 });
  try {
    const icon = await resolveIconifyIcon("lucide", "activity", { sourceMode: "remote" });
    assert.equal(icon.source, "remote");
    assert.equal(icon.sourceUrl, "https://api.iconify.design/lucide/activity.svg");
    assert.match(icon.svg, /^<svg/);
  } finally { globalThis.fetch = originalFetch; }
});

test("fallback mode uses remote Iconify when bundle misses", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = async (url) => { requested = String(url); return new Response('<svg viewBox="0 0 24 24"></svg>', { status: 200 }); };
  try {
    const icon = await resolveIconifyIcon("lucide", "not-a-real-icon", { sourceMode: "fallback" });
    assert.equal(icon.source, "remote");
    assert.equal(requested, "https://api.iconify.design/lucide/not-a-real-icon.svg");
  } finally { globalThis.fetch = originalFetch; }
});
