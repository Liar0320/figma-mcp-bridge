import assert from "node:assert/strict";
import test from "node:test";
import { Bridge } from "../dist/bridge.js";
import { toolInputSchemas } from "../dist/schema.js";

class FakeSocket {
  constructor(fileKey) {
    this.fileKey = fileKey;
    this.readyState = 1;
    this.handlers = new Map();
    this.closed = false;
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  send(payload, cb) {
    const request = JSON.parse(payload);
    queueMicrotask(() => {
      this.handlers.get("message")?.(
        Buffer.from(
          JSON.stringify({
            type: request.type,
            requestId: request.requestId,
            data: { fileKey: this.fileKey, requestType: request.type },
          })
        )
      );
    });
    cb?.();
  }
}

function attach(bridge, fileKey, fileName) {
  const socket = new FakeSocket(fileKey);
  bridge.handleConnection(socket, fileKey, fileName);
  return socket;
}

test("set_layout_mode accepts optional primary-axis sizing mode", () => {
  const schema = toolInputSchemas.set_layout_mode;
  assert.throws(() => schema.parse({
    nodeId: "1:2",
    layoutMode: "HORIZONTAL",
    primaryAxisSizingMode: "HUG",
  }));
});

test("bridge routes explicit fileKey and fails closed when ambiguous", async () => {
  const bridge = new Bridge();
  attach(bridge, "file-a", "File A");
  attach(bridge, "file-b", "File B");

  assert.deepEqual(bridge.listConnectedFiles(), [
    { fileKey: "file-a", fileName: "File A" },
    { fileKey: "file-b", fileName: "File B" },
  ]);

  await assert.rejects(
    bridge.send("get_metadata"),
    /Multiple files connected.*fileKey/i
  );

  const response = await bridge.sendWithParams(
    "get_metadata",
    undefined,
    undefined,
    "file-a"
  );
  assert.equal(response.data.fileKey, "file-a");

  await assert.rejects(
    bridge.sendWithParams("get_metadata", undefined, undefined, "missing"),
    /No plugin connected for fileKey "missing"/
  );

  bridge.close();
});


test("component migration schemas enforce deterministic inputs", () => {
  const migrate = toolInputSchemas.migrate_component_set;
  assert.doesNotThrow(() => migrate.parse({ componentSetId: "1:2", dryRun: true, cloneBeforeMutate: true, dimensions: [{ action: "rename", name: "State", newName: "Mode" }] }));
  assert.throws(() => migrate.parse({ componentSetId: "1:2", dimensions: [{ action: "rename", name: "State" }] }), /newName/);
  const split = toolInputSchemas.split_component_set;
  assert.doesNotThrow(() => split.parse({ componentSetId: "1:2", groups: [{ name: "A", componentIds: ["1:3"] }] }));
});
