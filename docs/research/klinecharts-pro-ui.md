# KLineChart Pro（@klinecharts/pro）UI 与视觉样式调研

针对本项目图表选型的调研：KLineChart Pro 是建立在核心库 `klinecharts` 之上的「开箱即用」金融图表 UI，用于评估其布局、画图工具、内置指标、主题样式，以及与 TradingView 的相似度。

- **调研日期：** 2026-09-21
- **方法：** 仅使用一手来源 —— GitHub 仓库源码（`main` 与 `refactor` 分支）、GitHub REST API、npm registry 与已发布 bundle，以及官方文档站与官方在线预览。`web_fetch` 不可用时改用 `curl` + `web_search` 抓取。
- **语言约定：** URL、包名、代码标识符、类名、许可证名称与产品名保留英文原文；叙述使用中文。

---

## 结论速览

- **定位：** `@klinecharts/pro` 是 `klinecharts` 的官方 UI 封装层，不是另一个图表引擎；渲染、窗格、坐标轴、crosshair、指标与 overlay 全部由核心库完成，Pro 只提供外围的窗口框架（顶栏、左侧画图条、弹窗、数据加载状态）。
- **发布状态：** npm 最新版 **0.1.1**，发布于 **2023-03-23**，此后未再发布；`main` 分支最后一次提交为 2023-05-04。已发布版本实质停更于 2023 年。
- **在做的重构：** 仓库未归档，`dev` / `refactor` 分支有 2026 年的提交；`refactor` 分支正在把 UI 从 **SolidJS 重写为 Svelte 5**，peer 依赖升级为 **klinecharts ^10**，但版本号仍是 0.1.1，**尚未发布**。
- **UI 风格：** 深色 / 浅色两套主题，蓝色主色 `#1677ff`，顶部周期条 38px + 左侧画图条 52px，整体信息架构高度贴近 TradingView，但没有自选列表（watchlist）、没有右侧工具条。
- **可定制性：** 提供 `setTheme` / `setStyles` 与一组 CSS 变量可做皮肤化，但 UI 组件的 JSX 内部结构未暴露为 slots/props，**不是 slot 化**，深度改造需退回核心库 `klinecharts`。

---

## 1. 身份与发布事实

- **仓库：** <https://github.com/klinecharts/pro>，许可证 **Apache-2.0**，作者 liihuu，属于 GitHub 组织 `klinecharts`。
- **npm 包：** <https://www.npmjs.com/package/@klinecharts/pro>，合法包名写作 `@klinecharts/pro`，非 scoped 名称 `klinecharts-pro` 仅用于 bundle 全局变量 `klinechartspro`。
- **最新版本：** `0.1.1`（`dist-tags.latest`），发布于 **2023-03-23**；npm registry 的 `time.modified` 同样为 2023-03-23，说明此后没有任何发布。
- **已发布版本构成：** UI 层依赖 `solid-js ^1.6.11` 与 `lodash ^4.17.21`；peerDependency 为 `klinecharts >= 9.0.0`；构建工具为 Vite + `vite-plugin-solid`，样式使用 Less；同时提供 ESM（`dist/klinecharts-pro.js`）、UMD（`dist/klinecharts-pro.umd.js`）与 CSS。
- **文档站：** 中文 <https://pro.klinecharts.com>，英文 <https://pro.klinecharts.com/en-US>。
- **官方在线预览：** <https://preview.klinecharts.com>（英文入口 <https://preview.klinecharts.com/#en-US>）。该预览页的 bundle 中可检出 `klinecharts-pro`、`drawingBarVisible` 以及 Pro 专有 UI 文案（`Main Indicator`、`Sub Indicator`、`Weak Magnet`、`Fibonacci Extension`），可确认其中包含 Pro UI。
- **可运行示例：** 官方 getting-started 给出的 JSFiddle <https://jsfiddle.net/mawsyh/ct65rysp/20/>。
- **生态热度（2026-09-14 至 2026-09-20 周下载量，来源 npm downloads API）：** `@klinecharts/pro` 约 **809** 次/周；核心包 `klinecharts` 约 **32,422** 次/周；核心包最新版为 **10.0.3**（2026-08）。可见已发布的 Pro 明显滞后于核心库。

