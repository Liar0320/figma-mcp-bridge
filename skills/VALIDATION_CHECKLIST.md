## Validation Checklist

### 结构检查

- [ ] 每个 skill 目录都有 `SKILL.md`
- [ ] 每个 `SKILL.md` frontmatter 只有 `name` 和 `description`
- [ ] 每个 skill 的引用文档路径都存在
- [ ] `skills/README.md` 和实际目录结构一致

### 内容检查

- [ ] 主 skill 明确了默认调用顺序，而不是只列工具名
- [ ] 文档上下文 skill 明确了何时用 `get_design_context`、何时用 `get_document`
- [ ] 样式/变量 skill 明确区分 `get_styles` 与 `get_variable_defs`
- [ ] 截图 skill 明确区分 `get_screenshot` 与 `save_screenshots`
- [ ] debug skill 明确覆盖连接、参数、路径和导出冲突

### 仓库检查

- [ ] 未引入新依赖
- [ ] 未改动 server/plugin 运行逻辑
- [ ] `server` 构建通过
- [ ] `plugin` 构建通过

### 回测样例

1. “我只想知道当前页里在选中的节点长什么样，该用哪个工具？”
2. “我已经有 nodeId 了，想看这个节点的详细结构和样式。”
3. “我需要把当前文件的颜色 tokens 和变量 alias 都读出来。”
4. “我要导出两个节点到本地文件夹，为什么 `outputPath` 报错？”
5. “为什么 MCP 一直说插件没连上 / 请求超时？”

### 完成标准

- 这套 skill 能解释工具如何分工
- 这套 skill 能阻止最常见的 `nodeId` / `outputPath` / 连接状态误用
- 结构能迁移到别的 MCP 仓库
- 内容不是 README 的改写版
