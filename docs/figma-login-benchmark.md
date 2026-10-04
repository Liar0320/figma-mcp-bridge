# 三 Agent 登录页复测协议（工程回归 v1 / 开放探索 v1）

目的：分别测量 Figma MCP/执行 skill 的可靠性，以及 Agent 在设计建议辅助下的自主设计质量。此协议是**静态 Figma 设计验收**，不是登录业务实现或像素级回归测试。运行一次生成一份新报告；不要覆盖上一轮证据。

先选且只选一种模式，报告中记录：`fixed-regression-v1` 或 `open-exploration-v1`。
- **固定工程回归**：使用第 1 节完整 brief，锁定色值、构图和文案；后续在相同 brief 下比较 MCP/skill 变动对成功率、错误和调用路径的影响。它并非旧 Round 3 的逐字复刻，旧任务不可作为严格 A/B 基线。
- **开放设计探索**：使用第 2 节场景 brief，只固定登录任务、产品类别、画布和安全边界；协调者提供 `search.py` 原始推荐，Agent 自主决定颜色、字型、空间与构图。评价设计判断，不把不同设计复杂度下的 MCP 次数当同任务性能对比。`search.py` 是检索推荐，**不是随机生成器**。

## 0. 共用前置与基线

1. 在 Figma Desktop 打开目标文件，运行当前构建的 Figma MCP Bridge 插件，确认插件 Build ID；记录插件/Server 版本、Git commit 与未提交变更范围。`list_files` 取得本轮 `fileKey`，`get_metadata` 取得 `pageId`。插件未连通则标记 `not_run`，不要把连通失败计作设计质量问题。
2. 在**专用测试文件或经用户明确清空的测试页**运行。用 `find_nodes` 查询 `parentId=<pageId>`，确认页面状态。若页面为空，继续本轮；若页面存在内容，**必须暂停并向用户明确询问是否继续**，列出已发现的根节点 ID、名称、坐标和尺寸，说明继续会在同一页面新增三张画板、不会自动删除或覆盖已有节点。只有用户明确确认继续后，才可在报告中记录 `pageReuseConfirmed=true` 并继续；未确认、拒绝或无法取得确认时记 `not_run`，不得派发 Agent。用户确认继续后，三 Agent 仍只能写入各自分配坐标，不得改动既有节点。本协议不创建/切换 Figma 页面，也不自动删除已有画板。
3. 选唯一 `RUN_ID`（如 `2026-10-03-a`），产物统一写到 `artifacts/login-benchmark/<RUN_ID>/`；路径已存在就换 RUN_ID。保留根节点 ID 和文件名，便于失败后检查；不盲目重放超时写入。同一轮只运行一种模式，不在一张页面内混用两套任务。
4. **设计检索仅在协调者侧运行**：使用本仓库 `.agents/skills/ui-ux-pro-max/scripts/search.py` 分别执行以下只读查询；记录脚本版本/查询/原始输出。固定回归模式将推荐仅作资料，仍按冻结 brief 执行；开放探索模式把每条**原始输出**交给相应 Agent，让它在认证页语境下作选择。脚本的营销页建议（Hero/客户证言/产品指标）不能机械照搬。脚本缺失或执行失败时，固定模式可记录 `search.py: not_available` 后继续；开放模式应记 `not_run`，不能悄悄换成模型自由发挥。

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "fintech banking wealth management" --design-system -f markdown
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "luxury lifestyle spa wellness" --design-system -f markdown
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "b2b enterprise saas cloud infrastructure" --design-system -f markdown
```

这三个查询只记录**检索依据**；第 1 节的配色和认证结构是人工筛选后的固定测试参数，**不要声称每个数值均为脚本原样输出**。固定回归不得根据新检索输出改变版式或主色；开放探索的主题、风格判断与被拒建议须逐项记录。

## 1. 固定工程回归（`fixed-regression-v1`）

```text
按 docs/figma-login-benchmark.md 的 fixed-regression-v1 复测三张 Figma 登录页。本轮 RUN_ID=<填写>，fileKey=<list_files 的实际结果>，pageId=<get_metadata 的实际结果>。先确认页面状态：若页面非空，暂停并向用户列出已有根节点 ID、名称、坐标和尺寸，询问是否继续；只有用户明确确认继续，才记录 `pageReuseConfirmed=true` 并继续。未获确认则停止，不删除用户节点。页面为空或用户已确认后，再派发 Agent。