---

## 2. 布局

Pro 外壳（`src/ChartProComponent.tsx`、`src/KLineChartPro.tsx`）的 DOM 结构极简：一个顶栏 `PeriodBar`，下面一个 `klinecharts-pro-content` 容器，容器内可选渲染加载遮罩与 `DrawingBar`，再加一个由核心库 `init()` 接管的图表挂载点。

根容器 `klinecharts-pro` 的样式（`src/base.less`、`src/index.less`）：

- `display: flex; flex-direction: column;`，默认 `height: 80vh`，字号 14px；
- 主题通过根节点的 `data-theme` 属性切换（`light` / `dark`）；
- 尺寸常量：顶部周期条 `@period-bar-height: 38px`、左侧画图条 `@drawing-bar-width: 52px`、图表区 `@widget-width: calc(100% - 52px)`、`@widget-height: calc(100% - 38px)`。

### 2.1 顶部 symbol / period 栏

源文件 `src/widget/period-bar/index.tsx`。从左到右依次为：

1. **菜单图标（汉堡）**：注意它切换的是**左侧画图工具条的显隐**（`drawingBarVisible`），**不是**自选列表；图标在展开/收起时旋转 180°。
2. **symbol 区**：可选 symbol logo 图片 + `shortName` / `name` / `ticker` 文本，加粗 18px；点击打开 Symbol Search 弹窗。
3. **周期按钮**：默认周期列表为 `1m`、`5m`、`15m`、`1H`、`2H`、`4H`、`D`、`W`、`M`、`Y`（可由 `periods` 选项整体替换）；选中项用主色高亮。
4. **工具项**：`Indicator`、`Timezone`、`Setting`、`Screenshot`、`Full Screen`，每项带 SVG 图标与文字标签，悬停变主色。

### 2.2 左侧画图工具条

源文件 `src/widget/drawing-bar/index.tsx`。宽 52px，自上而下分为若干 `item`，中间用 `split-line` 分隔；每个可展开项在 hover 时右侧显示一个小三角箭头，点击弹出 `List` 子菜单。分组顺序为：单线、多线、多边形、斐波那契、波浪；随后是磁吸模式、锁定、显隐、删除。

### 2.3 主图与副图窗格

图表本体不是 Pro 实现，而是核心库 `klinecharts` 的 `init()` 实例（挂载点 class 为 `klinecharts-pro-widget`）。Pro 的职责是调用 `createIndicator`：

- 主图指标以 `isStack = true` 堆叠到 `candle_pane`；
- 副图指标各自创建一个新 pane；对 `VOL` 额外设置 `gap: { bottom: 2 }`；
- 每个 indicator 通过 `createTooltipDataSource` 定制 tooltip 图标（显隐 / 设置 / 关闭）。

右侧价格轴与底部时间轴均由核心库绘制。x 轴日期格式由 Pro 的 `customApi.formatDate` 按周期切换（分钟级 `HH:mm`、小时级 `MM-DD HH:mm`、日/周 `YYYY-MM-DD`、月/年分别到 `YYYY-MM` / `YYYY`）。窗格之间的分隔条与拖拽缩放由核心库提供（核心 `pane.dragEnabled` 默认 true，并有 `PANE_MIN_HEIGHT` 与 `gap` 配置），Pro 不额外实现 resizer。

### 2.4 底部时间轴与分页加载

没有独立的「分页控件」：分页通过核心库的 `loadMore` 回调实现 —— 用户向左滚动到历史数据尽头时触发，Pro 每次通过 `datafeed.getHistoryKLineData` 拉取 **500 根** K 线，再调用 `applyMoreData` 追加。实时数据由 `datafeed.subscribe` / `unsubscribe` 提供。

### 2.5 弹窗（settings dialog 等）

Pro 共有 6 个模态框（`src/widget/` 下各自成目录）：

- `SymbolSearchModal`：标的搜索；
- `IndicatorModal`：指标选择（主图 / 副图两段复选列表）；
- `IndicatorSettingModal`：指标参数（如周期、标准差）；
- `TimezoneModal`：时区选择；
- `SettingModal`：图表外观设置；
- `ScreenshotModal`：截图预览。

