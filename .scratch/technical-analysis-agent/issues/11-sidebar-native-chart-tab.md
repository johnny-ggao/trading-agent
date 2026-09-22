# 11: 图表迁到右侧栏原生自定义 tab

**要构建什么：** 用户要求每次出图**自动在右侧栏打开**、**去掉对话内联图**，并且：只在**对话回合完成时**自动打开；刷新或切换会话**不**自动打开；每个出图回合底部留一个**重新打开的链接**，以便关掉 tab 后再找回来。每张图一个自己的 tab（旧图保留），并显示可区分的标题。决策见 [ADR-0006](../../../docs/adr/0006-sidebar-native-chart-tab.md)。

**Blocked by:** 04（图卡控件与宿主端点）

**Status:** done

- [x] 抽出可复用图表模块 `src/client/chart.ts`（工具栏 + 图表 + 图例 + 换图状态）
- [x] 声明资源类型 `trading-chart`，每张图一个 `dsh-resource://trading-chart/<会话>/<回合>` 地址
- [x] 正文与标题槽（`sidebar.right.pane.tab` / `.title`）从 params 或聊天快照取 spec
- [x] turnTail 每回合一个「在右侧栏查看行情图」链接
- [x] 会话级观察者只在 `running` true→false 时自动打开；刷新/切会话不打开
- [x] 客户端 `inject` 增加 `sidebarRightTabs`、`sidebarRight`
- [x] 纯逻辑测试（回合查找、地址解析、自动打开状态机）；全库 123 例

## Comments

- 2026-09-22：**工单 11 落地（第二版）。**
  - 迁移前发现并修复一个真实缺陷：升级到 **0.1.6-alpha.2** 后 `conversation.chat.turnTail` 是 **list** 槽，旧代码按 alpha.1 的 **chain** 形态注册（`select`、无 `id`），`apply` 会抛 `list slot "conversation.chat.turnTail" requires options.id`——内联图在 alpha.2 下其实已失效。ADR-0001 §20 相应修订。
  - **第一版**用页类型 + `openTabIn`，后按用户要求改为**资源类型 + 每图一个地址**：侧栏按 `(kind, contentId)` 去重，重复打开聚焦而不是新开；关掉再点链接即可找回；每张图一个 tab。
  - **自动打开的判定**：`conversation.session.header.utilities` 里注册一个不渲染的会话级观察者，读 `useSession().running` 的 `true→false` 跳变。刷新/切会话观察不到跳变，故不自动打开。状态机抽成纯函数 `autoOpenReducer` 并测试。
  - **刷新恢复**：导航参数不持久化，还原的 tab 先取 params，取不到再按地址里的回合号从聊天快照 `findChartSpec` 找回。
  - `src/client/chart.ts` 承载图卡；`src/client/turn.ts` 是纯逻辑（快照查找、地址解析、状态机）；`src/client/index.ts` 只做注册接线。
  - `typecheck` / `build` 干净；`pnpm test` 123 例通过。
  - **未验证**：客户端/侧栏 UI 无法在本沙箱自动视觉验证（模型无图像输入、浏览器起不来），需用户在升级后的运行时（web 3080 / 桌面 19387）实测。
