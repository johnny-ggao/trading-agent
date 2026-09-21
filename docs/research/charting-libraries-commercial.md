# 商业图表库调研：带内置画图工具的 TradingView 式图表

针对一个**商业产品**的调研：该产品需要 TradingView 风格的 K 线图 —— 左侧画图工具条、日期/时间轴与底部控件、可嵌入 **TypeScript** 应用（Node 宿主 + 浏览器/Electron 客户端）、使用**自有 crypto OHLCV 数据**（Binance / Hyperliquid）、支持自定义指标。

- **调研日期：** 2026-09-21
- **方法：** 仅使用一手来源，通过 curl 抓取官方文档、许可证 PDF、定价页与 npm registry / 已发布包的 tarball。无法访问的来源已标注。
- **语言约定：** 许可证名称、包名、URL 与代码标识符保留英文原文。

---

## 1. TradingView Advanced Charts / Charting Library 的商业授权

### 1.1 是否存在付费 / 商业授权

**存在，但不公开发布。** 公开可见的只有免费授权。

- Advanced Charts "available for free provided that the TradingView attribution remains visible and the implementation environment is public (not for private use or behind a paywall)"。
  来源：<https://www.tradingview.com/charting-library-docs/latest/introduction.md>
- 免费授权文本即 **Free Advanced Charts Agreement**（版本号 v.0626.FAC，共 9 页）：
  <https://s3.amazonaws.com/tradingview/charting_library_license_agreement.pdf>
- Trading Platform（图表 + 交易能力）"is licensed to brokers … has its own licensing fees"。
  来源：<https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions.md>
- 是否隐藏 TradingView logo："depends on the terms of your license agreement. Contact your TradingView account manager for more information." —— 这句话暗示存在按协议协商（付费）的授权变体。
  来源：<https://www.tradingview.com/charting-library-docs/latest/customization.md>
- **没有任何公开价格**（公开页面找不到 per-seat / MAU / revenue share / flat fee 的任何数字）。获取途径：在 <https://www.tradingview.com/advanced-charts/> 页面上点击 "Contact us" 提交申请表；通过审批后会收到私有 GitHub 仓库邀请。
  来源：<https://www.tradingview.com/charting-library-docs/latest/quick-start.md>（"1. Get access"）
- 已核实：不存在公开的商业授权 PDF；猜测的 S3 "commercial" 链接均返回 403。

### 1.2 免费 Advanced Charts Agreement 的关键条款（§2.2 / §2.4 / §2.5 / §3.2 / §7.5）

以下均摘自上述 PDF 原文（Free Advanced Charts Agreement v.0626.FAC）：

- **§2.2 Hosting and Data Feed：** Implementation 必须托管在 Client 自己的服务器上，并接入 Client **自己的** Market Data feed（历史 + 实时）。即 TradingView 不提供行情数据，必须自带 datafeed、自托管。
- **§2.4 Implementations (Free Offering Only)：** "This license is intended for Implementations as a public access service (as a free offering only, whether account registration is required or not), and not for private, personal or internal uses (such as blogs, research papers, or other unpublished media)." → 这就是排除付费/私有/Electron 产品的条款。它限制的是"对公众开放 **且** 免费"，并非字面上的"禁止商业实体使用"。
- **§2.5 Restriction：** 不得把 Advanced Charts Library 托管、披露或放到任何公开代码仓库/公开平台；使用该库的项目或站点不得开源、不得以暴露库代码的方式公开可见；分发给第三方的集成方案 (i) 不得包含任何 TradingView 库文件，(ii) 必须让该第三方自行向 TradingView 取得单独授权。→ **你自己的代码可以在该条款下保持闭源/私有**，但库本身不可再分发，第三方需要各自授权。
- **§3.2 TV Branding：** 必须在 Implementation 中包含指向 TradingView 网站的品牌署名（Attribution），链接不得带 nofollow / ugc / sponsored；不得改动、删除、遮挡该署名。
- **§7.5 Liquidated Damages：** 若 Client 违约且在收到书面通知后 10 天内未补救，TradingView 除其他救济外可主张**每一处被证明的违约 50,000 USD** 的约定损害赔偿（"fifty thousand (50,000) USD for each and every proven breach"）。
- 适用法律为纽约州；争议通过 JAMS 在有约束力的仲裁中解决；放弃陪审团审判与集体诉讼。

