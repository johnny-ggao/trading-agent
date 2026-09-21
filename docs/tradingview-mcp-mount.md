# 挂载 TradingView 官方 MCP（可选、用户自带账号）

> 决策背景与边界见 [ADR-0005](adr/0005-tradingview-mcp-optional-mount.md)；事实与一手来源见 [调研文档](research/tradingview-mcp-integration.md)。本页只是操作步骤。

**前提：** 你本人持有 **Essential 及以上、且非 trial** 的 TradingView 账号。

**为什么需要桥：** 官方端点只支持 Streamable HTTP + OAuth 2.1、没有 API key；DSH 自带的 MCP client 支持 stdio 与静态 header 的 streamable-http、**没有 OAuth**。所以用 `mcp-remote` 在本机处理 OAuth，再以 stdio 暴露给 DSH。

## Step 0 —— 先单独跑通授权

```sh
npx -p mcp-remote@latest mcp-remote-client https://mcp.tradingview.com/mcp --transport http-only
```

成功判据：浏览器完成 OAuth 后，命令输出远端工具列表，且 `~/.mcp-auth` 出现 token。
失败时先 `rm -rf ~/.mcp-auth` 重来。

## Step 1 —— 挂到你自己的 DSH（不要写进本仓库）

在 `$DSH_HOME/cordis.patch.yml`（默认 `~/.dsh/cordis.patch.yml`，或 `--patch` 指定的覆盖层）里加：

```yaml
- insert:
    - id: mcp-tradingview
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: tradingview
        transport: stdio
        command: npx
        args: ['-y', 'mcp-remote@0.14.3', 'https://mcp.tradingview.com/mcp',
               '--transport', 'http-only', '--ignore-tool', 'get_ohlcv']
```

`--ignore-tool` 把远端工具收窄成白名单（上面只留 `get_ohlcv`）；需要别的工具就继续追加。启动后模型应能看到 `mcp__tradingview__get_ohlcv`。

**注意：** DSH 的 stdio 连接会先起一个探针子进程再起服务进程。授权完成前探针可能失败；先按 Step 0 把 token 拿到手再挂更稳。

## Step 2 —— 与插件解耦的验证

问一个**纯展示**的问题（例如"用 TradingView 的 `get_ohlcv` 列出 NVDA 近 30 天收盘价"），确认：

- 模型只是把数字读给你；
- `trading_chart` 的入参仍只来自 Binance，没有任何 TradingView 字段进入 chartSpec / 机械候选 / 规则信号 / 市场状态。

## 边界（摘自 ADR-0005）

- 不缓存、不再分发 TradingView 数据；token 只在你本机。
- 不用于告警、下单、风控等自动化决策/执行。
- 不把这条配置写入本仓库或 npm 产物。
- 商业化（含云端服务）使用前，先取得 TradingView 的单独书面许可。
