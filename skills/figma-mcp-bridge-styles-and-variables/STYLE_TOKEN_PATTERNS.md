## Style And Token Patterns

### `get_styles` 返回什么

- `paints`
- `text`
- `effects`
- `grids`

它适合回答：

- 这个文件有哪些本地样式？
- 有哪些 text style / effect style / grid style？
- 某个 style 名字和基础视觉属性是什么？

### `get_variable_defs` 返回什么

- `collections`
- 每个 collection 下的 `modes`
- 每个 variable 的 `id`、`name`、`resolvedType`
- `valuesByMode`

它适合回答：

- 这个文件有哪些变量集合？
- 每个 mode 的 token 值是什么？
- 哪些 token 是 alias 到别的变量？

### `get_design_tokens` 返回什么

- 一个统一的 token graph
- 每个 token 都有稳定 `path`，例如 `color.brand.primary`
- 每个 token 都保留 `source: "variable" | "style" | "inferred"`
- variable token 保留 collection、modes、valuesByMode、alias 信息
- style token 保留 paint/text/effect/grid 的 styleType 与原始属性摘要
- summary 按 source 和 group 汇总数量

它适合回答：

- 给 AI 的设计系统 token 概览是什么？
- 这个文件有哪些颜色/字体/spacing/radius token？
- 哪些 token 来自 variables，哪些来自 styles？

### 解释变量值时的防错点

- 如果值里出现 `type: "VARIABLE_ALIAS"`，说明这是引用，不是最终展开值。
- 如果值里出现 `type: "COLOR"`，说明插件已把颜色对象结构化返回。
- 不要假设所有 mode 都有同构值；需要逐个 mode 看。

### 推荐回答套路

1. 先判断用户需要 raw 数据还是统一 token graph。
2. 统一设计系统概览优先用 `get_design_tokens`。
3. raw styles 用 `get_styles` 分类汇总。
4. raw variables 用 `get_variable_defs` 的 `collection -> mode -> variable` 结构汇总。
5. 如果用户关心 token 依赖关系，显式点出 alias。
6. 不要把 `source: "style"` 的 token 说成 Figma variable。
