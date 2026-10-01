---
name: figma-component-normalizer
description: normalize existing nearhub marketing website figma components through figma-mcp-bridge without changing visual design. use when the user asks to clean up, standardize, make readable, tokenize, or restructure homepage/marketing components such as hero, use case cards, feature sections, pricing, faq, cta, nav, footer, cards, grids, auto layout, naming, variants, or layer hierarchy. inspect selected nodes or node ids, then use mcp tools to preserve the current appearance while improving structure and binding existing variables/styles. do not redesign, create new tokens, or invent new UI.
---

# Figma Component Normalizer

Normalize existing NearHub marketing website Figma modules through `figma-mcp-bridge`.

This skill is not for visual redesign. It preserves the current design while making the component structure more readable, maintainable, and token-based.

## Core purpose

Use MCP tools to:

1. Inspect the selected Figma node or provided node id.
2. Preserve the visual appearance.
3. Improve layer naming and hierarchy.
4. Replace confusing structural hacks with readable auto-layout structure.
5. Bind existing variables/styles for color and typography.
6. Report anything that cannot be safely normalized.

## Non-goals

Do not redesign.

Do not create new visual concepts.

Do not change the apparent layout, spacing, imagery, content, hierarchy, or rhythm unless required to preserve the same visual result with cleaner structure.

Do not create new tokens by default.

Do not invent new UI.

Do not change copywriting.

Do not replace existing design decisions with subjective improvements.

## Required references

Before token/style normalization, consult:

- `references/token_style_rules.md`

Before using figma-mcp-bridge tools, consult:

- `references/figma_mcp_bridge_tools.md`

## Default workflow

### 1. Resolve target

Use this priority:

1. If the user provides node ids, inspect those nodes.
2. If the user says “当前选中”, “selected”, “this component”, or similar, inspect the current Figma selection.
3. If needed, inspect the current document or design context.
4. If multiple files are connected, resolve the correct file first.

Do not ask for clarification when the selected node or provided node id is enough.

### 2. Audit before writing

Check:

- Layer names
- Frame/component hierarchy
- Auto layout mode, gap, padding, sizing
- Transparent spacer nodes
- Hidden hover/CTA/state nodes
- Text style usage
- Fill/stroke token usage
- Raw color values that match existing tokens
- Raw typography values that match existing text styles
- Component/instance state structure
- Generic names such as `Frame 6755`, `Rectangle 1433`, `Vector 890`, `Group 12`

### 3. Preserve appearance

Before applying changes, treat the current visual result as the source of truth.

Allowed changes must keep:

- Same visible layout
- Same size
- Same spacing
- Same colors
- Same typography appearance
- Same images
- Same visible copy
- Same stacking order
- Same default state

If a normalization may visually change the component, do not apply it automatically. Report it as a suggested manual improvement.

## Website module structure conventions

Prefer semantic structure for marketing sections:

```text
Section
├─ Header
│  ├─ Eyebrow optional
│  ├─ Title
│  └─ Description optional
└─ Content
   └─ CardsGrid / FeatureGrid / FAQList / CTAContent
```

For card modules:

```text
UseCaseCard / FeatureCard / PricingCard
├─ Media
├─ Content
│  ├─ Category optional
│  ├─ Title
│  └─ Description
└─ CTA optional
```

For FAQ modules:

```text
FAQSection
├─ Header
└─ FAQList
   └─ FAQItem
      ├─ Question
      ├─ Icon
      └─ Answer
```

For CTA modules:

```text
CTASection
└─ CTAContent
   ├─ Title
   ├─ Description optional
   └─ Actions
```

For Nav/Footer modules:

```text
Nav / Footer
├─ Brand
├─ Links / LinkGroups
└─ Actions optional
```

## Structural normalization rules

### Layer naming

Rename generic layers to semantic names.

Examples:

```text
Frame 6755 -> CardsGrid
Rectangle 1433 -> Media
Frame 6761 -> Content
For Office -> Category
Description -> Description
Frame 6749 -> CTA
Vector 890 -> ArrowIcon
```

Keep names short and meaningful.

Use PascalCase for component/module names:

```text
UseCaseSection
UseCaseCard
FeatureGrid
FAQItem
```

Use readable semantic names for layers:

```text
Header
Title
Description
Media
Content
CTA
Actions
Icon
```

### Transparent spacer nodes

Replace transparent spacer rectangles only when the same visual result can be preserved.

Bad:

```text
Frame
├─ Rectangle opacity 0 height 24
└─ Card
```

Good:

```text
Frame
└─ Card with equivalent spacing/position
```

Use auto-layout gap, padding, or explicit position preservation rather than invisible rectangles.

