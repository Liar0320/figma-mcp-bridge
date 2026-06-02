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

## 5. 设计 Token

> 所有 token 以 **Figma Local Style** 形式存在（source: style），不是 Figma Variables。  
> 用 `get_design_tokens` 可获取完整列表；用 `set_text_style` / `set_fills` 时引用 figmaId。  
> 总计：颜色 222 个、typography 21 个、effect 1 个，共 244 个。

### 颜色色板（Tailwind 原子色）

色板命名格式：`color.<palette>.<shade>`，shade 范围 50–900。

| Palette | 代表色（500） | 常用语义对应 |
|---|---|---|
| slate | `#64748B` | 文字次色、边框基础色 |
| gray | `#6B7280` | — |
| zinc | `#71717A` | — |
| neutral | `#737373` | — |
| stone | `#78716C` | — |
| red | `#EF4444` | 错误/趋势负 |
| orange | `#F97316` | — |
| amber | `#F59E0B` | 警告/趋势橙 |
| yellow | `#EAB308` | — |
| lime | `#84CC16` | — |
| green | `#22C55E` | 成功 |
| **emerald** | **`#10B981`** | **趋势正（常用）** |
| teal | `#14B8A6` | — |
| cyan | `#06B6D4` | — |
| sky | `#0EA5E9` | — |
| blue | `#3B82F6` | — |
| **indigo** | **`#6366F1`** | **Primary（默认主题）** |
| violet | `#8B5CF6` | — |
| purple | `#A855F7` | — |
| fuchsia | `#D946EF` | — |
| pink | `#EC4899` | — |
| rose | `#F43F5E` | — |
| white | `#FFFFFF` | — |
| black | `#000000` | — |

**语义映射（shadcn/ui 默认主题）：**

| 语义 | token path | 颜色值 | figmaId |
|---|---|---|---|
| Background | `color.slate.50` | `#F8FAFC` | `S:85010f5ecd3c72905179cab438a66501199fc4c2` |
| Surface/Card | `color.white` | `#FFFFFF` | `S:220e8566c10bf8d2a5f4938f651ee80a4b169b23` |
| Primary | `color.indigo.500` | `#6366F1` | `S:804ee80a79bf36f1a879d58bd6b673c05cd45acd` |
| Primary Hover | `color.indigo.600` | `#4F46E5` | `S:67615d720c4347a3a404d4f54bd79ba4d467c30a` |
| Primary Subtle | `color.indigo.50` | `#EEF2FF` | `S:3a3313e44fb7d0f9b69b4f3be9f5d074a5b2e79b` |
| Text Primary | `color.slate.800` | `#1E293B` | `S:77e204934919705732632eb04ce0457741077933` |
| Text Secondary | `color.slate.500` | `#64748B` | `S:f525fb4ef3724d6a31e113ed473c3049af745087` |
| Text Muted | `color.slate.400` | `#94A3B8` | `S:d96521249019e37da01301d9d42afc0551776a2c` |
| Border | `color.slate.200` | `#E2E8F0` | `S:9705f83bd6cb6ada0dbd96ee1b39d5b118c22a8a` |
| Border Light | `color.slate.100` | `#F1F5F9` | `S:de1f2451ffb268fbc12dbbc55a5c8a14088322ec` |
| Trend Positive | `color.emerald.500` | `#10B981` | `S:c21c37535c2540a405757b92fe8a050e11c4cbc9` |
| Trend Positive Bg | `color.emerald.50` | `#ECFDF5` | `S:9c0c0b883f24df63ade4bb181c8d323c7671a6c3` |
| Trend Negative | `color.red.500` | `#EF4444` | `S:13408dce3b5d2c60f07f4435af848e663884d994` |
| Trend Negative Bg | `color.red.50` | `#FEF2F2` | `S:8d4c90ec6e17a3f397638b52ea515d532b403e18` |
| Trend Warning | `color.amber.500` | `#F59E0B` | `S:f7b67fdbd2ad74b23c83c3712cc5b1af0ec8dfba` |

> ⚠️ **shadcn/ui 没有 primary/secondary 等语义 token 层**（那层在代码 CSS variables 里），Figma 里只有 Tailwind 原子色板。  
> 其他任意色值的 figmaId 通过 `get_design_tokens()` 获取，格式 `color.<palette>.<shade>`。

### Typography Token（21 个，全部 Inter 字体）

