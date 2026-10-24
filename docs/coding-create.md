# Coding-create scripts

`execute_script` is the reproducible coding-create entrypoint. It persists inline JavaScript under the server's local `artifacts/scripts/` directory and runs it with a restricted `figma` SDK. Scripts can be saved, rerun, and edited when a step fails.

## Choose the highest useful level

- **Declarative:** use `createComponentSet` for a new variant matrix. It accepts `dimensions`, sparse `variants`/`exclusions`, component `properties`, visual/layout templates, and performs postflight verification.
- **Asset:** use `createIcon` for bundled or Iconify icons; it creates an editable SVG node.
- **Primitive:** use `createFrame`, `createText`, `createRectangle`, setters, and `batch` for custom layouts or local fixes. Use `batch` for static ordered mutations.
- **Existing components:** use `combineAsVariants` only when components already exist. Do not manually create every variant for a new matrix.
- **Verification:** use `getNode`, `findNodes`, `validateLayout`, and `verifyComponentSet` after writes when the result matters.

`dimensions` define native VARIANT axes. `properties` define component properties such as `TEXT`, `BOOLEAN`, and `INSTANCE_SWAP`; a `TEXT` property named `Label` is bound to generated labels by `createComponentSet`.

## Example

```js
const icon = await figma.createIcon({
  name: "sparkles",
  iconSet: "lucide",
  size: 24,
  color: "#2563EB",
  dryRun: false,
});

const button = await figma.createComponentSet({
  target: {
    name: "Button",
    dimensions: [
      { name: "Type", values: ["Default", "Destructive", "Outline"] },
      { name: "Size", values: ["Small", "Default", "Large"] },
    ],
    variants: [
      { Type: "Default", Size: "Default" },
      { Type: "Destructive", Size: "Default" },
      { Type: "Outline", Size: "Default" },
      { Type: "Default", Size: "Small" },
      { Type: "Default", Size: "Large" },
    ],
    properties: [{ name: "Label", type: "TEXT", defaultValue: "Button" }],
  },
  dryRun: false,
});

const health = await figma.verifyComponentSet(button.componentSetId);
```

## Safety and debugging

This is not unrestricted JavaScript. Scripts do not receive host `process`, filesystem, child-process, or network APIs. Paths stay inside the server artifact root and execution has a bounded timeout. Each SDK call records its operation, source location, parameters, result, and normalized error. `fileKey` is passed to every bridge call for multi-file routing.

Use direct MCP tools for short one-off operations. Existing mutations are not fully transactional; `batch` retains its creation rollback behavior.
