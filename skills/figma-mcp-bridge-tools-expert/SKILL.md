---
name: figma-mcp-bridge-tools-expert
description: Use when working with Figma MCP Bridge and you need to choose the right tool, order document/style/screenshot/write calls, or avoid common nodeId, outputPath, color format, and plugin-connection mistakes.
---

# Figma MCP Bridge Tools Expert

## Overview

这个入口 skill 负责给 `figma-mcp-bridge` 做工具路由，而不是解释 Figma 设计本身。它先帮代理判断应该读页面上下文、读 styles/tokens、做截图导出，还是执行写入操作，并统一约束高风险参数。

## When to Use

- 用户说”这个 Figma bridge 该用哪个工具”
- 需要在 `get_document` / `get_design_context` / `get_node` 之间做选择
- 任务同时涉及 design context、styles、variables、截图导出、写入操作中的两类以上
- 调用总是报 `Plugin not connected`、`Node ID must use colon format`、`outputPath` 冲突之类的错误
- 需要创建、修改或删除 Figma 节点

## Default Order

1. 先确认插件与 bridge 连接正常。
2. 先拿当前页/选区上下文，再决定要不要深入某个节点。
3. 读取 styles 和 variables 时分开调用，不要假设一个工具能返回两者。
4. 需要图片时先决定返回 base64 还是直接保存到本地。
5. 需要写入时先确认目标 `nodeId` 来源，复杂操作用 `batch_mutation`。
6. 有报错时先分辨是连接问题、参数问题还是文件系统/写入问题。

## Hard Rules

- 不要在没有可靠来源时直接调用 `get_node` 或写入 setter；先从 `get_selection`、`get_document`、`get_design_context` 或 `find_nodes` 拿到合法 `nodeId`。
- `nodeId` / `nodeIds` 一律使用 `123:456` 这种冒号格式，不能写成连字符。
- 想要压缩后的设计树优先用 `get_design_context`，只有需要完整当前页树时才用 `get_document`。
- `get_styles` 只看 local styles；`get_variable_defs` 只看 variables/tokens；不要混为一个”设计系统总表”。
- `get_screenshot` 返回 base64；`save_screenshots` 才会落盘到本地文件系统。
- `save_screenshots` 的 `outputPath` 必须位于 MCP server 当前工作目录内部，而且已有文件不会被覆盖。
- 颜色必须用 `#RRGGBB` 或 `#RRGGBBAA` 格式。
- `batch_mutation` 中的 `tmp:` 引用必须先在前序操作的 `ref` 字段声明；部分失败不回滚。
- `delete_node` 不可逆，执行前确认 `nodeId` 正确。
- 写操作只作用于当前页面，不能跨页。

## References

- [TOOL_SELECTION.md](./TOOL_SELECTION.md)
- [SAFETY_RULES.md](./SAFETY_RULES.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
