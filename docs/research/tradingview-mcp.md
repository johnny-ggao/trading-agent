# TradingView MCP Server — 事实调查报告

- **调查日期：** 2026-09-21
- **方法：** 仅从一手来源进行事实调查 —— TradingView 自己的博客、帮助/文档页面、
  实时 MCP 端点与 OAuth 发现文档、TradingView 使用条款与支持文章；官方 Model Context
  Protocol registry 与 TypeScript SDK；以及社区服务器的 GitHub 仓库页面 / 原始 README。
  新闻媒体的报道仅用于定位 TradingView 的一手材料，并按要求引用。
- **范围：** 是否存在官方 TradingView MCP server；它暴露了什么；认证、套餐与
  速率限制；安装/使用；自定义 Node/TS agent 能否充当 MCP client；许可
  与使用条款方面的影响；以及它是否返回图表**图像**。
- **为得出以下结论，没有改动任何仓库文件**（本文档即该报告的留存记录）。

---

## 1. 结论 — 官方 vs 社区

**确实存在一个官方的、由 TradingView 运营的 MCP server**。它于 **2026-09-16 进入公测**，
可通过 `https://mcp.tradingview.com/mcp` 访问。

来自 TradingView 自有资源的证据：

| 主张 | 一手来源 | 观察结果 |
|---|---|---|
| 官方公告 | [TradingView blog — "Bring TradingView to Claude with the new MCP Server: public beta available for paid plans"](https://www.tradingview.com/blog/en/tradingview-mcp-server-public-beta-60864/) | 日期为 **Sep 16**；描述了该 server、套餐与 beta 限制 |
| 官方文档 + 完整工具参考 | [tradingview.com/mcp/docs](https://www.tradingview.com/mcp/docs) | "TradingView MCP Server — Connect Claude, ChatGPT and other MCP clients"；列举了全部 35 个工具 |
| 实时端点 | `https://mcp.tradingview.com/mcp` | `HTTP/2 401`，响应体 `{"detail":"This server requires OAuth authentication"}`，响应头 `www-authenticate: Bearer resource_metadata="https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp"` |
| RFC 9728 资源元数据 | `https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp` | `{"resource":"https://mcp.tradingview.com/mcp","authorization_servers":["https://www.tradingview.com"],"bearer_methods_supported":["header"]}` |
| OAuth 授权服务器元数据 | `https://www.tradingview.com/.well-known/oauth-authorization-server` | issuer `https://www.tradingview.com`；authorize/token/register/jwks/revoke 端点 |
| 产品列表条目 | [tradingview.com/pricing](https://www.tradingview.com/pricing/) | "MCP Server" 出现在全局产品导航中，并链接到 `/mcp/docs` |

**注意事项：** 官方 server **未在公开的 MCP registry 中找到**
([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/v0/servers?search=tradingview)) ——
在该处搜索 "tradingview" 只返回社区/非官方条目。博客与文档仍是权威来源。

### 社区 / 非官方 server

以下所有项目都明确**与 TradingView Inc. 无关联**。列出它们是为了将其与官方 server 区分开。
Star 数是在调查时从 GitHub 读取的，为近似值。

| 仓库 / 包 | ★（约） | License | 最后提交 | 它是什么 / 维护情况 |
|---|---|---|---|---|
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | ~6.6k | MIT（仅代码） | 2026-07-28 | "TradingView MCP Bridge" —— 通过 Chrome DevTools Protocol (CDP，端口 9222) 驱动**本地 TradingView Desktop** 应用。Pine Script 开发、图表截图、alerts、quotes。需要付费 TradingView Desktop 订阅；README 警告它使用了未公开的内部 API，这些 API 可能失效。活跃。 |
| [atilaahmettaner/tradingview-mcp](https://github.com/atilaahmettaner/tradingview-mcp) | ~4.6k | MIT | 2026-09-01 | 37 个工具："real-time market data, screeners, technical analysis & backtesting"。声称**无需 TradingView 账号或 API key**（使用公共 scanner + Yahoo）。远程托管于 `https://mcp.cryptosieve.com/mcp`。活跃。 |
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol)（`@ferroxlabs/tvcontrol`） | ~41 | MIT | 2026-09-08 | 88 个工具，通过 CDP 驱动 TradingView Desktop；`chart_vision_read` 返回值**以及截图**。活跃。 |
| [ertugrul59/tradingview-chart-mcp](https://github.com/ertugrul59/tradingview-chart-mcp) | ~100 | （页面上未声明 license） | 2026-03-11 | 通过 Selenium 抓取 TradingView **图表图像**的 MCP server；需要 TradingView 会话凭据。 |
| [fiale-plus/tradingview-mcp-server](https://github.com/fiale-plus/tradingview-mcp-server) | ~52 | MIT | 2026-08-21 | "Unofficial MCP and CLI for TradingView API" —— 公共 scanner/symbol 端点的 client；`npx`，无需认证。活跃。 |
| [cklose2000/pinescript-mcp-server](https://github.com/cklose2000/pinescript-mcp-server) | ~105 | （未声明 license） | 2025-07-30 | Pine Script 开发工具；`npx pinescript-mcp-server`。陈旧（约 1 年）。 |
| [ali-rajabpour/tradingview-mcp](https://github.com/ali-rajabpour/tradingview-mcp) | ~18 | MIT | 2025-10-31 | 使用会话 cookie 认证的 Playwright 图表快照；stdio。陈旧。 |
| [moondevonyt/Trading-View-MCP-for-AI-by-Moon-Dev](https://github.com/moondevonyt/Trading-View-MCP-for-AI-by-Moon-Dev) | — | — | 2026-08-30 | CDP + `pine-facade.tradingview.com`；Pine + 截图；stdio。活跃。 |

**另一个独立的第三方数据 API（不是该 MCP server）：** [tradingviewapi.com](https://www.tradingviewapi.com/)
在其自身的 schema.org 元数据中描述自己为 "**Unofficial third-party market data API.
Not affiliated with, endorsed by, or part of TradingView.**"，并提供 REST/WebSocket/SSE/**MCP**。
它**不是**官方的 TradingView MCP server，也不带任何 TradingView 背书。

---

## 2. 官方能力清单 — 35 个工具

来源：[tradingview.com/mcp/docs](https://www.tradingview.com/mcp/docs)。这些工具由两个
内部 MCP server 提供，`mcp-watchlist`（Watchlists）与 `tv-mcp`（其余全部）。文档将每个
工具标记为 **Read-only**（只读）或 **Write**（写入），并附有以下说明：*"Read-only tools never modify the account; Write tools
create, change or delete user data."*

### Watchlists — 8 个工具（server `mcp-watchlist`）

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `list_watchlists` | 只读 | 列出用户的 watchlists（无参数） |
| `get_watchlist` | 只读 | 按 `watchlist_id` 获取某个 watchlist 及其 symbols |
| `get_active_watchlist` | 只读 | 获取/创建当前 active watchlist |
| `create_watchlist` | 写入 | 创建 watchlist（名称、symbols） |
| `delete_watchlist` | 写入 | 删除 watchlist |
| `add_to_watchlist` | 写入 | 添加 symbols（会将已存在的 symbol 移到末尾） |
| `remove_from_watchlist` | 写入 | 按 symbol 移除公司 |
| `update_watchlist` | 写入 | 修改名称和/或描述 |

### 行情/市场数据 — 3 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_ohlcv` | 只读 | 历史 OHLCV bars：`symbol` (EXCHANGE:TICKER)、`interval` (1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, M；默认 1D)、`count`（最大 5000，默认 300）、`summary`。返回 `[{t (unix sec UTC), o, h, l, c, v}]` 以及聚合 summary |
| `get_economic_data` | 只读 | 经济指标的时间序列（`ECONOMICS:<COUNTRY><INDICATOR>`），`date_from`/`date_to` |
| `get_economic_symbols` | 只读 | 经济 tickers 的目录（country/category/search） |

### Symbol 搜索 — 1 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `search_symbols` | 只读 | 将 ticker/公司名模糊查找为可路由的 EXCHANGE:TICKER symbols；`type_filter` (stock, etf, bond, forex, index, futures, crypto) |

### Screener — 5 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_symbol_data` | 只读 | 获取单个 symbol 的任意 TradingView screener 列 |
| `run_screener` | 只读 | 使用 filters/presets/sorting/columns 运行 screener；返回 rows + `totalCount` |
| `get_symbol_data_batch` | 只读 | 每次调用最多 50 个 symbols 的 quotes/columns；无法解析的 symbols 会以 `missing` 报告 |
| `get_screener_columns` | 只读 | 有效 screener 列名的目录 |
| `get_technicals_rating` | 只读 | 单周期指标快照：**RSI, Stoch K/D, CCI20, ADX, MACD, Momentum, AO, EMA/SMA 10–200, VWMA, HullMA9** 以及 3 个 Recommend 聚合值（summary/MA/other） |

### News — 2 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_news` | 只读 | 某 symbol 的最新头条（id、title、published、provider、urgency、link、relatedSymbols、paywall）；分页 |
| `get_news_story` | 只读 | 按 id 获取某条新闻的全文 |

### 基本面与预测 — 3 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_forecasts` | 只读 | 分析师共识：recommendation/score、buy/hold/sell、含上涨空间 % 的目标价、EPS/营收预测 |
| `get_financials` | 只读 | 当前基本面：P/E、P/B、利润率、ROE/ROA、TTM 营收/利润/EBITDA/FCF、同比 (YoY) 增长 |
| `get_financial_history` | 只读 | 含 `yoy_pct` 的季度/年度基本面历史 |

### 文档 — 2 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_documents` | 只读 | 列出 filings 与 transcripts（10-K/10-Q/8-K、earnings calls）及其 view ids |
| `get_document_view` | 只读 | 特定 document view 的全文（summary/transcript） |

### 日历 — 3 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `get_earnings_calendar` | 只读 | 未来/过去的财报日期，含 EPS 与营收共识 |
| `get_economic_calendar` | 只读 | 按 country/currency/category/importance 过滤的宏观事件（CPI、GDP、rates）；数据自 2003-09-01 起，前瞻约 31 天 |
| `get_dividends_calendar` | 只读 | 股息除权日、金额、收益率、支付日（按 symbol 或筛选） |

### Alerts — 8 个工具

| 工具 | 访问权限 | 用途 |
|---|---|---|
| `create_alert` | 写入 | 创建价格 alert（price + cross/cross_up/cross_down/greater/less）；可选的 message、resolution、expiration、email/mobile_push/popup/webhook |
| `update_alert` | 写入 | 更新 message/name/expiration/notifications/webhook 并重新激活（条件不可更改） |
| `delete_alert` | 写入 | 按 ids 删除 alerts（触发历史也会一并删除） |
| `stop_alerts` | 写入 | 暂停 alerts，保留 id/历史/设置 |
| `restart_alerts` | 写入 | 恢复已暂停的 alerts |
| `list_alerts` | 只读 | 所有 alerts（active + inactive），以规范化形式返回 |
| `get_alerts` | 只读 | 按 id 获取特定 alerts 的完整 payload（message/webhook 被过滤掉） |
| `get_alerts_log` | 只读 | Alert 触发历史及 webhook 投递状态 |

### 真实能力 vs 宣传

| 请求的能力 | 官方 MCP？ | 备注 |
|---|---|---|
| Quotes | ✅ | 没有专用的 `get_quote`；使用 `get_symbol_data` / `get_symbol_data_batch` screener 列 |
| OHLCV / K 线 | ✅ | `get_ohlcv` —— **仅数据（数组），绝不返回图像** |
| 技术指标 | ⚠️ 部分支持 | 仅有固定的快照 `get_technicals_rating`；不能任意计算指标 |
| Symbol 搜索 | ✅ | `search_symbols` |
| News | ✅ | `get_news`、`get_news_story` |
| Screener | ✅ | 5 个工具 |
| 基本面 / filings / 日历 | ✅ | 3 + 2 + 3 个工具 |
| Watchlists | ✅ | 8 个工具 |
| Alerts | ✅ | 8 个工具 |
| **Pine Script** | ❌ | **完全没有 Pine 工具**（没有 compile/validate/deploy） |
| **图表图像 / 截图** | ❌ | **没有光栅/图表图像工具**（见 §6） |
| MCP resources / prompts | ❓ | 文档只列举了 **tools**；未验证 |

Beta 说明，逐字引用自博客：*"For now we provide a scoped version: tool list is limited,
market data is delayed, and some MCP tools may not work as smoothly as expected."* 文档页脚补充道：
*"The toolset is in beta and expands over time."*

---

## 3. 认证、数据源、套餐、速率限制

- **数据源：** TradingView 自有的行情/市场数据。博客称 *"Nothing is scraped, nothing is guessed,
  and every answer is built on the same data you see on your charts."* 它**不是**那个独立的付费
  第三方数据 API，也没有其他公开的 TradingView 数据 API（见下文）。
- **认证：** **OAuth 2.1**，**无 API keys**。来自
  [`/.well-known/oauth-authorization-server`](https://www.tradingview.com/.well-known/oauth-authorization-server)：
  - `authorization_endpoint`：`https://www.tradingview.com/mcp/oauth/authorize`
  - `token_endpoint`：`https://www.tradingview.com/mcp/oauth/token`
  - `registration_endpoint`：`https://www.tradingview.com/mcp/oauth/register`（**Dynamic Client Registration**）
  - `revocation_endpoint`：`https://www.tradingview.com/mcp/oauth/revoke`
  - `grant_types_supported`：`["authorization_code", "refresh_token"]`
  - `code_challenge_methods_supported`：`["S256"]` (PKCE)
  - `scopes_supported`：`["mcp:read", "mcp:tools"]`
  - RFC 9728 protected-resource 元数据将该资源指向 `www.tradingview.com` 授权服务器。
- **套餐要求：** *"Included in Essential and above; trial plans don't include MCP access."*
  （文档 [tradingview.com/mcp/docs](https://www.tradingview.com/mcp/docs)；博客称 "available now to all users on
  Essential or higher-tier plans"）。
- **速率限制：** 文档 —— *"Tool calls are rate-limited to ~100 requests per minute per user."* 博客补充说，
  在 beta 期间 *"we may limit the number of requests per day"*（未公布每日请求数量的具体上限）。
- **其他地方没有官方公开数据 API：** TradingView 自己的支持文章
  [*"I need access to your API in order to get data or indicator values"*](https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/)
  指出：*"We don't have an API that gives access to data as of now… Our REST API is meant for brokers who want
  to be supported on our trading platform."* 位于 tradingviewapi.com 的付费 "TradingView Data API" 属于
  **非官方第三方**（见 §1）。

---

## 4. 安装与使用演练

**传输方式 (transport)：** 官方 server 是**仅通过 Streamable HTTP 提供的托管远程 server** ——
`https://mcp.tradingview.com/mcp`。**没有 stdio transport，没有 npm/uvx/docker 安装，也没有
环境变量或 API keys**。文档称：*"Any client that supports MCP over streamable HTTP with
OAuth 2.1 authorization works."*

宿主配置（来自 [tradingview.com/mcp/docs](https://www.tradingview.com/mcp/docs)）：

- **Claude（web / desktop / mobile）：** Settings → Connectors → Add custom connector → 粘贴
  `https://mcp.tradingview.com/mcp` → Add → 用你的 TradingView 账号授权。连接器添加一次后，
  在你使用 Claude 的所有地方都可用。
- **Claude Code：**
  ```bash
  claude mcp add --transport http mcp-tradingview https://mcp.tradingview.com/mcp
  ```
  然后运行 `/mcp` 并在浏览器中授权。
- **ChatGPT / Codex desktop UI：** Settings → Plugins → Add → MCPs → Add MCP Server；为其命名；将 Type 设为
  "Streamable HTTP"；粘贴 URL；Save；然后 Plugins → MCPs → Authenticate → 允许工具访问。
- **Codex CLI：**
  ```bash
  codex mcp add tradingview --url https://mcp.tradingview.com/mcp
  ```
- **通用 MCP 宿主 JSON：**
  ```json
  {
    "mcpServers": {
      "tradingview": {
        "type": "http",
        "url": "https://mcp.tradingview.com/mcp"
      }
    }
  }
  ```

**端到端流程：** (1) 将该 URL 添加为 custom connector；(2) 在浏览器中完成 OAuth 登录并
批准访问（这需要一个已登录的、处于 Essential 及以上（且**不是** trial）的 TradingView 账号）；
(3) client 执行 `initialize` 握手与 `tools/list`；(4) 提出一个自然语言问题
（例如 *"What's happening with NVDA today?"*）；(5) assistant 选择工具，server 返回数据，
模型作答。此过程中任何环节都不会创建或粘贴 API key。

---

## 5. 自定义 Node / TypeScript agent 作为 MCP client —— 可以

官方 server 是一个标准的远程 MCP server（Streamable HTTP + OAuth 2.1），因此 **Node/TS 插件
可以充当 MCP client** —— 它并不局限于桌面 MCP 宿主。

**存在官方 TypeScript SDK**（[modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)）：

| 包 | 分支 | 最新版（调查时） | License | 备注 |
|---|---|---|---|---|
| `@modelcontextprotocol/client` | v2 | 2.0.0 | MIT | 构建 MCP clients；实现 2026-07-28 MCP 规格 (spec) |
| `@modelcontextprotocol/server` | v2 | — | MIT | 构建 MCP servers |
| `@modelcontextprotocol/sdk` | v1 | 1.30.0 | MIT | 较旧的分支；v2 之后至少 6 个月内仍接收 bug/安全修复 |

**最小 client 流程：** `initialize` → `tools/list` → `tools/call`。使用该 SDK：

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const client = new Client({ name: 'my-agent', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.tradingview.com/mcp'),
  { authProvider: myOAuthProvider },
);

await client.connect(transport);            // runs the initialize handshake
const { tools } = await client.listTools(); // tools/list
const result = await client.callTool({ name: 'get_ohlcv', arguments: { symbol: 'NASDAQ:NVDA' } });
for (const block of result.content) if (block.type === 'text') console.log(block.text);
```

**自定义 client 的 OAuth：** SDK 暴露了 `OAuthClientProvider`。将它作为 transport 的
`authProvider` 传入；当 server 要求授权且不存在 token 时，SDK 会执行发现、
注册（或查找）你的 client、调用 `redirectToAuthorization(url)`，并且 `connect()` 会一直抛出
`UnauthorizedError`，直到最终用户带外完成登录。该 provider 持有 client
注册、tokens、PKCE verifier、发现状态以及浏览器重定向。见
[docs/clients/oauth.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md)
与 [docs/clients/connect.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)。

**对插件的实际影响：** 该集成是一个标准 MCP client，它必须 (a) 使用
Streamable HTTP，(b) 实现 OAuth 重定向/回调（环回 `http://localhost:...` 回调即可），
以及 (c) 要求每个最终用户在浏览器中授权**他们自己付费的 TradingView 账号**。不存在
server-to-server 的 API-key 路径，也无法代用户内嵌凭据。

---

## 6. 供多模态模型使用的图表图像（光栅）

**官方 MCP 不提供任何图表图像。** 文档记载的 35 个工具中没有一个返回图像；最接近的
工具（`get_ohlcv`、`get_technicals_rating`、screener 列）返回的是数字/数组。在完整的文档文本中，
"chart" 只作为 alert 的 `resolution` 字段描述出现。因此多模态模型**无法通过官方 server
"看到"图表** —— 它只能读取数值序列。

社区 server 确实会暴露图像，但都是通过浏览器/桌面自动化实现的，这种方式脆弱且有 ToS 风险：
- [ertugrul59/tradingview-chart-mcp](https://github.com/ertugrul59/tradingview-chart-mcp) —— Selenium 截图抓取，需要 TradingView 会话凭据。
- [ali-rajabpour/tradingview-mcp](https://github.com/ali-rajabpour/tradingview-mcp) —— 使用会话 cookie 的 Playwright 快照。
- [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp)、[FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol)、
  [moondevonyt/Trading-View-MCP-for-AI-by-Moon-Dev](https://github.com/moondevonyt/Trading-View-MCP-for-AI-by-Moon-Dev) —— TradingView Desktop CDP 截图
  （`tv screenshot`、`chart_vision_read`）。
- [atilaahmettaner/tradingview-mcp](https://github.com/atilaahmettaner/tradingview-mcp) —— 通过 MCP Apps 在聊天中渲染**交互式蜡烛图**
  （不是 TradingView 的光栅图）。

**对已经渲染客户端交互式图表的插件的建议：** 继续用官方数值数据
（`get_ohlcv`）渲染；如果多模态模型必须目视检查图表，请自行将客户端 canvas 光栅化，
而不要依赖官方 MCP 提供图像。

---

## 7. 许可 / 再分发分析

**官方 MCP server 不是开源的。** 不存在可用于内嵌或再分发它的 license；
其使用受 TradingView 通用使用条款约束。没有单独发布的 "MCP ToS" ——
文档仅说明了 beta 与套餐要求。

**社区 server 大多为 MIT，但这并不授予任何数据权利。** 例如，旗舰项目
[tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) 的 README 指出：
*"The MIT license applies to the source code of this project only. It does not grant any rights to
TradingView's software, data, trademarks, or intellectual property."* 同样的说明也出现在
[FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol)。因此，依赖一个 MIT 封装
并不赋予任何 TradingView 数据权利。

**TradingView 使用条款 §3**（[tradingview.com/policies](https://www.tradingview.com/policies/)）是
具有约束力的文本，且表述明确。关键引用：

- 数据仅限**展示用途、个人/内部业务**：*"The content and market data provided on the
  TradingView platform, including but not limited to charts, alerts, webhooks, and any other forms of
  information, are licensed for exclusive display-only use. This license is strictly limited to personal or
  internal business purposes and explicitly prohibits any form of non-display usage."*
- **禁止非展示用途**涵盖算法化/自动化使用：被禁止的用途 *"include, but are not limited
  to, any form of automated trading, automated order generation, price referencing, order verification,
  algorithmic decision-making, algorithmic trading, smart order routing, using data in operations control or
  risk management programs, or any machine-driven processes that do not involve the direct, human-readable
  display of such data."*
- **第三方产品受限：** *"we expressly forbid direct non-display usage by our users, as well as
  the development, offering, or utilization of any third-party products, tools, or services designed to
  facilitate or enable such non-display usage… it is hereby explicitly prohibited for any third party to
  create, offer, or operate any product or service that: Utilizes, repurposes, or relies upon TradingView's
  market data… for any form of automated trading, algorithmic decision-making, or any other non-display
  purposes."*
- **商业用途需要单独协议：** *"except as otherwise expressly permitted by separate
  agreement, we do not permit commercial usage of any of our services or APIs."*

**对一个 MIT 插件的结论。** 发布一个作为官方 server MCP **client** 的 MIT 许可插件，
从代码层面看是没问题的；用户授权自己的 TradingView 账号进行交互式、
人类可读的分析，正是官方预期的用途。但是，**再分发 TradingView 数据、将其缓存/提供给
第三方，或在第三方产品内使用它驱动自动化/算法化决策，
似乎违反 ToS §3**，未经单独协议进行商业使用也是如此。这是在决定是否依赖该 MCP 之前
需要权衡的最大单一风险。

---

## 8. 未核实事项

1. **每日请求上限** —— 博客称 beta 期间*可能*会施加上限；已公布的只有约 100 req/min。
2. **MCP resources / prompts** —— 文档只列举了 tools。无法确认该 server 是否还
   提供 resources/prompts，因为实时的 `initialize`/`tools/list` 需要一个付费且经 OAuth 授权的
   账号。
3. **协商的协议版本** —— 该端点是 Python/uvicorn 后端（很可能是 FastMCP）；server
   所协商的确切协议修订版未能确认。
4. **实时工具 schema** —— 上述 35 个工具的清单取自官方 `/mcp/docs` 页面，而非
   实时的 `tools/list` 响应。
5. **GitHub star 数** —— 调查时从未经认证的页面读取；可能包含 forks/mirrors，
   应视为近似值。
6. **MCP 专属条款** —— 除通用使用条款外未发现其他条款。
7. **MCP registry** —— 官方 server 未在公开的 MCP registry 中找到；这可能仅仅意味着
   它尚未在该处发布。

---

## 9. 一手来源 URL 索引

官方 TradingView：
- 博客公告 —— https://www.tradingview.com/blog/en/tradingview-mcp-server-public-beta-60864/
- MCP 文档 + 工具参考 —— https://www.tradingview.com/mcp/docs
- MCP 端点 —— https://mcp.tradingview.com/mcp
- OAuth protected-resource 元数据 —— https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp
- OAuth authorization-server 元数据 —— https://www.tradingview.com/.well-known/oauth-authorization-server
- 使用条款 —— https://www.tradingview.com/policies/
- 支持：没有公开数据 API —— https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/
- 定价 / 产品导航 —— https://www.tradingview.com/pricing/

MCP 标准 / SDK：
- 官方 TS SDK —— https://github.com/modelcontextprotocol/typescript-sdk
- Client 连接指南 —— https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md
- Client OAuth 指南 —— https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md
- 官方 MCP registry —— https://registry.modelcontextprotocol.io/v0/servers?search=tradingview

社区 server（非官方）：
- https://github.com/tradesdontlie/tradingview-mcp
- https://github.com/atilaahmettaner/tradingview-mcp
- https://github.com/FerroxLabs/tvcontrol
- https://github.com/ertugrul59/tradingview-chart-mcp
- https://github.com/fiale-plus/tradingview-mcp-server
- https://github.com/cklose2000/pinescript-mcp-server
- https://github.com/ali-rajabpour/tradingview-mcp
- https://github.com/moondevonyt/Trading-View-MCP-for-AI-by-Moon-Dev
- https://www.tradingviewapi.com/（非官方第三方数据 API）
