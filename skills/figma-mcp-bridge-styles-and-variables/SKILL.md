---
name: figma-mcp-bridge-styles-and-variables
description: Use when you need local Figma styles, variable collections, modes, token values, or alias relationships from Figma MCP Bridge and must not confuse styles with variables.
---

# Figma MCP Bridge Styles And Variables

## Overview

这个 skill 专门处理设计系统数据读取，覆盖 `get_styles`、`get_variable_defs`、`get_design_tokens` 和 `get_token_usage`。核心目标是防止把 local styles、variables/tokens 和实际节点 usage 混为一体。

## Use It For

- 读取当前文件的本地颜色、文字、效果、栅格样式
- 读取变量集合、modes、变量值与 alias
- 解释某个文件里的 token 组织方式
- 扫描当前 selection/page/nodeIds 的 token 使用情况与覆盖率
- 从“视觉样式”与“设计 token”两个维度分别建模

## Core Rules

- `get_styles` 负责 raw local styles，不负责变量集合。
- `get_variable_defs` 负责 raw variables/tokens，不负责 paint/text/effect/grid style 实体。
- `get_design_tokens` 负责统一后的 token graph：同时包含 variables 与 styles，但必须保留 `source` 字段区分来源。
- `get_token_usage` 负责实际节点 usage mapping：扫描 selection、current page 或显式 nodeIds，把节点属性映射到 token，match 类型包括 `boundVariable`、`style`、`exactValue`、`none`。
- 当用户问“设计系统都有哪些 token / 给 AI 用的 token 概览”时，优先用 `get_design_tokens`。
- 当用户问“哪些节点用了/没用 token、token 覆盖率、usage mapping”时，用 `get_token_usage`。
- 当用户问“Figma 原始变量集合/mode/alias”时，用 `get_variable_defs`。
- 当用户问“Figma 原始 local styles”时，用 `get_styles`。
- 变量值可能是普通值，也可能是 `VARIABLE_ALIAS` 或颜色对象，解析时要保留类型信息。

## References

- [STYLE_TOKEN_PATTERNS.md](./STYLE_TOKEN_PATTERNS.md)
- [../INTAKE_AUDIT.md](../INTAKE_AUDIT.md)
