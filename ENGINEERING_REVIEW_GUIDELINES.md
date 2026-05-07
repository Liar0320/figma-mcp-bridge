# 研发规范｜Figma MCP Bridge 手动实现与组内协作

> 适用项目：`figma-mcp-bridge`
> 适用对象：组内研发、Review 人、测试人员
> 核心目标：不依赖 AI 软件自动审查或自动修改，由研发人员手动实现、手动验证、手动 Review，保证 MCP 工具能力稳定、安全、可维护。

## 1. 规范目标

这份规范约束的是“人怎么开发这个项目”，不是“AI 怎么调用工具”。

组内研发需要做到：

1. **先明确需求边界，再写代码**：每个工具、字段、写入能力都必须说明使用场景、输入、输出、副作用和失败行为。
2. **读写分离**：读取类能力、审查类能力、写入类能力必须边界清楚，不能在只读工具里偷偷修改 Figma 文件。
3. **手动验证优先**：所有变更必须由研发在本地构建、测试、手动跑通插件链路后再提交 Review。
4. **小步提交，小 PR 合并**：每个 PR 聚焦一个明确能力，避免把读取、审查、写入、导出混在一起。
5. **风险显式化**：凡是会修改 Figma 文件、创建 token、绑定变量、删除节点、保存本地文件的能力，都必须在代码、文档和 PR 中明确标注副作用。

## 2. 项目分层职责

| 模块 | 职责 | 研发约束 |
| --- | --- | --- |
| `server/src/schema.ts` | 定义 MCP 工具入参 schema | 所有外部输入必须先过 Zod 校验；nodeId、颜色、format、scale、dryRun 等高风险参数必须有明确约束 |
| `server/src/tools.ts` | 注册 MCP 工具、描述工具行为、转发请求 | 工具描述必须写清楚是否只读、是否有副作用、是否默认 dry-run |
| `server/src/bridge.ts` | 管理 WebSocket 请求、超时、pending 请求 | 不允许业务工具绕过 bridge 直接访问插件；超时和错误语义要统一 |
| `server/src/leader.ts` / `follower.ts` / `node.ts` / `election.ts` | leader/follower 转发和健康检查 | 不把业务逻辑塞进集群/转发层 |
| `plugin/src/main/code.ts` | Figma 插件请求分发入口 | 每个 request type 必须有清晰分支、错误处理和返回结构 |
| `plugin/src/main/serializer.ts` | Figma 节点、样式、变量序列化 | 新增字段要控制体积，避免把整个 Figma 对象无节制返回 |
| `plugin/src/main/write.ts` | 节点创建、修改、删除、批量 mutation | 所有会修改 Figma 文件的逻辑必须集中管理，不能散落在请求分发层 |
| `plugin/src/main/token*.ts` | token 读取、usage、audit、propose、create、apply、export | 只读、dry-run、实际写入必须分层，不允许混淆；`propose`/`export` 不能写入 Figma |
| `plugin/tests/*.test.mjs` | 插件侧行为测试 | 新工具、新字段、新写入路径必须补测试 |

## 3. 工具分类规范

### 3.1 只读工具

只读工具只能读取 Figma 文件状态，不能修改节点、变量、样式或本地文件。

包括但不限于：

- `get_document`
- `get_selection`
- `get_node`
- `get_styles`
- `get_metadata`
- `get_design_context`
- `get_variable_defs`
- `get_design_tokens`
- `get_token_usage`
- `audit_design_tokens`
- `propose_design_tokens`
- `export_design_tokens`

研发要求：

1. 返回值结构稳定，字段命名一致。
2. 空选区、空页面、节点不存在时要返回可理解错误或空结果，不允许崩溃。
3. 不允许在只读工具中调用任何会修改 Figma 的 API。
4. 审计和 propose 类工具只能给建议，不能自动创建或绑定 token。

### 3.2 文件副作用工具

这类工具不修改 Figma，但会写本地文件。

当前代表：

- `save_screenshots`

研发要求：

1. `outputPath` 必须有路径约束，避免写到不可控目录。
2. 文件覆盖策略必须明确。
3. 返回结果必须包含实际保存路径、格式、scale、节点 ID。
4. PR 中必须说明这是“本地文件副作用”，不是纯读取。

### 3.3 Figma 写入工具

写入工具会直接修改当前 Figma 文件。

包括但不限于：

- `create_frame`
- `create_text`
- `create_rectangle`
- `append_children`
- `set_position`
- `set_size`
- `set_fills`
- `set_strokes`
- `set_corner_radius`
- `set_text_content`
- `set_text_style`
- `set_layout_mode`
- `set_padding`
- `set_item_spacing`
- `set_node_name` / `rename_node`
- `delete_node`
- `batch_mutation`
- `create_design_tokens` with `dryRun=false`
- `apply_tokens` with `dryRun=false`

研发要求：

