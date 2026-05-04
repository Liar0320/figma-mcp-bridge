## Write Patterns

### 工具速查

| 目标 | 工具 |
| --- | --- |
| 创建 frame | `create_frame` |
| 创建文字节点 | `create_text` |
| 创建矩形 | `create_rectangle` |
| 把已有节点移入父节点 | `append_children` |
| 查找当前页节点 | `find_nodes` |
| 设置位置 | `set_position` |
| 设置尺寸 | `set_size` |
| 设置填充色 | `set_fills` |
| 设置描边 | `set_strokes` |
| 设置圆角 | `set_corner_radius` |
| 设置文字内容 | `set_text_content` |
| 设置文字样式 | `set_text_style` |
| 设置 auto-layout 方向 | `set_layout_mode` |
| 设置 auto-layout 内边距 | `set_padding` |
| 设置 auto-layout 间距 | `set_item_spacing` |
| 重命名节点 | `set_node_name`（`rename_node` 是别名） |
| 删除节点 | `delete_node` |
| 批量有序执行多个操作 | `batch_mutation` |

### 颜色格式

填充和描边的颜色统一用 `#RRGGBB` 或 `#RRGGBBAA` 格式，例如：

```json
{ "type": "SOLID", "color": "#FF5733", "opacity": 0.9 }
```

### 场景 1：创建一个带文字的 frame

单独调用时：

1. `create_frame` → 拿到返回的 `nodeId`
2. `create_text` with `parentId` 指向上一步的 `nodeId`

或用 `batch_mutation` 一次完成：

```json
{
  "operations": [
    { "type": "create_frame", "ref": "tmp:card", "params": { "name": "Card", "width": 320, "height": 200 } },
    { "type": "create_text", "params": { "parentId": "tmp:card", "characters": "Hello" } }
  ]
}
```

### 场景 2：修改已有节点

先通过 `get_selection` 或 `find_nodes` 拿到合法 `nodeId`，再调用对应 setter：

```json
// set_fills
{ "nodeId": "123:456", "fills": [{ "type": "SOLID", "color": "#0066FF" }] }
```

### 场景 3：批量操作与 tmp: 引用

`batch_mutation` 中，`ref` 字段声明一个临时引用名，后续操作可以在 `nodeId` 或 `parentId` 中用该名称引用刚创建的节点：

```json
{
  "operations": [
    { "type": "create_frame", "ref": "tmp:wrapper", "params": { "width": 400, "height": 300 } },
    { "type": "set_fills", "nodeId": "tmp:wrapper", "params": { "fills": [{ "type": "SOLID", "color": "#FFFFFF" }] } },
    { "type": "create_text", "params": { "parentId": "tmp:wrapper", "characters": "Title" } }
  ]
}
```

### 场景 4：查找节点

`find_nodes` 支持按 `name`、`key`、`parentId` 过滤，返回当前页匹配的节点列表：

```json
{ "name": "Button", "parentId": "123:456" }
```

### 常见错误

- 在没有 `nodeId` 来源时直接调用 setter → 先用 `find_nodes` 或 `get_selection` 拿 ID
- `batch_mutation` 中忘记加 `ref` 就在后续操作引用 `tmp:xxx` → 确保创建操作带 `ref` 字段
- 颜色写成 `rgb(...)` 或 `rgba(...)` → 必须用 `#RRGGBB` / `#RRGGBBAA`
- `delete_node` 后还尝试对该节点做操作 → 删除不可逆，检查操作顺序
- `batch_mutation` 部分失败后假设所有操作都回滚 → 只有失败操作本身不生效，之前成功的操作已持久化
