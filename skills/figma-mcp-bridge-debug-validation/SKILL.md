---
name: figma-mcp-bridge-debug-validation
description: Use when Figma MCP Bridge calls fail, time out, reject node IDs or output paths, or appear stuck on plugin connectivity, leader forwarding, or screenshot export validation.
---

# Figma MCP Bridge Debug Validation

## Overview

这个 skill 负责把错误先归类，再决定查连接、查参数还是查文件系统规则。它覆盖 server 侧 bridge/election/leader/follower 行为，以及插件端最常见的报错面。

## Use It For

- 报 `Plugin not connected`
- 报 `Request timed out`
- 报 `Node ID must use colon format`
- 报 `No nodes to export`
- 报 `outputPath must be inside...` 或 `File already exists...`
- follower/leader 切换后行为异常

## Triage Order

1. 先查插件是否已打开并连上 `ws://localhost:1994/ws`。
2. 再查请求参数是否符合 schema。
3. 再查节点是否真实存在或当前选区是否为空。
4. 涉及导出落盘时，再查 `outputPath`、扩展名和文件覆盖。
5. 如果像是转发问题，再看 leader/follower 路由链。

## References

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
