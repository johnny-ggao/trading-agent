# TradingView 官方 MCP 接入方案调研

- **调查日期：** 2026-09-21
- **范围：** 在 DSH（DeepSeek Harness）双半边插件 `dsh-trading-agent` 的语境下，评估接入官方
  TradingView MCP Server（`https://mcp.tradingview.com/mcp`）的技术方案与使用条款风险，
  并给出推荐路径。
- **方法：** 只读检查**已安装并运行**的 DSH 0.1.6-alpha.1 与其依赖的 MCP TypeScript SDK
  2.0.0、DSH 源码 checkout 0.1.6-alpha.2、本仓库源码；直接抓取 TradingView 的 MCP 文档、
  使用条款与 OAuth 元数据；直接查询 npm registry 与 GitHub API 获取 `mcp-remote` 的
  维护/许可事实。每条论断都注明拥有它的文件/行或 URL。
- **本次调查未改动任何仓库文件**（本文档即新增产物）。事实基线：
  [tradingview-mcp.md](./tradingview-mcp.md)（上一轮官方 MCP 事实调查）与
  [ADR-0004](../adr/0004-no-tradingview-data-or-mcp.md)（现决策：不接入）。

---

## 0. 结论（推荐）

**建议维持 ADR-0004 的"不接入"决定，不要把这个官方 MCP 接入 `dsh-trading-agent` 的分析链路。**
理由是两条互相独立的硬约束仍然成立且已被一手材料证实：

1. **DSH 的 MCP client 至今不支持 OAuth。** 安装版 0.1.6-alpha.1 与源码 0.1.6-alpha.2 的
   Streamable HTTP transport 只接受静态 `headers`，构造 `StreamableHTTPClientTransport`
   时不传 `authProvider`（见 §2）。而 TradingView 端点只接受 OAuth 2.1，无 API key
   （见 §1.2）。因此**官方端点无法被 DSH 原生挂载**。
2. **TradingView 使用条款把市场数据限定为"仅展示、个人/内部用途"，并逐条禁止非展示用途、
   算法化决策，以及依赖其数据的第三方产品；商业用途需另行书面许可**（见 §4）。而本插件正是
   一个 MIT 许可、通过 npm 分发给第三方的自动化技术分析智能体。

