#!/usr/bin/env bash
#
# reload.sh — 重建 dsh-trading-agent 并重载 DSH：一条命令完成"构建 + 重装 + 重启"。
#
# 默认针对 **web** profile（测试环境，默认端口 3080），不会影响别处运行着的桌面客户端。
#
# 用法:
#   ./reload.sh                       # 构建 + 确保已装 + 重启 web
#   ./reload.sh --no-restart          # 只构建（客户端半边通常由 dsh-client-hmr 自动热更）
#   DSH_PROFILE=desktop ./reload.sh   # 改为重启桌面客户端（端口 19387）
#
# 可覆盖环境变量:
#   DSH_CHECKOUT  DSH 源码目录 (默认 /Users/johnny/Work/Project/deepseek-harness)
#   DSH_PROFILE   目标 profile (默认 web)
#   DSH_PORT      监听端口 (web 默认 3080；desktop 用 19387)
#   DSH_BIN       dsh 可执行文件 (默认 PATH 中的 dsh)
#   DSH_LAUNCH    desktop profile 的启动脚本 (默认 dev:desktop)
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_CHECKOUT="${DSH_CHECKOUT:-/Users/johnny/Work/Project/deepseek-harness}"
DSH_PROFILE="${DSH_PROFILE:-web}"
DSH_PORT="${DSH_PORT:-$([ "$DSH_PROFILE" = desktop ] && echo 19387 || echo 3080)}"
DSH_BIN="${DSH_BIN:-$(command -v dsh || true)}"
LOG="${REPO}/.reload.log"

RESTART=1
for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=0 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
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
  echo "    !! 找不到 dsh，请手动: dsh plugin --profile $DSH_PROFILE add link:$REPO" >&2
fi

if [ "$RESTART" -eq 0 ]; then
  echo "==> [3/4] 跳过重启（--no-restart）"
  echo "==> [4/4] 完成。客户端半边在运行中的 web 里通常自动热更；宿主半边改动才需要重启。"
  exit 0
fi

echo "==> [3/4] 关闭旧实例（profile=$DSH_PROFILE, 端口=$DSH_PORT）"
OLD_PID="$(lsof -t -nP -iTCP:"$DSH_PORT" -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
if [ -n "$OLD_PID" ]; then
  echo "    kill $OLD_PID"
  kill "$OLD_PID" 2>/dev/null || true
else
  pkill -f "profiles/$DSH_PROFILE" 2>/dev/null || true
fi
for _ in $(seq 1 40); do
  lsof -nP -iTCP:"$DSH_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 0.5
done

echo "==> [4/4] 启动（日志: $LOG）"
if [ "$DSH_PROFILE" = "desktop" ]; then
  cd "$DSH_CHECKOUT"
  nohup pnpm run "${DSH_LAUNCH:-dev:desktop}" >"$LOG" 2>&1 &
  echo "    已后台启动（PID $!）。"
else
  if [ -z "$DSH_BIN" ]; then echo "!! 找不到 dsh，无法启动" >&2; exit 1; fi
  nohup "$DSH_BIN" --profile "$DSH_PROFILE" >"$LOG" 2>&1 &
  echo "    已后台启动（PID $!）。打开 http://127.0.0.1:$DSH_PORT"
fi
