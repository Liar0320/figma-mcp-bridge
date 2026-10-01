import assert from "node:assert/strict";
import test from "node:test";
import { chunkMatrix, componentCompatibilityMatrix, createComponentFixture, createScreenshotReport } from "../dist-test/src/main/componentReliability.js";
import { beginOperation, finishOperation, getOperation, listOperations, markRolledBack, clearOperations } from "../dist-test/src/main/operationJournal.js";

test("chunkMatrix resumes deterministically", () => {
  const values = ["a", "b", "c", "d", "e"];
  const first = chunkMatrix(values, 2);
  assert.deepEqual(first.items, ["a", "b"]);
  assert.equal(first.nextCursor, "2");
  const second = chunkMatrix(values, 2, first.nextCursor);
  assert.deepEqual(second.items, ["c", "d"]);
  const last = chunkMatrix(values, 2, second.nextCursor);
  assert.deepEqual(last.items, ["e"]);
  assert.equal(last.complete, true);
  assert.throws(() => chunkMatrix(values, 2, "99"), /Invalid matrix cursor/);
});

test("fixtures cover healthy sparse duplicate and corrupted sets", () => {
  for (const kind of ["healthy", "sparse", "duplicate", "corrupted"]) {
    const fixture = createComponentFixture(kind);
    assert.equal(fixture.kind, kind);
    assert.ok(Number.isInteger(fixture.expected.componentCount));
  }
  assert.deepEqual(createComponentFixture("duplicate").expected.duplicateIds, ["2:1"]);
  assert.deepEqual(createComponentFixture("corrupted").expected.corruptedIds, ["bad"]);
});

test("journal records rollback eligibility and state transitions", () => {
  clearOperations();
  const entry = beginOperation("create_component", "req-1");
  finishOperation(entry, { nodeId: "1:2" });
  assert.equal(getOperation(entry.journalId)?.rollback?.supported, true);
  markRolledBack(entry);
  assert.equal(listOperations()[0].status, "rolled_back");
});

test("screenshot report is explicit about capture status", () => {
  const report = createScreenshotReport([{ nodeId: "1:1", format: "PNG", status: "missing" }], "baseline-a");
  assert.equal(report.version, 1);
  assert.equal(report.items[0].status, "missing");
  assert.equal(report.baseline, "baseline-a");
});

test("compatibility matrix marks native undo as unsupported", () => {
  const undo = componentCompatibilityMatrix.find((item) => item.capability === "native undo recovery");
  assert.equal(undo?.supported, false);
  assert.match(undo?.fallback ?? "", /RECOVERY_UNSUPPORTED/);
});

test("capability matrix explicitly lists unsupported Figma operations", () => {
  const unsupported = componentCompatibilityMatrix.filter((item) => !item.supported).map((item) => item.capability);
  assert.ok(unsupported.includes("remote library import"));
  assert.ok(unsupported.includes("pixel-level screenshot diff"));
  assert.ok(componentCompatibilityMatrix.filter((item) => !item.supported).every((item) => item.fallback));
});
