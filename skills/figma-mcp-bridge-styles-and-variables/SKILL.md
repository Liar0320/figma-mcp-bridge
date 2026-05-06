---
name: figma-mcp-bridge-styles-and-variables
description: Use when you need Figma styles, variable collections, normalized token graph, token usage/audit/proposal/export workflows, or dry-run-first token create/apply operations from Figma MCP Bridge.
---

# Figma MCP Bridge Styles And Variables

## Overview

这个 skill 专门处理设计系统与 design token 工具链，覆盖 `get_styles`、`get_variable_defs`、`get_design_tokens`、`get_token_usage`、`audit_design_tokens`、`propose_design_tokens`、`create_design_tokens`、`apply_tokens` 和 `export_design_tokens`。核心目标是防止把 local styles、variables/tokens、实际节点 usage、只读治理建议和真实写入混为一体。

## Use It For

- 读取当前文件的本地颜色、文字、效果、栅格样式
- 读取变量集合、modes、变量值与 alias
- 解释某个文件里的 token 组织方式
- 扫描当前 selection/page/nodeIds 的 token 使用情况与覆盖率
- 审计 token coverage、unbound usage、exact-value-only、duplicate token value 等治理问题
- 基于重复值或 audit 结果提出 token 建议，但不写入 Figma
- 创建或应用 token 前先生成 dry-run plan
- 导出 JSON、DTCG、CSS variables 或 Tailwind token 数据
- 从“视觉样式”与“设计 token”两个维度分别建模

## Core Rules

- `get_styles` 负责 raw local styles，不负责变量集合。
- `get_variable_defs` 负责 raw variables/tokens，不负责 paint/text/effect/grid style 实体。
- `get_design_tokens` 负责统一后的 token graph：同时包含 variables 与 styles，但必须保留 `source` 字段区分来源。
- `get_token_usage` 负责实际节点 usage mapping：扫描 selection、current page 或显式 nodeIds，把节点属性映射到 token，match 类型包括 `boundVariable`、`style`、`exactValue`、`none`。
- `audit_design_tokens` 负责只读治理审计，输出 issues、recommendations 和 coverage summary。
- `propose_design_tokens` 负责只读建议，不创建变量、不绑定节点。
- `create_design_tokens` 和 `apply_tokens` 是写入工作流，默认 dry-run；只有显式 `dryRun=false` 才能修改 Figma。
- `export_design_tokens` 负责只读序列化导出，不修改 Figma。
- 当用户问“设计系统都有哪些 token / 给 AI 用的 token 概览”时，优先用 `get_design_tokens`。
- 当用户问“哪些节点用了/没用 token、token 覆盖率、usage mapping”时，用 `get_token_usage`。
- 当用户问“设计系统健康检查 / token 治理问题”时，用 `audit_design_tokens`。
- 当用户问“建议创建哪些 token”时，用 `propose_design_tokens`，不要直接创建。
- 当用户问“创建 token / 应用 token”时，先用 `create_design_tokens` 或 `apply_tokens` 的默认 dry-run，并让用户或 reviewer 确认 plan 后再考虑 `dryRun=false`。
- 当用户问“导出 token 给代码/文档”时，用 `export_design_tokens`。
- 当用户问“Figma 原始变量集合/mode/alias”时，用 `get_variable_defs`。
- 当用户问“Figma 原始 local styles”时，用 `get_styles`。
- 变量值可能是普通值，也可能是 `VARIABLE_ALIAS` 或颜色对象，解析时要保留类型信息。

## References

- [STYLE_TOKEN_PATTERNS.md](./STYLE_TOKEN_PATTERNS.md)
- [../../docs/design-token-tools.md](../../docs/design-token-tools.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
