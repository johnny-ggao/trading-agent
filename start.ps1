<#
.SYNOPSIS
  dsh-trading-agent 一键启动（Windows）
.DESCRIPTION
  无论本机是否装过 Node / pnpm / DSH，都把缺失的组件装到
  $env:USERPROFILE\.dsh-trading-agent 下自用（不改系统安装），
  再把插件加入目标 profile 并启动 DSH。安装过程显示进度并把日志实时输出、留存到 logs\。
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

${ErrorActionPreference} = "Stop"
${ScriptDir} = Split-Path -Parent ${MyInvocation}.MyCommand.Path
${NodeVersion} = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { "v22.20.0" }
${DshVersion} = if ($env:DSH_VERSION) { $env:DSH_VERSION } else { "0.1.6-alpha.2" }
${PnpmVersion} = if ($env:PNPM_VERSION) { $env:PNPM_VERSION } else { "11" }
${ForceLocalNode} = ($env:FORCE_LOCAL_NODE -eq "1")
${LogDir} = Join-Path ${Home} "logs"
${Total} = 4
${script:Phase} = 0
if (${ToolchainOnly}) { ${Total} = 3 }

function Say([string]${msg})  { Write-Host "==> ${msg}" -ForegroundColor Cyan }
function Warn([string]${msg}) { Write-Host "[warn] ${msg}" -ForegroundColor Yellow }
function Die([string]${msg})  { Write-Host "[error] ${msg}" -ForegroundColor Red; exit 1 }

function Step([string]${label}) {
  ${script:Phase} = ${script:Phase} + 1
  Write-Host ""
  Write-Host ("==> [{0}/{1}] {2}" -f ${script:Phase}, ${Total}, ${label}) -ForegroundColor Cyan
}

function Run-Step([string]${label}, [string]${logfile}, [scriptblock]${action}) {
  Step ${label}
  if (${DryRun}) { Write-Host "    [dry-run] ${label}"; return }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent ${logfile}) | Out-Null
  Write-Host "    日志：${logfile}"
  ${start} = Get-Date
  & ${action} 2>&1 | Tee-Object -FilePath ${logfile}
  ${code} = ${LASTEXITCODE}
  ${secs} = [int]((Get-Date) - ${start}).TotalSeconds
  if (${code} -eq 0) {
    Write-Host "    ✓ 完成（${secs}s）" -ForegroundColor Green
  } else {
    Write-Host "    ✗ 失败（${secs}s），最后 30 行：" -ForegroundColor Red
    Get-Content ${logfile} -Tail 30
    exit 1
  }
}

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

要求：Node ≥ 20；pnpm > 10（缺失时用 Node 自带的 corepack 自动准备，不需要全局安装）。

安装过程会显示进度（下载有进度条）并把每一步日志实时输出，同时保存到 <Home>\logs\。
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
      & curl.exe -fL --retry 3 --progress-bar -o ${dest} ${url}
      if (${LASTEXITCODE} -ne 0) { throw "curl failed" }
    } else { throw }
  }
}

function Ensure-Node {
  Step "准备 Node（需要时自动下载安装）"
  ${node} = Get-Command node -ErrorAction SilentlyContinue
  ${npm} = Get-Command npm -ErrorAction SilentlyContinue
  if ((-not ${ForceLocalNode}) -and ${node} -and ${npm}) {
    if ((Get-NodeMajor) -ge 20) { Write-Host "    使用系统 Node $(& node -v)"; return }
    Warn "系统 Node 版本过低（$(& node -v)），改装本地 Node ${NodeVersion}"
  } else {
    Write-Host "    未检测到可用的 Node，准备安装本地 Node ${NodeVersion}"
  }
  ${arch} = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  ${toolchain} = Join-Path ${Home} "toolchain"
  ${nodeDir} = Join-Path ${toolchain} ("node-" + ${NodeVersion} + "-win-" + ${arch})
  ${zip} = Join-Path ${toolchain} ("node-" + ${NodeVersion} + "-win-" + ${arch} + ".zip")
  ${url} = "https://nodejs.org/dist/${NodeVersion}/node-${NodeVersion}-win-${arch}.zip"
  if (${DryRun}) { Write-Host "    [dry-run] 下载 ${url}"; return }
  New-Item -ItemType Directory -Force -Path ${toolchain} | Out-Null
  if (-not (Test-Path (Join-Path ${nodeDir} "node.exe"))) {
    Write-Host "    下载 ${url}"
    Download ${url} ${zip}
    Write-Host "    解压到 ${toolchain}"
    Expand-Archive -Path ${zip} -DestinationPath ${toolchain} -Force
    Remove-Item ${zip} -Force
  }
  if (-not (Test-Path (Join-Path ${nodeDir} "node.exe"))) { Die "未找到 node.exe：${nodeDir}" }
  $env:Path = "${nodeDir};$env:Path"
  Write-Host "    本地 Node：$(& node -v)"
}

