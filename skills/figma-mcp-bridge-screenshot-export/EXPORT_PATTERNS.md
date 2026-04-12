## Export Patterns

### 先选工具

| 需求 | 工具 |
| --- | --- |
| 我只要图片内容，后面自己处理 | `get_screenshot` |
| 我想直接保存到本地文件 | `save_screenshots` |

### `get_screenshot` 规则

- 参数：`nodeIds?`、`format?`、`scale?`
- 默认 `format` 为 `PNG`
- 默认 `scale` 为 `2`
- 未传 `nodeIds` 时，导出当前选区
- 返回结果是 base64，不会写磁盘

### `save_screenshots` 规则

- 参数：`items[]`，每项至少包含 `nodeId` 和 `outputPath`
- 每项还可以单独覆盖 `format` / `scale`
- 顶层 `format` / `scale` 是默认值
- server 会先校验路径，再通过插件导出，再写文件

### 常见失败原因

- 既没传 `nodeIds`，当前选区又为空
- `nodeId` 不存在或不是合法冒号格式
- `outputPath` 超出 MCP server 工作目录
- `format` 和文件扩展名冲突
- 目标文件已经存在

### 推荐顺序

1. 先确认目标节点来自选区还是显式 ID。
2. 如果用户要本地文件，明确文件名和扩展名。
3. 再决定是否传 `scale`。
4. 导出失败时，先看连接和节点存在性，再看路径和格式。