补充说明：

- 协议**没有**区分 SaaS 与桌面 / Electron。由于 Electron 应用是分发的二进制、并非 "public access service"，它落在 §2.4 之外，因此需要协商授权。
- **对任务前提的更正：** 免费协议的边界是 "public + free offering only"，而不仅仅是"公开的免费服务且禁止一切商业用途"。一家商业公司运营的、对公众免费的公开服务，按字面仍落在免费授权范围内；私有 / 内部 / 付费墙 / 桌面分发则不在范围内。

### 1.3 商业授权现状小结

- 商业授权**仅以协商协议形式存在**，无公开价格或定价模型；需通过 Advanced Charts 落地页的 "Contact us" 表单联系 TradingView。
- 免费授权无法合法覆盖闭源 / 付费 / Electron 产品；这类产品需要单独谈判。
- **未能核实：** 商业授权的具体条款、是否提供 Electron 再分发授权、以及任何价格区间。

---

## 2. 替代库逐项对比

### 2.1 klinecharts（核心）与 KLineChart Pro

- **许可证：** 核心与 Pro 均为 **Apache-2.0**（已抓取 LICENSE 文件），免费，允许商业使用与闭源集成，无版税。
  来源：<https://github.com/klinecharts/KLineChart/blob/main/LICENSE>、<https://github.com/klinecharts/pro/blob/main/LICENSE>、<https://www.npmjs.com/package/klinecharts>、<https://www.npmjs.com/package/@klinecharts/pro>
- **画图工具：** 从已发布包 klinecharts@10.0.3 的 bundle 字符串表提取到的核心 overlay：segment、rayLine、straightLine、horizontalStraightLine、horizontalRayLine、horizontalSegment、verticalStraightLine / verticalRayLine / verticalSegment、parallelStraightLine、priceLine、priceChannelLine、fibonacciLine、simpleAnnotation、simpleTag，以及几何图形 line / rect / circle / arc / path / polygon / brush / text。**KLineChart Pro** 额外提供左侧画图工具条：abcd、xabcd、threeWaves / fiveWaves / eightWaves / anyWaves、arrow、triangle、parallelogram、rect、circle、fibonacciCircle / fibonacciExtension / fibonacciSegment / fibonacciSpiral / fibonacciSpeedResistanceFan、gannBox（名称自 @klinecharts/pro 的 dist 中提取）。合计约 15 个核心 + 约 18 个 Pro 工具，**远少于 TradingView 的 110+**。
- **指标：** 核心内置 MA、SMA、EMA、BOLL、SAR、KDJ、MACD、VOL、BIAS、BRAR、CCI、CR、DMA、DMI、EMV、MTM、PSY、ROC、TRIX、VR、WR，以及 OBV / PVT / AO 等（约 25 个）。
- **多窗格：** 支持（类型声明中含 pane API；klinecharts v9/v10 支持多 pane / 多 Y 轴）。
- **数据源：** 核心用 DataLoader；Pro 暴露 Datafeed 接口：searchSymbols / getHistoryKLineData(symbol, period, from, to) / subscribe / unsubscribe —— 可接入自有 OHLCV。来源：已发布包 @klinecharts/pro 的 dist/index.d.ts。
- **React / TS：** TypeScript 优先并附带 .d.ts；**没有官方 React 包装**（社区包 react-klinecharts 存在于 npm，v1.0.1）。Pro 基于 SolidJS（依赖 solid-js、lodash），以 DOM class 形式暴露，可在 React 中通过 ref/effect 使用。
- **分发形式：** 核心提供 ESM + CJS + **UMD**（dist/umd/klinecharts.min.js，unpkg 可用）；Pro 提供 ESM + **UMD**（dist/klinecharts-pro.umd.js）与 CSS。可自托管，适合放进 Electron / 浏览器插件（本地代码，无需远程 CDN）。
- **注意：** Pro 仍处于 0.1.x（v0.1.1），相对年轻；文档有中文渊源，但存在英文版（<https://klinecharts.com/en-US/guide/introduction>、<https://pro.klinecharts.com/en-US>）。

