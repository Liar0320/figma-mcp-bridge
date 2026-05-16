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

test("all MCP tool schemas accept optional fileKey", () => {
  const knownTools = [
    "get_document",
    "get_selection",
    "get_node",
    "get_styles",
    "get_metadata",
    "get_local_components",
    "get_components",
    "get_design_context",
    "get_variable_defs",
    "get_design_tokens",
    "get_token_usage",
    "audit_design_tokens",
    "propose_design_tokens",
    "export_design_tokens",
    "create_design_tokens",
    "apply_tokens",
    "get_screenshot",
    "save_screenshots",
    "create_frame",
    "create_component",
    "create_instance",
    "swap_instance_component",
    "create_text",
    "create_rectangle",
    "append_children",
    "find_nodes",
    "batch_mutation",
    "set_position",
    "set_size",
    "set_fills",
    "set_strokes",
    "set_corner_radius",
    "set_text_content",
    "set_text_style",
    "set_layout_mode",
    "set_padding",
    "set_item_spacing",
    "set_node_name",
    "rename_node",
    "delete_node",
  ];

  for (const tool of knownTools) {
    assert.ok(toolInputSchemas[tool], `${tool} should have an input schema`);
    assert.ok(
      "fileKey" in toolInputSchemas[tool].shape,
      `${tool} should expose optional fileKey`
    );
  }
});

test("component inventory schemas expose bounded pagination fields", () => {
  for (const tool of ["get_local_components", "get_components"]) {
    const schema = toolInputSchemas[tool];
    assert.ok("limit" in schema.shape, `${tool} should expose limit`);
    assert.ok("pageId" in schema.shape, `${tool} should expose pageId`);
    assert.ok("cursor" in schema.shape, `${tool} should expose cursor`);
    assert.ok("maxDurationMs" in schema.shape, `${tool} should expose maxDurationMs`);

    assert.doesNotThrow(() =>
      schema.parse({ fileKey: "file-a", limit: 25, pageId: "1:2", cursor: "1", maxDurationMs: 5000 })
    );
    assert.throws(() => schema.parse({ limit: 0 }), /Number must be greater than or equal to 1/);
  }
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
