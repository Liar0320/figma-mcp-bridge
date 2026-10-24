import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm } from "node:fs/promises";
import { executeScript, resolveScriptPath, SCRIPT_ROOT } from "../dist/scriptRunner.js";

function fakeNode(responses = {}) {
  const calls = [];
  return {
    calls,
    sendWithParams: async (tool, nodeIds, params, fileKey) => {
      calls.push({ tool, nodeIds, params, fileKey });
      const response = responses[tool];
      return typeof response === "function" ? response({ tool, nodeIds, params, fileKey }) : { requestId: "req:test", data: response ?? { nodeId: "4029:12345" } };
    },
  };
}

test("execute_script persists source and routes SDK calls with fileKey", async () => {
  await rm(SCRIPT_ROOT, { recursive: true, force: true });
  const node = fakeNode({ create_frame: { nodeId: "4029:12345" } });
  const report = await executeScript(node, {
    filePath: "tests/create-dashboard.mjs",
    fileKey: "file:test",
    input: "const root = await figma.createFrame({ name: 'Dashboard' }); return root;",
  });

  assert.equal(report.ok, true);
  assert.equal(node.calls.length, 1);
  assert.equal(node.calls[0].tool, "create_frame");
  assert.equal(node.calls[0].nodeIds, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(node.calls[0].params)), { name: "Dashboard" });
  assert.equal(node.calls[0].fileKey, "file:test");
  assert.equal(await readFile(report.filePath, "utf8"), "const root = await figma.createFrame({ name: 'Dashboard' }); return root;");
  assert.equal(report.events[0].status, "succeeded");
});

test("execute_script rejects paths outside the artifact root", async () => {
  await assert.rejects(() => resolveScriptPath("../outside.mjs"), /remain inside/);
  await assert.rejects(() => resolveScriptPath("/tmp/outside.mjs"), /must be relative/);
});

test("execute_script reports a failed SDK step and source context", async () => {
  const node = fakeNode({
    set_size: () => ({ requestId: "req:failure", error: "width must be greater than 0" }),
  });
  const report = await executeScript(node, {
    filePath: "tests/failing-scene.mjs",
    input: "await figma.setSize('4029:12345', { width: -1, height: 100 });",
  });

  assert.equal(report.ok, false);
  assert.equal(report.error?.code, "BRIDGE_ERROR");
  assert.equal(report.error?.tool, "set_size");
  assert.equal(report.error?.requestId, "req:failure");
  assert.equal(report.events[0].status, "failed");
  assert.match(report.error?.message ?? "", /width must be greater/);
});

test("execute_script does not expose host process or require", async () => {
  const node = fakeNode();
  const report = await executeScript(node, {
    input: "return { process: typeof process, require: typeof require, figma: typeof figma };",
  });

  assert.equal(report.ok, true);
  assert.equal(report.result.process, "undefined");
  assert.equal(report.result.require, "undefined");
  assert.equal(report.result.figma, "object");
});
