---
name: figma-scene-rapid-prototyping
description: Create editable Figma screens and prototypes with a repeatable receive → plan → draw → review → refine → deliver lifecycle. Use for new UI scenes regardless of product or page type; includes create_scene preflight and visual quality checks.
---

# Figma 可编辑场景绘制

## 每个画师的通用 lifecycle

接收任务 → 构思方案 → 绘制初稿 → 检查初稿 → 按问题微调并复查 → 交付结果。微调是可选的循环，不是必须凑满的一步；绘制方法、批次数量和内容模块由任务决定，不以登录页或某种布局为模板。

1. **接收任务**：确认目标、交付形式、限制、可写画板与当前文件；不修改其他 Agent 或用户已有的节点。信息缺失先从任务上下文/文件取得，不猜画板 ID。
2. **构思方案**：确定内容、视觉层级、布局、可编辑节点和检查标准；简短明确后开始绘制，不把抽象的设计系统构建当作默认前置工作。
3. **绘制初稿**：使用合适的原生节点和工具完成任务范围内的完整画面。预检成功后才写入；需要分批时按实际父子依赖拆分，不固定批数。记录首次可检查的完整初稿时点。
4. **检查初稿**：导出并实际查看图像，检查需求覆盖、可读性、裁切、布局与适用的触控/对比度问题；运行适用的布局诊断。工具无法验证的内容以人工读图核对并注明边界。
5. **微调并复查**：
   - **批量修复优先**：首次检查发现多个同类问题（如 6 个对比度错误、3 个触控目标过小）时，一次性修复所有问题后统一复查，避免"修 1 个 → 查 1 次"的低效循环
   - 只针对发现的问题局部修改，再导出/读图并复验；可循环多次，但**最多 3 轮**
   - 首次检查通过则跳过；3 轮后仍未解决则如实报告失败原因和剩余问题数量，不得声称质量通过
6. **交付结果**：给出最终画板与产物位置、检查结论、未验证边界及真实失败；接收方收到结果才是端到端完成。禁止把初稿创建成功当作交付完成。

若任务要求比较画师速度，使用唯一的 [`artifacts/figma-drawing-runs.csv`](../../../artifacts/figma-drawing-runs.csv)，**一轮一行**。协调者在派发前记 `task_sent_at`，收到结果后记 `result_received_s`；Agent 在每个实际边界即时记录 UTC，交付时提供时间，协调者换算为相对派发的累计秒数并补行。字段定义：

| 列 | 边界 |
|---|---|
| `agent_started_s` | Agent 首次可观测动作；旧轮只有首工具时钟时，它是首工具代理，不能冒充任务真实接收时间 |
| `plan_done_s` | 已确定内容/布局/检查标准，开始执行绘制前 |
| `first_draft_done_s` | 首次完整、可检查的画面已写入，不是单个模块完成 |
| `first_review_done_s` | 已实际读图并完成第一次适用的质量检查 |
| `final_review_done_s` | 最后一次修复后的读图/复查完成；首次通过时等于首次检查时点 |
| `revision_count` | 检查→局部修复→复查的轮数；确证未修复填 0，无法观察留空 |
| `result_received_s` | 协调者实际收到结果，端到端终点；不是 Agent 自报完成 |
| `quality` | `pass` / `fail`；未解决问题不能记 `pass` |

时间列仅填观察到的累计秒数，未知留空，不从相邻事件推算；备注只解释历史不可比、失败或关键偏差。不在 Skill 固定时限或页面预算。技能只有在 Agent 实际读取时才生效：派发多个画师时，共享任务合同必须明确要求读取本 Skill、按边界报告，协调者核对质量与接收时钟。

## 视觉优先与工具选择

优先完成完整、可编辑的画面，再考虑用户明确要求的组件/Token 系统。新场景可用原生 Frame/Text/Rectangle 和 Auto Layout，不预建复杂 `COMPONENT_SET`；已有组件需要复用时按实际任务使用。画板尺寸、配色、文字及组件依赖由 brief 决定，不默认 1440×960 或某个固定两栏。

---

## `create_scene` 预检与落地规则

`create_scene` 默认 `dryRun: true`。以当前 schema 和运行时响应为准。区分 wrapper JSON 解析失败（请求尚未到达 MCP）与 MCP/schema 校验错误；按实际失败层定位，不要盲目重试相同 payload。

