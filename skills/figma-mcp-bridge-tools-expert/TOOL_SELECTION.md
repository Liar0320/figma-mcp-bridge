## Tool Selection

### 按目标选工具

| 目标 | 首选工具 | 何时再补别的 |
| --- | --- | --- |
| 看当前页完整树 | `get_document` | 结果太大或只关心局部时改用 `get_design_context` |
| 看当前选中节点 | `get_selection` | 需要更多父子结构时补 `get_design_context` |
| 看一个明确 nodeId | `get_node` | 先确认 `nodeId` 来自别的查询结果 |
| 看文件名、页面列表、当前页信息 | `get_metadata` | 通常作为 discovery 起点 |
| 看压缩后的局部设计结构 | `get_design_context` | 可传 `depth`，默认比 `get_document` 更适合 AI 理解 |
| 看本地 paint/text/effect/grid styles | `get_styles` | 若要变量与 modes，另调 `get_variable_defs` |
| 看变量集合、modes、alias、token 值 | `get_variable_defs` | 和 `get_styles` 互补，不替代 |
| 看 normalized token graph | `get_design_tokens` | 比 `get_styles`/`get_variable_defs` 更适合 AI 统一理解设计系统 |
| 看节点 token 使用和覆盖率 | `get_token_usage` | 扫 selection/page/nodeIds，区分 `boundVariable`/`style`/`exactValue`/`none` |
| 做 token 治理审计 | `audit_design_tokens` | 只读，输出 coverage、issues 和 recommendations |
| 生成 token 建议 | `propose_design_tokens` | 只读建议，不创建变量或绑定节点 |
| 创建 token | `create_design_tokens` | 默认 dry-run；确认 plan 后才可显式 `dryRun=false` |
| 应用 token 到节点 | `apply_tokens` | 默认 dry-run；确认 nodeIds/plan 后才可显式 `dryRun=false` |
| 导出 token | `export_design_tokens` | 只读，支持 JSON/DTCG/CSS/Tailwind |
| 要图像二进制结果 | `get_screenshot` | 返回 base64，不落盘 |
| 要直接保存文件 | `save_screenshots` | 需要严格处理 `outputPath`、格式和覆盖规则 |
| 创建 frame/text/rectangle | `create_frame` / `create_text` / `create_rectangle` | 多步创建用 `batch_mutation` + `tmp:` 引用 |
| 修改节点属性 | 对应 setter（`set_fills`、`set_position` 等） | 先确认有合法 `nodeId`；多属性改同一节点可用 `batch_mutation` |
| 查找当前页节点 | `find_nodes` | 支持按 name/key/parentId 过滤 |
| 有序批量写操作 | `batch_mutation` | 最多 100 个操作，部分失败不回滚 |
| 删除节点 | `delete_node` | 不可逆，确认 `nodeId` 正确再执行 |

### 推荐工作流

#### 场景 1：理解当前设计

`get_metadata` -> `get_selection` -> `get_design_context`

如果没有选区，再决定用 `get_document` 还是 `get_design_context(depth=2+)` 看当前页。

#### 场景 2：深挖单个节点

先从 `get_selection` / `get_document` / `get_design_context` 拿到合法 `nodeId` -> `get_node`

#### 场景 3：读设计系统资产

`get_styles` + `get_variable_defs` -> 需要统一 token 视图时再用 `get_design_tokens`。

前者偏本地样式，后者偏变量集合和 modes；`get_design_tokens` 是归一化后的 graph，不要只调一个 raw source 就声称“拿到了全部 token”。

#### 场景 4：token 治理

`get_design_tokens` -> `get_token_usage` -> `audit_design_tokens` -> 可选 `propose_design_tokens`。

如果用户要创建或应用 token，先运行 `create_design_tokens` / `apply_tokens` 的默认 dry-run，审查 plan 后才考虑 `dryRun=false`。如果用户要给代码侧消费 token，用 `export_design_tokens`。

#### 场景 5：导出图像

如果后续流程自己处理图片内容，用 `get_screenshot`。如果用户明确要本地文件，用 `save_screenshots`。

#### 场景 6：写入节点

先确认目标 `nodeId` 来源（`get_selection`、`find_nodes` 或已知 ID）。单个属性修改用对应 setter。多步操作（创建 + 修改 + 嵌套）用 `batch_mutation` + `tmp:` 引用。
