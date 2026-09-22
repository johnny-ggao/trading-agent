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
LOG_DIR="${AGENT_HOME}/logs"
START=1
OPEN=1
TOOLCHAIN_ONLY=0
DRY_RUN=0
PHASE=0
TOTAL=4

say()  { printf '%s\n' "==> $*"; }
warn() { printf '%s\n' "[warn] $*" >&2; }
die()  { printf '%s\n' "[error] $*" >&2; exit 1; }

step() { PHASE=$((PHASE + 1)); printf '\n==> [%s/%s] %s\n' "${PHASE}" "${TOTAL}" "${1}"; }

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

要求：Node ≥ 20；pnpm > 10（缺失时用 Node 自带的 corepack 自动准备，不需要全局安装）。

安装过程会显示进度（下载有进度条）并把每一步日志实时输出，同时保存到 <AGENT_HOME>/logs/。
USAGE
}

while [ "$#" -gt 0 ]; do
  case "${1}" in
    --profile) PROFILE="${2}"; shift 2 ;;
    --spec) PLUGIN_SPEC="${2}"; shift 2 ;;
    --home) AGENT_HOME="${2}"; LOG_DIR="${AGENT_HOME}/logs"; shift 2 ;;
    --no-start) START=0; shift ;;
    --no-open) OPEN=0; shift ;;
    --toolchain-only) TOOLCHAIN_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：${1}（用 --help 查看用法）" ;;
  esac
done
if [ "${TOOLCHAIN_ONLY}" = "1" ]; then TOTAL=3; fi
mkdir -p "${LOG_DIR}"

OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"
case "${OS_RAW}" in
  Darwin) NODE_OS="darwin" ;;
  Linux)  NODE_OS="linux" ;;
  *) die "暂只支持 macOS 与 Linux（当前 ${OS_RAW}）。Windows 请用 start.ps1。" ;;
esac
case "${ARCH_RAW}" in
  arm64|aarch64) NODE_ARCH="arm64" ;;
  x86_64|amd64)  NODE_ARCH="x64" ;;
  *) die "暂不支持的 CPU 架构：${ARCH_RAW}" ;;
esac

# 下载：带进度条；curl 优先，退回 wget。
download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --progress-bar -o "${2}" "${1}"
  elif command -v wget >/dev/null 2>&1; then
    wget --progress=bar:force --tries=3 -O "${2}" "${1}"
  else
    die "需要 curl 或 wget 之一来下载依赖。"
  fi
}

# 运行一步：输出实时镜像到终端并写入日志；失败时打印日志末尾。
run_step() {
  label="${1}"; logfile="${2}"; shift 2
  step "${label}"
  if [ "${DRY_RUN}" = "1" ]; then printf '    [dry-run] %s\n' "$*"; return 0; fi
  printf '    日志：%s\n' "${logfile}"
  start=${SECONDS}
  set +e
  "$@" 2>&1 | tee "${logfile}"
  status=${PIPESTATUS[0]}
  set -e
  elapsed=$((SECONDS - start))
  if [ "${status}" -eq 0 ]; then
    printf '    ✓ 完成（%ss）\n' "${elapsed}"
  else
    printf '    ✗ 失败（%ss），最后 30 行：\n' "${elapsed}" >&2
    tail -n 30 "${logfile}" >&2
    return "${status}"
  fi
}

pnpm_major() { pnpm --version 2>/dev/null | cut -d. -f1; }

node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