`SettingModal` 的选项清单（`src/widget/setting-modal/data.ts`）：K 线类型（`candle_solid`、`candle_stroke`、`candle_up_stroke`、`candle_down_stroke`、`ohlc`、`area`）、显示最新价、显示最高价、显示最低价、显示指标最后值、价格轴类型（`normal` / `percentage` / `log`）、反转坐标、显示网格、恢复默认。

### 2.6 十字光标图例（crosshair legend）

每个窗格顶部的 `indicator.tooltip` 即图例，含指标名与数值，并带 4 个 hover 图标：`visible`、`invisible`、`setting`、`close`，通过核心库的 `ActionType.OnTooltipIconClick` 事件分发处理。图标字体为 `icomoon`，颜色浅色主题 `#76808F`、深色主题 `#929AA5`，悬停背景 `rgba(22, 119, 255, 0.15)`。此外十字光标本身及其轴标签、最新价标记由核心库绘制。

### 2.7 数据加载状态

- 切换 symbol / period 时先 `setLoadingVisible(true)`，由 `Loading` 组件渲染三点弹跳遮罩 `klinecharts-pro-loading`（主色、覆盖整个图表区、z-index 50），数据返回后关闭；
- 组件还内置 `klinecharts-pro-empty` 空状态组件；
- 主图中央有一个可配置的水印 `watermark`（默认是 KLineChart 的 logo SVG），class 为 `klinecharts-pro-watermark`；
- 价格单位标签 `klinecharts-pro-price-unit` 显示在价格轴顶部。

### 2.8 自选列表（watchlist）

**Pro 不提供自选列表。** 源码、i18n 资源与 `refactor` 分支中均没有 `watchlist` 相关字符串或组件；标的选择只有 Symbol Search 弹窗一种方式。顶栏左侧的汉堡只负责画图条显隐。

---

## 3. 画图工具与内置指标清单

### 3.1 左侧画图工具条中的画图工具

来源 `src/widget/drawing-bar/icons/index.ts` 的 `createSingleLineOptions` 等函数，共 5 个弹出分组、**30 个 overlay 名称**：

| 分组 | 内部 key（英文原名） | 界面文案（en-US） |
| --- | --- | --- |
| 单线 | `horizontalStraightLine` | Horizontal Line |
| 单线 | `horizontalRayLine` | Horizontal Ray |
| 单线 | `horizontalSegment` | Horizontal Segment |
| 单线 | `verticalStraightLine` | Vertical Line |
| 单线 | `verticalRayLine` | Vertical Ray |
| 单线 | `verticalSegment` | Vertical Segment |
| 单线 | `straightLine` | Trend Line |
| 单线 | `rayLine` | Ray |
| 单线 | `segment` | Segment |
| 单线 | `arrow` | Arrow |
| 单线 | `priceLine` | Price Line |
| 多线 | `priceChannelLine` | Price Channel Line |
| 多线 | `parallelStraightLine` | Parallel Line |
| 多边形 | `circle` | Circle |
| 多边形 | `rect` | Rect |
| 多边形 | `parallelogram` | Parallelogram |
| 多边形 | `triangle` | Triangle |
| 斐波那契 | `fibonacciLine` | Fibonacci Line |
| 斐波那契 | `fibonacciSegment` | Fibonacci Segment |
| 斐波那契 | `fibonacciCircle` | Fibonacci Circle |
| 斐波那契 | `fibonacciSpiral` | Fibonacci Spiral |
| 斐波那契 | `fibonacciSpeedResistanceFan` | Fibonacci Sector |
| 斐波那契 | `fibonacciExtension` | Fibonacci Extension |
| 斐波那契 | `gannBox` | Gann Box |
| 波浪 | `xabcd` | XABCD Pattern |
| 波浪 | `abcd` | ABCD Pattern |
| 波浪 | `threeWaves` | Three Waves |
| 波浪 | `fiveWaves` | Five Waves |
| 波浪 | `eightWaves` | Eight Waves |
| 波浪 | `anyWaves` | Any Waves |

