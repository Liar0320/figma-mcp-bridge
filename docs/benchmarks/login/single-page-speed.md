# 单页登录设计速度训练协议（`single-page-speed-v1`）

目标：让一名 Agent 从收到完整任务到交付一张**合格、可编辑**的 Figma 登录页，端到端在 180 秒内完成；超过 300 秒调查。此协议只测单页流程，不测三 Agent 并发或开放设计探索。三方向并发可靠性与自主设计评价见 [三 Agent 登录页协议](./three-agent-regression.md)。静态设计不代表登录业务已经实现。

## 任务与可比边界

- 每轮仅一名 Agent、一张 `1440×960` 画板。使用三 Agent 协议中 [03 企业云的固定 brief](./three-agent-regression.md#agent-03企业云--浅色结构化)；品牌、字段、文案、主色、构图、安全边界不得为了提速删减或改写。其他设计目标要另立协议或版本，不与本协议的耗时直接比较。
- 固定当前任务的真实 `fileKey`、`pageId`、画板 ID、插件 Build ID、server/plugin 版本、Git commit 和未提交变更范围；每轮记录 Figma 文件/测试页及节点环境。不同构建、模型、文件环境、画布状态或任务 brief 下的耗时仅作过程参考，不称严格 A/B。
- 在专用测试文件或测试页运行。协调者先用 `list_files`、`get_metadata`、`find_nodes` 确认连接及既有根节点边界，在不重叠的位置创建**一个**命名含 `RUN_ID` 的子任务画板。不能安全放置或插件不可用则 `not_run`；不修改、删除或移动既有节点。每轮使用唯一 `RUN_ID`，产物写入 `artifacts/login-benchmark/single-page-speed/<RUN_ID>/`；路径已存在就换 RUN_ID，不覆盖已有截图或报告。历史 `artifacts/login-benchmark/<RUN_ID>/` 原地保留。
- 协调者在派发前完成连接检查、画板分配与 brief 准备，并分别记录耗时；**不得替 Agent**预构造 scene、预读工具 schema、生成最终图或修复布局。实际在 Agent 内执行的 schema 查阅、构图、参数生成、失败重试、修复和报告均计入单页时间。不运行 `search.py`，因为本轮 brief 已冻结；跳过构建、lint、测试、格式化。

## 复制给执行者的任务

```text
按 docs/benchmarks/login/single-page-speed.md 的 single-page-speed-v1 完成一张登录页。RUN_ID=<填写>；fileKey=<当前 list_files 结果>；pageId=<当前 get_metadata 结果>；分配画板 ID=<真实 ID>；画板坐标=<真实坐标>，尺寸 1440×960。仅可在分配画板及其后代写入；不能改动既有节点、其他画板或另建替代根画板。

完整设计 brief：沿用 docs/benchmarks/login/three-agent-regression.md 的「Agent 03：企业云 / 浅色结构化」。必须有 Forma、Email、Password、Forgot password?、Sign in、Create account，及该 brief 的抽象可编辑架构几何；不得伪造实时数据、安全资质、已接入 SSO 或第三方登录。使用本仓库 figma-scene-rapid-prototyping 与 figma-product-designer skill 的工程及验收规则；使用任何 xd:// MCP 工具前先读当前 schema。

准备完整但克制的 native Frame/Text/Rectangle + Auto Layout scene；检查字体、主次文字与背景对比度、文本宽度、输入高度至少 48px、链接触控区域。用分配画板为 parent，对相同节点树先 create_scene dryRun:true，成功后 dryRun:false；每批最多 100 节点、16 层。预检失败按当前 schema 修正，不反复猜测参数；任何后加内容也必须预检。写入结果不明时先查已知节点，不盲目重放。

保存唯一 PNG，读取并人工检查实际图像；对分配画板执行 validate_layout。仅在发现真实问题时局部修复并重新截图/诊断，不为微调删除重建整张画板。交付画板 ID、最终截图相对路径、诊断结果、可见问题及未验证边界、每个阶段的 UTC 时间和实际请求计数。HTTP 429、连接失败、wrapper 参数拒绝与 MCP 请求失败分开记录；不能把已创建空画板当完成页。不要为了 180 秒省略验收。
```

## 计时、结果与停止条件

- **单页端到端计时**：从 Agent 收到上述完整任务、真实 ID 和画板分配结果（`startedAt`），到最终截图已读取、最后一次布局诊断已确认、结果交付给协调者（`completedAt`）。采用同一 UTC 时钟记录原始时间戳与差值；协调者准备时间另报，不计入单页目标。Agent 运行期间的模型等待、schema read、wrapper 参数拒绝和恢复均在计时内。协调者记录派发时间及结果到达时间，不能用推测补齐缺失时间。
- 记录 `dryRunPassedAt`、`liveWriteAt`、`firstScreenshotAt`、`finalValidationAt`；每个实际 MCP 请求另记开始、结束、durationMs、工具名与状态。如无法取得逐请求时间，填 `unknown`，**不得从总墙钟反推 MCP 性能**。wrapper 在发往 MCP 前拒绝的调用、模型请求/429、schema read 单独列，不算实际 MCP 调用。
- `passed_on_target`：所有合格条件满足且端到端 `≤180s`；`passed_over_target`：合格但 `>180s`，其中 `>300s` 必须调查具体等待/返工阶段；`failed`：未完成或验收未通过；`cancelled`：任务主动终止；`not_run`：环境/前置条件无法启动。边界按完成时间计算，300 秒是调查线，**不是强制取消线**。429 属于 Agent 资源失败，记录发生阶段及已写入节点，不记成 MCP timeout，也不混入成功样本耗时。缺时间证据不得宣称达标。
- 合格条件：分配的画板存在且尺寸正确，必需字段/入口、企业云构图均可见且为原生可编辑节点；最终 PNG 已保存并被实际读图；`validate_layout` 已执行、扫描完成，裁切/重叠、低对比度和过小触控目标等可操作 warning 已修复，最终无未处理的相关 issues。固定文本溢出等 validator 无法验证的内容须人工检查并说明未覆盖边界。成功写入、截图存在或报告声称通过均不单独构成合格。
- 发现模型限额、工具不可用或不明确的写入结果时，保留画板及证据；先核实状态，不自动重放 live 写入。不得删除用户已有内容。协调者复核截图、画板及工具回执后才确认状态。

## 报告模板

```markdown
# Single-page Login Speed — <RUN_ID>
协议：single-page-speed-v1；设计 brief：03 企业云固定版。
环境：fileKey=<...>；pageId=<...>；画板 ID/坐标=<...>；插件 Build ID=<...>；server/plugin 版本=<...>；commit/未提交变更=<...>；模型=<...>；既有节点避让依据=<...>。
协调者准备/派发：<开始/结束 UTC、耗时；不计单页目标>。
单页：startedAt=<...>；dryRunPassedAt=<...>；liveWriteAt=<...>；firstScreenshotAt=<...>；finalValidationAt=<...>；completedAt=<...>；端到端=<...>s。
结果：<passed_on_target | passed_over_target | failed | cancelled | not_run>；最终截图=<...>；画板节点=<...>；读图结果=<...>；最终 validate_layout=<...>；人工检查/未验证边界=<...>。
实际 MCP 请求（每个请求一行；无法取得的字段填 `unknown`）：
| 工具 | startedAt | finishedAt | durationMs | 结果/错误码 |
|---|---|---|---:|---|
| ... | ... | ... | ... | ... |
非 MCP 开销：<schema read、wrapper 拒绝、模型等待/429、修复动作及可观察时间；未知填 unknown>。
诊断：<超过 180 秒的具体阶段；超过 300 秒时必须分析；无法归因则明确写无法归因>。
可比性：<同 brief、同模型/环境/版本的基线，或不可严格比较的差异>。
```