If removing the spacer changes layout, do not remove it automatically.

### Hidden states

Do not leave important state content as anonymous `opacity: 0` layers.

Convert unclear hidden state layers into readable structure:

```text
CTA / Hidden until hover
```

or component properties/variants if the existing component already supports variants.

Allowed:

```text
State=Default
State=Hover
showCTA=false
```

Do not make hidden content visible unless the user explicitly asks.

### Auto layout

Prefer auto layout when it preserves appearance.

Use auto layout to clarify:

- vertical section stacking
- card content spacing
- grid/list spacing
- button/icon alignment
- header title/description grouping

Do not force auto layout if it changes absolute composition or makes the design drift.

## Token and style rules

Use existing NearHub semantic tokens and typography styles.

Do not create tokens by default.

Do not propose new tokens unless the user explicitly asks to extend the design system.

### Color binding

Bind or replace raw values with existing token/style matches:

- `#222222` -> `content-primary`
- `#555555` -> `content-secondary`
- `#999999` -> `content-tertiary`
- `#FFFFFF` -> `content-white` or `surface`, based on usage
- `#F8F8F8` -> `surface-subdued`
- `#E5E5E5` -> `border-base`
- `#3D6DFF` -> `primary`
- `#6691FF` -> `primary-hover`
- `#294FD9` -> `primary-active`
- `rgba(61,109,255,0.3)` -> `primary-disabled`
- `rgba(61,109,255,0.2)` -> `primary-border`
- `rgba(61,109,255,0.05)` -> `primary-bg`
- `#FF703D` -> `orange`
- `#2EC4B0` -> `teal`

Use context to choose between `content-white` and `surface` for `#FFFFFF`.

### Typography binding

Bind matching text styles:

- Hero headline -> `text-display-1`
- Landing hero title -> `text-display-2`
- Large section title -> `text-heading-1`
- Secondary heading -> `text-heading-2`
- Module title -> `text-heading-3`
- Small module title -> `text-heading-4`
- Card title -> `text-title-1`
- List item title -> `text-title-2`
- Section content title -> `text-title-3`
- Standard paragraph -> `text-body-2`
- Secondary body -> `text-body-3`
- Button/tab text -> `text-label-2` or `text-label-3`
- Small label -> `text-label-4` or `text-label-5`
- Caption/copyright -> `text-caption-1`

If a text layer matches the numeric values of a known style, bind the style.

If no matching style exists in Figma, preserve raw typography and report the missing style.

## MCP write behavior

Use MCP write tools to apply safe normalization directly.

Allowed automatic changes:

- Rename layers
- Create semantic wrapper frames
- Re-parent related nodes when visual stacking is preserved
- Replace transparent spacer nodes with equivalent auto-layout spacing
- Set auto layout mode/gap/padding when appearance is preserved
- Bind existing color variables/styles
- Bind existing typography styles
- Rename hidden state layers clearly
- Organize existing hover/default states into readable variants/properties
- Use batch operations for multiple deterministic edits

Not allowed unless explicitly requested:

- Creating new design tokens
- Creating new typography styles
- Changing colors to different values
- Changing font size, weight, or line height
- Changing copy
- Changing images
- Changing component dimensions for aesthetics
- Adding new CTA/content/visual elements
- Deleting meaningful visual content
- Redesigning layout rhythm

## Tool usage guidance

Prefer read tools first:

- get_selection
- get_node
- get_document
- get_styles
- get_design_context
- get_variable_defs
- get_design_tokens
- get_token_usage
- audit_design_tokens
- get_screenshot

Prefer write tools only after understanding the target:

- set_node_name / rename_node
- set_layout_mode
- set_padding
- set_item_spacing
- append_children
- set_fills
- set_strokes
- set_text_style
- set_component_properties
- set_variant_properties
- batch_mutation

Only use token creation/proposal tools when the user explicitly asks to extend the design system.

## Safety rules

Never modify unrelated nodes.

Never normalize outside the selected node unless the user explicitly expands scope.

Prefer minimal edits.

Use batch mutation for multi-step changes.

If dry-run is available, use it before broad writes.

After writing, re-read or inspect the changed node to verify structure.

## Output format

After execution, respond in Chinese unless the user uses another language.

Use this format:

```text
已完成：
- 将 ... 重命名为 ...
- 将 ... 结构整理为 ...
- 将 ... 绑定到已有 token/style
- 移除了 ...，并用等效 auto-layout spacing 保持视觉不变

未处理：
- ... 可能影响视觉，所以未自动修改
- ... 在 Figma 中没有找到对应 token/style，已保留 raw value
```

Keep the response concise.