除画图外，工具条还包含：磁吸模式 `weak_magnet` / `strong_magnet`（关闭时为 `normal`）、`lock` / `unlock`、`visible` / `invisible`、以及按 groupId `drawing_tools` 一键 `remove`。

### 3.2 内置指标

来源 `src/widget/indicator-modal/index.tsx`：

**主图指标（叠加在 candle_pane，共 6 个）：** `MA`、`EMA`、`SMA`、`BOLL`、`SAR`、`BBI`

**副图指标（独立 pane，共 26 项）：** `MA`、`EMA`、`VOL`、`MACD`、`BOLL`、`KDJ`、`RSI`、`BIAS`、`BRAR`、`CCI`、`DMI`、`CR`、`PSY`、`DMA`、`TRIX`、`OBV`、`VR`、`WR`、`MTM`、`EMV`、`SAR`、`SMA`、`ROC`、`PVT`、`BBI`、`AO`

**默认值：** `mainIndicators` 默认 `[MA]`，`subIndicators` 默认 `[VOL]`。

**RSI、MACD、KDJ、BOLL 是否内置：全部内置。** 其中 `BOLL` 同时出现在主图与副图列表；`RSI`、`MACD`、`KDJ` 仅副图。指标参数可在 `IndicatorSettingModal` 中修改（例如 `BOLL` 默认 period 20、standard deviation 2）。

---

## 4. 主题、颜色、字体与窗格

### 4.1 主题

内置 **`dark` 与 `light`** 两套主题，默认 `light`（`KLineChartPro` 构造参数的 `theme` 默认 `light`；根节点 `data-theme` 默认 `light`）。Pro 的切换方式是：给根节点写 `data-theme`，同时把主题名传给核心库的 `widget.setStyles(theme)`。

### 4.2 默认颜色（Pro UI 外壳）

来源 `src/base.less`、`src/index.less` 与官方文档 `docs/theme.md`。UI 皮肤由 CSS 变量控制（变量定义在 `.klinecharts-pro` 与 `.klinecharts-pro[data-theme="dark"]` 上）：

| CSS 变量 | 浅色 | 深色 |
| --- | --- | --- |
| `--klinecharts-pro-primary-color` | `#1677ff` | （沿用 `#1677ff`） |
| `--klinecharts-pro-hover-background-color` | `rgba(22, 119, 255, 0.15)` | `rgba(22, 119, 255, 0.15)` |
| `--klinecharts-pro-background-color` | `#FFFFFF` | `#151517` |
| `--klinecharts-pro-popover-background-color` | `#FFFFFF` | `#1c1c1f` |
| `--klinecharts-pro-text-color` | `#051441` | `#F8F8F8` |
| `--klinecharts-pro-text-second-color` | `#76808F` | `#929AA5` |
| `--klinecharts-pro-border-color` | `#ebedf1` | `#292929` |
| `--klinecharts-pro-selected-color` | `rgba(22, 119, 255, 0.15)` | 同左 |

### 4.3 默认颜色（核心图表）

图表区域的颜色来自核心库 `klinecharts` 的内置默认样式（v9 bundle 中提取）：

- 涨 / 跌 / 平：`#2DC08E` / `#F92855` / `#888888`（蜡烛、影线、最新价标记同色）；
- 主色 / 白 / 文本：`#1677FF` / `#FFFFFF` / `#76808F`；
- 深色主题：网格线与 x 轴线 `#292929` / `#333333`，tooltip 文本 `#929AA5`，tooltip 背景 `rgba(10, 10, 10, .6)`。

### 4.4 字体

- Pro 外壳未设置自定义字体，继承宿主页面字体；根字号为 14px；
- 核心库默认文本字体为 `Helvetica Neue`；
- 文档站使用 Inter，`refactor` 分支使用 `Inter Variable`；
- indicator tooltip 图标使用随包分发的 `icomoon` 图标字体。

### 4.5 窗格缩放（pane resizing）

窗格分隔与拖拽缩放由核心库负责（`pane.dragEnabled` 默认 true，另有 `PANE_MIN_HEIGHT`、`gap` 配置），Pro 仅通过 `PaneOptions` 传入 `gap`，本身不实现 resizer。