1. 写入参数必须严格校验。
2. 能 dry-run 的工具必须默认 dry-run。
3. `delete_node` 这类不可逆操作必须有单独测试和文档说明。
4. `batch_mutation` 必须明确执行顺序、临时 ref 规则、失败策略。
5. 部分失败是否回滚必须明确；如果不回滚，必须写进工具描述和文档。

## 4. 参数设计规范

### 4.1 nodeId

所有传入工具的 Figma nodeId 必须使用冒号格式：

```text
4029:12345
```

禁止使用：

```text
4029-12345
```

研发要求：

1. schema 中统一使用 `^\d+:\d+$` 校验。
2. 错误提示必须告诉使用者正确格式。
3. 文档示例必须全部使用冒号格式。

### 4.2 颜色

颜色参数必须使用：

```text
#RRGGBB
#RRGGBBAA
```

研发要求：

1. 不接受 `rgb()`、`rgba()`、颜色名称、短 hex。
2. alpha 的语义要统一：要么用 `#RRGGBBAA`，要么用单独 `opacity`，不能混乱。
3. 测试必须覆盖非法颜色。

### 4.3 dryRun

凡是“可能创建、绑定、应用、批量修改”的工具，必须考虑 dry-run。

研发要求：

1. 默认值应尽量是 `dryRun=true`。
2. dry-run 返回的 plan 要足够具体，包含将要修改的节点、属性、token 或 style。
3. 实际执行需要显式 `dryRun=false`。

### 4.4 batch mutation ref

`batch_mutation` 中的临时引用必须使用：

```json
{
  "ref": "tmp:card"
}
```

后续引用：

```json
{
  "nodeId": "tmp:card"
}
```

研发要求：

1. 临时 ref 必须先声明再引用。
2. 裸字符串如 `"card"` 不能被当成临时 ref。
3. batch 最多 100 个操作。
4. 测试必须覆盖 ref 顺序错误、重复 ref、引用不存在 ref。

## 5. 新工具开发流程

新增 MCP 工具必须按以下顺序开发：

### Step 1：写清楚工具设计

在开发前先明确：

```markdown
## 工具设计
- 工具名称：
- 工具类型：只读 / 文件副作用 / Figma 写入
- 使用场景：
- 输入参数：
- 返回结构：
- 是否 dry-run：
- 失败场景：
- 是否需要更新 README / skills / 测试：
```

### Step 2：定义 schema

先改：

```text
server/src/schema.ts
```

要求：

1. 所有必填字段明确。
2. 所有枚举值明确。
3. 高风险字段有格式校验。
4. 错误消息可读。

### Step 3：注册 server tool

再改：

```text
server/src/tools.ts
```

要求：

1. 工具描述要写清楚边界和副作用。
2. 使用统一的响应封装。
3. 不在 server 层做 Figma 业务逻辑。

### Step 4：实现插件请求

再改：

```text
plugin/src/main/code.ts
plugin/src/main/*.ts
```

要求：

1. 请求类型命名与工具名称保持一致。
2. 插件侧逻辑分模块实现，避免 `code.ts` 变成大杂烩。
3. 异常要能返回到 server，不要静默失败。

### Step 5：补测试

至少覆盖：

1. 正常路径。
2. 空输入 / 空选区。
3. 非法 nodeId。
4. 非法颜色 / format / scale。
5. 节点不存在。
6. dry-run 与实际执行差异。
7. batch 部分失败场景。

### Step 6：更新文档

需要同步检查：

- `README.md`
- `skills/*`
- 本规范文档
- PR 描述

## 6. 手动验证流程

每个研发在提交 PR 前必须手动完成以下验证。

### 6.1 基础检查

```bash
git status --short
cd server && npm run build
cd ../plugin && npm run build
npm test
```

如果本地缺少依赖，先执行：

```bash
cd server && npm install
cd ../plugin && npm install
```

### 6.2 插件链路手动验证

1. 构建 server。
2. 构建 plugin。
3. 在 AI 工具或 MCP 客户端中启动本地 server：

```json
{
  "figma-bridge": {
    "command": "node",
    "args": ["/path/to/figma-mcp-bridge/server/dist/index.js"]
  }
}
```

4. 在 Figma 中导入并运行：

```text
/path/to/figma-mcp-bridge/plugin/manifest.json
```

5. 手动验证：

- 插件能连接 `ws://localhost:1994/ws`。
- `get_metadata` 能返回文件名和页面信息。
- `get_selection` 能返回当前选区。
- 新增工具能返回预期结果。
- 写入工具只在明确执行时修改 Figma。

### 6.3 写入工具专项验证

如果 PR 涉及写入，必须准备一个测试 Figma 文件或测试页面，手动验证：

1. 创建节点是否在当前页面。
2. 修改属性是否只影响目标节点。
3. 删除节点是否仅删除指定节点。
4. batch mutation 顺序是否符合预期。
5. 失败时是否有明确错误。
6. 不支持的节点类型是否能安全失败。

