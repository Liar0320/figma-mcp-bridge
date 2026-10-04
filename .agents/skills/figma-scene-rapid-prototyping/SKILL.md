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

## `create_scene` 预检与落地规则

`create_scene` 默认 `dryRun: true`。以当前工具 schema 和运行时响应为准；一次预检失败应按具体错误修复，而不是套用过时的禁用字段清单。

### 1. `ref` 标识符命名规范
- 运行时接受 `^[A-Za-z][A-Za-z0-9_-]{0,63}$`，同一场景内必须唯一。为跨工具一致，推荐字母开头的 ASCII 字母、数字与下划线；不要把更窄的建议误称为硬限制。

### 2. 布局尺寸与依赖
- 顶层画板及主分栏建议给定明确宽高，例如 1440×960、左右两栏各自宽度；这是可预测布局的策略，不是所有场景的运行时硬要求。
- `FILL` 需要 Auto Layout 父容器、匹配的填充轴，并且不能与父级同轴 `HUG` 冲突。根据预检结果修正布局依赖，不要盲目将内部 `FILL` 全部改成 `FIXED`。

### 3. 组件实例与文本
- `INSTANCE` 需要本文件有效的 `COMPONENT` ID；没有实际复用需求时，用原生 Frame 完成探索稿即可。尺寸模式以当前预检和实际渲染为准，不把某个模式一概视为禁用。
- 多行文本建议给定 `props.width`、`props.style.fontFamily`、`props.style.fontSize` 和 **`props.style.textAutoResize: "HEIGHT"`**；短标签可用 `props.style.textAutoResize: "WIDTH_AND_HEIGHT"`。`textAutoResize` 不属于 `props` 顶层。
- 字体使用目标 Figma 文件实际可加载的 family/style。当前 `create_scene` 对 `SemiBold`、`ExtraBold`、`UltraLight` 等支持有限别名候选；预检若返回 `FONT_STYLE_FALLBACK`，记录请求值和实际值，不默认为视觉等价。未知字体仍可能返回 `FONT_LOAD_FAILED`。

### 4. 画板删除重绘原则（No Delete-and-Redo for Minor Fixes）
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

### Step 2: 组装结构并预检后注入 (`create_scene`)
先用 `dryRun: true` 预检，再用相同节点树、`dryRun: false` 写入；预检减少无效创建，不保证写入后无需截图纠正：
```json
{
  "parentId": "<FRAME_ID>",
  "dryRun": true,
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
      "children": []
    }
  ]
}
```

### Step 3: 截图自检与产物交付 (`save_screenshots`)
预检通过后以 `dryRun: false` 写入，并在页面落成后调用 `save_screenshots` 导出 PNG，核对实际视觉与排版：
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
