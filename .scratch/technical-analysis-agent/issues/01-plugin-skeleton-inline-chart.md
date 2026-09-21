# 01: 插件骨架与内联图表（假数据）

**要构建什么：** 一个可安装的 DSH 双半边插件（宿主 + 客户端）。安装并重启后，让 agent 调用工具，对话中渲染出一张可交互的 K 线图卡，数据来自硬编码序列。本票打通整条集成链路：npm 包与 DSH 清单、宿主工具注册、客户端槽位注册、`chartSpec` 宿主↔客户端契约、Lightweight Charts 内联渲染，以及测试脚手架（Vitest）与 fixture 约定。

**Blocked by:** 无（可立即开始）

**Status:** ready-for-agent

- [ ] 仓库是一个可被 `dsh plugin --profile web add <路径>` 安装的 npm 包，声明 `dsh.bundle.patch` 与 `dsh.client`
- [ ] 宿主半边注册一个工具，其 `presentationMeta` 返回固定的 `chartSpec`
- [ ] 客户端半边注册该工具的 `tool.call.toolview`，用 Lightweight Charts 渲染可交互 K 线图卡
- [ ] 构建产出宿主 Node 产物与客户端 `window.__ModuleLoader__.load` 经典脚本
- [ ] Vitest 就绪，`chartSpec → series` 映射有纯函数测试
- [ ] README 写明安装步骤与"重启 `dsh web`"（安装由用户执行）