**如果用户本人仍希望在自己的 DSH 里使用 TradingView MCP，唯一技术上最省事、法律上可辩护的
边界是方案 2a**：把官方 MCP 作为**用户自己的**一个普通 DSH MCP server，通过
[`mcp-remote`](https://github.com/punkpeye/mcp-remote) 这个本地 OAuth 桥接到 stdio 挂载；
**不把它打包进 `dsh-trading-agent`**、不把它的数据写进 chart spec、不缓存、不进入自动化分析。
方案 2b（给 DSH 上游加 OAuth）与 2c（插件宿主半边内嵌 MCP client）技术上都可行，但都**不能
解决 ToS 问题**：2b 是一个 DSH 级通用能力（工作量大、跨包、不属于本仓库职责），2c 则恰好落在
ToS 明确禁止的"第三方产品依赖其数据"上，风险最高。详见 §3。

---

## 1. 事实基线

### 1.1 已安装运行时 vs 源码 checkout

| 制品 | 路径 | 版本 |
|---|---|---|
| 运行中的安装 | `/Users/johnny/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/` | **0.1.6-alpha.1** |
| 源码 checkout（文档所在处） | `/Users/johnny/Work/Project/deepseek-harness/` | **0.1.6-alpha.2** |
| 已安装的 MCP client | `.../dsh/node_modules/@deepseek-ai/dsh-mcp-client/` | 0.1.6-alpha.1 |
| 已安装的 MCP SDK | `.../dsh/node_modules/@modelcontextprotocol/client/` | **2.0.0** |

已安装包的 `package.json` 把依赖钉死在 `@modelcontextprotocol/client: 2.0.0`
（`.../dsh-mcp-client/package.json:40-44`），alpha.2 源码同样钉在 `2.0.0`
（`packages/mcp/mcp-client/package.json:40-44`）。**两版共用同一 SDK 大版本**，所以
"OAuth 能力"在两边是同一个问题，没有版本差可以利用。

### 1.2 官方 TradingView MCP 的传输与认证（复核）

2026-09-21 直接用 HTTP 探测与抓取官方文档/元数据：

- `POST https://mcp.tradingview.com/mcp` 返回 `HTTP/2 401`，响应体
  `{"detail":"This server requires OAuth authentication"}`，响应头
  `www-authenticate: Bearer resource_metadata="https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp"`，
  `server: uvicorn`。
- `https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp`：
  `{"resource":"https://mcp.tradingview.com/mcp","authorization_servers":["https://www.tradingview.com"],"bearer_methods_supported":["header"]}`。
- `https://www.tradingview.com/.well-known/oauth-authorization-server`：
  `authorization_endpoint=https://www.tradingview.com/mcp/oauth/authorize`、
  `token_endpoint=.../mcp/oauth/token`、`registration_endpoint=.../mcp/oauth/register`（**动态客户端注册 DCR**）、
  `revocation_endpoint=.../mcp/oauth/revoke`、`response_types_supported=["code"]`、
  `grant_types_supported=["authorization_code","refresh_token"]`、
  `token_endpoint_auth_methods_supported=["none","client_secret_basic","client_secret_post"]`、
  `code_challenge_methods_supported=["S256"]`（PKCE）、
  `scopes_supported=["mcp:read","mcp:tools"]`。
  **注意：元数据里没有 `device_authorization_endpoint`** —— 因此 OAuth 设备码流程（RFC 8628）
  对 TradingView 不可用。
- 官方文档 `https://www.tradingview.com/mcp/docs`：*"One URL for every client. Authentication is
  OAuth 2.1 — you sign in with your TradingView account, no API keys to manage."*；
  *"Any client that supports MCP over streamable HTTP with OAuth 2.1 authorization works"*；
  *"Included in Essential and above; trial plans don't include MCP access."*；
  *"Tool calls are rate-limited to ~100 requests per minute per user."*
  工具清单仍是 35 个（Watchlists 8 + Market data 3 + Symbol search 1 + Screener 5 + News 2 +
  Fundamentals & forecasts 3 + Documents 2 + Calendars 3 + Alerts 8），与上一轮一致。

结论：**仅 Streamable HTTP + OAuth 2.1 + PKCE + DCR，无 API key、无 stdio、无设备码。**

### 1.3 DSH 现状：静态 header 而非 OAuth

现有调研 [tradingview-mcp.md](./tradingview-mcp.md) 与 [ADR-0004](../adr/0004-no-tradingview-data-or-mcp.md)
的结论在本次核实后仍然成立。细节见 §2。

---

## 2. 问题 1：DSH MCP client 支持哪些 transport 与认证？

### 2.1 两种 transport，配置 schema 的位置

- **权威类型声明（已安装 0.1.6-alpha.1）：**
  `.../dsh-mcp-client/lib/types/index.d.ts:26-80` 定义
  `StdioConfig`、`StreamableHttpConfig`、`Config = StdioConfig | StreamableHttpConfig`
  以及导出的 `Config: z<ConfigInput, Config>`。
- **权威 schema（已安装运行代码）：**
  `.../dsh-mcp-client/lib/index.js:780-800` 的 `z.union([...])`。
- **同一 schema 的源码（alpha.2）：** `packages/mcp/mcp-client/src/index.ts:52-142`。
- **生成的配置目录（alpha.2）：** `docs/config-catalog.md:1651-1726`，由
  `gen-cordis-catalog.ts` 从 `src/index.ts:104` 生成。
- **人类可读配置表：** `packages/mcp/mcp-client/README.md:30-69`。
- **子系统文档：** `docs/subsystems/mcp.md:24-34`（配置归属）、`docs/subsystems/mcp.md:101`
  （Limits）。

两种 transport 的字段（alpha.1 与 alpha.2 完全一致）：

| transport | 字段 |
|---|---|
| `stdio` | `serverName`（必填，`[A-Za-z0-9_-]{1,32}`）、`command`（必填）、`args`、`env`、`cwd` |
| `streamable-http` | `serverName`（必填）、`url`（必填）、`headers` |
| 两者共有 | `toolCallTimeoutMs`（默认 60 000）、`failOnStartupError`（默认 false）、`maxInstructionBytes`（默认 32 768）、`reconnect`（`enabled/initialDelayMs/maxDelayMs/maxAttempts`） |

stdio 会把 `env` 合并到**已擦除凭据形状变量**的父环境上：`scrubbedParentEnv()` 会丢弃匹配
`/KEY|PASSWORD|SECRET|TOKEN/i` 的环境变量与所有 `DSH_*` 变量
（`packages/mcp/mcp-client/src/transport.ts:15-23`；README `.../mcp-client/README.md:136-138`）。

### 2.2 认证：无 OAuth、无动态客户端注册、无 bearer 抽象；只有静态 header

这是全篇的关键事实。**两版的 transport 工厂都是同一个函数，且都没有传 `authProvider`：**

- 已安装 alpha.1：`.../dsh-mcp-client/lib/index.js:38-48`：

  ```js
  case "streamable-http": return new StreamableHTTPClientTransport(
    new URL(config.url), { requestInit: { headers: config.headers } });
  ```

- alpha.2 源码：`packages/mcp/mcp-client/src/transport.ts:31-46`，同样只有
  `{ requestInit: { headers: config.headers } }`。

DSH 的配置里**没有** `authProvider`、`oauth`、`token`、`bearer` 等任何字段
（`src/index.ts:119-142` / `lib/index.js:780-800`），README 的字段表也没有
（`.../mcp-client/README.md:55-68`）。因此：

| 能力 | DSH MCP client 是否支持 |
|---|---|
| stdio | ✅ |
| Streamable HTTP | ✅ |
| 静态自定义 header（含 `Authorization: Bearer ...`） | ✅（`headers` 字段，alpha.1 `lib/index.js:795`） |
| OAuth 2.1（authorization_code + PKCE） | ❌ |
| 动态客户端注册（DCR） | ❌ |
| bearer token 自动刷新 / `AuthProvider` | ❌ |
| `OAuthClientProvider` / 浏览器重定向 / 环回回调 | ❌ |

**相反，底层 SDK 完全支持 OAuth，只是 DSH 没有接线。** 已安装的 SDK 2.0.0 导出：

- `StreamableHTTPClientTransportOptions.authProvider?: AuthProvider | OAuthClientProvider`
  —— `.../@modelcontextprotocol/client/dist/index.d.mts:3020-3038`；
- `AuthProvider`（最简单的 bearer：`{ token: async () => apiKey }`）——
  `.../dist/index.d.mts:186-201`；
- `OAuthClientProvider`（`redirectUrl`、`clientMetadata`、`clientInformation`/
  `saveClientInformation`、`tokens`/`saveTokens`、`redirectToAuthorization`、
  `saveCodeVerifier`/`codeVerifier`、`addClientAuthentication`）——
  `.../dist/index.d.mts:228-320`；
- 交互流程所需的 `finishAuth(callbackParams)` 与 `UnauthorizedError` ——
  `.../dist/index.d.mts:3188-3211`、`:456`；
- SDK 内部注释明确：无 `authProvider` 时，被 401 拒绝的连接在协商阶段就失败
  （`.../dist/index-D4xIIEF6.d.mts:190`），且 `onUnauthorized` 未提供时直接抛
  `UnauthorizedError`（`.../dist/index.d.mts:194-195`）。

**因此，把 `https://mcp.tradingview.com/mcp` 直接配成 `streamable-http` 的实际行为是：**
连接被 401 → SDK 抛 `UnauthorizedError` → DSH 的 connection supervisor 当作一次失败的
连接尝试，按 `reconnect` 策略以 500ms 起、翻倍到 30s 的上限重试，最多 10 次后注销工具并
停止（`packages/mcp/mcp-client/src/connection.ts:211-245`；默认值 `41-46`）。
它**不会**弹浏览器、**不会**获得 token。

### 2.3 stdio 协商会先起一个"探针"子进程

DSH 的 connection supervisor 使用 `versionNegotiation: { mode: 'auto' }`
（`connection.ts:257-271`），配套测试明确断言：一个 stdio 连接会**先后启动两个子进程**，
先起的探针被回收后才启动真正服务的进程
（`packages/mcp/mcp-client/tests/negotiation-lifecycle.spec.ts:66-76`；
README 也写明 *"stdio negotiation starts a temporary probe process before the serving process"*，
`.../mcp-client/README.md:28`）。这对任何把 stdio 当 OAuth 桥的方案都是必须验证的副作用
（见 §3.1）。

### 2.4 alpha.1 与 alpha.2 的差异

| 维度 | alpha.1（已安装） | alpha.2（源码） |
|---|---|---|
| MCP client 配置 schema | `lib/types/index.d.ts:26-80`；运行代码 `lib/index.js:780-800` | `src/index.ts:52-142` |
| transport 工厂 | `lib/index.js:38-48` | `src/transport.ts:31-46` |
| 认证面 | 仅静态 `headers`；无 `authProvider` | 完全一致 |
| 钉住的 SDK | `@modelcontextprotocol/client@2.0.0` | `@modelcontextprotocol/client@2.0.0` |
| 文档 | 已安装包**不含 `docs/`**，只有 README 与 `lib/*.js` | 完整开发文档 |

**结论：在 OAuth 这件事上 alpha.1 与 alpha.2 没有差异；给 DSH 加 OAuth 是同一份改动。**

---

## 3. 问题 2：接入官方 TradingView MCP 的可行方案

### 3.1 方案 2a —— 本地 OAuth 桥接（`mcp-remote`）

**结论：可行，是"用户自用"场景下成本最低的路径。** 用 `mcp-remote` 在本地起一个 stdio MCP
server，它反向代理到远程 Streamable HTTP + OAuth 的 TradingView 端点，并自己处理 OAuth 的
浏览器重定向、环回回调与 token 存储。DSH 只看到一个普通 stdio server，不需要任何改动。

**`mcp-remote` 的一手事实（npm registry + GitHub API + 官方 README，2026-09-21）：**

| 事实 | 值 | 来源 |
|---|---|---|
| npm 包 | `mcp-remote` | `https://registry.npmjs.org/mcp-remote/latest` |
| 最新版本 | **0.14.3** | 同上 |
| License | **MIT** | 同上 |
| 仓库 | `punkpeye/mcp-remote`（原作者 geelen，README 致谢） | `https://api.github.com/repos/punkpeye/mcp-remote`；README "Acknowledgments" |
| Stars / forks / open issues | 1602 / 297 / 0 | GitHub API |
| 归档 | `archived: false`，最近 push **2026-09-21T00:25:47Z** | GitHub API |
| 依赖 | `open`、`undici`、`express`、`strict-url-sanitise`（**不依赖官方 MCP SDK**） | `registry.npmjs.org/mcp-remote/latest` |
| token 存储 | `~/.mcp-auth`（可用 `MCP_REMOTE_CONFIG_DIR` 覆盖），当前布局 `mcp-remote-v1` | README "Troubleshooting" |

**它做这件事的证据（README）：**

- 自述：*"Connect an MCP Client that only supports local (stdio) servers to a Remote MCP Server,
  with auth support"*；*"drop in this one liner"*。
- CLI 形态：`npx mcp-remote <url>`，作为 stdio server 由宿主启动（`{"command":"npx","args":["mcp-remote", ...]}`）。
- **Streamable HTTP-only 支持：** `--transport http-only`（默认 `http-first` 会先试 HTTP 再回落 SSE）。
- **自定义 header / bearer：** `--header "Authorization: Bearer ..."` 与 `--header-file <path>`。
- **OAuth 交互：** 默认在本机起环回回调，默认 host `localhost`、路径 `/oauth/callback`，
  端口由 server URL 派生（`3335`–`49150`，被占用时向上走 8 个）；可用位置参数或
  `--host`/`--callback-path` 覆盖；`--auth-timeout` 改回调超时（默认 30s）。
- **DCR 相关：** 支持 `--static-oauth-client-metadata`、`--static-oauth-client-info`、
  `--client-metadata-url`（SEP-991），以及 `--resource`（RFC 8707）与
  `--authorize-param key=value`。
- **设备码：** 支持 `--device-code`，但**TradingView 的 AS 元数据没有
  `device_authorization_endpoint`，所以这条退路对它不可用**（§1.2）。
- **现代协议时代：** `--protocol auto` 让 mcp-remote 成为 dual-era client，跨接
  `2026-07-28` 与 `2025-11-25`（DSH 的 client 讲 2026-07-28 并支持回落）。
- **工具过滤：** `--ignore-tool` 可把远端工具裁剪成白名单（例如只留 `get_ohlcv`），
  这正好能实现"最小暴露"的边界。
- **代理/网络：** `--enable-proxy`（读 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`）、`--ipv4`、
  `--connect-timeout`/`--headers-timeout`/`--body-timeout`、`--keep-alive`。

**给 DSH 的最小配置（本仓库 `cordis.patch.yml` 风格）：**

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

首次启动时 `mcp-remote` 会打开浏览器完成 OAuth（需要用户本人已登录的 **Essential 及以上、
非 trial** TradingView 账号）。DSH 端最终看到
`mcp__tradingview__get_ohlcv`（受 `--ignore-tool` 限制）。

**必须验证的风险点（本次无法用付费账号端到端验证）：**

1. **stdio 探针双启动。** DSH 会先起一个探针进程再起服务进程（§2.3）。`mcp-remote`
   每次启动都会尝试连接并在无 token 时启动 OAuth。第一次交互授权完成后 token 落入
   `~/.mcp-auth`，第二个进程可复用；但**授权尚未完成时探针可能失败/退出**，需要实测。
   README 也建议先用 `npx -p mcp-remote@latest mcp-remote-client <url>`（"Client" 模式）
   单独跑通授权，再挂进宿主。
2. **协议时代协商。** TradingView 协商到哪个 MCP 修订版未验证（上一轮也未确认
   [tradingview-mcp.md §8](./tradingview-mcp.md)）。建议保留 `--protocol auto` 作为兜底。
3. **环回回调可用性。** `dsh web` 与用户浏览器在同一台机器时可用；纯 SSH/容器环境不可用，
   而 TradingView 又不支持设备码，等于无解。
4. **许可证与再分发。** `mcp-remote` 是 MIT，可以合法地被用户 `npx`；但**它不授予任何
   TradingView 数据权利**（同一结论见 [tradingview-mcp.md §7](./tradingview-mcp.md)）。

**同类工具（作为对照，均不改变结论）：** `sparfenyuk/mcp-proxy`、`supercorp-ai/supergateway`
也能做 stdio↔HTTP 代理，但它们主要面向静态 header/无认证；面向"远程 OAuth"的成熟度、
`--header-file`、`--protocol auto`、`~/.mcp-auth` 这类细节都不如 `mcp-remote`，故不作首选。
（本次未逐一深挖它们的一手 README，列为未核实项。）

### 3.2 方案 2b —— 给 DSH 的 MCP client 加 OAuth（上游改动）

**结论：技术可行，但这是 DSH 上游的一个通用特性，跨包、工作量大，不应由本插件仓库承担。**
SDK 已经提供了全部协议能力（§2.2），缺的是：

**改动清单（alpha.1 与 alpha.2 同一份改动）：**

| 包 / 文件 | 改动 |
|---|---|
| `packages/mcp/mcp-client/src/index.ts:52-142`（alpha.1 `lib/index.js:780-800`） | Config 增加认证字段，例如 `oauth: { enabled, redirectUrl?, store? }` 或 `auth: 'oauth' \| 'none'`；需要新的 Schemastery schema 与校验 |
| `packages/mcp/mcp-client/src/transport.ts:31-46`（alpha.1 `lib/index.js:38-48`） | 把 `authProvider` 传给 `StreamableHTTPClientTransport` |
| 新文件（provider） | 实现 `OAuthClientProvider`（`index.d.mts:228-320`）：持久化 client registration、tokens、PKCE verifier；可用 DSH 已有的凭据 seam（见下）或 `$DSH_HOME` 下的文件 |
| `packages/mcp/mcp-client/src/connection.ts:127-408` | 401/OAuth 待授权不应进入普通"失败重连"预算；需要"需要授权"态与触发浏览器/回调的入口 |
| 回调落地 | 需要一个 DSH 端可接收 OAuth 重定向的入口与打开浏览器的动作（见 §3.3 的落地分析） |
| 测试与文档 | `tests/*`、README、`docs/config-catalog.md`、Agent Note |

**DSH 已经有可复用的信用/授权 seam，这是唯一的好消息：**

- `ctx.credentials`（已安装 `@deepseek-ai/dsh-credentials-local`，由 base bundle 挂载：
  `.../dsh-base/cordis.patch.yml:94-98`）提供 `readRecord`/`describeRecord`/`listRecords`/
  `modifyRecord`/`deleteRecord`，记录的 `grant` 半边是"不透明 JSON payload"，天然适合装
  OAuth token 文档（`docs/subsystems/credentials.md:125-215`；
  `.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.md:19-21`）。
  记录的 key 形如 `<scope>/<id>`，scope 是**拥有它的插件的注册名**，因此
  `mcp-client/tradingview` 是一个干净的 key。
- `ctx.authorization`（`packages/credentials/authorization/README.md:34-65`）提供
  `registerFlow` / `begin` / `cancel`，用一套中立的 notice/prompt 词汇跑"与人对话"的
  授权流程。MCP client 加 OAuth 时，最一致的实现是把 OAuth 注册成一个 `AuthorizationFlow`。
- **但当前 web profile 并未挂载 `ctx.authorization`。** base bundle（505 行）只挂了
  `credentials-local`，没有 `dsh-authorization` 行；web-app bundle（491 行）也没有
  （`.../dsh-base/cordis.patch.yml`、`.../dsh-web-app/cordis.patch.yml` 全文 grep
  `authoriz` 无命中）。Agent Note 也写着"surface 还没落地，flow 目前只能在进程内调用"
  （`.agents/notes/.../2026-08-13-credential-records-and-authorization-flows.md:58`）。
  所以 2b 还要顺带补一个授权 UI/线协议。

**工作量估计：** 数百行代码 + 跨包（mcp-client、credentials/authorization、可能的
settings-controller 与 client UI）+ 测试与文档；且要把"401 后如何让人类完成授权"接进
reconnect 生命周期。相对本仓库的规模，这是不合理的。

### 3.3 方案 2c —— 插件宿主半边内嵌 MCP client

**结论：技术上可行，但 ToS 风险最高（第三方产品），且工作量远大于 2a。** 思路是
`dsh-trading-agent` 的宿主半边（`src/index.ts`）自己 `import` MCP SDK，直连
`https://mcp.tradingview.com/mcp`，实现 `OAuthClientProvider`，把选定的远端工具转成
自己的 DSH 工具。这样就完全绕开 DSH 的 MCP client。

**宿主半边现在能做什么（已有先例）：**

- 它已经是 Cordis 插件：`export function apply(ctx)`，`inject = ['tools','skills']`
  （`src/index.ts:13-16`），并用 `ctx.tools.register(defineTool({...}))` 注册工具
  （`src/index.ts:61-134`）。
- 它已经注册 HTTP 路由：`ctx.inject(['webServer'], ({ webServer }) => webServer.register({
  kind: 'exact', path: '/trading-agent/chart', handler }))`（`src/index.ts:58-60`）。

**OAuth 交互怎么落地（这是 2c 最需要设计的地方）：**

1. **不要用 `ctx.webServer` 路由当 OAuth 回调。** DSH 的 web server 路由受连接信任门控制：
   `open-in-app` 在处理请求前先调 `connectionOf(ctx).requestRejection(req)`
   （`packages/host/open-in-app/src/index.ts:185-204`），gateway 同样
   （`packages/api/gateway/src/index.ts:215`）。外部浏览器带着 OAuth 重定向回来时**没有
   DSH 的连接令牌**，会被 401/403 拒绝。
2. **推荐做法：插件自己起一个 127.0.0.1 的环回监听**（`node:http`，端口设 0 让 OS 分配），
   把 `redirect_uri` 设成 `http://127.0.0.1:<port>/oauth/callback`；用系统默认浏览器打开
   授权页（DSH web-app 就是用 `open` 包做这件事的：`packages/bundle/web-app/src/index.ts:84-112,172-217`）；
   收到回调后用 SDK 的 `transport.finishAuth(searchParams)` 换 token（`index.d.mts:3188-3211`），
   然后重新 `connect()`。
3. **token 持久化：** 优先写进 `ctx.credentials` 的 `grant` 记录（key `dsh-trading-agent/tradingview`），
   这是已挂载的服务；不依赖未挂载的 `ctx.authorization`，必要时用
   `ctx.inject(['authorization'], ...)` 在存在时补一个 flow。
4. **首次授权怎么触发：** 可以在工具第一次被调用且 token 缺失时启动环回 + 打开浏览器，并在
   工具结果里返回"请在浏览器完成授权"；也可以注册一个显式的登录入口。
5. **依赖：** 需要新增 `@modelcontextprotocol/client@2.0.0`（MIT）与浏览器打开器（`open`，MIT）
   作为本插件依赖；这会改变插件体积与依赖面。

**为什么仍不推荐：** 这不只是技术问题。把官方 MCP 内嵌进一个**通过 npm 分发的第三方 MIT 插件**，
正是 ToS §3 明确点名禁止的形态（见 §4）。技术上能做出来，法律上不可辩护。

---

## 4. 问题 3：每种方案下的 TradingView ToS 风险

**权威文本：** TradingView 使用条款 `https://www.tradingview.com/policies/` 第 3 节
"Ownership of information; license to use TradingView; redistribution of data; non-display usage"。
以下为 2026-09-21 抓取的原文（HTML 实体已还原）：

- 仅展示、个人/内部用途：
  > "The content and market data provided on the TradingView platform, including but not limited to
  > charts, alerts, webhooks, and any other forms of information, are licensed for exclusive
  > display-only use. This license is strictly limited to personal or internal business purposes and
  > explicitly prohibits any form of non-display usage."
- 非展示用途含算法化决策：
  > "Such prohibited uses include, but are not limited to, any form of automated trading, automated
  > order generation, price referencing, order verification, algorithmic decision-making,
  > algorithmic trading, smart order routing, using data in operations control or risk management
  > programs, or any machine-driven processes that do not involve the direct, human-readable display
  > of such data."
- 也禁止"基于其内容做产品/加工"：
  > "Such prohibited cases also include creating products or services based on TradingView content,
  > any processing of TradingView's content, or any other use cases that undermine the restrictions
  > in place by the Data Providers."
- 第三方产品被点名：
  > "we expressly forbid direct non-display usage by our users, as well as the development, offering,
  > or utilization of any third-party products, tools, or services designed to facilitate or enable
  > such non-display usage of TradingView's content and market data. For the avoidance of doubt, it
  > is hereby explicitly prohibited for any third party to create, offer, or operate any product or
  > service that: Utilizes, repurposes, or relies upon TradingView's market data ... for any form of
  > automated trading, algorithmic decision-making, or any other non-display purposes."
- 再分发/商业化：
  > "our agreements with Data Providers strictly forbid the sublicensing, assigning, transferring,
  > selling, loaning, or any distribution of TradingView content, including market data, for any
  > form of compensation."
  > "Except as otherwise expressly permitted by separate agreement, we do not permit commercial
  > usage of any of our services or APIs."

上一轮的 [tradingview-mcp.md §7](./tradingview-mcp.md) 已就同一条款得出"再分发、缓存/提供给
第三方、或在第三方产品内驱动自动化都似乎违反 ToS §3"的结论；本次抓取逐字复核一致。

**逐方案风险：**

| 方案 | 自动化/算法化分析 | 缓存/会话留存 | 第三方产品 / 商业 | 综合风险 |
|---|---|---|---|---|
| **2a 用户自用 `mcp-remote`** | 用户主动提问时属于"人读展示"，但一旦模型用它产出信号/结论即落入"algorithmic decision-making" | token 存 `~/.mcp-auth`（不算数据缓存）；**DSH 会话日志会持久化工具结果**，是本机副本；mcp-remote 自身不缓存行情 | 桥是通用工具、非 TradingView 专用；插件本身不依赖它 | **中**：若仅个人交互查看、不打包、不外传，可辩护；不能保证不越线 |
| **2b 给 DSH 加 OAuth** | 与任何 MCP 宿主相同；TradingView 官方本身鼓励 Claude/ChatGPT/Codex 这样接 | 同上 | 是通用客户端能力，不是 TradingView 专用产品 | **中**：技术上是"照官方推荐的用法"，但把 TradingView 数据引入自动化分析仍受 §3 约束；需另行判断商业使用 |
| **2c 插件内嵌** | 插件的目的就是自动化技术分析 → 直接命中"algorithmic decision-making" | 数据可能进入 chart spec / 会话日志并随插件行为扩散 | **第三方产品依赖其数据**，命中 §3 点名条款；MIT 再分发使"distribution"风险上升 | **高**：最接近条款明确禁止的形态 |

补充：`mcp-remote` 是 MIT 只授权其**代码**，不授予任何 TradingView 数据/商标/IP 权利
（同类结论见 [tradingview-mcp.md §7](./tradingview-mcp.md)）。官方 MCP server 本身不开源，
使用完全受通用 ToS 约束。

---

## 5. 问题 4：推荐方案与实施计划

### 5.1 推荐（分层）

1. **默认推荐：维持 ADR-0004，不接入。** 分析链路继续用 Binance（主）+ Hyperliquid（补充）
   的公共端点；图表继续由客户端自行渲染。这是唯一不需要 ToS 辩护的方案。
2. **若用户坚持个人自用：只做方案 2a，且作为"用户自己的 DSH MCP server"存在，不进插件包。**
   插件继续不读、不缓存、不把 TradingView 数据写进 chart spec。这是技术上最小、可随时撤销
   的一步。
3. **不推荐 2b / 2c：** 2b 是 DSH 上游的通用能力，不属于本仓库；2c 的 ToS 风险最高。
   若确实要做，应先取得 TradingView 的书面许可（ToS 多处提到"separate agreement"）。

### 5.2 分步骤实施计划（方案 2a 的最小可行路径）

**Step 0 —— 先跑通授权，再挂宿主（不改任何仓库文件）**
- 用户在一个临时目录执行：
  `npx -p mcp-remote@latest mcp-remote-client https://mcp.tradingview.com/mcp --transport http-only`
  （README 的 "Client" 模式），确认能打开浏览器、完成 OAuth、列出工具。
- 成功判据：命令输出远端工具列表；`~/.mcp-auth` 出现 token。
- 失败排查：先 `rm -rf ~/.mcp-auth` 重来（README "Troubleshooting"）。

**Step 1 —— 用作一个用户级 DSH MCP server**
- 在 `$DSH_HOME/cordis.patch.yml`（或 `--patch` 覆盖层）里加 §3.1 的那条 `mcp-github` 式
  配置行，`serverName: tradingview`，`--transport http-only`，并按需要
  `--ignore-tool` 收窄工具面。
- **不要**把这条写进本仓库的 `cordis.patch.yml`，也**不要**让插件代码依赖它。
- 成功判据：DSH 启动后出现 `mcp__tradingview__get_ohlcv` 等工具，调用返回 OHLCV 数组。

**Step 2 —— 与插件解耦的验证**
- 在本插件的会话里问一个**纯展示**问题（如"用 TradingView 的 get_ohlcv 显示 NVDA 近 30 天
  收盘价"），确认模型只是把数字读给用户；**不**触发 `trading_chart` 工具，不把它的数据
  合并进 Binance 的分析/信号。
- 成功判据：`trading_chart` 的入参仍然只来自 Binance；没有任何 TradingView 字段进入
  chart spec 或 session 的机械数据。

**（备选）Step 3 —— 若最终决定做 2c**
- 需要注意的落地细节见 §3.3；涉及新文件 `src/tradingview/client.ts`、
  `src/tradingview/oauth.ts`，改动 `src/index.ts`（注册转发工具）与 `package.json`
  （新增 `@modelcontextprotocol/client`、`open` 依赖）。
- **在动代码前必须先取得 TradingView 书面许可**，否则不建议实施。

### 5.3 需要用户做的授权动作

- 拥有 **Essential 或更高套餐、且非 trial** 的 TradingView 账号（`/mcp/docs`）。
- 在本机浏览器完成一次 OAuth 登录并批准 `mcp:read`/`mcp:tools`（官方文档与 AS 元数据）。
- 若走 2a：同意 `mcp-remote` 在本机 `~/.mcp-auth` 保存 token，并在环回端口起回调。
- 若走 2c：额外同意插件在宿主进程里起环回监听并打开浏览器。
- 在任何情况下都**不能**代用户内嵌凭据：官方没有 server-to-server 的 API-key 路径
  （[tradingview-mcp.md §5](./tradingview-mcp.md)）。

### 5.4 可验证的里程碑（按顺序）

1. `mcp-remote-client` 单独跑通 → 工具列表非空。
2. DSH 挂载后 `tools/list` 暴露 `mcp__tradingview__*`（数量由 `--ignore-tool` 决定）。
3. 一次性调用 `get_ohlcv` 返回与官方文档一致的 `[{t,o,h,l,c,v}]`。
4. 会话里 "纯展示" 用例通过，且 `trading_chart` 的输入源仍只有 Binance。
5. 撤销测试：删掉配置行 + `rm -rf ~/.mcp-auth`，DSH 恢复无 TradingView 工具。
6. （2b/2c 若实施）401 后能触发一次人类授权并恢复，且不误入 10 次重连熔断
   （`connection.ts:225-234`）。

### 5.5 明确的"不应做"边界

- **不**把 `mcp.tradingview.com` 的 URL、OAuth client、token 存储路径或桥接命令**写进本仓库
  的任何发布产物**（`src/`、`cordis.patch.yml`、`package.json`、README）。
- **不**把 TradingView 返回的数据写进 `chartSpec`、机械候选、规则信号、市场状态或会话留存的
  分析产物；**不**缓存、**不**在插件间/用户间再分发。
- **不**用它的数据驱动任何自动化/算法化决策或下单相关逻辑。
- **不**为商业用途启用；商业使用需先取得 TradingView 的单独书面许可。
- **不**用社区/抓取型 TradingView MCP 作为替代（ADR-0004 已排除；非官方、基于抓取、
  不授予任何数据权利，见 [tradingview-mcp.md §1/§7](./tradingview-mcp.md)）。
- **不**在没有 ToS 结论前，为接入而先改 DSH 上游或插件源码。

### 5.6 涉及的文件 / 包（方案对照）

| 方案 | 需要触碰的文件/包 | 本仓库是否改代码 |
|---|---|---|
| 2a（推荐若坚持） | 用户的 `$DSH_HOME/cordis.patch.yml`（或 `--patch` 文件）；`mcp-remote@0.14.3` | 否 |
| 2b | DSH 上游 `packages/mcp/mcp-client/`、`packages/credentials/*`、可能的 `packages/api/settings-controller` 与 client UI | 否（属 DSH 上游） |
| 2c | `src/tradingview/*.ts`（新）、`src/index.ts`、`package.json` | 是（风险最高，不建议） |

---

## 6. 未核实事项

1. **授权后的实时工具列表** —— 需要一个付费且已授权的 TradingView 账号；35 个工具仍来自
   `/mcp/docs`，不是实时 `tools/list`（与 [tradingview-mcp.md §8](./tradingview-mcp.md) 相同）。
2. **mcp-remote 与 DSH stdio 探针双启动的端到端结果** —— 需要实测；理论上第一次交互授权后
   第二个进程可复用 `~/.mcp-auth`。
3. **TradingView 接受的 `redirect_uri` 形态** —— DCR 端点存在，但未验证它是否接受
   `http://localhost:<随机端口>/oauth/callback` 这类环回地址。
4. **TradingView 协商的 MCP 协议修订版** —— 未验证；建议 `--protocol auto`。
5. **构建期曾尝试 `dsh --profile web --dump-config` 以核对组合树**，但该命令会写
   `/Users/johnny/.dsh/profiles/web/cordis.yml`，在当前 workspace-write 沙箱下被拒（EPERM）。
   因此"web profile 未挂载 `ctx.authorization`"的结论建立在对已安装 base/web-app 两个
   bundle patch 与已安装 lib 的静态检查上，而非运行期转储。
6. **`mcp-proxy` / `supergateway` 等同类桥的一手细节** —— 本次只核对了 `mcp-remote`。
7. **MCP 专属条款** —— 除通用使用条款外未发现其他（同上一轮）。

---

## 7. 一手来源索引

**DSH（已安装 0.1.6-alpha.1）**
- MCP client 类型：`/Users/johnny/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-mcp-client/lib/types/index.d.ts:26-80`
- transport 工厂：`.../dsh-mcp-client/lib/index.js:38-48`
- Config schema：`.../dsh-mcp-client/lib/index.js:780-800`
- 依赖：`.../dsh-mcp-client/package.json:40-44`
- SDK 包：`.../dsh/node_modules/@modelcontextprotocol/client/package.json`
- SDK transport 选项（`authProvider`）：`.../@modelcontextprotocol/client/dist/index.d.mts:3020-3108`
- SDK `OAuthClientProvider`/`AuthProvider`/`finishAuth`/`UnauthorizedError`：同上 `:228-320`、`:186-201`、`:3188-3211`、`:456`
- base bundle（只挂 credentials，无 authorization）：`.../@deepseek-ai/dsh-base/cordis.patch.yml:94-98`

**DSH（源码 0.1.6-alpha.2，`/Users/johnny/Work/Project/deepseek-harness`）**
- `packages/mcp/mcp-client/src/index.ts:52-142`、`src/transport.ts:31-46`、`src/connection.ts:41-46,127-408`
- `packages/mcp/mcp-client/README.md:28-69,136-138`、`tests/negotiation-lifecycle.spec.ts:66-76`
- `docs/subsystems/mcp.md:24-34,101`、`docs/config-catalog.md:1651-1726`
- `docs/subsystems/credentials.md:64-121,125-215`
- `packages/credentials/authorization/README.md:34-65`
- `.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.md:19-21,58`
- `packages/host/webserver/src/index.ts:38-70`
- `packages/host/open-in-app/src/index.ts:185-204`（路由信任门）
- `packages/api/gateway/src/index.ts:215`（路由信任门）
- `packages/bundle/web-app/src/index.ts:84-112,172-217`（浏览器打开）

**本仓库（`/Users/johnny/Work/trading-agent`）**
- `src/index.ts:13-16,58-60,61-134`
- `package.json:17-39`、`cordis.patch.yml`
- `docs/adr/0004-no-tradingview-data-or-mcp.md`、`docs/research/tradingview-mcp.md`

**TradingView（2026-09-21 抓取/探测）**
- 使用条款：https://www.tradingview.com/policies/ （第 3 节）
- MCP 文档：https://www.tradingview.com/mcp/docs
- MCP 端点：`https://mcp.tradingview.com/mcp`（401 + `www-authenticate`）
- 受保护资源元数据：https://mcp.tradingview.com/.well-known/oauth-protected-resource/mcp
- 授权服务器元数据：https://www.tradingview.com/.well-known/oauth-authorization-server

**mcp-remote / 工具**
- npm 元数据：https://registry.npmjs.org/mcp-remote/latest
- README：https://github.com/punkpeye/mcp-remote
- 仓库状态：https://api.github.com/repos/punkpeye/mcp-remote
