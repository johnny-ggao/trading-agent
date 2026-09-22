<#
.SYNOPSIS
  dsh-trading-agent 一键启动（Windows）
.DESCRIPTION
  无论本机是否装过 Node / pnpm / DSH，都把缺失的组件装到
  $env:USERPROFILE\.dsh-trading-agent 下自用（不改系统安装），
  再把插件加入目标 profile 并启动 DSH。
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start.ps1 -Profile desktop -NoStart
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]${Profile} = "web",
  [string]${Spec} = "",
  [string]${Home} = "$env:USERPROFILE\.dsh-trading-agent",
  [switch]${NoStart},
  [switch]${NoOpen},
  [switch]${ToolchainOnly},
  [switch]${DryRun},
  [switch]${Help}
)

$ErrorActionPreference = "Stop"
${ScriptDir} = Split-Path -Parent ${MyInvocation}.MyCommand.Path
${NodeVersion} = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { "v22.20.0" }
${DshVersion} = if ($env:DSH_VERSION) { $env:DSH_VERSION } else { "0.1.6-alpha.2" }
${PnpmVersion} = if ($env:PNPM_VERSION) { $env:PNPM_VERSION } else { "11" }
${ForceLocalNode} = ($env:FORCE_LOCAL_NODE -eq "1")

function Say([string]${msg})  { Write-Host "==> ${msg}" -ForegroundColor Cyan }
function Warn([string]${msg}) { Write-Host "[warn] ${msg}" -ForegroundColor Yellow }
function Die([string]${msg})  { Write-Host "[error] ${msg}" -ForegroundColor Red; exit 1 }

if (${Help}) {
  @"
dsh-trading-agent 一键启动（Windows）

用法：powershell -ExecutionPolicy Bypass -File .\start.ps1 [选项]

  -Profile <name>   目标 DSH profile（默认 web；桌面端用 desktop）
  -Spec <spec>      插件来源：tgz 路径 / 本地目录 / github:owner/repo / npm 包名
                    缺省时依次尝试：脚本同目录的 dsh-trading-agent-*.tgz > 本仓库目录 > GitHub
  -Home <dir>       工具链安装目录（默认 $env:USERPROFILE\.dsh-trading-agent）
  -NoStart          只准备好环境，不启动 DSH
  -NoOpen           启动 web 时不自动打开浏览器
  -ToolchainOnly    只安装 Node / pnpm / DSH，不装插件、不启动
  -DryRun           只打印将要执行的动作
  -Help             显示本帮助

环境变量：NODE_VERSION DSH_VERSION PNPM_VERSION FORCE_LOCAL_NODE=1
"@ | Write-Host
  exit 0
}

function Get-NodeMajor {
  try { return [int]((& node -v).TrimStart("v").Split(".")[0]) } catch { return 0 }
}

function Download([string]${url}, [string]${dest}) {
  try {
    Invoke-WebRequest -Uri ${url} -OutFile ${dest} -UseBasicParsing
  } catch {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe -fsSL -o ${dest} ${url}
      if (${LASTEXITCODE} -ne 0) { throw "curl failed" }
    } else { throw }
  }
}

function Ensure-Node {
  ${node} = Get-Command node -ErrorAction SilentlyContinue
  ${npm} = Get-Command npm -ErrorAction SilentlyContinue
  if ((-not ${ForceLocalNode}) -and ${node} -and ${npm}) {
    if ((Get-NodeMajor) -ge 20) { Say "使用系统 Node $(& node -v)"; return }
    Warn "系统 Node 版本过低（$(& node -v)），改装本地 Node ${NodeVersion}"
  } else {
    Say "未检测到可用的 Node，准备安装本地 Node ${NodeVersion}"
  }
  if (${DryRun}) { Say "[dry-run] 下载并解压 Node ${NodeVersion} 到 ${Home}\toolchain"; return }
  ${arch} = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  ${toolchain} = Join-Path ${Home} "toolchain"
  ${nodeDir} = Join-Path ${toolchain} ("node-" + ${NodeVersion} + "-win-" + ${arch})
  New-Item -ItemType Directory -Force -Path ${toolchain} | Out-Null
  if (-not (Test-Path (Join-Path ${nodeDir} "node.exe"))) {
    ${zip} = Join-Path ${toolchain} ("node-" + ${NodeVersion} + "-win-" + ${arch} + ".zip")
    ${url} = "https://nodejs.org/dist/${NodeVersion}/node-${NodeVersion}-win-${arch}.zip"
    Say "下载 ${url}"
    Download ${url} ${zip}
    Expand-Archive -Path ${zip} -DestinationPath ${toolchain} -Force
    Remove-Item ${zip} -Force
  }
  if (-not (Test-Path (Join-Path ${nodeDir} "node.exe"))) { Die "未找到 node.exe：${nodeDir}" }
  $env:Path = "${nodeDir};$env:Path"
  Say "本地 Node：$(& node -v)"
}