同时派发三个 OMP agent，各自只拥有一个根画板：x=0、1640、3280；y=0；尺寸均 1440x960。任务是独立的，三个 agent 同批 dispatch。将“共同执行合同”和本节各自完整 brief 原样交给对应 agent；不要让 agent 再搜索一次 UI/UX Pro Max 或自选第四种主题。协调者记录派发时间、完成/取消时间，复核三张截图及节点，并按文末模板报告所有 MCP 工具调用。不要因为 agent 声称完成就直接标记通过。
```

### 共用执行合同（两种模式均原样放入三个 Agent 的共享 context）

```text
这是一次静态、可编辑的 Figma 登录页复测。仅在已分配坐标新增自己的 1440x960 根画板；不得改动其他 agent 或用户节点。始终传入本轮真实 fileKey，不要写死历史 session key。若协调者报告 `pageReuseConfirmed=true`，该确认只允许在分配坐标新增本轮节点，不允许删除、移动、重命名、覆盖或修改既有节点。使用本仓库 .agents/skills/figma-scene-rapid-prototyping/SKILL.md 与 figma-product-designer 的相关工程、验收规则；使用任何 xd:// MCP 工具前先读其当前 schema。已有约束与运行时返回冲突时，以当前 schema/运行时为准并记录偏差。

优先 native Frame/Text/Rectangle + Auto Layout，整页需可编辑；只做必要的局部组件复用，不预建 component set / token 系统。create_frame 创建根画板；create_scene 先 dryRun:true 预检，再以相同节点树 dryRun:false 写入。预检不创建节点；每次失败记录错误码、位置、修复动作。每批最多 100 节点、16 层，复杂画面可在本次根画板下分段写入。

scene 的 ref 需唯一，推荐以字母开头且只用 ASCII 字母/数字/下划线。多行 TEXT 用 props.width、props.style.fontFamily、props.style.fontSize 和 props.style.textAutoResize:"HEIGHT"。字体以真实预检结果为准；FONT_STYLE_FALLBACK 必须记录 requested/resolved。不要将固定尺寸误称作响应式。画完及时保存唯一 PNG，读取实际截图；用 validate_layout 检查自己的根画板并对可见问题做局部修复。不要为小瑕疵删除重建整张画板；如确需放弃，先报告原因并保留原产物以供诊断。超时/报错先读取已知根节点确认状态，不直接重放。
阶段计时：Agent 必须用同一 UTC wall clock 记录 `startedAt`、`rootCreatedAt`、`dryRunPassedAt`、`liveWriteAt`、`firstScreenshotAt`、`finalValidationAt`、`completedAt`；无法观察的字段写 `unknown`，禁止估算。协调者另外记录三 Agent 派发开始/结束和每个 task-result 到达时间。时间戳只证明阶段边界；不能从模型历史臆测单个 MCP 请求耗时。报告同时列 Agent 总耗时、并发波次耗时和缺失字段。
执行优化边界：可共享认证页的结构不变量（字段、主操作、恢复入口和画板尺寸），但不得共享开放探索的颜色、字体或构图。先用最小稳定结构通过一次 dry-run，再增加装饰；不要在失败的深层 scene JSON 上反复试错。装饰若不需要绝对定位，应放入 Auto Layout 父级；若必须绝对定位，先验证父级布局模式和运行时支持。成功 live 写入后先截图/诊断一次，仅在证据显示问题时做局部修复。

