## Intake Audit

### 仓库定位

`figma-mcp-bridge` 不是直接请求 Figma HTTP API 的 MCP。它由两部分组成：

- Figma plugin：运行在 Figma 内部，读取当前文件、选区、节点、styles、variables，并执行截图导出。
- MCP server：走 stdio 暴露工具；leader 持有插件 WebSocket 连接，follower 通过 `POST /rpc` 代理请求到 leader。

### 工具审计表

| 项目 | 结论 |
| --- | --- |
| 核心工具族 | 1) 文档与节点上下文：`get_document` `get_selection` `get_node` `get_metadata` `get_design_context` 2) 设计系统数据：`get_styles` `get_variable_defs` 3) 导出：`get_screenshot` `save_screenshots` |
| 主工作流 | 1) 先确认页面/选区，再读 design context 2) 拿到合法 `nodeId` 后再查 `get_node` 3) 需要 tokens 时单独读 `get_variable_defs` 4) 需要图片时先决定 base64 还是直接落盘 5) 出错时先判断插件连接、再判断参数 |
| 易错参数 | `nodeId` 必须是冒号格式；`get_node` 只接受单个 `nodeId`；`get_screenshot` 的 `nodeIds` 可省略但会退回当前选区；`save_screenshots.items[].outputPath` 必须位于 server 当前工作目录内；`format` 与扩展名冲突会报错；已有文件不会被覆盖 |
| 常见失败原因 | 插件未连接；选区为空但又没有传 `nodeIds`；传了连字符格式 ID；节点不存在；导出路径越界；导出路径扩展名与 `format` 冲突；目标文件已存在；leader 未就绪或 follower 访问 leader 失败 |
| 不支持或限制 | 不通过 Figma API 拉远端文件；只能读取当前打开文件/当前页上下文；只能连本地 `ws://localhost:1994/ws`；`save_screenshots` 仍依赖插件端 `get_screenshot`；仓库无现成测试覆盖这些技能文档 |
| 建议 skill 数量 | 1 个入口 skill + 3 个领域 skill + 1 个 debug skill + 顶层审计与验证文档 |

### 典型调用链

#### 1. 读当前设计上下文

`get_metadata` -> `get_selection` 或 `get_document` -> `get_design_context` -> 如需节点细查再 `get_node`

#### 2. 读 design tokens

先确认当前文件/页面正确 -> `get_styles` 看本地样式 -> `get_variable_defs` 看变量集合、modes 和 alias

#### 3. 导出图片

先确定目标节点来源（选区或显式 `nodeIds`） -> 决定返回 base64 还是直接保存文件 -> `get_screenshot` 或 `save_screenshots` -> 检查格式、扩展名与输出路径

#### 4. 排查失败

先看是否是连接问题 -> 再看 `nodeId` / `nodeIds` / `outputPath` / `format` -> 再判断是插件端报错还是 leader/follower 转发链路报错

### 设计这套 skill 时要持续防的误用

- 先上 `get_node`，却没有可靠 `nodeId` 来源
- 把 Figma `123:456` 写成 `123-456`
- 需要局部理解，却直接拉完整 document tree
- 需要文件落盘，却误用只返回 base64 的 `get_screenshot`
- 把绝对路径或越界路径塞给 `save_screenshots`
- 忘了插件必须开着且要连上本地 bridge
