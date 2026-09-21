# 不使用 TradingView 数据或 TradingView MCP

我们不使用 TradingView 市场数据，也不集成官方 TradingView MCP 服务器。有两个互相独立的限制迫使如此：DSH 附带的 MCP 客户端支持 \`stdio\` 和静态 header 的 \`streamable-http\` 传输，但不支持 OAuth，因此仅支持 OAuth 的 TradingView MCP 无法挂载；并且 TradingView 的使用条款将市场数据许可限定为仅用于展示、个人或内部使用，并明确禁止非展示用途、算法决策，以及依赖其数据用于此类目的的第三方产品——而这正是一个自动化、可分享的分析智能体。

## 后果 (Consequences)

- 市场数据来自 Binance（主要）和 Hyperliquid（补充）的公共端点，无需 key，也不存在再分发问题。
- 官方 MCP 缺少图表图像这一点无关紧要：我们自己渲染交互式图表（ADR-0001），如果模型需要查看，就把我们自己的 canvas 栅格化。
- 社区版 TradingView MCP 服务器也被排除：非官方、基于抓取，且不授予任何数据权利。
- 如果 TradingView 将来提供其条款适合开源自动化智能体的授权数据 API，这个决定值得重新审视。