### 2.2 TradingVue.js

- **许可证：** **MIT**（badge + package.json + npm tarball 内的 LICENSE.md）：<https://www.npmjs.com/package/trading-vue-js>。仓库裸 LICENSE 路径在 tvjsx/trading-vue-js/master 返回 404，但已发布的 tarball 内含 MIT LICENSE.md。
- **状态：** README 中明确写着 **"[Not Maintained]"**，npm 最近一次发布为 1.0.2。
  来源：<https://github.com/tvjsx/trading-vue-js>
- **画图工具：** 采用 overlay / DSM 模型并带工具条；包内工具 overlay 包括 LineTool、Segment、RangeTool、Channel、Range（dist 中还有 "Lines""Extended""Ray""Crosshair""Measurements" 等字符串）。工具很大程度上需要用户自己写（自定义 .vue overlay），并非固定的 TradingView 式工具集。确切内置数量：未核实。
- **指标：** "Scripts (make your own indicators)" —— 需自建，不附带指标库；支持 onchart / offchart 窗格。
- **多窗格：** onchart / offchart + splitters。数据源：以响应式结构传入自有 OHLCV 数组。
- **框架：** 仅 Vue 2 组件；trading-vue-next（MIT）面向 Vue 3。**不建议用于商业产品。**

### 2.3 Highcharts Stock

- **许可证 / 价格**（官方商店已抓取）：<https://shop.highcharts.com/>、<https://shop.highcharts.com/license>
  - 公开列表价（按 seat / 年，订阅制）：Highcharts Core **$366/seat**，Stock **+$366/seat**（即 Stock 约 **$732/seat/年**），Maps +$128，Gantt +$73，Dashboards $264，Grid Pro $316。Perpetual 选项 = 订阅结束时对当时版本拥有永久使用权。
  - 授权类型（Standard License Agreement 19.1）：**Internal**（仅内部应用/私有站点）、**SaaS**（增加 1 个外部/付费/公开应用）、**SaaS+**（最多 5 个外部应用）、**OEM**（当产品被分发给你的客户或由客户托管；OEM 包含具名 Licensee Products、developer seats 与 **Customer Installations**）。按 developer seats 计数。OEM 为按需报价。
  - FAQ 文案来源：<https://shop.highcharts.com/>（Licensing FAQ）。协议条款 3.2.1（developers）、3.2.5（software key）、4.1 Internal、4.2 SaaS、4.3 OEM：<https://shop.highcharts.com/license>
- **画图工具：** 内置 **Stock Tools** 左侧工具条（标注 + 指标），外加 Advanced Annotations 模块。navigation.bindings API 列出约 40 个 binding，其中绘图/标注类约 25 个：arrowInfinityLine、arrowRay、arrowSegment、crooked3/5、elliott3/5、fibonacci、fibonacciTimeZones、flag pins、horizontalLine、infinityLine、measureX/XY/Y、parallelChannel、pitchfork、ray、segment、timeCycles、verticalArrow/Counter/Label/Line。Advanced annotations 另有 rectangle / ellipse / circle / path / arrow / label 等。
  来源：<https://www.highcharts.com/docs/stock/stock-tools>、<https://api.highcharts.com/highstock/navigation.bindings>
- **指标：** 40+ 内置 series（SMA、EMA、WMA、DEMA、TEMA、MACD、RSI、Bollinger、Stochastic、ATR、CCI、DMI、Ichimoku、Keltner、VWAP、Supertrend、PSAR、ZigZag 等）。
  来源：<https://www.highcharts.com/docs/stock/technical-indicator-series>
