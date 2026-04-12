## Safety Rules

### 全局前置条件

- Figma 插件必须已打开，并且 UI 侧成功连接 `ws://localhost:1994/ws`。
- 这个 bridge 只读当前打开的 Figma 文件，不会帮你通过远端 API 打开别的文件。

### 参数规则

- `get_node.nodeId` 必填，且必须是冒号格式。
- `get_screenshot.nodeIds` 可以省略；省略后会退回当前选区。
- `save_screenshots.items[].nodeId` 和 `outputPath` 都是必填。
- `depth` 只影响 `get_design_context`，不要误传给别的工具。

### 导出与文件系统规则

- `save_screenshots` 的 `outputPath` 会按 server 当前工作目录解析。
- 超出当前工作目录的路径会被拒绝。
- `format` 与文件扩展名冲突会报错。
- 已存在文件会触发 `File already exists at outputPath`，不会覆盖。

### 错误归因顺序

1. 先看插件是否连接。
2. 再看 `nodeId` / `nodeIds` 是否合法。
3. 再看是否选中了节点或目标节点真实存在。
4. 最后才看导出格式、路径和文件覆盖问题。