---

## 5. 与 TradingView 的异同

### 5.1 相似之处

KLineChart Pro 在**信息架构与交互范式**上明显对标 TradingView：

- 左侧竖直画图工具条，按类别分组并 hover 展开飞出子菜单，配磁吸（弱 / 强）、锁定、显隐、删除；
- 顶栏 = symbol 选择 + 周期按钮 + Indicator + 时区 + 设置 + 截图 + 全屏；
- 主图 + 多个指标副图的堆叠式多窗格布局，右侧价格轴、底部时间轴；
- 每个窗格左上角的指标图例，带 hover 图标（显隐 / 设置 / 关闭）；
- 深色 / 浅色主题、蓝色主色、绿涨红跌。

### 5.2 差异之处

- **没有自选列表 / 标的列表面板**：顶栏汉堡切换的是画图条，选标的只能用搜索弹窗；TradingView 有完整左侧自选与右侧面板。
- **没有右侧工具条**；周期选择是平铺按钮行，而不是 TradingView 那种带收藏的周期下拉。
- **指标与画图集合更小**，且没有回放（replay）、警报（alerts）、对比（compare）、财务数据、交易面板、模板 / 布局保存、多图网格、账户体系等。相对地，它补充了 Gann Box、Fibonacci Circle / Spiral / Speed-Resistance Fan、XABCD / ABCD / Three-Five-Eight Waves 等。
- **渲染与皮肤机制不同**：开源 canvas 渲染（`klinecharts`）通过 CSS 变量 + `setStyles` 换肤，而 TradingView 是闭源库自带的模板系统。
- **本地化**：仅 zh-CN（默认）与 en-US；时区弹窗只列约 18 个精选时区，不是完整 IANA 列表。
- **尺寸行为**：组件默认高度 80vh，而非 TradingView 的铺满视口。
- 官方文档明确把 Pro 定位为「不想在前端 UI 上投入精力」的用户，并建议自定义需求极强的用户直接使用核心库 `klinecharts`（`docs/introduction.md`）。

---

## 6. 演示链接与截图

- **官方在线预览（唯一可直接看到 UI 的官方入口）：** <https://preview.klinecharts.com>；英文 <https://preview.klinecharts.com/#en-US>。
- **文档站：** <https://pro.klinecharts.com>、<https://pro.klinecharts.com/en-US>。
- **可运行示例：** <https://jsfiddle.net/mawsyh/ct65rysp/20/>。
- **npm 页：** <https://www.npmjs.com/package/@klinecharts/pro>。
- **仓库：** <https://github.com/klinecharts/pro>。

**官方没有提供截图或 GIF。** 已核实 `main` 分支的 `docs/public/`、仓库其他目录以及 `gh-pages` 分支中，图片资源只有 `logo.svg` 一个。GitHub 自动生成的仓库社交预览图存在于 <https://opengraph.githubassets.com/1/klinecharts/pro>（返回 `image/png`），但它不是人工制作的 UI 截图，仅供参考。因此「看到界面」的唯一官方途径是在线预览。

---

## 7. 版本与维护现状

- **npm 已发布版本：** `0.1.1`（2023-03-23）；GitHub tag 仅有 `v0.1.0`、`v0.1.1`；`main` 分支最后一次提交为 2023-05-04（docs/ci 提交）。**已发布版本实质停更于 2023 年。**
- **仓库未归档，且有未发布的重构：** `dev` 分支有 2026-07-25 的提交；`refactor` 分支有 2026-07-25 至 2026-07-26 的多个提交。
- **refactor 分支的技术栈：** 从 **SolidJS 重写为 Svelte 5**；`package.json` 中 peerDependency 变为 **`klinecharts ^10`**；UI 依赖 `bits-ui`，图标改用 `@lucide/svelte`；工具链换成 bun + biome；样式改为基于 oklch 的设计 token（`src/app.css` 定义了 `--background`、`--foreground`、`--primary`、`--border` 等变量）。**但 package.json 版本号仍是 0.1.1，尚未发布到 npm。**
- **SolidJS 依赖：** 已发布的 0.1.1 依赖 `solid-js ^1.6.11`，并用 `vite-plugin-solid` 构建；UI 组件全部是 Solid 组件。`refactor` 分支已移除该依赖。
- **社区诉求（open issues，佐证版本滞后）：** 要求升级到 klinecharts v10（#76、#51）、暴露核心库 API（#66）等。
- **规模：** 339 stars、200 forks、55 个 open issues，Apache-2.0。