function Ensure-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) { Say "使用系统 pnpm $(& pnpm --version)"; return }
  if (${DryRun}) { Say "[dry-run] 在 ${Home}\pnpm 安装 pnpm@${PnpmVersion}"; return }
  Say "未检测到 pnpm，安装到 ${Home}\pnpm（pnpm@${PnpmVersion}）"
  ${prefix} = Join-Path ${Home} "pnpm"
  ${log} = Join-Path ${Home} "pnpm-install.log"
  New-Item -ItemType Directory -Force -Path ${prefix} | Out-Null
  & npm install --prefix ${prefix} --no-audit --no-fund ("pnpm@" + ${PnpmVersion}) *> ${log}
  if (${LASTEXITCODE} -ne 0) { Get-Content ${log} -Tail 40; Die "pnpm 安装失败（详见 ${log}）" }
  $env:Path = "${prefix}\node_modules\.bin;$env:Path"
  Say "本地 pnpm：$(& pnpm --version)"
}

function Ensure-Dsh {
  ${dsh} = Get-Command dsh -ErrorAction SilentlyContinue
  if (${dsh}) {
    ${v} = (& dsh --version 2>$null | Select-Object -Last 1)
    if ("${v}" -like "0.1.6*") { Say "使用系统 dsh ${v}"; return }
    Warn "系统 dsh 版本 ${v} 与所需 ${DshVersion} 不一致，改装本地 dsh"
  } else {
    Say "未检测到 dsh，安装到 ${Home}\dsh（@deepseek-ai/dsh@${DshVersion}）"
  }
  if (${DryRun}) { Say "[dry-run] 在 ${Home}\dsh 安装 @deepseek-ai/dsh@${DshVersion}"; return }
  ${prefix} = Join-Path ${Home} "dsh"
  ${log} = Join-Path ${Home} "dsh-install.log"
  New-Item -ItemType Directory -Force -Path ${prefix} | Out-Null
  & npm install --prefix ${prefix} --no-audit --no-fund ("@deepseek-ai/dsh@" + ${DshVersion}) *> ${log}
  if (${LASTEXITCODE} -ne 0) { Get-Content ${log} -Tail 40; Die "dsh 安装失败（详见 ${log}）" }
  $env:Path = "${prefix}\node_modules\.bin;$env:Path"
  Say "本地 dsh：$(& dsh --version | Select-Object -Last 1)"
}

function Resolve-Spec {
  if (${Spec}) { return ${Spec} }
  ${tgz} = Get-ChildItem -Path ${ScriptDir} -Filter "dsh-trading-agent-*.tgz" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (${tgz}) { return ${tgz}.FullName }
  ${pkg} = Join-Path ${ScriptDir} "package.json"
  if ((Test-Path ${pkg}) -and ((Get-Content ${pkg} -Raw) -match '"name"\s*:\s*"dsh-trading-agent"')) { return ${ScriptDir} }
  return "github:johnny-ggao/trading-agent"
}

function Install-Plugin {
  ${spec} = Resolve-Spec
  Say "把插件加入 profile「${Profile}」：${spec}"
  if (${DryRun}) { Say "[dry-run] dsh plugin --profile ${Profile} add ${spec}"; return }
  & dsh plugin --profile ${Profile} add ${spec}
  if (${LASTEXITCODE} -ne 0) {
    Die ("插件安装失败。若提示缺少 allowBuilds，把 dsh-trading-agent 写进 " + $env:USERPROFILE + "\.dsh\profiles\" + ${Profile} + "\pnpm-workspace.yaml 后重跑；或改用与脚本同目录的预构建 .tgz。")
  }
}

function Start-Dsh {
  if (${NoStart}) { Say "已按 -NoStart 跳过启动。手动启动：dsh --profile ${Profile}"; return }
  Say "启动 DSH（profile：${Profile}）。首次启动会初始化 profile 并下载依赖，可能需要几分钟。"
  Say "提示：DSH 需要一个模型 provider/API key 才能对话；插件出图不需要 key，TypeSafe 校准 key 可选。"
  if (${NoOpen}) { & dsh --profile ${Profile} --no-open } else { & dsh --profile ${Profile} }
}

Say "dsh-trading-agent 一键启动（Windows，AGENT_HOME=${Home}）"
Ensure-Node
Ensure-Pnpm
Ensure-Dsh
if (${ToolchainOnly}) { Say "工具链就绪。"; exit 0 }
Install-Plugin
Start-Dsh