- **多窗格：** 支持多 pane / 多 Y 轴，并带 navigator / range selector（底部控件）与 Stock Tools 工具条（左侧）。
- **React / TS：** 官方 React 包装 + TypeScript 类型；允许在授权下自托管（需 license key）；提供 ESM / UMD（highcharts.js 为 UMD）。
- **商业使用：** 付费授权下允许；非商业/教育用途免费。
- **Electron / 桌面成本陷阱：** 分发的桌面应用不是 "public website"；按 FAQ，当产品 "distributed to or hosted by your customers" 时需要 **OEM**（按需报价），很可能不是普通 SaaS seat。**未能核实：** 官方未就 Electron 逐字说明。

### 2.4 AG Charts（Community / Enterprise）

- **许可证 / 价格：** Community = **MIT**（npm 包 ag-charts-community 的 license 字段为 MIT）；Enterprise = **Commercial**（npm 包 ag-charts-enterprise 的 license 字段为 "Commercial"）。官方定价页只列出 **AG Grid Enterprise $999/dev** 与 **Enterprise Bundle（AG Grid Enterprise + AG Charts Enterprise）from $1,498 USD per developer**；**没有单独公布 AG Charts Enterprise 的列表价**（存疑）。
  来源：<https://www.ag-grid.com/license-pricing/>、<https://www.ag-grid.com/charts/javascript/community-vs-enterprise/>
- 未授权的 Enterprise 构建会显示**水印 + 控制台报错**；需要试用 licence 才能移除。
- **画图工具**（Enterprise Financial Charts 工具条，v14.2）：工具条分组为 **Lines、Line/Channel Labels、Extending Lines/Channels、Annotations、Arrows、Fibonacci Tools、Measuring Tools**，另有图表类型选择、undo/redo、通过 Chart State API 的 save/restore。标注类型包括 line / trend line、parallel-channel、disjoint-channel、comment 等。
  来源：<https://www.ag-grid.com/charts/javascript/financial-charts-toolbar/>
- **指标：** **没有内置技术指标**（文档/功能矩阵中均未列出）—— 需自行计算并以 series 传入。
  来源：<https://www.ag-grid.com/charts/javascript/community-vs-enterprise/>
- **多窗格：** financial chart 默认渲染 price + **volume** 窗格（已在 financial chart options 文档中核实）；更一般的多窗格依赖 synchronized charts / 次坐标轴，而不是任意指标窗格。
  来源：<https://www.ag-grid.com/charts/javascript/financial-charts-configuration/>
- **数据源：** 直接传入 {date, open, high, low, close, volume} 数组（内存），streaming 用 transactions API。
- **React / TS：** 一流 TypeScript 支持与官方 @ag-charts/react 包装。分发形式：ESM + CJS（package exports 中无 UMD）；可在授权下自托管。
- **商业使用：** Community 可（MIT）；Enterprise 需付费授权。

### 2.5 SciChart（SciChart.js）+ SciChart Financial Tools

- **许可证：** <https://www.scichart.com/scichart-eula/>；定价指南 <https://www.scichart.com/scichart-pricing-licensing-guide/>；商店 <https://www.scichart.com/shop/>
  - 按 developer、**perpetual（永久）**，含 1 / 2 / 3 年 support + updates；标准条款下无版税。
  - **Standard** 覆盖内部工具、SaaS 平台、商业产品、最多 15,000 名终端用户，以及 **domain-locked** 的 JS 部署（key 绑定到某个域名，例如 app.yourcompany.com）。
  - **Advanced**（仅限 Bundle SKU，附带按终端用户规模计费的 runtime subscription）适用于：非 domain-locked / permissive 的 JS 运行时、无法控制最终宿主部署、production localhost、OEM 环境、超过 15,000 名终端用户。
  - JS **Community 仅限非商业用途，免费**。
  - 商店列表价（USD，按 developer）：SciChart.js 2D **$1,349.66/年**（$112.47/月）、JS 2D&3D **$1,765.26/年**、Bundle 2D Pro **$2,336.71/年**、Bundle 2D/3D Pro **$3,479.61/年**、Bundle 2D/3D Source **$4,622.51/年**。**存疑：** 这些年度数字与"perpetual + support"模型之间的对应关系在页面上没有明说。
