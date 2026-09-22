#!/usr/bin/env bash
# dsh-trading-agent 一键启动（macOS / Linux）
#
# 目标：无论本机是否装过 Node / pnpm / DSH，都能直接跑起来。
# 做法：把缺失的组件装到 AGENT_HOME（默认 ~/.dsh-trading-agent）下自用，不改系统、不需要 sudo。
#
# 用法：
#   ./start.sh [--profile web] [--spec <npm/git/路径/tgz>] [--home <目录>]
#              [--no-start] [--no-open] [--toolchain-only] [--dry-run]
# 环境变量：PROFILE / PLUGIN_SPEC / AGENT_HOME / NODE_VERSION / DSH_VERSION / PNPM_VERSION
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
PROFILE="${PROFILE:-web}"
PLUGIN_SPEC="${PLUGIN_SPEC:-}"
AGENT_HOME="${AGENT_HOME:-${HOME}/.dsh-trading-agent}"
NODE_VERSION="${NODE_VERSION:-v22.20.0}"
DSH_VERSION="${DSH_VERSION:-0.1.6-alpha.2}"
PNPM_VERSION="${PNPM_VERSION:-11}"
FORCE_LOCAL_NODE="${FORCE_LOCAL_NODE:-0}"
START=1
OPEN=1
TOOLCHAIN_ONLY=0
DRY_RUN=0

say()  { printf '%s\n' "==> $*"; }
warn() { printf '%s\n' "[warn] $*" >&2; }
die()  { printf '%s\n' "[error] $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
dsh-trading-agent 一键启动

选项：
  --profile <name>   目标 DSH profile（默认 web；桌面端可用 desktop）
  --spec <spec>      插件来源：tgz 路径 / 本地目录 / github:owner/repo / npm 包名
                     缺省时依次尝试：脚本同目录的 dsh-trading-agent-*.tgz > 本仓库目录 > GitHub
  --home <dir>       工具链安装目录（默认 ~/.dsh-trading-agent）
  --no-start         只准备好环境，不启动 DSH
  --no-open          启动 web 时不自动打开浏览器
  --toolchain-only   只安装 Node / pnpm / DSH，不装插件、不启动
  --dry-run          只打印将要执行的动作
  -h, --help         显示本帮助

环境变量：PROFILE PLUGIN_SPEC AGENT_HOME NODE_VERSION DSH_VERSION PNPM_VERSION FORCE_LOCAL_NODE=1
USAGE
}

while [ "$#" -gt 0 ]; do
  case "${1}" in
    --profile) PROFILE="${2}"; shift 2 ;;
    --spec) PLUGIN_SPEC="${2}"; shift 2 ;;
    --home) AGENT_HOME="${2}"; shift 2 ;;
    --no-start) START=0; shift ;;
    --no-open) OPEN=0; shift ;;
    --toolchain-only) TOOLCHAIN_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：${1}（用 --help 查看用法）" ;;
  esac
done

OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"
case "${OS_RAW}" in
  Darwin) NODE_OS="darwin" ;;
  Linux)  NODE_OS="linux" ;;
  *) die "暂只支持 macOS 与 Linux（当前 ${OS_RAW}）。Windows 请在 WSL 或 Git Bash 下运行。" ;;
esac
case "${ARCH_RAW}" in
  arm64|aarch64) NODE_ARCH="arm64" ;;
  x86_64|amd64)  NODE_ARCH="x64" ;;
  *) die "暂不支持的 CPU 架构：${ARCH_RAW}" ;;
esac

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "${2}" "${1}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "${2}" "${1}"
  else
    die "需要 curl 或 wget 之一来下载依赖。"
  fi
}

node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

ensure_node() {
  if [ "${FORCE_LOCAL_NODE}" != "1" ] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    major="$(node_major || echo 0)"
    if [ "${major}" -ge 20 ] 2>/dev/null; then
      say "使用系统 Node $(node -v)"
      return 0
    fi
    warn "系统 Node 版本过低（$(node -v)），改装本地 Node ${NODE_VERSION}"
  else
    say "未检测到可用的 Node，准备安装本地 Node ${NODE_VERSION}"
  fi
  if [ "${DRY_RUN}" = "1" ]; then say "[dry-run] 下载并解压 Node ${NODE_VERSION} 到 ${AGENT_HOME}/toolchain"; return 0; fi
  TOOLCHAIN_DIR="${AGENT_HOME}/toolchain"
  NODE_DIR="${TOOLCHAIN_DIR}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}"
  mkdir -p "${TOOLCHAIN_DIR}"
  if [ ! -x "${NODE_DIR}/bin/node" ]; then
    TARBALL="${TOOLCHAIN_DIR}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
    URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
    say "下载 ${URL}"
    download "${URL}" "${TARBALL}" || die "Node 下载失败（${URL}）。检查网络，或用 NODE_VERSION 指定可用版本。"
    tar -xzf "${TARBALL}" -C "${TOOLCHAIN_DIR}" || die "Node 解压失败"
    rm -f "${TARBALL}"
  fi
  [ -x "${NODE_DIR}/bin/node" ] || die "未找到 Node 可执行文件：${NODE_DIR}/bin/node"
  export PATH="${NODE_DIR}/bin:${PATH}"
  say "本地 Node：$(node -v)"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then say "使用系统 pnpm $(pnpm --version)"; return 0; fi
  if [ "${DRY_RUN}" = "1" ]; then say "[dry-run] 在 ${AGENT_HOME}/pnpm 安装 pnpm@${PNPM_VERSION}"; return 0; fi
  say "未检测到 pnpm，安装到 ${AGENT_HOME}/pnpm（pnpm@${PNPM_VERSION}）"
  mkdir -p "${AGENT_HOME}/pnpm"
  if ! npm install --prefix "${AGENT_HOME}/pnpm" --no-audit --no-fund "pnpm@${PNPM_VERSION}" >"${AGENT_HOME}/pnpm-install.log" 2>&1; then
    tail -n 40 "${AGENT_HOME}/pnpm-install.log" >&2
    die "pnpm 安装失败（详见 ${AGENT_HOME}/pnpm-install.log）"
  fi
  export PATH="${AGENT_HOME}/pnpm/node_modules/.bin:${PATH}"
  say "本地 pnpm：$(pnpm --version)"
}

