## Intake Audit

### 仓库定位

`figma-mcp-bridge` 不是直接请求 Figma HTTP API 的 MCP。它由两部分组成：

- Figma plugin：运行在 Figma 内部，读取当前文件、选区、节点、styles、variables，并执行截图导出。
- MCP server：走 stdio 暴露工具；leader 持有插件 WebSocket 连接，follower 通过 `POST /rpc` 代理请求到 leader。

### 工具审计表

| 项目 | 结论 |
| --- | --- |
| 核心工具族 | 1) 文档与节点上下文：`get_document` `get_selection` `get_node` `get_metadata` `get_design_context` 2) 设计系统数据：`get_styles` `get_variable_defs` 3) 导出：`get_screenshot` `save_screenshots` 4) 写入：`create_frame` `create_text` `create_rectangle` `append_children` `find_nodes` `set_position` `set_size` `set_fills` `set_strokes` `set_corner_radius` `set_text_content` `set_text_style` `set_layout_mode` `set_padding` `set_item_spacing` `delete_node` `batch_mutation` |
| 主工作流 | 1) 先确认页面/选区，再读 design context 2) 拿到合法 `nodeId` 后再查 `get_node` 3) 需要 tokens 时单独读 `get_variable_defs` 4) 需要图片时先决定 base64 还是直接落盘 5) 需要写入时先确认目标 `nodeId` 来源，复杂操作用 `batch_mutation` 6) 出错时先判断插件连接、再判断参数 |
| 易错参数 | `nodeId` 必须是冒号格式；`get_node` 只接受单个 `nodeId`；`get_screenshot` 的 `nodeIds` 可省略但会退回当前选区；`save_screenshots.items[].outputPath` 必须位于 server 当前工作目录内；`format` 与扩展名冲突会报错；已有文件不会被覆盖；颜色必须用 `#RRGGBB`/`#RRGGBBAA`；`batch_mutation` 的 `tmp:` 引用必须先在 `ref` 字段声明 |
| 常见失败原因 | 插件未连接；选区为空但又没有传 `nodeIds`；传了连字符格式 ID；节点不存在；导出路径越界；导出路径扩展名与 `format` 冲突；目标文件已存在；leader 未就绪或 follower 访问 leader 失败；写操作在没有合法 `nodeId` 时直接调用 setter；`batch_mutation` 部分失败后误以为全部回滚 |
| 不支持或限制 | 不通过 Figma API 拉远端文件；只能读取/写入当前打开文件/当前页上下文；只能连本地 `ws://localhost:1994/ws`；`save_screenshots` 仍依赖插件端 `get_screenshot`；写操作不可跨页；`delete_node` 不可逆 |
| 建议 skill 数量 | 1 个入口 skill + 4 个领域 skill + 1 个 debug skill + 顶层审计与验证文档 |

### 典型调用链

#### 1. 读当前设计上下文

`get_metadata` -> `get_selection` 或 `get_document` -> `get_design_context` -> 如需节点细查再 `get_node`

#### 2. 读 design tokens

先确认当前文件/页面正确 -> `get_styles` 看本地样式 -> `get_variable_defs` 看变量集合、modes 和 alias

#### 3. 导出图片

先确定目标节点来源（选区或显式 `nodeIds`） -> 决定返回 base64 还是直接保存文件 -> `get_screenshot` 或 `save_screenshots` -> 检查格式、扩展名与输出路径

#### 4. 写入节点

先确认目标节点 `nodeId` 来源（`get_selection`、`find_nodes` 或已知 ID） -> 单个属性用对应 setter -> 多步操作用 `batch_mutation` + `tmp:` 引用 -> 确认颜色格式为 `#RRGGBB`

#### 5. 排查失败

先看是否是连接问题 -> 再看 `nodeId` / `nodeIds` / `outputPath` / `format` -> 再判断是插件端报错还是 leader/follower 转发链路报错

### 设计这套 skill 时要持续防的误用

- 先上 `get_node`，却没有可靠 `nodeId` 来源
- 把 Figma `123:456` 写成 `123-456`
- 需要局部理解，却直接拉完整 document tree
- 需要文件落盘，却误用只返回 base64 的 `get_screenshot`
- 把绝对路径或越界路径塞给 `save_screenshots`
- 忘了插件必须开着且要连上本地 bridge
- 在没有 `nodeId` 来源时直接调用写入 setter
- 颜色用 `rgb(...)` 格式而不是 `#RRGGBB`
- `batch_mutation` 中用 `tmp:xxx` 但忘记在创建操作上声明 `ref`
- 误以为 `batch_mutation` 部分失败会回滚所有操作
