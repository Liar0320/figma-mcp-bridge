---
name: figma-mcp-bridge-screenshot-export
description: Use when exporting selected Figma nodes as images, choosing between base64 output and filesystem saves, or handling format, scale, nodeIds, and outputPath constraints in Figma MCP Bridge.
---

# Figma MCP Bridge Screenshot Export

## Overview

这个 skill 负责截图导出相关工具：`get_screenshot` 和 `save_screenshots`。重点不是“怎么导出图片”本身，而是帮代理正确选择返回 base64 还是写文件，并且避免路径和格式冲突。

## Use It For

- 导出当前选中节点或指定节点
- 决定是拿 base64 结果还是直接保存本地文件
- 处理 `format`、`scale`、`nodeIds`、`outputPath` 这几个高风险参数
- 解释为什么图片导出失败

## Core Rules

- 只需要图像数据时，用 `get_screenshot`。
- 需要在本地落盘时，用 `save_screenshots`。
- 未传 `nodeIds` 时，两个导出路径都依赖当前选区。
- `save_screenshots` 是批量接口，核心输入是 `items[]`。
- `outputPath` 只能写到 server 当前工作目录里，且不会覆盖已有文件。

## References

- [EXPORT_PATTERNS.md](./EXPORT_PATTERNS.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
