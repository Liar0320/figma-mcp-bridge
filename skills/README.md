## Figma MCP Bridge Skills

这套 repo-local skills 面向 `figma-mcp-bridge` 仓库，用于把这个 MCP 仓库的真实调用经验沉淀成可复用的触发式指导，而不是把 [README.md](../README.md) 换个说法重写一遍。

### 为什么拆成多 skill

- 这个仓库的误用点不在源码目录，而在任务流：先拿页面/选区上下文，再决定是否按 nodeId 深挖，再决定要不要读 tokens，然后可能执行写入操作，最后才可能导出截图或落盘。
- 高风险参数集中在 `nodeId`、`nodeIds`、`outputPath`、`format`、`scale`、颜色格式和插件连接状态，单个 skill 很容易把这些规则讲混。
- `save_screenshots` 是唯一带本地文件副作用的读取工具；写入工具（`create_*`、`set_*`、`delete_node`、`batch_mutation`）会直接修改 Figma 文件，有不同的安全边界。

### Skill 列表

- `figma-mcp-bridge-tools-expert`
  入口路由 skill，负责选工具、排调用顺序、统一全局防错规则。
- `figma-mcp-bridge-document-context`
  负责页面树、当前选区、指定节点、元数据和 design context 查询。
- `figma-mcp-bridge-styles-and-variables`
  负责本地 styles 和 variables/tokens 的读取与解释。
- `figma-mcp-bridge-screenshot-export`
  负责 `get_screenshot` 与 `save_screenshots` 的选择、参数约束和落盘规则。
- `figma-mcp-bridge-write-tools`
  负责创建/修改/删除节点、属性 setter、`find_nodes` 和 `batch_mutation` 批量写操作。
- `figma-mcp-bridge-debug-validation`
  负责连接、参数、leader/follower 转发链路和常见失败诊断。

### 配套文档

- [INTAKE_AUDIT.md](./INTAKE_AUDIT.md)
  这次 intake 的审计结论：工具族、主工作流、误用点和限制。
- [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md)
  这套 skills 的结构、内容和回测检查项。

### 怎么复用

- 在当前仓库中直接引用这些 `skills/*/SKILL.md` 即可。
- 如果要迁移到别的 agent skills 目录，优先整体复制 `skills/`，不要只拷单个 `SKILL.md`，否则 references 会断。
- 后续如果仓库新增更多导出格式或插件连接模式，先更新 `INTAKE_AUDIT.md`，再调整相关 skill，而不是直接往 `SKILL.md` 塞细节。