每页必须有品牌 Forma、Email、Password、Forgot password?、Sign in、Create account。按钮、标签和输入边界可读；显示的是静态设计，不要声称登录/第三方授权/安全认证已实现。不得虚构真实安全认证、监管许可、活跃状态、客户数量、性能指标或第三方产品集成。需要视觉暗示时用纯装饰几何与明确的中性文本，不画假的 live 仪表盘。不要给未配置的链接伪造 URL。只报告真实工具结果：根节点 ID、截图相对路径、布局诊断结果、预检次数、真实写入次数、失败与 warning，以及未验证边界。跳过构建、lint、测试、格式化。
```

### Agent 01：机构金融 / 深色秩序

```text
拥有 x=0,y=0 的 1440x960 画板。名称：Login Benchmark / 01 Institutional Dark。
定位：稳健、可信、低干扰的金融产品登录，不假冒任何真实机构。背景 #0B0F19；表面 #111827；边框 #334155；强调琥珀 #F59E0B；正文 #F8FAFC；辅助字 #94A3B8。构图为居中 460px 左右的清晰登录区，外围只用克制的几何秩序线条，不堆广告/指标。邮箱和密码各有可见标签；输入高度至少 48px；主按钮 Sign in。Forgot password?、Create account 清晰可见。不要出现 SOC、FINRA、SIPC、YubiKey 已连接、TLS 认证等未经证实的背书。静态页面可用“Secure access”作为视觉标题，但不能宣称已验证安全。
将 PNG 保存到 artifacts/login-benchmark/<RUN_ID>/01-institutional-dark.png。返回自己的根节点、预检/布局/截图证据。
```

### Agent 02：高端疗愈 / 温暖有机

```text
拥有 x=1640,y=0 的 1440x960 画板。名称：Login Benchmark / 02 Warm Sanctuary。
定位：安静、温暖、重视呼吸感的生活方式产品。背景 #FDF8F6；卡片 #FFFFFF；边框 #E8DCD7；主色 #C25E5E；深色文字 #3D1C24；辅助字 #8C757B。左侧约 600px 为实际登录表单；右侧约 840px 用可编辑圆弧、圆角矩形和几何光影作纯装饰，不写虚构客房/住户/度假区/疗效数据。标题“Return to your sanctuary.”；标注 Email / Password；输入高度至少 48px；主按钮 Sign in；Forgot password?、Create account 可见。对比度及软色按钮文字必须实际检查。
将 PNG 保存到 artifacts/login-benchmark/<RUN_ID>/02-warm-sanctuary.png。返回自己的根节点、预检/布局/截图证据。
```

### Agent 03：企业云 / 浅色结构化

```text
拥有 x=3280,y=0 的 1440x960 画板。名称：Login Benchmark / 03 Enterprise Cloud。
定位：清晰、理性、适合高频开发者使用的云工具，但不伪造在线 telemetry。背景 #F8FAFC；表面 #FFFFFF；边框 #CBD5E1；海军蓝 #0F172A；主要行动蓝 #0284C7；正文 #020617；辅助字 #64748B。约 760px 左侧展示抽象的可编辑架构几何（不是实时数值卡）；约 680px 右侧清晰的登录表单。标题“Sign in to Forma Cloud”；Email、Password、Forgot password?、Sign in、Create account 均可见。第三方登录/SSO 只有在设计中明确标为“示意、未接入”且不抢主操作时才展示；默认不画。输入高度至少 48px。
将 PNG 保存到 artifacts/login-benchmark/<RUN_ID>/03-enterprise-cloud.png。返回自己的根节点、预检/布局/截图证据。
```

## 2. 开放设计探索（`open-exploration-v1`）

沿用第 0 节页面状态确认与第 1 节的**共用执行合同**，但**不要使用第 1 节三个固定 brief**。协调者在派发前为三个类别各运行一次第 0 节的 `search.py` 命令，将每条完整原始输出（或可读取的本地输出路径）仅交给对应 Agent；保留查询及脚本版本作为证据。同一轮中不重复检索、不重新选类别，不给 Agent 预选 HEX、字体、列宽或页面构图。CLI 输出的推荐不是产品事实、不能替代设计判断。

### 复制给协调者的开放探索指令

```text
按 docs/figma-login-benchmark.md 的 open-exploration-v1 创建三张 Figma 登录页。RUN_ID=<填写>，fileKey=<list_files 的实际结果>，pageId=<get_metadata 的实际结果>。先确认页面状态：若页面非空，暂停并向用户列出已有根节点及其坐标/尺寸，询问是否继续；只有用户明确确认继续，才记录 `pageReuseConfirmed=true` 并继续。未获确认则停止，不删除用户节点。页面为空或用户已确认后，再确认三条 search.py 命令均成功并保存各自完整原始输出；否则停止，不删除用户节点。