---

## 8. 可定制性 / 皮肤化

**可以皮肤化，但不是 slot 化。**

- **构造选项：** `theme`、`styles`（`DeepPartial<Styles>`）、`watermark`、`locale`、`drawingBarVisible`、`symbol`、`period`、`periods`、`timezone`、`mainIndicators`、`subIndicators`、`datafeed`。
- **运行时 API：** `setTheme` / `getTheme`、`setStyles` / `getStyles`、`setLocale` / `getLocale`、`setTimezone` / `getTimezone`、`setSymbol` / `getSymbol`、`setPeriod` / `getPeriod`。
- **UI 换肤：** 通过官方文档给出的 CSS 变量（见第 4.2 节）覆盖 `.klinecharts-pro` 与 `.klinecharts-pro[data-theme="dark"]`，可改变主色、背景、文本、边框与弹层颜色。
- **不作为 slot 暴露：** Pro 没有对外暴露 UI 组件内部的 JSX / slots / render props，无法通过受支持的接口重排或替换顶栏、画图条、弹窗的结构；截图、全屏、设置弹窗的样式也基本固定在 LESS 中。若要深度自定义，官方建议直接基于核心库 `klinecharts` 自行封装。
- **国际化：** 仅内置 zh-CN 与 en-US 两套文案（`src/i18n/`），`locale` 为字符串开关，未提供受支持的第三方语言注册 API。

---

## 9. 关键来源清单

- 仓库主页：<https://github.com/klinecharts/pro>
- 主组件与布局：<https://github.com/klinecharts/pro/blob/main/src/ChartProComponent.tsx>
- 入口与默认选项：<https://github.com/klinecharts/pro/blob/main/src/KLineChartPro.tsx>
- 顶栏：<https://github.com/klinecharts/pro/blob/main/src/widget/period-bar/index.tsx>
- 画图条：<https://github.com/klinecharts/pro/blob/main/src/widget/drawing-bar/index.tsx>
- 画图工具清单：<https://github.com/klinecharts/pro/blob/main/src/widget/drawing-bar/icons/index.ts>
- 指标弹窗：<https://github.com/klinecharts/pro/blob/main/src/widget/indicator-modal/index.tsx>
- 设置项清单：<https://github.com/klinecharts/pro/blob/main/src/widget/setting-modal/data.ts>
- 颜色常量：<https://github.com/klinecharts/pro/blob/main/src/base.less> 与 <https://github.com/klinecharts/pro/blob/main/src/index.less>
- 主题文档：<https://github.com/klinecharts/pro/blob/main/docs/theme.md>
- 定位说明：<https://github.com/klinecharts/pro/blob/main/docs/introduction.md>
- API 文档：<https://github.com/klinecharts/pro/blob/main/docs/api.md>
- npm 寄存器：<https://registry.npmjs.org/@klinecharts/pro>
- 核心库：<https://klinecharts.com>（最新 10.0.3）
- refactor 分支：<https://github.com/klinecharts/pro/tree/refactor>

---

## 10. 未能核实 / 局限

- 未在真实浏览器中逐项点击验证交互（仅源码 + 预览页 bundle 字符串 + 官方文档），个别交互细节（例如画图 overlay 的完整形态、移动端手势）未逐一实测。
- `preview.klinecharts.com` 为压缩后的生产 bundle，只能确认其包含 Pro 组件与 Pro 文案，无法从静态资源断定其展示的每一个 UI 元素版本。
- refactor 分支仍在变动（最后提交 2026-07-26），其最终 API 与 UI 可能与本报告描述不同；本报告对它的描述仅代表该时点。
- 未核实 `@klinecharts/pro` 在 TradingView 各功能维度上的逐项等价性清单，第 5 节为结构性对比。

