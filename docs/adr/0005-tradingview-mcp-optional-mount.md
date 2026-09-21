# 接入 TradingView 官方 MCP：可选挂载、用户自带账号

推翻 ADR-0004。TradingView 官方 MCP（`https://mcp.tradingview.com/mcp`）是 host-agnostic 的：官方文档写明"任何支持 MCP over Streamable HTTP + OAuth 2.1 的客户端都能用"，示例覆盖 Claude / ChatGPT / Codex 与通用 MCP host；它自己还提供 `get_technicals_rating` 这类指标快照，说明"由 agent 读取数据并做技术分析"正是它服务的形态。因此"让 agent 使用 TradingView 数据"不再是我们的排除项。

由于 DSH 自带的 MCP client 只支持 stdio 与静态 header 的 streamable-http、**没有 OAuth**（已安装 0.1.6-alpha.1 与源码 alpha.2 一致），接入方式是用本地 OAuth 桥 `mcp-remote` 把官方端点桥接成 stdio，由用户在自己的 DSH 里挂载。**插件不内置、不预置、不默认启用这条接入**；每个用户用自己的 TradingView 账号（Essential 及以上、非 trial）完成 OAuth。操作步骤见 [docs/tradingview-mcp-mount.md](../tradingview-mcp-mount.md)，事实与来源见 [docs/research/tradingview-mcp-integration.md](../research/tradingview-mcp-integration.md)。

## 后果 (Consequences)

- **不缓存、不再分发** TradingView 数据；token 由桥保存在用户本机（`~/.mcp-auth`）。
- **不进入自动化决策/执行链路**：不拿它的数据驱动告警、下单、风控等动作。
- **不进发布产物**：仓库与 npm 包不含 TradingView 的 URL、OAuth client、token 路径或桥接命令；挂载方式以文档提供。
- **商业化是另一回事**：最终形态（云端部署的服务类应用）比本地插件更接近 ToS 的 "third-party products/services"；若用于收费，须先取得 TradingView 的单独书面许可。
- **残留不确定性**：ToS §3 字面禁止 `machine-driven processes`，与官方 MCP 的存在自相矛盾，且没有 MCP 专属条款。当前判断是"交互式、人读的分析在预期用法内；产品化 / 商用 / 缓存再分发才是暴露面"。这是风险读法，不是法律意见。

## 状态 (Status)

accepted；取代 ADR-0004。