| token path | 字体 | 大小 | 行高 | 用途 | figmaId |
|---|---|---|---|---|---|
| `typography.h1` | Inter ExtraBold | 48 | 48 | 页面大标题 | `S:0fe695b7157184d67f789ebb61a0e4e053551471` |
| `typography.h2` | Inter SemiBold | 30 | 36 | 区域标题 | `S:ff49db7fe536075652d4ab7c06d653a9db8392ff` |
| `typography.h3` | Inter SemiBold | 24 | 32 | 卡片标题 | `S:e659b9a7cdb22160d3a557baaf2bef1970041031` |
| `typography.h4` | Inter SemiBold | 20 | 28 | 小标题 | `S:8d1c68c322129798fb20ab9b5bcbf3519f1e2cac` |
| `typography.large` | Inter SemiBold | 18 | 28 | 大号正文 | `S:ed9532a0e7ab7e3d4a7b2599c1ef5fb83f937dcc` |
| `typography.lead` | Inter Regular | 20 | 28 | 导语 | `S:d8e21dbe85f77cfe6350a20b962f2f8b932a7d1c` |
| `typography.p` | Inter Regular | 16 | 28 | 段落正文 | `S:b29027cb9fab8aca2974eb22bac277025a08a36f` |
| `typography.p-ui` | Inter Regular | 16 | 24 | UI 正文 | `S:3f8cc14f0dadb9cfb9c403801c847cc5f2bd7251` |
| `typography.p-ui-medium` | Inter Medium | 16 | 24 | UI 正文强调 | `S:448284e666af30ced8a3afa4b698adb74e105c9b` |
| `typography.body` | Inter Regular | 14 | 24 | 小正文（最常用） | `S:e3dc925b0cfa6f247fcf9d18e1b51ca838fd2bb5` |
| `typography.body-medium` | Inter Medium | 14 | 24 | 小正文强调 | `S:8e44de222b4ce79a76296c297ef3507f92b06dda` |
| `typography.subtle` | Inter Regular | 14 | 20 | 次要/辅助文字 | `S:eaa356ce30705e155e63bebe08f819a584326022` |
| `typography.subtle-medium` | Inter Medium | 14 | 20 | 次要文字强调 | `S:1958ba6797fb2df5a74397ab28b2a745010a7016` |
| `typography.suble-semibold` | Inter SemiBold | 14 | 20 | 次要文字半粗 | `S:27a8f42d31de7ec430016101fccce9cca217c44d` |
| `typography.small` | Inter Medium | 14 | 14 | 极小标签 | `S:3e9c27c1953fdf437e65a9f0e306c2f08d84a894` |
| `typography.detail` | Inter Medium | 12 | 20 | 说明文字 | `S:001d26f7d20cf2dc31e664d4bb925e818373d463` |
| `typography.blockquote` | Inter Italic | 16 | 24 | 引用块 | `S:3235e068056f4c52334b7444fe5b230b08bf58c8` |
| `typography.inline-code` | Menlo Bold | 14 | 20 | 行内代码 | `S:32b680b7be6e182f64e74612987538711486cd7b` |
| `typography.table-head` | Inter Bold | 16 | 24 | 表头 | `S:60027f3b3e6dace15e5309bbe8dd39cd91a68379` |
| `typography.table-item` | Inter Regular | 16 | 24 | 表格行 | `S:e5f497f80a5fd471bb12047e6b38f06eecaa24ca` |
| `typography.list` | Inter Regular | 16 | 24 | 列表项 | `S:027ddaf325b93c671db4e845cd6e86c69a80842a` |

### Effect Token

| token path | 描述 | figmaId |
|---|---|---|
| `effect.shadow` | `drop-shadow(0 4px 6px rgba(0,0,0,0.09))` — Card/Hover Card 阴影 | `S:64087c283849c85c29bf155d7595ed3d09478e9e` |

---

## 5.5 如何用 Token 替代硬编码

### 当前 MCP 限制

`set_fills` / `set_text_style` 目前只接受属性值（颜色 hex、字体参数），**不支持直接传 figmaId 绑定 style**。

### 推荐工作流

```
1. 用硬编码值创建节点（set_fills / set_text_style）
   → 颜色使用语义映射表对应的 hex 值
   → 字体使用 typography 表对应的 fontFamily/fontSize/lineHeight

2. 创建完毕后，调用 apply_tokens(dryRun: false)
   → 自动扫描文件，将精确匹配 token 值的属性绑定到 Local Style
   → 等效于 Figma 里手动 "Apply Style"

3. 验证结果：get_token_usage() 检查绑定是否成功
```

### 颜色使用示例

```json
// 创建节点时用精确 hex（确保与 token 一致）
set_fills(nodeId, [{ "type": "SOLID", "color": "#6366F1" }])

// 颜色必须与 token 值完全一致，否则 apply_tokens 匹配不上
// Primary = #6366F1 ✅（来自 color.indigo.500）
// Primary = #6367F1 ❌（差一位，无法绑定）
```

### Typography 使用示例

```json
// 创建文本时用 token 对应的属性值
set_text_style(nodeId, {
  "fontFamily": "Inter",
  "fontStyle": "Regular",
  "fontSize": 14,
  "lineHeight": { "unit": "PIXELS", "value": 24 }
})
// 对应 typography.body，apply_tokens 后会自动绑定到该 style
```

### 为什么不直接硬编码

- 后续主题切换（如换 primary 颜色）只需改一个 token，所有绑定节点自动更新
- 设计稿可以 export_design_tokens 生成 CSS variables，与代码保持同步
- `audit_design_tokens` 可以检测出未绑定 token 的游离值

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
