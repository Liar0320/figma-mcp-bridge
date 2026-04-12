## Discovery Workflows

### 1. 从当前工作区开始

如果用户只是说“看看这个设计”或“分析当前页面”：

1. `get_metadata`
2. `get_selection`
3. 如果有选区，`get_design_context`
4. 如果没有选区，再决定是 `get_design_context` 还是 `get_document`

### 2. 从 nodeId 开始

只有在以下来源之一已经给出 ID 时才进入这条路：

- 之前某次 `get_selection` 的返回
- `get_document` / `get_design_context` 返回中的 `id`
- 用户明确给出且格式正确的 `123:456`

然后才调用 `get_node`。

### 3. 何时选 `get_document`

用在这些场景：

- 要扫整页节点层级
- 需要当前页完整 document tree
- 能接受更大响应体

### 4. 何时选 `get_design_context`

用在这些场景：

- 只想理解局部设计块
- 希望减少 token 噪音
- 想通过 `depth` 控制展开层数

### 5. 已知语义差异

- `get_document` 返回当前页 document tree。
- `get_selection` 只返回当前选中的节点数组。
- `get_design_context` 在有选区时以选区为中心，在无选区时退回当前页，并且会按 `depth` 截断子树。
