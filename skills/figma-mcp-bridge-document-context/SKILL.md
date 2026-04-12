---
name: figma-mcp-bridge-document-context
description: Use when you need the current page tree, current selection, file metadata, a depth-limited design context, or a specific node from Figma MCP Bridge without guessing node IDs.
---

# Figma MCP Bridge Document Context

## Overview

这个 skill 负责“读设计结构”，覆盖 `get_document`、`get_selection`、`get_node`、`get_metadata`、`get_design_context`。它的重点不是多列工具名，而是避免代理在没有上下文时乱猜 `nodeId`。

## Use It For

- 先理解当前页、当前选区或页面列表
- 用较小成本拿到适合 AI 推理的设计上下文
- 在已有可靠 `nodeId` 的前提下查询单节点详情
- 决定该从“完整树”还是“局部压缩树”切入

## Core Rules

- 想知道“当前在看哪里”，先调 `get_metadata`。
- 想知道“当前选中了什么”，先调 `get_selection`。
- 想让上下文更适合模型理解，优先 `get_design_context`，必要时再提高 `depth`。
- 只有确实需要完整页面树时才用 `get_document`。
- `get_node` 只在你已经拿到合法 `nodeId` 时使用。

## References

- [DISCOVERY_WORKFLOWS.md](./DISCOVERY_WORKFLOWS.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
