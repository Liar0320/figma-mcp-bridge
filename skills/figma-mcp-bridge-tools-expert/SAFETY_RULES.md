## Safety Rules

### 全局前置条件

- Figma 插件必须已打开，并且 UI 侧成功连接 `ws://localhost:1994/ws`。
- 这个 bridge 只读/写当前打开的 Figma 文件，不会帮你通过远端 API 打开别的文件。

### 参数规则

- `get_node.nodeId` 必填，且必须是冒号格式。
- `get_screenshot.nodeIds` 可以省略；省略后会退回当前选区。
- `save_screenshots.items[].nodeId` 和 `outputPath` 都是必填。
- `depth` 只影响 `get_design_context`，不要误传给别的工具。
- 所有写入工具的 `nodeId` 必须是冒号格式（`123:456`），不能用连字符。
- 颜色必须用 `#RRGGBB` 或 `#RRGGBBAA` 格式，不接受 `rgb(...)` 或命名颜色。
- `batch_mutation` 中使用 `tmp:xxx` 引用前，必须在同一批次的前序操作中通过 `ref: "tmp:xxx"` 声明。

### 导出与文件系统规则

- `save_screenshots` 的 `outputPath` 会按 server 当前工作目录解析。
- 超出当前工作目录的路径会被拒绝。
- `format` 与文件扩展名冲突会报错。
- 已存在文件会触发 `File already exists at outputPath`，不会覆盖。

### 写入操作规则

- 写操作只作用于当前页面，不能跨页。
- `delete_node` 不可逆，执行前确认 `nodeId` 正确。
- `batch_mutation` 最多 100 个操作，按顺序执行；部分失败不会回滚已成功的操作。
- 调用 setter 前必须有可靠的 `nodeId` 来源，不要凭空猜测。

### 错误归因顺序

1. 先看插件是否连接。
2. 再看 `nodeId` / `nodeIds` 是否合法。
3. 再看是否选中了节点或目标节点真实存在。
4. 涉及导出落盘时，再查 `outputPath`、扩展名和文件覆盖问题。
5. 涉及写入时，再查颜色格式、`tmp:` 引用声明和页面作用域。