function Get-PnpmMajor {
  try { return [int]((& pnpm --version).Trim().Split(".")[0]) } catch { return 0 }
}

function Ensure-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    if ((Get-PnpmMajor) -gt 10) { Step "准备 pnpm（要求 > 10）"; Write-Host "    使用系统 pnpm $(& pnpm --version)"; return }
    Warn "系统 pnpm 版本 $(& pnpm --version) 不满足 >10，准备本地 pnpm $PnpmVersion"
  }
  Step "准备 pnpm > 10（本地 pnpm $PnpmVersion）"
  if ($DryRun) { Write-Host "    [dry-run] 用 corepack 准备 pnpm@$PnpmVersion"; return }
  $binDir = Join-Path $Home "toolchain\bin"
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    $shim = Join-Path $binDir "pnpm.cmd"
    Write-Host "    用 corepack 固定 pnpm@$PnpmVersion（shim: $shim）"
    Set-Content -Path $shim -Value @("@echo off", "corepack pnpm@$PnpmVersion %*") -Encoding ASCII
    $env:Path = "$binDir;$env:Path"
  } else {
    Warn "未找到 corepack，退回用 npm 引导安装 pnpm"
    $prefix = Join-Path $Home "pnpm"
    $sb = { & npm install --prefix $prefix --no-audit --no-fund --loglevel=http "pnpm@$PnpmVersion" }.GetNewClosure()
    Run-Step "安装 pnpm@$PnpmVersion（npm 引导）" (Join-Path $LogDir "pnpm-install.log") $sb
    $env:Path = "$prefix\node_modules\.bin;$env:Path"
  }
  Write-Host "    本地 pnpm：$(& pnpm --version)"
}

function Ensure-Dsh {
  $dsh = Get-Command dsh -ErrorAction SilentlyContinue
  if ($dsh) {
    $v = (& dsh --version 2>$null | Select-Object -Last 1)
    if ("$v" -like "0.1.6*") { Step "准备 DSH"; Write-Host "    使用系统 dsh $v"; return }
    Warn "系统 dsh 版本 $v 与所需 $DshVersion 不一致，改装本地 dsh"
  }
  $prefix = Join-Path $Home "dsh"
  New-Item -ItemType Directory -Force -Path $prefix | Out-Null
  $sb = { & pnpm --config.strict-dep-builds=false --dir $prefix add "@deepseek-ai/dsh@$DshVersion" }.GetNewClosure()
  Run-Step "用 pnpm 安装 @deepseek-ai/dsh@$DshVersion" (Join-Path $LogDir "dsh-install.log") $sb
  $env:Path = "$prefix\node_modules\.bin;$env:Path"
  Write-Host "    注：pnpm 默认跳过依赖的原生构建脚本（node-pty 等），出图不受影响"
  Write-Host "    本地 dsh：$(& dsh --version | Select-Object -Last 1)"
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
  ${sb} = { & dsh plugin --profile ${Profile} add ${spec} }.GetNewClosure()
  Run-Step "安装插件到 profile「${Profile}」：${spec}" (Join-Path ${LogDir} "plugin-add.log") ${sb}
}

function Start-Dsh {
  if (${NoStart}) { Say "已按 -NoStart 跳过启动。手动启动：dsh --profile ${Profile}"; return }
  Say "启动 DSH（profile：${Profile}）。首次启动会初始化 profile 并下载依赖，可能需要几分钟。"
  Say "提示：DSH 需要一个模型 provider/API key 才能对话；插件出图不需要 key，TypeSafe 校准 key 可选。"
  if (${NoOpen}) { & dsh --profile ${Profile} --no-open } else { & dsh --profile ${Profile} }
}

Say "dsh-trading-agent 一键启动（Windows，AGENT_HOME=${Home}）"
Say "安装日志目录：${LogDir}"
Ensure-Node
Ensure-Pnpm
Ensure-Dsh
if (${ToolchainOnly}) { Say "工具链就绪。"; exit 0 }
Install-Plugin
Start-Dsh