- **画图工具：** SciChart **Financial Tools** 扩展提供较丰富的标注/工具集 —— 从页面源码提取到的类名包括 TrendLine / HorizontalTrendLine / VerticalTrendLine、ExtendedLine、AngleLine、Channel、DisjointChannel、FlatBottomChannel、Pitchfork、Schiff / Modified Schiff / Inside Pitchfork、Pitchfan、FibonacciRetracement / Extension / Circles / TimeZone / SpeedResistanceArcs / Wedge、Gann、CyclicArc / Line、FreehandDrawing、PolyLine、Measure、Sector、StopLossTakeProfit、MultiPoint、CrossLine（约 28 个）。另有基础 Annotations API（line / box / text / custom）。
  来源：<https://www.scichart.com/documentation/js/v5/scichart-extensions/scichart-financial-tools/overview/>、<https://www.scichart.com/documentation/js/v4/2d-charts/annotations-api/annotations-api-overview/>
- **指标：** 未以 Stock 式指标库形式内置；需自行构建 series/indicator（financial tools 提供的是画图层）。
- **React / TS：** 官方 React 包装 + 强 TypeScript。ESM / UMD bundle；可自托管。
- **Electron 成本陷阱：** Standard key 是 domain-locked 的；Electron / localhost / 客户托管运行需要 **Advanced（Bundle + runtime subscription）**。这是本用例中最重要的注意点。

### 2.6 DevExtreme（DevExpress）

- **许可证 / 价格：** 12 个月 per-developer 订阅；一旦授权，商业应用可免版税分发；续费约为原价 50%，且到期 30 天后上涨；运行时会验证 **license key**，无效/过期会在**浏览器控制台打印授权提示**。按 developer，不按服务器，无版税。
  来源：<https://js.devexpress.com/Licensing/>
- **画图工具：** **没有 TradingView 式画图工具条**；只有编程式 annotations（自由形式的标注对象），不是面向用户的画图工具集。
  来源：<https://js.devexpress.com/DevExtreme/ApiReference/UI_Components/dxChart/Configuration/annotations/>
- **指标：** JS 产品中**没有内置技术指标** —— 对已发布的 devextreme@26.1.5 的 bundles/dx.all.d.ts 做 grep，未找到 SMA/EMA/MACD/RSI/Bollinger 等指标类型；这些只存在于 DevExpress WPF，而非 DevExtreme JS。（存疑：文档页为 JS 渲染；结论基于已发布类型声明 + 仅 WPF 的指标文档。）
- **多窗格：** 支持多 pane / 多 Y 轴。数据源：绑定自有 OHLCV series。
- **React / TS：** 官方包装 + TS。分发为传统 JS / ESM；购买后允许商业使用。
- **结论：** 不匹配（无画图工具条、无指标）。

### 2.7 FusionCharts

- **许可证 / 价格**（<https://www.fusioncharts.com/buy>）：
  - Pro **$1,899/年** 或 **$4,799 perpetual**，最多 5 名 developer，单一产品，仅限 Internal Apps（不可 on-prem 分发、不可 SaaS、不可 OEM、无源码）。
  - Enterprise **$3,399/年** 或 **$8,399 perpetual**，最多 10 名 developer，单一产品，增加 On-Prem + SaaS + OEM（"as a part of your software"），无源码。
  - Enterprise+ = 报价（组织级、含完整源码）。
  - 授权绑定产品名；向组织外分发需要 Enterprise / OEM。
- **画图工具：** **没有画图工具条**。Candlestick 支持趋势线/区间与 "custom trend sets … technical indicators"，但数据需你自己提供；annotations 为编程式图形/文本。
  来源：<https://docs.fusioncharts.com/archive/3.13.3/chart-guide/standard-charts/candlestick-chart>
- **指标：** 无内置（需自行提供算好的趋势/指标数据）。
- **React / TS：** 有集成；但没有一等公民式的画图工具条。**结论：** 不匹配。

### 2.8 TradingView Widgets（嵌入）