ensure_dsh() {
  if command -v dsh >/dev/null 2>&1; then
    v="$(dsh --version 2>/dev/null | tail -1)"
    case "${v}" in
      0.1.6*) say "使用系统 dsh ${v}"; return 0 ;;
      *) warn "系统 dsh 版本 ${v} 与所需 ${DSH_VERSION} 不一致，改装本地 dsh" ;;
    esac
  else
    say "未检测到 dsh，安装到 ${AGENT_HOME}/dsh（@deepseek-ai/dsh@${DSH_VERSION}）"
  fi
  if [ "${DRY_RUN}" = "1" ]; then say "[dry-run] 在 ${AGENT_HOME}/dsh 安装 @deepseek-ai/dsh@${DSH_VERSION}"; return 0; fi
  mkdir -p "${AGENT_HOME}/dsh"
  if ! npm install --prefix "${AGENT_HOME}/dsh" --no-audit --no-fund "@deepseek-ai/dsh@${DSH_VERSION}" >"${AGENT_HOME}/dsh-install.log" 2>&1; then
    tail -n 40 "${AGENT_HOME}/dsh-install.log" >&2
    die "dsh 安装失败（详见 ${AGENT_HOME}/dsh-install.log）"
  fi
  export PATH="${AGENT_HOME}/dsh/node_modules/.bin:${PATH}"
  say "本地 dsh：$(dsh --version 2>/dev/null | tail -1)"
}

resolve_spec() {
  if [ -n "${PLUGIN_SPEC}" ]; then printf '%s' "${PLUGIN_SPEC}"; return 0; fi
  for f in "${SCRIPT_DIR}"/dsh-trading-agent-*.tgz; do
    if [ -f "${f}" ]; then printf '%s' "${f}"; return 0; fi
  done
  if [ -f "${SCRIPT_DIR}/package.json" ] && grep -q '"name": *"dsh-trading-agent"' "${SCRIPT_DIR}/package.json" 2>/dev/null; then
    printf '%s' "${SCRIPT_DIR}"; return 0
  fi
  printf '%s' "github:johnny-ggao/trading-agent"
}

install_plugin() {
  spec="$(resolve_spec)"
  say "把插件加入 profile「${PROFILE}」：${spec}"
  if [ "${DRY_RUN}" = "1" ]; then say "[dry-run] dsh plugin --profile ${PROFILE} add ${spec}"; return 0; fi
  if ! dsh plugin --profile "${PROFILE}" add "${spec}"; then
    die "插件安装失败。若提示缺少 allowBuilds：把 dsh-trading-agent 写进 ${HOME}/.dsh/profiles/${PROFILE}/pnpm-workspace.yaml 的 allowBuilds 后重跑；或改用与本脚本放在同一目录的预构建 .tgz。"
  fi
}

start_dsh() {
  if [ "${START}" != "1" ]; then
    say "已按 --no-start 跳过启动。手动启动：dsh --profile ${PROFILE}"
    return 0
  fi
  say "启动 DSH（profile：${PROFILE}）。首次启动会自动初始化 profile 并下载依赖，可能需要几分钟。"
  say "提示：DSH 需要一个模型 provider/API key 才能对话；插件出图不需要 key，TypeSafe 校准 key 可选。"
  if [ "${OPEN}" = "1" ]; then
    dsh --profile "${PROFILE}"
  else
    dsh --profile "${PROFILE}" --no-open
  fi
}

say "dsh-trading-agent 一键启动（平台 ${NODE_OS}-${NODE_ARCH}，AGENT_HOME=${AGENT_HOME}）"
ensure_node
ensure_pnpm
ensure_dsh
if [ "${TOOLCHAIN_ONLY}" = "1" ]; then say "工具链就绪。"; exit 0; fi
install_plugin
start_dsh
