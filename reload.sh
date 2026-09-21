#!/usr/bin/env bash
#
# reload.sh — 重建 dsh-trading-agent 并重载 DSH，一条命令完成"构建 + 重装 + 重启"。
#
# 用法:
#   ./reload.sh                  # 构建 + 确保已装 + 重启桌面应用
#   ./reload.sh --no-restart     # 只构建（客户端半边在运行中的应用里通常自动热更）
#   DSH_PROFILE=web ./reload.sh  # 指定 profile（默认 desktop，即当前 GUI）
#   DSH_LAUNCH=start:desktop ./reload.sh   # 跳过 DSH 自身构建，重启更快
#
# 可覆盖的环境变量:
#   DSH_CHECKOUT  DSH 源码目录 (默认 /Users/johnny/Work/Project/deepseek-harness)
#   DSH_PROFILE   要安装/重启的 profile (默认 desktop)
#   DSH_PORT      GUI 监听端口 (默认 19387)
#   DSH_BIN       dsh 可执行文件 (默认 PATH 里的 dsh)
#   DSH_LAUNCH    DSH 启动脚本 (默认 dev:desktop；start:desktop 可跳过构建)
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_CHECKOUT="${DSH_CHECKOUT:-/Users/johnny/Work/Project/deepseek-harness}"
DSH_PROFILE="${DSH_PROFILE:-desktop}"
DSH_PORT="${DSH_PORT:-19387}"
DSH_BIN="${DSH_BIN:-$(command -v dsh || true)}"
DSH_LAUNCH="${DSH_LAUNCH:-dev:desktop}"
LOG="${REPO}/.reload.log"

RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg" >&2; exit 2 ;;
  esac
done

echo "==> [1/4] 构建插件（宿主 + 客户端）"
cd "$REPO"
node scripts/build.mjs

echo "==> [2/4] 确认插件已链接进 '$DSH_PROFILE' profile"
PROFILE_PKG="${DSH_HOME:-$HOME/.dsh}/profiles/${DSH_PROFILE}/package.json"
if [ -f "$PROFILE_PKG" ] && grep -q '"dsh-trading-agent"' "$PROFILE_PKG"; then
  echo "    已安装"
elif [ -n "$DSH_BIN" ]; then
  echo "    未安装，执行: dsh plugin --profile $DSH_PROFILE add link:$REPO"
  "$DSH_BIN" plugin --profile "$DSH_PROFILE" add "link:$REPO"
else
  echo "    !! 找不到 dsh 可执行文件，请手动安装：dsh plugin --profile $DSH_PROFILE add link:$REPO" >&2
fi

if [ "$RESTART" -eq 0 ]; then
  echo "==> [3/4] 跳过重启（--no-restart）"
  echo "==> [4/4] 完成。客户端半边在运行中的 DSH 里通常会自动热更；宿主半边改动才需要重启。"
  exit 0
fi

echo "==> [3/4] 关闭旧实例"
OLD_PID="$(lsof -t -nP -iTCP:"$DSH_PORT" -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
if [ -n "$OLD_PID" ]; then
  echo "    kill $OLD_PID（端口 $DSH_PORT）"
  kill "$OLD_PID" 2>/dev/null || true
else
  echo "    端口 $DSH_PORT 无监听，按应用路径兜底"
  pkill -f "$DSH_CHECKOUT/apps/desktop" 2>/dev/null || true
fi
for _ in $(seq 1 40); do
  lsof -nP -iTCP:"$DSH_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 0.5
done

echo "==> [4/4] 启动 DSH（$DSH_LAUNCH，日志: $LOG）"
cd "$DSH_CHECKOUT"
nohup pnpm run "$DSH_LAUNCH" >"$LOG" 2>&1 &
echo "    已后台启动（PID $!）。窗口出现后，刷新或重开对话即可。"