- 免费、复制粘贴式 iframe / web components；文档：<https://www.tradingview.com/widget-docs/>。
- 但 widget 由 TradingView 托管、展示 **TradingView 的数据**；"you cannot connect your data to the widgets."
  来源：<https://www.tradingview.com/charting-library-docs/latest/product-comparison.md> 与该库 FAQ。
- **直接排除**（本用例要求自有 Binance / Hyperliquid 数据）。

---

## 3. 对比表

| 库 | 许可证 / 价格 | 画图工具条 | 指标 | 多窗格 | 自有 OHLCV | React/TS | 分发形式 | 可否商业 | 自托管 |
|---|---|---|---|---|---|---|---|---|---|
| TradingView Advanced Charts | Proprietary。仅对 public free offering 免费；商业授权需议价，无公开价格 | 110+（官方文档列表） | 100+ | 有 | Datafeed API / UDF | TS 类型，任意框架 | ESM/CJS/UMD/IIFE | 需协商授权 | 必须自托管 |
| klinecharts + KLineChart Pro | Apache-2.0，免费 | 核心约 15 + Pro 约 18 | 约 25 | 有 | DataLoader / Datafeed 接口 | TS；社区 React 包装；Pro 为 SolidJS | ESM + UMD | 可以 | 可以 |
| TradingVue.js | MIT，免费 | overlay/DSM 工具条（约 8 个示例工具，需自定义） | 仅自定义 | onchart/offchart | 有（响应式数组） | 仅 Vue 2；无 TS 类型 | UMD | 可以 | 可以 |
| Highcharts Stock | 付费；Core $366 + Stock $366 ≈ $732/seat/年；Internal/SaaS/SaaS+/OEM | 约 25 个 stock-tool binding + advanced annotations | 40+ | 有 | 有 | 官方 React + TS | ESM/UMD | 可以（付费） | 可以（key） |
| AG Charts Enterprise | Commercial；公开仅见 Enterprise Bundle from $1,498/dev（Community 为 MIT） | Financial toolbar（lines/channels/fib/arrows/measure/annotations） | 无内置 | price + volume 窗格 | 直接传数据数组 | 官方 @ag-charts/react + TS | ESM/CJS | 可以（付费） | 可以（key） |
| SciChart.js + Financial Tools | per-dev perpetual + support；JS 2D from $1,349.66/年；非 domain-locked 需 Advanced/Bundle | 约 28 个 financial annotation | 未内置 | 有 | 有 | 官方 React + TS | ESM/UMD | 可以（付费；Community 仅非商业） | 可以（key） |
| DevExtreme | per-dev 12 个月订阅，分发免版税，需 key | 无（仅编程式 annotations） | JS 无内置 | 有 | 有 | 官方 React + TS | ESM/UMD | 可以（付费） | 可以（key） |
| FusionCharts | Pro $1,899/年（仅 internal）；Enterprise $3,399/年（含 SaaS/on-prem/OEM） | 无 | 无 | 有限 | 需自算数据 | 有集成 | UMD/ESM | 可以（付费） | 可以 |
| TradingView Widgets | 免费嵌入 | （自带工具） | 100+ | 有 | **无 —— 仅 TradingView 数据** | iframe / web component | iframe | 可以（但无法用自有数据） | 否 |

---

## 4. 针对本用例的排序短名单

用例：**商业产品、自有 Binance/Hyperliquid 数据、需要画图工具、TypeScript、Node + 浏览器/Electron、闭源。**

