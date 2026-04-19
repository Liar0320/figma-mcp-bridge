---
name: figma-mcp-bridge-write-tools
description: Use when you need to create, modify, or delete nodes in Figma via MCP Bridge write tools, or when choosing between individual setters and batch_mutation.
---

# Figma MCP Bridge Write Tools

## Overview

这个 skill 负责所有写入操作：创建节点、修改属性、删除节点，以及通过 `batch_mutation` 批量执行。它的重点是防止在没有合法 `nodeId` 时直接调用 setter，以及正确使用 `tmp:` 引用跨操作传递新建节点的 ID。

## Use It For

- 创建 frame、text、rectangle 节点
- 修改节点的位置、尺寸、填充、描边、圆角、文字内容/样式、布局模式、内边距、间距
- 删除节点
- 在一次调用中有序执行多个写操作（`batch_mutation`）
- 查找当前页上的节点（`find_nodes`）

## Core Rules

- 写操作只作用于当前页面内的节点，不能跨页操作。
- 所有 `nodeId` 必须是冒号格式（`123:456`），不能用连字符。
- 调用 setter（`set_position`、`set_fills` 等）前，必须先有可靠的 `nodeId` 来源（`get_selection`、`get_document`、`find_nodes` 或 `batch_mutation` 的 `tmp:` 引用）。
- 需要在同一次调用中引用刚创建的节点时，用 `batch_mutation` + `ref: "tmp:xxx"` 临时引用，不要分两次调用。
- `batch_mutation` 最多 100 个操作，按顺序执行，部分失败不会回滚已成功的操作。
- `delete_node` 不可逆，执行前确认 `nodeId` 正确。

## References

- [WRITE_PATTERNS.md](./WRITE_PATTERNS.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
