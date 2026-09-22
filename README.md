# dsh-trading-agent

在 DSH 的**右侧栏原生自定义 tab** 里渲染加密行情技术分析图表的双半边插件（宿主 + 客户端），并提供机械候选（枢轴 / 支撑阻力 / 斐波那契 / 均线排列）、规则信号、市场状态与多周期共振；可选接入 TypeSafe Jev 校准方向性结论的置信度。

- 数据来自 **Binance 现货公共接口**，**不需要任何 API key**。
- Jev 置信度校准是**可选**的；不配置也能正常出图与分析。
- 图表库为 Lightweight Charts（Apache-2.0，保留 TradingView 署名）。

## 前置条件

- **DSH 0.1.6-alpha.2 或兼容版本**。本插件用到该版本的右侧栏（`sidebarRight` / `sidebarRightTabs`）、`conversation.chat.turnTail` 的 **list** 槽，以及插件管理页的 `plugins.row.config` 配置页；更早的版本（如 alpha.1）槽位声明不同，无法工作。
- **Node.js ≥ 20**，以及 **pnpm**（`dsh plugin` 内部调用 pnpm）。
- 能访问 Binance 现货公共接口（`api.binance.com` 等）。

## 一键启动（推荐给不熟悉命令行的同事）

把这三样放在**同一个文件夹**里发给同事：

- `start.command`（macOS 双击）或 `start.sh`（终端）
- `dsh-trading-agent-0.1.0.tgz`（预构建插件；脚本会自动优先使用同目录的 tgz，无需构建）

macOS：双击 `start.command`。首次可能被 Gatekeeper 拦下——右键 → 打开，或在「系统设置 → 隐私与安全性」里允许；也可执行 `xattr -d com.apple.quarantine start.command`。终端用户直接 `bash start.sh`。

脚本会自动完成：识别平台 → 缺 Node 就下载本地 Node（≥20）→ 缺 pnpm 就装到 `~/.dsh-trading-agent` → 缺 DSH 就装 `@deepseek-ai/dsh@0.1.6-alpha.2` → 把插件加入 `web` profile → 启动 DSH 并打开浏览器。**全程不需要 sudo，也不改系统安装**（缺什么就装到 `~/.dsh-trading-agent` 下自用）。

常用参数：`--profile desktop`（桌面端）、`--spec github:johnny-ggao/trading-agent`（改用 GitHub 源）、`--no-start`、`--toolchain-only`、`--dry-run`、`--help`。

要求：能访问 npm 与 nodejs.org；首次启动会初始化 profile 并下载 DSH 依赖，需要几分钟。DSH 还需要一个**模型 provider / API key** 才能对话（首次 onboarding 里配置）；插件出图不需要 key。

> Windows 请在 WSL 或 Git Bash 下运行 `start.sh`；暂未提供原生 PowerShell 版本。

## 安装

> ⚠️ **本插件尚未发布到 npm**，所以 `dsh plugin add dsh-trading-agent` **不会**装上它。请用下面三种方式之一。

### 方式 A：从 GitHub 安装（同事最省事，无需本地构建）

```sh
dsh plugin --profile web add github:johnny-ggao/trading-agent
```

- 仓库不跟踪构建产物（`lib/` 被 gitignore），git 安装时 pnpm 会执行 `prepare` **自动构建**。
- 若 pnpm 拦下构建脚本，按提示把它加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重跑；或改用方式 B。
- HTTPS 等价写法：`dsh plugin --profile web add git+https://github.com/johnny-ggao/trading-agent.git`

把 `web` 换成你自己的 profile 名即可（例如桌面端用 `desktop`）。

### 方式 B：用事先构建好的打包文件（最稳，不依赖网络与构建脚本）

作者执行 `pnpm pack` 会产出 `dsh-trading-agent-0.1.0.tgz`（已含构建后的 `lib/`）。拿到文件后：

```sh
dsh plugin --profile web add "/绝对路径/dsh-trading-agent-0.1.0.tgz"
```

### 方式 C：从本地 checkout（开发者）

```sh
git clone https://github.com/johnny-ggao/trading-agent.git
cd trading-agent
pnpm install            # 会跑 prepare 自动构建
# 或显式：pnpm run build
dsh plugin --profile web add "$PWD"
```

### 安装后：重启 profile

bundle 成员变化**必须重启**对应的 DSH：

```sh
dsh --profile web        # 或你的 profile
```

> 注意：**客户端半边改动**只需刷新页面（由 `dsh-client-hmr` 热更）；**宿主半边**改动（工具、端点、skill）才需要重启。

### 验证是否装好

1. 重启后在对话里说一句「今天 BTC 走势如何」，让 agent 调用 `trading_chart`；右侧栏应自动出现「行情图」tab。
2. 命令行确认插件行已进入装配：

```sh
dsh --profile web --dump-config | grep -A1 trading-agent
```

## 使用

- **出图**：让 agent 画图即可。每次出图会在右侧栏自动打开（或聚焦并更新）对应 tab；每个回合一个 tab，旧图各自保留。
- **找回旧图**：每个出过图的回合底部有「在右侧栏查看行情图」入口；关掉 tab 后点它即可重开。
- **切换周期 / 指标**：图卡自带工具栏，点击走宿主端点换图，不产生对话消息、不占模型回合。
- **配置入口**：侧栏**「插件」页 → 已安装 → dsh-trading-agent → `trading-agent` 行的「配置」**。

