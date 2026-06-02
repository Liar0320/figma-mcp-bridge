# shadcn/ui Component Library — Figma Design Rules

> **Scope:** SaaS Admin Test 设计文件，Figma MCP Bridge 工作流  
> **Last verified:** 2026-06-02  
> **Component count:** 967 components, 18 component sets, 877 icons  
> **Component source:** shadcn/ui (https://ui.shadcn.com)

---

## 1. 文件结构

| Figma 页面 | 用途 |
|---|---|
| `SaaS Admin` | 实际设计稿（dashboard frames） |
| `Primitives` | 基础组件（button, avatar, input, table item 等） |
| `Components` | 复合组件（hover card, dialog, dropdown 等） |
| `Icons` | 877 个 Lucide icon 组件 |

---

## 2. Component Sets（Primitives 页面）

> 使用 `create_instance` 时，优先用 **默认变体 nodeId**，再通过 `set_component_properties` 切换状态/类型。

| 组件名 | Set nodeId | 默认变体 nodeId | 尺寸 | 备注 |
|---|---|---|---|---|
| Button | `1:85` | `1:72` | 自适应 | 11 type × 2 state variants |
| Avatar | `8:297` | `8:295` (initials) / `8:296` (image) | 40×40 | |
| Table Item | `21:1363` | — | 自适应 | type: table head / table item × state: Default / selected |
| Menu Item | `4:6163` | — | 自适应 | type: default / section title × state: default / hover / disabled |
| Tab Item | `6:205` | — | 自适应 | state: selected / unselected |
| Switch | `9:338` | — | — | state: on / off |
| Input | `2:285` | — | — | |
| Textarea | — | — | — | |
| Checkbox | `1:117` | — | — | |
| Radio Button | — | — | — | |
| Navigation Menu Item | `13:551` | — | — | type: Default / dropdown / link |

---

## 3. Standalone Components（Components 页面）

| 组件名 | nodeId | 默认尺寸 | 说明 |
|---|---|---|---|
| Hover Card | `4:462` | 320×118 | 白底, border `#E5E7EB`, shadow, radius 6 |
| Progress | `13:1649` | — | |
| Select | `8:302` | — | |
| Tabs + Content | `13:492` | — | |
| Separator | `13:2142` | — | |
| Dialog | `4:329` | — | |
| Dropdown Menu | `4:6588` | — | |
| Tooltip | `13:896` | — | |
| Badge | — | — | |
| Alert | — | — | |
| Card | — | — | 与 Hover Card 区分 |

---

## 4. 高频 Icons（Icons 页面）

> 全量 877 个图标来自 **Lucide Icons**，命名与 lucide-react 包一致。

| Icon 名称 | nodeId |
|---|---|
| layout-dashboard | `4:5311` |
| bar-chart | `4:4891` |
| users | `4:5648` |
| settings | `4:5518` |
| search | `4:5509` |
| bell | `4:4912` |
| trending-up | `4:5622` |
| trending-down | `4:5623` |
| home | `4:5274` |
| calendar | `4:4953` |
| filter | `4:5171` |
| user | `4:5647` |
| log-out | `4:5343` |
| pie-chart | `4:5445` |
| gauge | `4:5224` |
| plus | `4:5460` |
| more-horizontal | `4:5387` |
| edit | `4:5096` |
| trash | `4:5617` |
| chevron-right | `4:4973` |
| chevron-down | `4:4969` |
| check | `4:4966` |
| x | `4:5683` |
| sidebar | `4:5537` |
| grid | `4:5247` |
| eye | `4:5107` |
| download | `4:5086` |

> 其他图标请用 `find_nodes(name: "<icon-name>", type: "COMPONENT")` 按名称查询。

---

## 5. 设计 Token（颜色）

| 用途 | 颜色值 |
|---|---|
| 页面背景 | `#F8FAFC` |
| Sidebar / Card 背景 | `#FFFFFF` |
| 主色（Primary）| `#6366F1` |
| 文字主色 | `#1E293B` |
| 文字次色 | `#64748B` |
| 边框 | `#E2E8F0` |
| 绿色趋势（正） | `#10B981` |
| 红色趋势（负） | `#EF4444` |
| 橙色趋势（警告） | `#F59E0B` |

---

## 6. Dashboard 布局规范（SaaS Admin 页面）

```
Canvas
├── V1 (141:1216)  x:80, y:80    — 静态参考稿（无 INSTANCE）
├── V2 (143:1270)  x:80, y:1200  — 半结构化（部分 FRAME 替代 INSTANCE）
└── V3             x:80, y:2400  — 全组件化目标版本
```

### 标准 Frame 尺寸

| 区域 | 宽 | 高 |
|---|---|---|
| 根 Frame | 1440 | 1024 |
| Sidebar | 256 | 1024 |
| Top Bar | 1184 | 88 |
| Main Content | 1184 | 936 |

### 图层命名约定

格式：`区域 / 类型 / 名称`

示例：
- `Sidebar / Nav Item / Overview`
- `Top Bar / Action / Search`
- `Main Content / Card / Total Revenue`

---

## 7. MCP 工具使用规则

### create_instance（跨页组件）

```json
{
  "componentId": "1:72",
  "parentId": "目标 frame nodeId",
  "x": 0,
  "y": 0,
  "name": "Sidebar / Nav Item / Overview"
}
```

- **支持跨页**（PR #50 修复后，`figma.getNodeByIdAsync` 替换同步 API）
- `componentId` 必须是 `COMPONENT` 节点，不能是 `COMPONENT_SET`

### set_component_properties（切换变体）

```json
{
  "instanceId": "INSTANCE nodeId",
  "properties": {
    "State": "hover",
    "Type": "primary"
  }
}
```

### nodeId 格式

- ✅ 正确：`4:5311`（冒号分隔）
- ❌ 错误：`4-5311`（连字符）

### batch_mutation 限制

- 最多 100 个操作/次
- 临时引用用 `ref: "tmp:xxx"` 声明，后续用 `nodeId: "tmp:xxx"` 引用
- 部分失败不会自动回滚，需手动清理

---

## 8. 换组件库时的迁移指南

如果未来从 shadcn/ui 切换到其他组件库（如 Radix Themes、Ant Design、Material UI 等），请参考本文件建立新的 skill：

1. **运行全量组件扫描**
   ```
   get_local_components()  →  解析 18 component sets + standalone components + icons
   ```

2. **建立新的 nodeId 映射表**（参考第 2、3、4 节格式）

3. **更新颜色 token**（第 5 节）

4. **验证跨页 create_instance 是否正常**（参考第 7 节）

5. **在 `skills/` 下创建新文件夹**，命名建议：`<library-name>-component-library/README.md`

---

## 9. 参考资源

- shadcn/ui 官网: https://ui.shadcn.com
- Lucide Icons: https://lucide.dev
- figma-mcp-bridge PR #50 (cross-page create_instance): https://github.com/Liar0320/figma-mcp-bridge/pull/50
- figma-mcp-bridge PR #1 (token graph): https://github.com/Liar0320/figma-mcp-bridge/pull/1
