# Coding-create scripts

The server exposes an `execute_script` MCP capability for multi-step UI creation. It persists inline JavaScript under the server's local `artifacts/scripts/` directory, then runs it with a restricted `figma` SDK that forwards allowlisted operations through the existing bridge. Scripts are intended to be saved, rerun, and edited when a step fails.

The SDK includes common creation, mutation, query, and batch methods. Each call is recorded in the returned run report with a step index, operation name, and status. Errors include the saved script path, step context, and the underlying bridge error when available.

This is not unrestricted JavaScript execution. Script code runs in a constrained VM context without host `process`, filesystem, child-process, or network APIs. The runner enforces a bounded timeout and only reads or writes paths inside the server artifact root. `fileKey` is passed to each bridge call for multi-file routing.

Use direct MCP tools for short one-off operations. Prefer `execute_script` for multi-step, reproducible coding-create work. Existing mutations to nodes are not fully transactional; `batch_mutation` retains its existing creation rollback behavior.
