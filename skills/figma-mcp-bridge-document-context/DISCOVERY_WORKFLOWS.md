# Discovery Workflows

## 1. Start from the current workspace

If the user says to inspect the current design or analyze the current page:

1. Call `get_metadata`.
2. Call `get_selection`.
3. If a selection exists, call `get_design_context`.
4. If no selection exists, decide between `get_design_context` and `get_document` based on the required scope.

## 2. Start from a node ID

Use this path only when an ID already came from one of these sources:

- A previous `get_selection` response.
- A `get_document` or `get_design_context` response.
- A user-provided ID in valid `123:456` format.

Then call `get_node`.

## 3. When to use `get_document`

Use it when you need the full current-page tree, need to scan page hierarchy, and can tolerate a larger response.

## 4. When to use `get_design_context`

Use it when you need a compact local design summary, want to reduce token noise, or need to control traversal depth.

## 5. Semantic differences

- `get_document` returns the current page document tree.
- `get_selection` returns only selected nodes.
- `get_design_context` centers on the selection when present, otherwise falls back to the current page, and truncates children according to `depth`.
