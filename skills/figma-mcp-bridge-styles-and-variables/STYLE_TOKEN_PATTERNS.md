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

### 解释变量值时的防错点

- 如果值里出现 `type: "VARIABLE_ALIAS"`，说明这是引用，不是最终展开值。
- 如果值里出现 `type: "COLOR"`，说明插件已把颜色对象结构化返回。
- 不要假设所有 mode 都有同构值；需要逐个 mode 看。

### 推荐回答套路

1. 先分“styles”与“variables”两层。
2. styles 用分类汇总。
3. variables 用 `collection -> mode -> variable` 结构汇总。
4. 如果用户关心 token 依赖关系，显式点出 alias。
