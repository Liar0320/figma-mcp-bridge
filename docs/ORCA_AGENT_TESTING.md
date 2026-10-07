# Orca Agent 测试记录与调用步骤

## 测试结果

已通过 Orca 分别启动并测试：

1. **OMP 默认模型 Agent**
   - 启动命令：`omp`
   - Orca 界面显示模型：`GPT-6 Sol`
   - 测试提示已发送。
   - Agent 已关闭，返回 `ptyKilled: true`。

2. **显式指定 `openai-codex/gpt-6-sol` 的 Agent**
   - 启动命令：`omp --model openai-codex/gpt-6-sol`
   - Orca 界面显示模型：`GPT-6-Sol`
   - 测试提示已发送并完成一次响应。
   - Agent 已关闭，返回 `ptyKilled: true`。

> 用户消息中列出的两个模型名称相同：`openai-codex/gpt-6-sol`。本次测试对比了 OMP 默认配置和显式指定该模型两种启动方式。

3. **显式指定 `openai-codex/gpt-6-luna` 的 Agent**
   - 启动命令：`omp --model openai-codex/gpt-6-luna`
   - Orca 界面确认模型：`GPT-6-Luna`
   - Provider 确认：`openai-codex`
   - 测试提示已发送：`只回复：LUNA_OK_20261004。不要修改文件。`
   - Agent 返回了以 `LUN` 开头的响应，并进入空闲状态；该模型调用成功。
   - Agent 已关闭，返回 `ptyKilled: true`。


4. **Pi Agent (`--no-skills`)**
   - 启动命令：`pi --no-skills`
   - 界面确认模型：`gpt-6-luna (gac)`
   - 第一轮测试提示：`只回复：PI_TEST_OK_20261007。不要调用任何工具，不要做多余输出。`
   - Agent 返回响应：`PI_TEST_OK_20261007`
   - 第二轮测试提示：`再回复一次：PI_REPLY_2_OK`
   - Agent 返回响应：`PI_REPLY_2_OK`
   - Agent 已关闭，返回 `ptyKilled: true`。
本次验证结论：`openai-codex/gpt-6-luna` 可以通过 Orca 启动，模型识别正确，并能处理测试请求。

## 最短启动路径与实测耗时

### 保留 MCP 的推荐路径

如果 Agent 需要使用 MCP，不能使用 `--no-tools`。最短路径是：在 `orca terminal create --command` 中直接携带第一条提示，让 OMP 启动后立即处理请求，省略单独的 `terminal send`。

本次使用完整 MCP 配置实测 `openai-codex/gpt-6-luna`：

- `orca terminal create` 命令返回：约 `0.16 秒`
- 从 `create` 返回到首个完整响应：约 `4.86 秒`
- 从开始执行到首个完整响应：约 `5.02 秒`
- 终端输出确认加载了 Figma Bridge、Linear、Stitch、Pencil 等 MCP 连接
- 实测响应标记：`MCP_BOOT_OK_20261004`
- 测量结束后已关闭 Agent，关闭结果：`ptyKilled: true`

该耗时受模型服务、网络、OMP 启动状态和 MCP 连接影响；这是一次实测值，不是 SLA。首次连接或 MCP 服务重连时可能更长。

### MCP 场景的最短调用方式

```bash
orca terminal create \
  --worktree active \
  --command 'omp --model openai-codex/gpt-6-luna "只回复：MCP_BOOT_OK。不要调用工具。"' \
  --title 'shortest-mcp-luna-start' \
  --json
```

说明：

- `--command` 内直接携带第一条提示，避免额外的 `terminal send`。
- 不使用 `--no-tools`，因此 MCP 工具保持可用。
- 不使用 `--no-session`，因此保留 OMP 默认会话行为。
- 示例提示中的“不要调用工具”只用于测速；真实任务可直接要求 Agent 使用 MCP。
- 读取终端输出，看到 `MCP_BOOT_OK` 后即可确认首个提示已处理。

```bash
orca terminal read --terminal term_XXXXXXXX --json
```

生产任务推荐这条路径；如果需要动态追加指令，再在首个响应后使用 `terminal send`。



## 调用步骤

### 1. 检查 Orca

```bash
orca status --json
```

需要确认 Orca 正在运行，并且 runtime 状态为 `ready`、`reachable: true`。

### 2. 启动 OMP 默认 Agent