同时派发三个 OMP agent，每个 agent 只处理本节对应类别、坐标与检索结果，共同执行合同放共享 context。三个独立任务同批 dispatch。让 Agent 从推荐中挑选、改造或拒绝风格/颜色/字体/版式，不要把检索输出逐字当成登录页规范，也不要转交其他类别的推荐。协调者复核三个最终节点、截图与实际工具日志，按文末模板报告。不要把三者的视觉差异解释成 MCP 性能变化。
```

### Agent 01：机构金融

```text
拥有 x=0,y=0 的 1440x960 画板。名称：Login Exploration / 01 Institutional Finance。目标人群是需要可信、低干扰登录体验的金融产品用户；品牌为虚构的 Forma。提供给你的行业检索结果：<粘贴第 1 条完整输出或指向本地可读取文件>。
由你决定配色、字型、版式和装饰形式，并解释哪些推荐适合认证页、哪些营销建议被拒绝。不要伪造合规资质、硬件已连接或账户/市场实时数据。完成可编辑登录页并检查截图与布局。
PNG: artifacts/login-benchmark/<RUN_ID>/01-institutional-finance.png。返回根节点 ID、设计决策与证据。
```

### Agent 02：疗愈生活方式

```text
拥有 x=1640,y=0 的 1440x960 画板。名称：Login Exploration / 02 Wellness。目标人群是进入个人疗愈服务的回访用户；品牌为虚构的 Forma。提供给你的行业检索结果：<粘贴第 2 条完整输出或指向本地可读取文件>。
由你决定配色、字型、版式和装饰形式，并说明采纳、改造或拒绝了哪些建议。不编造疗效、住户/场馆或用户数据；装饰图形不要冒充产品功能。完成可编辑登录页并检查截图与布局。
PNG: artifacts/login-benchmark/<RUN_ID>/02-wellness.png。返回根节点 ID、设计决策与证据。
```

### Agent 03：企业云

```text
拥有 x=3280,y=0 的 1440x960 画板。名称：Login Exploration / 03 Enterprise Cloud。目标人群是需要快速、安全识别登录入口的企业开发者；品牌为虚构的 Forma。提供给你的行业检索结果：<粘贴第 3 条完整输出或指向本地可读取文件>。
由你决定配色、字型、版式和装饰形式，并说明采纳、改造或拒绝了哪些建议。不编造在线 telemetry、真实集群状态或已接入的 SSO/第三方登录；如展示未接入方式，仅作明确标识的交互示意。完成可编辑登录页并检查截图与布局。
PNG: artifacts/login-benchmark/<RUN_ID>/03-enterprise-cloud.png。返回根节点 ID、设计决策与证据。
```

## 3. 验收与停止条件

- 每个 Agent 的状态分别记为 `passed` / `failed` / `cancelled` / `not_run`，不要把文件已导出等同于通过。完成条件：根画板存在且尺寸/坐标正确；Email、Password、Sign in、Forgot password?、Create account 可见且原生可编辑；同一根节点截图已导出并人工读图；`validate_layout` 已执行且对严重裁切/重叠有处理或明确未通过。开放模式还要报告检索建议的采纳/改造/拒绝理由及实际配色、字体、构图。
- 若页面非空但用户明确确认继续，报告必须记录 `pageReuseConfirmed=true`、确认时间（UTC）、确认原文或可审计引用，以及继续前发现的既有根节点清单。该确认只授权在本轮分配坐标新增节点，不授权删除、移动、重命名、覆盖或修改既有节点。
- 根画板不得为了微调反复删除重建；如确实删除过，报告每次操作和最终状态，不掩盖失败阶段。检查是否留有无内容空画板；不自动清理用户内容。
- 若单个 Agent 在完整画板与截图之后持续重复预检、重绘或偏离目标，协调者停止其任务并保留当时证据，记 `cancelled`。不要以事后截图证明它仍在运行的画板必然保留。
- 设计流程优化复盘至少回答：是否在首次 live 前解决布局依赖；是否重复截图/诊断而没有产生修复决策；是否因 wrapper/eval 或错误工具路径增加不可归因开销；是否将营销检索正确收敛为认证页结构；是否保留开放探索的视觉自主性。把“调用少”与“设计好”分开评价。

## 4. MCP 调用统计与报告模板

统计口径：**一个发往 `xd://mcp__gethopp_figma_mcp_bridge_*` 的实际执行请求 = 1 次 MCP 调用**。读取 `xd://...` 工具 schema 另列 `schema read`，不混入 MCP 执行数；`read` 本地图像/skill、CLI、`eval` 容器本身也不计。`eval` 内多次实际调用 MCP 要按运行结果逐次计数，不能只数源码出现的 URL 字符串；一次 `create_scene` 内部创建的几十个节点仍算 **1 次对外 MCP 调用**。协调者自己调用的 `list_files`/`get_metadata`/`find_nodes`/复核截图等作为**共享准备与验收**单独统计，不摊给 Agent。三个 Agent 并发共享同一个 Figma 插件，墙钟时间不能直接归因于单个工具。

