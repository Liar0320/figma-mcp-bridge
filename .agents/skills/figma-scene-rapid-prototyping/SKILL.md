---
name: figma-scene-rapid-prototyping
description: Rapidly create editable Figma screens, prototypes, landing pages, and multi-directional explorations using create_scene and figma-mcp-bridge. Use when creating new pages or screens from scratch to prevent schema validation loops, avoid over-engineering component sets prematurely, and ensure visual first-time delivery.
---

# Figma 场景快速生成与执行指南 (Figma Scene Rapid Prototyping)

本 Skill 沉淀自多 Agent 实际操作 Figma 的真实踩坑记录（解决 Agent 在 `create_scene` 预检中反复报错、过度构建变体组件导致数分钟零产出的问题）。

---

## 核心原则：视觉优先（Visual First）

在进行**多方向设计探索、原型试样或快速新建页面**时：
1. **先出画面，再做系统**：优先在画布上呈现完整、可编辑、符合 Auto Layout 的视觉结构，不要一上来就搭建复杂的变体组件库（`COMPONENT_SET`）。
2. **两阶段分离**：
   - **阶段一（探索与落地）**：顶层 Frame + 极简单体组件（至多 1 个重复结构，如 input shell）+ 单次 `create_scene` 注入整页。
   - **阶段二（系统沉淀，仅在用户要求时）**：在用户选定某个方向后，再抽离多状态变体矩阵与 Token 绑定。

---

## `create_scene` 一次性通过黄金规则 (Zero-Dryrun Pass Rules)

`create_scene` 工具默认 `dryRun: true`，且服务端的结构校验极其严格（Fail-Closed）。为避免反复试探（如连续 6 次预检修补），必须遵守以下规则：

### 1. `ref` 标识符命名规范
- **必须匹配 `^[a-zA-Z0-9_]+$`**。
- **严禁**空格、斜杠、横杠、中文或特殊字符（如 ❌ `Email / Input`、`btn-primary`、`用户表单`；✅ `email_input`、`btn_primary`、`user_form`）。

### 2. 根容器与主分栏尺寸规则（避开弹性尺寸预检死锁）
- **顶层容器必须是明确像素尺寸**：`width` 和 `height` 必须显式声明（如 1440×960），且 `layoutSizingHorizontal: 'FIXED'`, `layoutSizingVertical: 'FIXED'`。
- **直接子分栏（如左右分栏）必须给固定尺寸**：在场景树预检时，如果父级尚未计算最终布局，给子级直接挂 `layoutSizingHorizontal: 'FILL'` 会引发校验错误。应先指定显式像素宽度（如左栏 800，右栏 640）。
- **内部流式元素使用 FILL**：只有深层确有包裹父级的容器内部，才使用 `FILL`。

### 3. 组件实例 (INSTANCE) 的尺寸安全约束
- 如果场景树内引用了外部 `COMPONENT`（即 `type: 'INSTANCE'`）：
  - **不要设置 `layoutSizingVertical: 'HUG'`**（组件未挂载前高度自适应会引发预检冲突）。
  - 给其保留明确的固定高度占位，或省略垂直 sizing 字段。

### 4. 文本节点安全属性与字重别名禁忌
- 凡是段落或多行文本，必须显式给定 `width`、`style.fontFamily`（推荐通用安全的 `'Inter'`）、`style.fontSize`，以及 `props.textAutoResize: 'HEIGHT'`。
- **字重样式规范**：严禁使用特异别名（如 `SemiBold`、`Inter-Medium`）。在 Figma 原生 API 中，Inter 样式名为带空格的 `'Semi Bold'`、`'Regular'` 或 `'Bold'`。避免触发 `FONT_LOAD_FAILED` 导致整批场景被拒。
- 单行文字或由文字撑开的标签，可使用 `props.textAutoResize: 'WIDTH_AND_HEIGHT'`。

### 5. 画板删除重绘原则（No Delete-and-Redo for Minor Fixes）
- **小修小改严禁使用 `delete_node` 删掉整张画板**：如果画板整体结构已成立，仅局部尺寸、间距、文字有偏差，严禁将整页画板销毁重新生成。应保留现有节点直接交付，或针对局部子节点做增量 patch。
- **何时允许删除**：仅在方案完全走偏、或者用户/流程明确要求“彻底废弃该探索方向不要了”时，才允许对根画板执行 `delete_node`。
## 高效标准工作流（3 步极速着陆）

### Step 1: 创建画布底板 (`create_frame`)
先用 `create_frame` 在当前页面生成 1440×960（或指定尺寸）的顶层 Frame，拿到 `frameId`。
```json
{
  "name": "Direction 01 / Minimal Light",
  "x": 0,
  "y": 0,
  "width": 1440,
  "height": 960,
  "fills": [{ "type": "SOLID", "color": "#F8FAFC" }],
  "fileKey": "<CURRENT_FILE_KEY>"
}
```

### Step 2: 组装结构并直接单次注入 (`create_scene`)
利用上述规则直接编写包含完整内容的结构树，单次或最多两次注入（一次预检确认，一次 `dryRun: false` 真实写入）：
```json
{
  "parentId": "<FRAME_ID>",
  "dryRun": false,
  "fileKey": "<CURRENT_FILE_KEY>",
  "nodes": [
    {
      "ref": "main_layout",
      "type": "FRAME",
      "props": {
        "name": "Main layout",
        "layoutMode": "HORIZONTAL",
        "width": 1440,
        "height": 960,
        "layoutSizingHorizontal": "FIXED",
        "layoutSizingVertical": "FIXED"
      },
      "children": [
        /* 左分栏 / 视觉区 */
        /* 右分栏 / 核心交互区 */
      ]
    }
  ]
}
```

### Step 3: 截图自检与产物交付 (`save_screenshots`)
在页面落成后立即调用 `save_screenshots` 导出 PNG，核对实际视觉与排版：
```json
{
  "items": [
    {
      "nodeId": "<FRAME_ID>",
      "outputPath": "artifacts/explorations/screen-01.png"
    }
  ],
  "fileKey": "<CURRENT_FILE_KEY>"
}
```

---

## 避坑检查清单 (Red Flags)

- 🚨 **Red Flag 1**：为了画一个页面，先花 1 分钟去读 5 篇 skill 文档和 10 个 tool schema。
  *纠正*：直接聚焦 `create_frame`、`create_scene`、`save_screenshots` 三个核心工具。
- 🚨 **Red Flag 2**：在画出页面之前，试图调用 `create_component_set` 搭建包含 108 种变体的组件矩阵。
  *纠正*：原型期严禁创建 `COMPONENT_SET`，输入框和按钮只建最简单的单一组件或原生 Frame。
- 🚨 **Red Flag 3**：`create_scene` 多次返回错误，依然在同一个几十层的大 JSON 里反复死磕。
  *纠正*：立刻按功能模块拆分（如 Header 一次、Hero 一次、Form 一次），每次注入成功即落定。
- 🚨 **Red Flag 4**：画板已经成型，自检发现局部间距或子元素微调不理想，直接调用 `delete_node` 把整张画板删光从头重画。
  *纠正*：小修小改严禁推倒重来！微调子节点或直接输出当前截图与待优化说明。
