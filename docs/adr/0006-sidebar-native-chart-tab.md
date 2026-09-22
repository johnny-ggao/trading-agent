# 图表改在右侧栏原生自定义 tab 渲染

取代 [ADR-0001](0001-chart-rendering-lightweight-charts.md) 的「渲染位置」一节。图表不再内联在对话回合末尾，而是每张图一个**右侧栏原生自定义 tab**，由回合末尾（`conversation.chat.turnTail`）的链接手动打开，并在**看着一个回合完成**时自动打开。

选择的理由：

- 用户明确要求每次出图自动在右侧栏打开，并去掉内联图。
- 右侧栏是每会话常驻的停靠面：图表不随对话滚动被淹没，横向空间更大，可与其他 tab（文件、终端、浏览器）并存，也不挤压正文。
- 触发与内容分离：`chartSpec` 仍由宿主工具经 `presentationMeta` 交付，客户端只需把它作为 tab 的导航参数传出；两半的契约（单一可序列化 `chartSpec`）不变。

## 机制（按已安装运行时 0.1.6-alpha.2 核对）

- **声明资源类型**：`ctx.sidebarRightTabs.register({ id, kind: 'trading-chart', patterns: ['dsh-resource://trading-chart/**'], title })`。
- **每张图一个稳定地址**：`dsh-resource://trading-chart/<sessionId>/<turn>`（sessionId 经 URI 编码）。用**资源地址**而不是页 kind 作为 tab 身份，是为了让侧栏自己按 `(kind, contentId)` 去重：同一张图重复打开只会**聚焦已有 tab**，关闭后再打开也能找回；每个回合地址不同，旧图因此各自留在 tab 条上。
- **注册正文与标题**：`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, ChartTab)`（标题同理注册到 `sidebar.right.pane.tab.title`，显示 `交易对 周期`）。正文经 `useTabInfo()` 读 `navigation.params.spec` 渲染图卡。
- **打开**：`ctx.sidebarRight.openResourceIn(sessionId, address, { params: { spec } })`。
- **只在内联触发**：`conversation.chat.turnTail` 每个出图的回合渲染一个「在右侧栏查看行情图」按钮（不是图）；点击调用上面的打开。
- **自动打开的条件**：注册一个**不渲染任何内容**的会话级观察者到 `conversation.session.header.utilities`。它读 `useSession` 的 `running`；只有观察到 `true → false`（真的看着回合从跑到停）才把该回合的图打开。刷新页面或切换会话时 `running` 一直是 false，观察不到跳变，因此**不会**自动打开。
- **图卡控件**：周期切换与指标开关继续走**已有**的宿主路由 `/trading-agent/chart`（同源 `fetch`），不新增服务、端口或对话消息。
- **刷新后的恢复**：侧栏布局会持久化，但导航参数不持久化，还原出来的 tab 一开始没有 `params`。正文因此再按地址里的回合号从聊天快照（`useChat` → `findChartSpec`）把 `chartSpec` 取回来，恢复后的 tab 仍显示原图。
- **客户端服务注入**：客户端半边的 `inject` 增加 `sidebarRightTabs` 与 `sidebarRight`（由 `@deepseek-ai/dsh-client-ui-sidebar-right` 提供，`dsh-web-app` 内置）。

## 槽位形态的教训（修订 ADR-0001 §20）

ADR-0001 根据当时已安装的 0.1.6-alpha.1 把 `conversation.chat.turnTail` 当 **chain** 注册（带 `options.select`）。升级到 **0.1.6-alpha.2** 后该槽是 **list**：注册必须带唯一 `id`，缺 `id` 会在 `apply` 时抛 `list slot "conversation.chat.turnTail" requires options.id`，整条贡献被丢弃——内联图因此在 alpha.2 下失效。**结论不变但对象更新：实现必须以已安装运行时的槽位声明为准；当前运行时是 alpha.2。**

## 后果 (Consequences)

- 对话里不再有图表卡片，只有每个出图回合底部的一个「查看」按钮。
- 每个出图回合在右侧栏各占一个 tab，长期对话会积累较多 tab（tab 条会自动让位）。
- 自动打开依赖会话的 `running` 跳变：在后台完成、或完成时并未查看该会话的回合不会自动打开，但可以用该回合的按钮找回。
- 客户端视觉无法在本仓库的自动化测试里覆盖（测试只覆盖纯逻辑：回合查找、地址解析、自动打开状态机），需人工实测。

## 状态 (Status)

accepted；取代 ADR-0001 的「渲染位置」一节；ADR-0001 关于图表库选型（Lightweight Charts）与署名的部分仍然有效。
