import assert from "node:assert/strict";
import test from "node:test";
import { Bridge } from "../dist/bridge.js";
import { toolInputSchemas } from "../dist/schema.js";
import { Leader } from "../dist/leader.js";
import { Follower } from "../dist/follower.js";

class FakeSocket {
  constructor(fileKey) {
    this.fileKey = fileKey;
    this.lastRequest = undefined;
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
    this.lastRequest = request;
    queueMicrotask(() => {
      this.handlers.get("message")?.(
        Buffer.from(
          JSON.stringify({
            type: request.type,
            requestId: request.requestId,
            params: request.params,
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
    "find_canvas_slot",
    "migrate_component_set",
    "repair_component_set",
    "clone_component_set",
    "merge_component_sets",
    "split_component_set",
    "migrate_instances",
    "reconcile_component_set",
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
test("set_layout_mode accepts optional primary-axis sizing mode", () => {
  const schema = toolInputSchemas.set_layout_mode;
  assert.doesNotThrow(() => schema.parse({
    nodeId: "1:2",
    layoutMode: "HORIZONTAL",
    primaryAxisSizingMode: "AUTO",
  }));
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

test("follower ICON scene reaches plugin with resolved SVG", async () => {
  const leader = new Leader(0);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url).startsWith("https://api.iconify.design/")
    ? Promise.resolve(new Response('<svg viewBox="0 0 24 24"></svg>', { status: 200 }))
    : originalFetch(url, options);
  try {
    await leader.start();
    const socket = attach(leader.getBridge(), "file-a", "File A");
    const follower = new Follower(`http://localhost:${leader.server.address().port}`);
    await follower.sendWithParams("create_scene", undefined, {
      nodes: [{ ref: "root", type: "FRAME", children: [{ ref: "icon", type: "ICON", props: { name: "activity" } }] }],
      dryRun: true,
    }, "file-a");
    assert.equal(socket.lastRequest.params.nodes[0].children[0].props.iconSet, "lucide");
    assert.match(socket.lastRequest.params.nodes[0].children[0].props.svg, /^<svg/);
  } finally {
    leader.stop();
    globalThis.fetch = originalFetch;
  }
});


test("follower batch ICON operations resolve bundled SVG once and preserve inline SVG", async () => {
  const leader = new Leader(0);
  const originalFetch = globalThis.fetch;
  const originalSource = process.env.FIGMA_BRIDGE_ICON_SOURCE;
  let iconFetchCount = 0;
  process.env.FIGMA_BRIDGE_ICON_SOURCE = "bundled";
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.iconify.design/")) {
      iconFetchCount += 1;
      throw new Error("network must not be used");
    }
    return originalFetch(url, options);
  };
  try {
    await leader.start();
    const socket = attach(leader.getBridge(), "file-a", "File A");
    const follower = new Follower(`http://localhost:${leader.server.address().port}`);
    const inlineSvg = "<svg viewBox=\"0 0 1 1\"></svg>";
    await follower.sendWithParams("batch_mutation", undefined, {
      failureMode: "atomic",
      operations: [
        { type: "create_icon", ref: "tmp:bundled", params: { name: "activity" } },
        { type: "create_icon", ref: "tmp:inline", params: { svg: inlineSvg, name: "inline" } },
      ],
    }, "file-a");
    assert.equal(iconFetchCount, 0);
    const operations = socket.lastRequest.params.operations;
    assert.match(operations[0].params.svg, /^<svg/);
    assert.equal(operations[0].params.source, "bundled");
    assert.equal(operations[1].params.svg, inlineSvg);
  } finally {
    leader.stop();
    globalThis.fetch = originalFetch;
    if (originalSource === undefined) delete process.env.FIGMA_BRIDGE_ICON_SOURCE;
    else process.env.FIGMA_BRIDGE_ICON_SOURCE = originalSource;
  }
});
test("component migration schemas enforce deterministic inputs", () => {
  const migrate = toolInputSchemas.migrate_component_set;
  assert.doesNotThrow(() => migrate.parse({ componentSetId: "1:2", dryRun: true, cloneBeforeMutate: true, dimensions: [{ action: "rename", name: "State", newName: "Mode" }] }));
  assert.throws(() => migrate.parse({ componentSetId: "1:2", dimensions: [{ action: "rename", name: "State" }] }), /newName/);
  const split = toolInputSchemas.split_component_set;
  assert.doesNotThrow(() => split.parse({ componentSetId: "1:2", groups: [{ name: "A", componentIds: ["1:3"] }] }));
});
