# dsh-trading-agent

在 DSH 对话中内联渲染加密行情技术分析图表的双半边插件（宿主 + 客户端）。

## 安装

```sh
dsh plugin --profile web add dsh-trading-agent
```

安装后**重启 `dsh web`**（bundle 成员变化需要重启）。随后在对话里让 agent 调用 `trading_chart` 即可看到 K 线图卡。

开发期从本仓库直接安装：

```sh
dsh plugin --profile web add /Users/johnny/Work/trading-agent
```

## 随包 skill

插件附带一个模型可调用的 skill `trading-chart`，由宿主半边在启动时注册。它教模型何时调用 `trading_chart`、时间词如何映射主周期、指标参数怎么填、默认值是什么，以及如何在回答里声明所用默认。

正文在 [assets/trading-chart.md](assets/trading-chart.md)；构建时由 esbuild 的 `.md` text loader 内联进 `lib/index.js`，所以改完正文要**重新构建并重启 `dsh web`**。

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