### 1. `ref` 标识符命名规范
- 运行时接受 `^[A-Za-z][A-Za-z0-9_-]{0,63}$`，同一场景内必须唯一。为跨工具一致，推荐字母开头的 ASCII 字母、数字与下划线；不要把更窄的建议误称为硬限制。

### 2. 布局尺寸与依赖
- 对已指定尺寸的画板及主要区域给定明确宽高；固定尺寸不是所有场景的硬要求，也不能据此声称响应式。
- `FILL` 需要 Auto Layout 父容器、匹配的填充轴，并且不能与父级同轴 `HUG` 冲突。根据预检结果修正布局依赖，不要盲目将内部 `FILL` 全部改成 `FIXED`。

### 3. 组件实例与文本
- `INSTANCE` 需要本文件有效的 `COMPONENT` ID；没有实际复用需求时，用原生 Frame 完成探索稿即可。尺寸模式以当前预检和实际渲染为准，不把某个模式一概视为禁用。
- 多行文本建议给定 `props.width`、`props.style.fontFamily`、`props.style.fontSize` 和 **`props.style.textAutoResize: "HEIGHT"`**；短标签可用 `props.style.textAutoResize: "WIDTH_AND_HEIGHT"`。`textAutoResize` 不属于 `props` 顶层。
- 字体使用目标 Figma 文件实际可加载的 family/style。当前 `create_scene` 对 `SemiBold`、`ExtraBold`、`UltraLight` 等支持有限别名候选；预检若返回 `FONT_STYLE_FALLBACK`，记录请求值和实际值，不默认为视觉等价。未知字体仍可能返回 `FONT_LOAD_FAILED`。

### 4. Payload 大小与按模块提交
- 不要求每页都用一棵大 scene 树。先规划父级容器和 Auto Layout 依赖，再按有意义的模块拆成少量自包含批次；避免把每个小元素拆成独立调用，也不固定模块名称或批数。
- 先 live 创建需要作为后续 `parentId` 的布局骨架。后续批次只写入已存在的目标容器；不要跨批次引用 `ref`，因为 scene 内 `ref` 不是跨调用 ID。通过实际返回的节点 ID 建立依赖。
- 每批单独 `dryRun: true`，通过后以**完全相同的节点树** `dryRun: false`；任何增补都作为新批次重新预检。每批规模按 payload 可读性和结构复杂度决定，不以 100 节点上限作为目标。
- `Expected ']'` / `Expected '}'` 等 wrapper JSON parse 错误意味着提交的 JSON `content` 无效，尚未到达 MCP，也没有 Figma 写入。优先在 JavaScript 中用对象构造参数并经 `JSON.stringify(args)` 序列化，再通过实际工具绑定 `await tool.write({i, path: "xd://...", content: JSON.stringify(args)})` 直接调用；这样避免手工拼接/复制嵌套 JSON。若无该执行路径，使用 `functions.write` 直接路由并保持 payload 紧凑。解析拒绝后最多做一次有针对性的修正；再次失败就停止重发整棵树，缩小并拆分为最小可验证模块。JSON Schema 只能检查成功解析后的结构，不能修复语法。
- Eval 的文件 helper `write()` 不支持 `xd://` 协议路径；不要把它当成 `tool.write()` 的替代品，也不要把超大 JSON 从文件读回后手工重构为字符串。`tool.write()` 是实际工具绑定，`write()` 是文件 helper，两者不可混淆。

---

### 5. 画板删除重绘原则（No Delete-and-Redo for Minor Fixes）
- **小修小改严禁使用 `delete_node` 删掉整张画板**：如果整体结构已成立，只局部修改尺寸、间距、文字或填充，然后复查；未解决的质量问题应如实报告，不能把当前截图当成合格交付。
- **何时允许删除**：仅在方案完全走偏，或者用户/流程明确要求彻底废弃该方向时，才允许删除已建根画板；先确认不会触碰其他人节点。

## 工具动作对应 lifecycle

- **接收/构思**：确认当前 Figma 文件和授权范围；需要新画板时用 `create_frame`，已有分配画板则直接使用，不另建替代根。
- **绘制**：`create_scene` 先 `dryRun:true`，通过后对同一树 `dryRun:false`；复杂场景按实际依赖分批，读取 live 返回的节点 ID 后再写后续子树。
- **检查**：写完完整初稿后使用 `save_screenshots`，实际读取最终图像，并运行适用的 `validate_layout`；预检通过只证明输入可写，不证明最终视觉通过。
- **微调/复查**：对具体节点局部修正，重新截图、读图并复验；只有最终检查结论才决定质量状态。
- **交付**：报告画板 ID、截图路径、验证结果和未覆盖边界。任务方负责记录结果收到时间；运行基准测试时不将其移出计时范围。
---