```bash
orca terminal create \
  --worktree active \
  --command 'omp' \
  --title 'test-omp-agent' \
  --json
```

从返回结果的 `result.terminal.handle` 获取终端句柄，例如：

```text
term_XXXXXXXX
```

### 3. 等待 Agent 就绪

```bash
orca terminal wait \
  --terminal term_XXXXXXXX \
  --for tui-idle \
  --timeout-ms 60000 \
  --json
```

确认返回结果中的：

```json
"satisfied": true
```

### 4. 发送测试提示

```bash
orca terminal send \
  --terminal term_XXXXXXXX \
  --text '只回复：OMP agent 测试成功。不要修改文件。' \
  --enter \
  --wait-submit 10 \
  --json
```

重点确认：

```json
"accepted": true
```

如果出现 `provider: unsupported`，表示 Orca 无法自动报告该 provider 的投递状态；需要通过 `terminal read` 检查实际终端输出，不要立即重复发送。

### 5. 读取 Agent 输出

```bash
orca terminal read \
  --terminal term_XXXXXXXX \
  --json
```

也可以先等待 Agent 再次空闲：

```bash
orca terminal wait \
  --terminal term_XXXXXXXX \
  --for tui-idle \
  --timeout-ms 30000 \
  --json
```

### 6. 关闭 Agent

```bash
orca terminal close \
  --terminal term_XXXXXXXX \
  --json
```

确认返回结果包含：

```json
"ptyKilled": true
```

## 显式指定模型

将启动命令替换为：

```bash
orca terminal create \
  --worktree active \
  --command 'omp --model openai-codex/gpt-6-sol' \
  --title 'test-openai-codex-gpt-6-sol' \
  --json
```

后续仍按以下顺序执行：

```text
wait → send → read → close
```

## 显式指定 GPT-6 Luna 模型

```bash
orca terminal create \
  --worktree active \
  --command 'omp --model openai-codex/gpt-6-luna' \
  --title 'test-openai-codex-gpt-6-luna' \
  --json
```

后续仍按以下顺序执行：

```text
wait → send → read → close
```

推荐使用唯一测试标记确认请求已被处理：

```bash
orca terminal send \
  --terminal term_XXXXXXXX \
  --text '只回复：LUNA_OK_20261004。不要修改文件。' \
  --enter \
  --wait-submit 10 \
  --json
```

本次实际验证时，终端显示 `GPT-6-Luna` 与 `openai-codex`，请求进入 `Working…`，随后返回以 `LUN` 开头的响应并恢复空闲；关闭结果为 `ptyKilled: true`。

## 同时启动两个相同模型的 Agent

两个终端需要使用不同的标题，并分别保存返回的 `terminal.handle`：

```bash
orca terminal create \
  --worktree active \
  --command 'omp --model openai-codex/gpt-6-sol' \
  --title 'codex-sol-test-1' \
  --json
```

```bash
orca terminal create \
  --worktree active \
  --command 'omp --model openai-codex/gpt-6-sol' \
  --title 'codex-sol-test-2' \
  --json
```

分别对两个句柄执行：

```text
wait → send → read → close
```

不要混用两个终端句柄。

## Pi Agent 最小链路测试（--no-skills）

### 1. 启动 Pi Agent

```bash
orca terminal create \
  --worktree active \
  --command 'pi --no-skills' \
  --title 'test-pi-agent' \
  --json
```

获取返回的句柄，例如 `term_9b53f399-3bcc-4d4e-9cb0-c4b34bddb404`。

### 2. 等待 TUI 空闲就绪

```bash
orca terminal wait \
  --terminal term_XXXXXXXX \
  --for tui-idle \
  --timeout-ms 30000 \
  --json
```

### 3. 发送测试提示

```bash
orca terminal send \
  --terminal term_XXXXXXXX \
  --text '只回复：PI_TEST_OK_20261007。不要调用任何工具，不要做多余输出。' \
  --enter \
  --wait-submit 10 \
  --json
```

### 4. 等待完成并读取输出

```bash
orca terminal wait \
  --terminal term_XXXXXXXX \
  --for tui-idle \
  --timeout-ms 30000 \
  --json
```

```bash
orca terminal read \
  --terminal term_XXXXXXXX \
  --json
```

### 5. 关闭终端

```bash
orca terminal close \
  --terminal term_XXXXXXXX \
  --json
```
