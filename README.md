# dsh-trading-agent

把加密行情技术分析图表渲染到 DSH **右侧栏原生自定义 tab** 的双半边插件（宿主 + 客户端）。

## 安装

```sh
dsh plugin --profile web add dsh-trading-agent
```

安装后**重启 `dsh web`**（bundle 成员变化需要重启）。随后在对话里让 agent 调用 `trading_chart`，图表会自动在右侧栏的「行情图」tab 中打开（见 [ADR-0006](docs/adr/0006-sidebar-native-chart-tab.md)）。

开发期从本仓库直接安装：

```sh
dsh plugin --profile web add /Users/johnny/Work/trading-agent
```

## 随包 skill

插件附带一个模型可调用的 skill `trading-chart`，由宿主半边在启动时注册。它教模型何时调用 `trading_chart`、时间词如何映射主周期、指标参数怎么填、默认值是什么，如何用 `trading_confidence` 校准置信度，以及如何在回答里声明所用默认。

正文在 [assets/trading-chart.md](assets/trading-chart.md)；构建时由 esbuild 的 `.md` text loader 内联进 `lib/index.js`，所以改完正文要**重新构建并重启 `dsh web`**。

## 置信度校准（可选）

方向性结论的置信度可以用 TypeSafe 的 [Jev](https://docs.typesafe.ai/)（System One）校准：模型先出图、形成「方向 + 失效位 + 理由」，再调用 `trading_confidence`，宿主把真实机械证据与结论交给 Jev，返回**支持度（含概率分布）**与**校准置信度（0..1 与 高/中/低）**。

**配置 key（普通用户）**：打开侧栏的**「插件」页 → 已安装 → dsh-trading-agent → trading-agent 行的「配置」**，粘贴 TypeSafe API key 并保存。密钥经 credentials 域存储、不会明文回传；保存后热生效，无需重启。（第三方插件不会出现在「设置 → 插件」的官方配置页里，只会在插件管理页的本行配置中。）

**配置 key（高级用户）**：设置环境变量 `TYPESAFE_API_KEY`，或在插件配置里设置 `apiKeyEnv` 指向别的变量名。

保存会给出明确反馈：成功显示「已保存，已生效。」，失败显示宿主的原因。**如果同名环境变量（如 `TYPESAFE_API_KEY`）已经提供了该引用，它属于只读来源，界面写入会被拒绝**——此时直接用环境变量即可，或先移除该变量再在界面保存。

**不配置也能用**：没有 key 或服务不可用时，`trading_confidence` 返回 `ok=false`，模型按自己的判断给出置信度并声明「未经校准」，插件的出图与分析不受影响。事实与边界见 [docs/research/jev-confidence.md](docs/research/jev-confidence.md) 与 [ADR-0007](docs/adr/0007-jev-calibrated-confidence.md)。

## 开发

```sh
pnpm install
pnpm run build      # 产出 lib/index.js（宿主）与 lib/client.js（客户端经典脚本）
pnpm test           # Vitest
pnpm run typecheck
```

## 重载开发

改完插件代码后，一条命令重建并重启**测试环境（web，默认端口 3080）**：

```sh
./reload.sh
```

- `./reload.sh --no-restart`：只构建。客户端半边在运行中的 DSH 里通常由 `dsh-client-hmr` 自动热更；**宿主半边**改动才需要重启。
- `DSH_PROFILE=desktop ./reload.sh`：改为重启桌面客户端（端口 19387）。
- 重启日志写到 `.reload.log`（已 gitignore）。