## 质量验收标准

最终交付前必须满足以下条件，否则必须标记为 `quality: fail`：

1. **布局诊断零错误**：`validate_layout` 返回 0 个 issue，或仅剩明确标注为"工具无法验证"的边界（如复杂交互逻辑）
2. **截图目视检查通过**：
   - 无明显裁切（文字被截断、图标缺失）
   - 无重叠错位（元素堆叠、文字压在一起）
   - 符合任务要求的内容完整性
3. **可编辑性验证**：所有节点在 Figma 中可选中、可修改（不是栅格图或锁定图层）

**不允许的误判**：
- ❌ "虽然还有 6 个对比度错误，但整体可用" → 必须标记 `fail` 并报告剩余问题
- ❌ "截图看起来正常，跳过 validate_layout" → 必须运行诊断
- ❌ "修复 3 轮仍失败，但我已经尽力了" → 如实报告 `fail`，说明失败原因，不要声称 `pass`

---

## 常见问题批量修复策略

### 对比度错误（LOW_CONTRAST）
1. 一次性读取所有报错节点的 `fills` 颜色
2. 批量计算与背景色的 WCAG 对比度（至少 4.5:1 正文，3:1 大标题）
3. 统一调整后一次性提交，避免逐个修复逐个复查

### 触控目标过小（SMALL_TOUCH_TARGET）
1. 确认所有交互元素（按钮、链接、输入框）
2. 批量调整至少 44×44（iOS）或 48×48（Material）
3. 如果视觉尺寸必须更小，增加 `padding` 扩大点击区域

### 文字截断（TEXT_TRUNCATION）
1. 检查 `textAutoResize` 是否为 `HEIGHT` 或 `WIDTH_AND_HEIGHT`
2. 如果固定宽度，增加 `width` 或减少 `fontSize`
3. 如果父容器太小，调整父容器 `layoutMode` 或尺寸

### 元素超出边界（OUT_OF_BOUNDS / CLIPPED_CONTENT）
1. 检查父容器 `clipsContent` 是否为 `true`
2. 批量调整子元素 `x/y` 或 `width/height`，确保在父容器内
3. 或者调整父容器尺寸，或关闭 `clipsContent`（如果设计允许）

---

## 避坑检查清单 (Red Flags)

- 🚨 **Red Flag 1**：为了画一个页面，先花 1 分钟去读 5 篇 skill 文档和 10 个 tool schema。
  *纠正*：按任务实际使用的工具读取 schema；通常是 `create_scene`、`save_screenshots` 和 `validate_layout`，需要新画板时再读 `create_frame`。
- 🚨 **Red Flag 2**：用户只要原型，却先构建大型 `COMPONENT_SET`。
  *纠正*：原型先用原生 Frame/Text/Rectangle；用户明确需要组件或设计系统时再建对应结构。
- 🚨 **Red Flag 3**：`create_scene` wrapper 报 JSON parse error 后，仍反复手工重构同一棵大型 JSON，或用 `eval.write()` 误路由 `xd://`。*纠正*：parse error 尚未到 MCP；先核对实际提交字符串，针对性修正一次，仍失败就缩小 payload 并按有意义的模块分批。使用 MCP 工具自身路由。
- 🚨 **Red Flag 4**：画板已经成型，自检发现局部间距或子元素微调不理想，直接调用 `delete_node` 把整张画板删光从头重画。
  *纠正*：小修小改严禁推倒重来；修改相关子节点并复查。问题未解决则如实交付失败/受限状态，不能冒充验收通过。
- 🚨 **Red Flag 5**：把合法性等同于 JSON Schema。*纠正*：先确保提交内容本身是可解析 JSON，再由输入 schema 检查结构和类型，最后用 `create_scene` dry-run 检查字体、ref 和布局依赖。
- 🚨 **Red Flag 6**：发现 6 个对比度错误，逐个修复并每次复查，循环 6 次。*纠正*：批量修复所有同类问题，一次性提交后统一复查；最多 3 轮修复，避免低效循环。
- 🚨 **Red Flag 7**：`validate_layout` 仍返回错误，但认为"整体可用"就标记 `quality: pass`。*纠正*：任何未解决的诊断错误都必须标记 `fail`，如实报告剩余问题数量和类型。