每个 Agent 至少分开列：`create_scene` 预检/实际写入/失败，`create_frame`、`get_node`、`save_screenshots`、`validate_layout`、`delete_node`、其他；总尝试次数、成功/失败次数、首个有效画板时间、截图时间、总墙钟时间。以 agent 历史中的实际 tool-call/tool-result（或工具服务日志）核对；若 `eval` 包装隐藏了内部次数，标记 `unknown` 和估算下界，**不得写精确次数**。错误码与 `FONT_STYLE_FALLBACK` 单列，不把退化字重当成功无差异。没有逐调用计时证据时，不报“工具耗时明细”，只报观察到的总墙钟时长。

```markdown
# Login Benchmark — <RUN_ID>
模式：<fixed-regression-v1 | open-exploration-v1>；对比边界：<同一固定 brief 的上一轮 RUN_ID，或“探索模式，不做同任务性能对比”>。
环境：fileKey=<...>；pageId=<...>；pageReuseConfirmed=<true|false>；确认时间（UTC）=<... 或 not_applicable>；确认原文/可审计引用=<... 或 not_applicable>；插件 Build ID=<...>；server/plugin 版本=<...>；commit/未提交变更=<...>。
检索依据：search.py 版本=<commit/hash 或 not_available>；三条查询及完整原始输出=<路径或 not_available>。

| 类别 | Agent 状态 | 根节点/坐标 | 截图 | 预检 | 实际写入 | 诊断与肉眼结论 | 首屏/截图/总时间 |
|---|---|---|---|---|---|---|---|
| 01 机构金融 | <...> | <...> | <...> | <...> | <...> | <...> | <...> |
| 02 疗愈生活方式 | <...> | <...> | <...> | <...> | <...> | <...> | <...> |
| 03 企业云 | <...> | <...> | <...> | <...> | <...> | <...> | <...> |
阶段耗时（UTC；未知填 `unknown`，不要从调用次数推算）：
| Agent | startedAt | rootCreatedAt | dryRunPassedAt | liveWriteAt | firstScreenshotAt | finalValidationAt | completedAt | 总耗时 | 并发波次备注 |
|---|---|---|---|---|---|---|---|---:|---|
| 01 | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| 02 | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| 03 | ... | ... | ... | ... | ... | ... | ... | ... | ... |


开放探索设计决策（固定回归填“不适用，按冻结 brief”）：

| Agent | 实际配色/字型/构图 | 采纳的检索建议及原因 | 改造/拒绝的检索建议及原因 | 可用性/真实性取舍 |
|---|---|---|---|---|
| 01 | <...> | <...> | <...> | <...> |
| 02 | <...> | <...> | <...> | <...> |
| 03 | <...> | <...> | <...> | <...> |

MCP 调用（Agent 执行，不含工具 schema read）：
| Agent | 总尝试/成功/失败 | create_frame | create_scene dry-run / live / 失败 | get_node | save_screenshots | validate_layout | delete_node | 其他 | schema read |
|---|---:|---:|---|---:|---:|---:|---:|---|---:|
| 01 | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| 02 | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| 03 | ... | ... | ... | ... | ... | ... | ... | ... | ... |
共享准备/验收 MCP 调用：<工具/次数>。
流程优化复盘：<布局预检、场景拆分、截图/诊断次数、工具路由、检索收敛、视觉自主性；逐项写证据与下一轮动作>。
错误与 warning（按 Agent、工具、阶段、原始码、修复动作）：<...>。
未观察或不可计数项目：<...>。
对比基线：<固定模式同一冻结 brief 的上一轮 RUN_ID；探索模式填“不适用”>。
结论：<分别归因于 MCP 契约、Agent 策略、Figma 环境或无法归因，并列证据>。
```
