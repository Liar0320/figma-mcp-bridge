## Troubleshooting

### 症状：`Plugin not connected`

优先检查：

1. Figma 插件是否正在当前文件中运行
2. 插件 UI 是否显示已连接
3. server 是否已启动并监听 `localhost:1994`

原因定位：

- 这是 bridge 在发送前发现 WebSocket 没有打开时抛出的错误
- 不是 nodeId 或 schema 问题，先不要去改参数

### 症状：`Request timed out`

优先检查：

1. 插件是否卡住或 Figma 当前文件很重
2. 目标节点是否过多、导出是否过重
3. leader 是否还活着，follower 到 leader 的转发是否正常

原因定位：

- bridge 端超时是 30 秒
- follower 访问 leader `/rpc` 的超时是 35 秒

### 症状：`Node ID must use colon format`

优先检查：

- 是否把 `4029:12345` 写成了 `4029-12345`
- 是否从别的系统复制了被改写格式的 ID

### 症状：`Node not found`

优先检查：

- 这个 ID 是否来自当前打开文件
- 节点是否已经被删除
- 是否误传了 `PAGE` / `DOCUMENT` 级对象

### 症状：`No nodes to export. Select nodes or provide nodeIds.`

优先检查：

- 当前选区是否为空
- 是否本来就应该显式传 `nodeIds`
- 传入的节点查找后是否全被过滤掉了

### 症状：`outputPath must be inside the MCP server working directory`

优先检查：

- 是否传了绝对路径
- 是否用了 `../` 逃逸工作目录
- 是否误以为路径相对于用户 home，而不是 server 当前工作目录

### 症状：`format ... conflicts with outputPath extension`

优先检查：

- `format: "PNG"` 却把文件名写成 `.svg`
- 顶层默认 `format` 和 item 级扩展名/格式不一致

### 症状：`File already exists at outputPath`

优先检查：

- 目标文件是否已存在
- 是否应该换文件名，而不是期待覆盖

### Leader/Follower 相关说明

- 只有 leader 持有插件 WebSocket 连接。
- follower 通过 `POST /rpc` 把工具调用转发给 leader。
- `save_screenshots` 虽然在 server 侧写文件，但图片内容仍然是通过插件端 `get_screenshot` 拿到的，所以插件断开时它一样会失败。
