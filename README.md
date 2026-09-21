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

## 开发

```sh
pnpm install
pnpm run build      # 产出 lib/index.js（宿主）与 lib/client.js（客户端经典脚本）
pnpm test           # Vitest
pnpm run typecheck
```

## 重载开发

改完插件代码后，一条命令重建并重启：

```sh
./reload.sh
```

- `./reload.sh --no-restart`：只构建。客户端半边在运行中的 DSH 里通常由 `dsh-client-hmr` 自动热更；**宿主半边**改动才需要重启。
- 默认重启 `desktop` profile 的桌面应用；用 `DSH_PROFILE=web ./reload.sh` 可切换。
- 重启日志写到 `.reload.log`（已 gitignore）。