## 7. PR 规范

### 7.1 PR 拆分原则

一个 PR 只做一类事情：

- 读取能力一个 PR。
- usage mapping 一个 PR。
- audit 一个 PR。
- propose 一个 PR。
- create token 一个 PR。
- apply token 一个 PR。
- export 一个 PR。
- 写入工具增强一个 PR。
- 文档更新一个 PR。

禁止一个 PR 同时包含：

- 大量重构；
- 新工具；
- 写入行为变化；
- 文档大改；
- 无关格式化。

### 7.2 PR 描述模板

```markdown
## Summary
- ...

## Tool Type
- [ ] Read-only
- [ ] Local file side effect
- [ ] Figma write

## Behavior
- Inputs:
- Outputs:
- Side effects:
- Failure modes:

## Validation
- [ ] `cd server && npm run build`
- [ ] `cd plugin && npm run build`
- [ ] `cd plugin && npm test`
- [ ] Manual Figma plugin verification

## Risks
- ...
```

### 7.3 Review 人检查清单

Review 人必须检查：

- [ ] 工具分类是否正确。
- [ ] schema 是否覆盖所有外部输入。
- [ ] 工具描述是否写清副作用。
- [ ] 插件侧是否有明确错误处理。
- [ ] 是否有测试覆盖关键路径。
- [ ] 是否存在只读工具偷偷写入。
- [ ] 写入工具是否误伤非目标节点。
- [ ] README / skills / 研发规范是否同步更新。
- [ ] `propose_design_tokens` / `export_design_tokens` 等只读工具是否无 Figma 写入。
- [ ] `create_design_tokens` / `apply_tokens` 是否默认 dry-run，且 `dryRun=false` 的真实写入边界清楚。
- [ ] PR 是否过大，是否需要拆分。

## 8. 问题分级

| 级别 | 定义 | 示例 | 处理要求 |
| --- | --- | --- | --- |
| P0 | 会导致 Figma 文件被误改、节点误删、token 错绑、工具不可用 | 未确认目标就删除节点；schema 漏校验导致错误写入 | 阻断合并 |
| P1 | 会导致工具结果错误、审计误判、批量操作不可靠 | exact value 被误认为 token bound；batch 失败行为不明确 | 合并前修复 |
| P2 | 可维护性或文档一致性问题 | 工具描述不清；测试覆盖不足 | 建议合并前修复，或登记后续任务 |
| P3 | 体验和文案问题 | 错误提示不够友好；示例不够完整 | 可后续优化 |

## 9. Design Token 研发专项规范

### 9.1 能力分层

Token 相关能力必须按以下层级推进：

1. `get_design_tokens`：只读，建立 normalized token graph。
2. `get_token_usage`：只读，扫描节点实际使用情况。
3. `audit_design_tokens`：只读，输出问题和建议。
4. `propose_design_tokens`：只读，提出 token 建议。
5. `create_design_tokens`：默认 dry-run，显式执行才创建。
6. `apply_tokens`：默认 dry-run，显式执行才绑定或应用。
7. `export_design_tokens`：只读导出，不修改 Figma。

### 9.2 禁止混淆的概念

研发和 Review 中必须区分：

- `boundVariable`：节点属性已经绑定变量。
- `style`：节点属性使用 Figma style。
- `exactValue`：节点值与某个 token 值相同，但不代表已绑定。
- `none`：没有匹配 token。
- `unbound value`：可治理问题，不等于 bug。
- `duplicate token value`：可能需要治理，但不能自动删除。

### 9.3 Token 写入要求

`create_design_tokens` 和 `apply_tokens` 必须满足：

1. 默认 dry-run。
2. dry-run plan 必须可人工审查。
3. 实际执行必须显式 `dryRun=false`。
4. 冲突策略必须明确。
5. 写入后必须能重新读取并验证结果。

## 10. 禁止事项

组内研发禁止以下行为：

1. 不写 schema，直接接收任意 JSON。
2. 只在 README 写工具，源码没有对应实现。
3. 只改 server，不改 plugin 请求分发。
4. 只改 plugin，不注册 MCP tool。
5. 只实现功能，不补测试。
6. 在只读工具里修改 Figma 文件。
7. 将 `exactValue` 当作已绑定 token。
8. 隐藏写入副作用。
9. 在一个 PR 中混入无关重构。
10. 本地没有构建和测试就提交 Review。

## 11. 最低合并标准

一个 PR 至少满足：

- 代码职责边界清晰。
- schema、server tool、plugin handler 三层一致。
- 关键路径有测试。
- README 或相关文档已同步。
- 本地构建通过。
- plugin 测试通过。
- 如果涉及 Figma 写入，已做手动插件验证。
- PR 描述清楚说明行为、风险和验证结果。

这份规范的目的不是增加流程负担，而是让组内每个人都能用同一套标准判断：这个工具能不能合并、有没有误写风险、能不能长期维护。