ensure_node() {
  step "准备 Node（需要时自动下载安装）"
  if [ "${FORCE_LOCAL_NODE}" != "1" ] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    major="$(node_major || echo 0)"
    if [ "${major}" -ge 20 ] 2>/dev/null; then
      printf '    使用系统 Node %s\n' "$(node -v)"
      return 0
    fi
    warn "系统 Node 版本过低（$(node -v)），改装本地 Node ${NODE_VERSION}"
  else
    printf '    未检测到可用的 Node，准备安装本地 Node %s\n' "${NODE_VERSION}"
  fi
  TOOLCHAIN_DIR="${AGENT_HOME}/toolchain"
  NODE_DIR="${TOOLCHAIN_DIR}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}"
  TARBALL="${TOOLCHAIN_DIR}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
  URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
  if [ "${DRY_RUN}" = "1" ]; then printf '    [dry-run] 下载 %s\n' "${URL}"; return 0; fi
  if [ -x "${NODE_DIR}/bin/node" ]; then
    printf '    已存在本地 Node：%s\n' "${NODE_DIR}"
  else
    mkdir -p "${TOOLCHAIN_DIR}"
    printf '    下载 %s\n' "${URL}"
    download "${URL}" "${TARBALL}" || die "Node 下载失败（${URL}）。检查网络，或用 NODE_VERSION 指定可用版本。"
    printf '    解压到 %s\n' "${TOOLCHAIN_DIR}"
    tar -xzf "${TARBALL}" -C "${TOOLCHAIN_DIR}" || die "Node 解压失败"
    rm -f "${TARBALL}"
  fi
  [ -x "${NODE_DIR}/bin/node" ] || die "未找到 Node 可执行文件：${NODE_DIR}/bin/node"
  export PATH="${NODE_DIR}/bin:${PATH}"
  printf '    本地 Node：%s\n' "$(node -v)"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    major_pnpm="$(pnpm_major || echo 0)"
    if [ "${major_pnpm}" -gt 10 ] 2>/dev/null; then
      step "准备 pnpm（要求 > 10）"
      printf '    使用系统 pnpm %s\n' "$(pnpm --version)"
      return 0
    fi
    warn "系统 pnpm 版本 $(pnpm --version 2>/dev/null) 不满足 >10，准备本地 pnpm ${PNPM_VERSION}"
  fi
  step "准备 pnpm > 10（本地 pnpm ${PNPM_VERSION}）"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '    [dry-run] 用 corepack 准备 pnpm@%s\n' "${PNPM_VERSION}"
    return 0
  fi
  BIN_DIR="${AGENT_HOME}/toolchain/bin"
  mkdir -p "${BIN_DIR}"
  if command -v corepack >/dev/null 2>&1; then
    printf '    用 corepack 固定 pnpm@%s（shim: %s/pnpm）\n' "${PNPM_VERSION}" "${BIN_DIR}"
    cat > "${BIN_DIR}/pnpm" <<EOF
#!/usr/bin/env sh
exec corepack pnpm@${PNPM_VERSION} "\$@"
EOF
    chmod +x "${BIN_DIR}/pnpm"
  else
    warn "未找到 corepack，退回用 npm 引导安装 pnpm"
    run_step "安装 pnpm@${PNPM_VERSION}（npm 引导）" "${LOG_DIR}/pnpm-install.log" npm install --prefix "${AGENT_HOME}/pnpm" --no-audit --no-fund --loglevel=http "pnpm@${PNPM_VERSION}"
    BIN_DIR="${AGENT_HOME}/pnpm/node_modules/.bin"
  fi
  export PATH="${BIN_DIR}:${PATH}"
  printf '    本地 pnpm：%s\n' "$(pnpm --version)"
}

ensure_dsh() {
  if command -v dsh >/dev/null 2>&1; then
    v="$(dsh --version 2>/dev/null | tail -1)"
    case "$v" in
      0.1.6*) step "准备 DSH"; printf '    使用系统 dsh %s\n' "$v"; return 0 ;;
      *) warn "系统 dsh 版本 $v 与所需 ${DSH_VERSION} 不一致，改装本地 dsh" ;;
    esac
  fi
  mkdir -p "${AGENT_HOME}/dsh"
  run_step "用 pnpm 安装 @deepseek-ai/dsh@${DSH_VERSION}" "${LOG_DIR}/dsh-install.log" pnpm --config.strict-dep-builds=false --dir "${AGENT_HOME}/dsh" add "@deepseek-ai/dsh@${DSH_VERSION}"
  export PATH="${AGENT_HOME}/dsh/node_modules/.bin:${PATH}"
  printf '    注：pnpm 默认跳过依赖的原生构建脚本（node-pty 等），出图不受影响\n'
  printf '    本地 dsh：%s\n' "$(dsh --version 2>/dev/null | tail -1)"
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
  if [ "${DRY_RUN}" = "1" ]; then
    step "安装插件到 profile「${PROFILE}」"
    printf '    [dry-run] dsh plugin --profile %s add %s\n' "${PROFILE}" "${spec}"
    return 0
  fi
  run_step "安装插件到 profile「${PROFILE}」：${spec}" "${LOG_DIR}/plugin-add.log" dsh plugin --profile "${PROFILE}" add "${spec}" || die "插件安装失败。若提示缺少 allowBuilds：把 dsh-trading-agent 写进 ${HOME}/.dsh/profiles/${PROFILE}/pnpm-workspace.yaml 的 allowBuilds 后重跑；或改用与本脚本同目录的预构建 .tgz。"
}

start_dsh() {
  if [ "${START}" != "1" ]; then
    say "已按 --no-start 跳过启动。手动启动：dsh --profile ${PROFILE}"
    return 0
  fi
  say "启动 DSH（profile：${PROFILE}）。首次启动会初始化 profile 并下载依赖，需要几分钟。"
  say "提示：DSH 需要一个模型 provider/API key 才能对话；插件出图不需要 key，TypeSafe 校准 key 可选。"
  if [ "${OPEN}" = "1" ]; then
    dsh --profile "${PROFILE}"
  else
    dsh --profile "${PROFILE}" --no-open
  fi
}

say "dsh-trading-agent 一键启动（平台 ${NODE_OS}-${NODE_ARCH}，AGENT_HOME=${AGENT_HOME}）"
say "安装日志目录：${LOG_DIR}"
ensure_node
ensure_pnpm
ensure_dsh
if [ "${TOOLCHAIN_ONLY}" = "1" ]; then say "工具链就绪。"; exit 0; fi
install_plugin
start_dsh