1. **TradingView Advanced Charts** —— 功能最匹配（110+ 画图、100+ 指标、多窗格、JS 自定义指标、自有 Datafeed/UDF、TS 类型、ESM/UMD、时间轴与底部控件）。仅在以下两种情况可行：(a) 产品是免费的公开 Web 服务 → 免费授权；(b) 为闭源/付费/桌面产品协商付费授权。**授权是本方案的决策性风险。**
2. **KLineChart Pro + klinecharts** —— 自托管、闭源、商业产品中成本/风险最佳：Apache-2.0（无费用、无 key、无版税）、自有 Datafeed、画图工具条、约 25 指标、多窗格、TS、UMD+ESM（适配 Electron / 浏览器插件）。需接受工具较少、Pro 尚年轻（0.1.x），并预留自建缺失指标/工具的工作量。
3. **Highcharts Stock** —— 最成熟、授权最清晰的商业选项，具备真正的画图工具条 + 40 指标 + 官方 React/TS；但按 seat 计费，且分发的 Electron 应用很可能触发 **OEM**。
4. **AG Charts Enterprise** —— 现代、官方 React、financial 工具条良好；但无内置指标（需自建）、仅有 bundle 报价（约 $1,498/dev），桌面分发条款待确认。
5. **SciChart.js + Financial Tools** —— 画图集与性能强，但 Standard key 为 domain-locked，Electron / localhost / 客户托管部署需要更贵的 Advanced/Bundle + runtime subscription。仅在能接受时选用。
6. **DevExtreme** / 7. **FusionCharts** —— 不可行：无用户画图工具条、无内置指标，且有额外按 seat/按产品的授权。
8. **TradingVue.js** —— MIT 但明确停止维护、仅 Vue 2、工具需自定义。不推荐。
9. **TradingView Widgets** —— 直接排除：无法使用自有数据。

---

## 5. 最大的授权 / 成本陷阱

1. **TradingView 免费授权**是 "public + free offering only"：不得开源或公开暴露库代码；不得再分发；强制署名；**每处被证明的违约 50,000 USD 约定损害赔偿**；付费墙 / 私有 / Electron 产品不在授权范围内，需另行协商（且无公开价格）。
2. **Highcharts 的 Electron 桌面**：按 FAQ，"distributed to or hosted by your customers" 触发 **OEM**（按需报价，含具名产品 + developer seats + Customer Installations），而不只是一个 SaaS seat。不要默认按 $732/seat 估算，先与 sales 确认。
3. **SciChart 的 domain-locked key**：Electron / localhost / 客户控制的宿主需要 **Advanced（Bundle）授权 + 按终端用户规模计费的 runtime subscription**，可能远高于约 $1,350/dev 的列表价。
4. **授权 key 机制**（AG Charts Enterprise / DevExtreme / SciChart）：key 无效或过期会出现水印或控制台报错；构建/服务端环境也可能触发校验问题。
5. **FusionCharts Pro 禁止 on-prem 分发、SaaS 与 OEM** —— 光是要发布一个可下载产品就得买 Enterprise（$3,399/年）。
6. **DevExtreme 与 FusionCharts** 没有 TradingView 式画图工具条，且（JS 端）没有内置指标 —— 隐藏成本是自己把两者都做出来。
7. **开源不等于零风险**：klinecharts/Pro（Apache-2.0）与 TradingVue（MIT）没有厂商担保/支持，且仍需避免 "TradingView 式" 的商业外观（trade dress）与名称。

---

## 6. 未能核实项（已标注）

- **TradingView 商业授权的价格/模型**：公开渠道完全查不到，只有落地页的联系表单；也未能确认其是否提供 Electron 再分发授权。
- TradingView 免费授权的 "free offering only" 对"免费但闭源"的服务是否会被执法：按条款字面（public + free、禁止暴露库代码），闭源本身是允许的。
- **Highcharts** SaaS/OEM 的具体加价幅度，以及 Electron 应用究竟归为 OEM 还是 SaaS+（依据 FAQ + EULA 定义推断）。
- **AG Charts Enterprise 的单独列表价**：公开的只有 $1,498 的 Enterprise Bundle。
- **SciChart** 商店年度价格与 per-developer / perpetual 模型的精确对应关系，以及 Advanced runtime 的具体定价（定价指南未给数字）。
- **KLineChart Pro** 的确切内置画图工具数量（由已发布 bundle 名称推断）与 **TradingVue** 的工具数量（工具由用户定义）。
- **DevExtreme 指标**：结论"无内置"来自已发布的 dx.all.d.ts 类型与仅 WPF 的指标文档；因文档页为 JS 渲染，未能直接读取页面正文。
- **Internet Archive** 在调研期间离线，未能核对 TradingView 历史授权条款。