## 置信度校准（可选）

方向性结论的置信度可以用 TypeSafe 的 [Jev](https://docs.typesafe.ai/)（System One）校准：模型先出图、形成「方向 + 失效位 + 理由」，再调用 `trading_confidence`；宿主把**真实机械证据**与结论一起交给 Jev，返回**支持度（含概率分布）**与**校准置信度（0..1 与 高/中/低）**，以及证据充分度与方向一致概率。

**配置 key（普通用户）**：侧栏**「插件」页 → 已安装 → dsh-trading-agent → `trading-agent` 行的「配置」** → 粘贴 TypeSafe API key → 保存。密钥经 **credentials 域**存储、不会明文回传；保存后热生效，无需重启。

> 第三方插件**不会**出现在「设置 → 插件」的官方配置页里（那是 `ui-settings-plugins` 为内置插件 ship 的），只在插件管理页的本行配置中。

**配置 key（高级用户）**：设置环境变量 `TYPESAFE_API_KEY`，或在插件配置里设 `apiKeyEnv` 指向别的变量名；也可配置 `model` / `baseURL` / `timeoutMs` / 阈值。

**保存反馈与只读来源**：保存成功显示「已保存，已生效。」，失败显示宿主的原因。**如果同名环境变量已经提供了该引用，它属于只读来源，界面写入会被拒绝**——此时直接用环境变量即可，或先移除该变量再在界面保存。

**不配置也能用**：没有 key、超时或服务不可用时，`trading_confidence` 返回 `ok=false`，模型按自己的判断给出置信度并声明「未经校准」，插件其余功能不受影响。

**数据出境**：调用 Jev 时发送的是公开行情、机械特征与**模型自己的结论文本**（不含用户原文）。事实与边界见 [docs/research/jev-confidence.md](docs/research/jev-confidence.md) 与 [ADR-0007](docs/adr/0007-jev-calibrated-confidence.md)。

## 随包 skill

插件附带一个模型可调用的 skill `trading-chart`，由宿主半边在启动时注册。它教模型何时调用 `trading_chart`、时间词如何映射主周期、指标参数怎么填、默认值是什么，如何用 `trading_confidence` 校准置信度，以及如何在回答里声明所用默认。

正文在 [assets/trading-chart.md](assets/trading-chart.md)；构建时由 esbuild 的 `.md` text loader 内联进 `lib/index.js`，所以改完正文要**重新构建并重启**对应 profile。

## 故障排查

| 现象 | 处理 |
|---|---|
| 右侧栏没有图表 tab | 确认 DSH ≥ 0.1.6-alpha.2；确认安装后已**重启** profile；用上面 `--dump-config` 确认本插件行在装配里。 |
| 找不到填 TypeSafe key 的地方 | 在**侧栏「插件」页**本行，不在「设置 → 插件」（那里第三方只有只读列表）。 |
| 保存 key 失败 | 多半是同名环境变量作为只读来源遮蔽了该引用；直接用 env，或移除后重试。 |
| 刷新后图表 tab 空白片刻 | 正常：导航参数不持久化，正文会按地址里的回合号从对话快照恢复；对话窗口加载到该回合后即显示。 |
| 升级 DSH 后旧的内联图消失 | 预期：alpha.2 起图表改在右侧栏渲染（[ADR-0006](docs/adr/0006-sidebar-native-chart-tab.md)）。 |

## 打包（作者用）

```sh
pnpm pack      # 产出 dsh-trading-agent-0.1.0.tgz（自动跑 prepack 构建），可发给同事用方式 B 安装
```

## 开发

```sh
pnpm install        # 会跑 prepare 构建
pnpm run build      # 产出 lib/index.js（宿主）与 lib/client.js（客户端经典脚本）
pnpm test           # Vitest
pnpm run typecheck
```

仓库结构：

- `src/index.ts`：宿主半边（工具、HTTP 换图端点、配置与 skill 注册）。
- `src/market/`：行情与机械计算（数据源、指标、候选、规则信号、市场状态）。
- `src/analysis/`：模型调用层（Jev 置信度校准的纯逻辑与官方 SDK 适配）。
- `src/client/`：客户端半边（图卡、侧栏 tab、自动打开、配置页）。
- `src/shared/`、`src/skill/`、`assets/`：契约、skill 与正文。
- `start.sh` / `start.command`：一键启动脚本（缺 Node/pnpm/DSH 时自动本地补齐）。

## 重载开发

改完插件代码后，一条命令重建并重启**测试环境（web，默认端口 3080）**：

```sh
./reload.sh
```

- `./reload.sh --no-restart`：只构建。客户端半边在运行中的 DSH 里通常由 `dsh-client-hmr` 自动热更；**宿主半边**改动才需要重启。
- `DSH_PROFILE=desktop ./reload.sh`：改为重启桌面客户端（端口 19387）。
- 重启日志写到 `.reload.log`（已 gitignore）。

## 许可

MIT，见 [LICENSE](LICENSE)；第三方组件与署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
