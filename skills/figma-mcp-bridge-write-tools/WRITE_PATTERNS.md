# Write Patterns

## Single-property update

1. Verify the target node.
2. Choose the specific setter.
3. Validate input format.
4. Execute the write.
5. Read back the node or relevant usage data.

## Multi-step creation

Use `batch_mutation` when multiple operations depend on newly created nodes.

```json
[
  { "type": "create_frame", "ref": "tmp:card", "params": { "name": "Card", "width": 320, "height": 180 } },
  { "type": "create_text", "ref": "tmp:title", "params": { "parentId": "tmp:card", "characters": "Title" } }
]
```

## Temporary references

- Temporary refs must start with `tmp:`.
- A ref must be declared before it is used.
- Duplicate refs should be treated as invalid.
- A batch can contain at most 100 operations.

## Deletion

Only call `delete_node` after the target node ID has been confirmed. Prefer reading the node first and reporting its name/type before deletion.

## Verification

After mutation, use `get_node`, `get_design_context`, `get_token_usage`, or another relevant read tool to confirm the expected state.
