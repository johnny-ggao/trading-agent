# TypeScript / JavaScript 技术指标库

针对一个**基于 Node（TypeScript）的 agent** 的调研：该 agent 在 crypto OHLCV
（Binance / Hyperliquid）上计算指标，并把结果传给一个**浏览器图表**，且参数可由用户覆盖。

- **调研日期：** 2026-09-21
- **方法：** 仅从一手来源做事实核查 —— npm registry JSON、GitHub REST API、
  已发布包的 tarball，以及由 jsDelivr CDN 提供的类型声明，外加对所选库的一次实证打包/运行时测试。
- **范围：** `trading-signals`、`technicalindicators`，以及其他仍在积极维护的
  TS/JS 替代方案；外加"自己写"这一选项。

---

## (a) 对比 (Comparison)

### 元数据 (Metadata)

| npm 包 | 最新版本 | 最近发布 | 许可证 | Stars | 维护状态 | TS 原生类型 |
|---|---|---|---|---|---|---|
| **trading-signals** (bennycode) | 8.3.0 | 2026-08-11 | MIT | 992 | **活跃**（最近提交 2026-09-20；2 个未关闭 issue） | 是（TS 源码 + `.d.ts`） |
| **technicalindicators** (anandanand84) | 3.1.0 | 2020-03-16 | MIT | 2,454 | **停滞**（默认分支最近提交 2020-03-16） | 是（`declarations/`） |
| **@ixjb94/indicators** | 1.2.6 | 2026-06-26 | MIT | 96 | 活跃（最近提交 2026-06-26；0 个未关闭 issue） | 是（`dist/index.d.ts`） |
| **@debut/indicators** | 2.0.1 | 2026-05-16 | **GPL-3.0** | 446 | 仍在维护（最近提交 2026-05-16） | 是（`lib/index.d.ts`） |
| **fast-technical-indicators** | 1.1.6 | 2026-08-24 | MIT | 9 | 新 / 未经检验（创建于 2025-09） | 是（`lib/index.d.ts`） |
| **indicatorts** (cinar) | 2.2.2 | 2025-02-26 | MIT | 475 | **npm 已弃用**（"Package no longer supported"） | 是 |
| **wickra**（Rust 内核） | 1.0.5 | 2026-09-18 | Apache-2.0 | 56 | 非常活跃但非常新（仓库创建于 2026-05） | 是（`index.d.ts`） |
| **centaur-technical-indicators** | 1.3.1 | 2026-06-21 | MIT | 2 | 极小 / 很新（WASM 封装） | 是 |
| **@d3fc/d3fc-technical-indicator** | 8.1.1 | 2024-06-13 | MIT | 1,350 (d3fc monorepo) | 放缓（仓库最近 push 2024-09） | 是 |
| **tulind**（Tulip Charts 原生） | 0.8.20 | 2021-08-08 | LGPL-3.0 | 515 | 无人维护；原生 N-API addon | 未附带 `.d.ts` |

上个月的 npm 下载量（一手来源：npm downloads API）：
`technicalindicators` **164,760**；`trading-signals` **62,651**；`indicatorts` 38,710；
`fast-technical-indicators` 4,773；`@ixjb94/indicators` 3,594；`tulind` 3,050；
`@debut/indicators` 2,632。

> `technicalindicators` 的高下载量反映的是历史惯性，而非维护状况 ——
> 该包自 2020 年以来没有任何发布。

### 能力矩阵（所要求的指标）(Capability matrix)

| 库 | MA/EMA | MACD | RSI | Bollinger | ATR | Stochastic | ADX | OBV | **KDJ（J 线）** | 流式更新 | 交叉辅助 | 模块 / 浏览器 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **trading-signals** | ✅ SMA/EMA/WMA/DEMA/TEMA/RMA | ✅ | ✅ | ✅ | ✅ | ✅ K,D | ✅ | ✅ | **✅ `stochJ`** | `add` / `update(input, replace)` / `replace` / `updates` | `hasCrossedOver` / `hasCrossedUnder` | 仅 ESM、零依赖；对打包器友好；classic script 需要打包器 |
| **technicalindicators** | ✅ | ✅ | ✅ | ✅ | ✅ | 仅 K,D | ✅ | ✅ | ❌（自定义 `3K − 2D`） | `nextValue()`（由 generator 驱动） | `crossUp` / `crossDown` | CJS main + ESM module + 预构建 `dist/browser.js` / `browser.es6.js` |
| **@ixjb94/indicators** | ✅ | ✅ | ✅ | ✅ | ✅ | `[K,D]` | ✅ | ✅ | ❌ | Promise API + `IndicatorsSync`（面向批量） | `crossover` / `crossany` / `crossOverNumber` | CJS main + UMD `dist/browser.js`（全局 `indicators`）；`module` 字段指向 TS 源码 |
| **@debut/indicators** | ✅ | ✅ | ✅ | ✅ | ✅ | 仅 K,D | ✅ | ✅ | ❌ | `nextValue()` 提交，`momentValue()` 预览未收盘 K 线，`restoreState()` | ❌（仅 `Extremums`/`Level`/`TrendLines`） | CJS + ESM + UMD（`lib/indicators.umd.js`） |
| **fast-technical-indicators** | ✅ | ✅ | ✅ | ✅ | ✅ | 仅 K,D | ✅ | ✅ | ❌ | `nextValue()`（可直接替换 `technicalindicators` API） | `crossUp` / `crossDown` | 通过 `exports` map 同时提供 ESM+CJS；未附带 UMD |
| **indicatorts** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 仅作为 `kdjStrategy` 提供，而非原始指标 | 批处理函数 | 辅助函数 | CJS + ESM；已弃用 |
| **wickra** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 很可能是（514 个指标）—— 未验证 | ✅ 以流式优先，O(1)/tick | ✅（crossover 系列） | Rust 内核：原生 Node（`engines >=22`）+ 独立的 `wickra-wasm` |
| **tulind** | ✅ (100+) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 很可能 | Tulip 流式 API | 非标准 | 原生 addon —— **仅 Node**，无法打包给浏览器 |

---

## 声誉 / 正确性问题 (Reputation / correctness issues)（证据）

- **technicalindicators** —— 评论数最多的未关闭准确性 bug 主导了其 issue 追踪：
  [#220 "Calculated EMA seems not accurately"](https://github.com/anandanand84/technicalindicators/issues/220)（11 条评论），
  [#216 "incorrect calculator RSI"](https://github.com/anandanand84/technicalindicators/issues/216)（10），
  [#249 "Looks like most of indicator calculation is wrong"](https://github.com/anandanand84/technicalindicators/issues/249)（8），
  [#248 "diffrence with tradingview and this RSI calculation"](https://github.com/anandanand84/technicalindicators/issues/248)，
  [#236 "Incorrect Stochastic output"](https://github.com/anandanand84/technicalindicators/issues/236)，
  [#213 "Bollinger Bands - use EMA?"](https://github.com/anandanand84/technicalindicators/issues/213)，
  [#264 "This library is a memory leak"](https://github.com/anandanand84/technicalindicators/issues/264)，
  [#266 "Is this library still supported?"](https://github.com/anandanand84/technicalindicators/issues/266)。
  3.1.0 版（2020-03-16）是最后一次发布；默认分支的最后一次提交是 2020-03-16
  （存在一个 2022 年的 `pushed_at`，但没有发布）。它还把 `@types/node` 作为**运行时**
  依赖。结论：因惯性而流行，不值得在新工作中信任。
- **trading-signals** —— 活跃；README 声明其结果会对照参考数据
  （Tulip Indicators）检查，并声称 100% 测试覆盖率。MIT `LICENSE` 已在 tarball 中确认。
  最近只有 2 个未关闭 issue，且都是功能请求。
- **@ixjb94/indicators** —— README 声明其输出已针对 Binance Futures
  的 TradingView 数据（DOGEUSDT 4h）做过测试。注意事项：基于 Promise 的 API、没有原生 KDJ，且
  `package.json` 的 `"module": "src/index.ts"` 指向 TypeScript 源码（可能让
  打包器困惑 —— 请使用 `main` 或 UMD bundle）。
- **@debut/indicators** —— 流式设计出色且有交叉验证，但为 **GPL-3.0**
  （已在 tarball README 和 npm 元数据中确认）。对专有 agent 来说是个严重问题。
- **fast-technical-indicators** —— 零依赖、API 兼容的 `technicalindicators`
  重实现，同时提供 ESM/CJS，但只有 9 个 star 且创建于 2025-09 → 未经检验。
- **indicatorts** —— npm 已弃用（"Package no longer supported"）；尽管有 475 个 star，也应避免。
- **wickra / centaur** —— Rust/WASM，性能可期，但非常新（2026），并会引入
  Rust/WASM 构建 + 运行时依赖。
- **d3fc-technical-indicator** —— 约 7 个指标，面向图表组件，仓库自 2024 年起停滞。
- **tali**（2018）和 **stock-technical-indicators**（2019）—— 已死。

---

## (b) 面向 Node 宿主的推荐技术栈 (Recommended stack for the Node host)

**首选：`trading-signals`**（v8.3.0）—— MIT、零运行时依赖、纯 TypeScript/ESM。

它是唯一一个原生覆盖全部所需指标集（**包括 KDJ**）的候选，
并具备一流的增量 API 和交叉辅助函数：

| 指标 | 实例（所有参数都是构造函数参数 → 可由用户覆盖） |
|---|---|
| MA / SMA | `new SMA(period)` |
| EMA | `new EMA(interval)` |
| MACD | `new MACD(new EMA(short), new EMA(long), new EMA(signal))` → `{macd, signal, histogram}`（也接受 DEMA/RMA） |
| RSI | `new RSI(period, SmoothingIndicator?, {overbought, oversold})` |
| Bollinger | `new BollingerBands(interval, deviationMultiplier = 2)` → `{lower, middle, upper}` |
| **KDJ** | `new StochasticOscillator({kPeriod, dPeriod, kSlowingPeriod})` → `{stochK, stochD, stochJ}`（经典 9/3/3） |
| ATR | `new ATR(interval, SmoothingIndicator?)` |
| ADX | `new ADX(interval, SmoothingIndicator?)`（暴露 `.pdi` / `.mdi`） |
| OBV | `new OBV(interval)` —— **interval 为必填** |
| Volume | OBV，外加 VWMA、VWAP、VROC、PVT、MFI、Force Index、KVO、NVI/PVI、RVOL（volume 模块） |

- **实时 K 线：** 每个 `(symbol, timeframe, indicator-config)` 保留一个实例；在每根
  已收盘 K 线上调用 `add(closedBar)`，并读取 `getResult()` / `getSignal()`
  （`{state: BULLISH | BEARISH | SIDEWAYS, changed}`）。
- **历史预热：** 通过 `updates(inputs)`（或静态批处理辅助函数）喂入数组。
  指标在稳定前返回 `null`。
- **已实证的坑：** `new OBV()` 不传 interval 会在第一根 K 线上抛出
  `Cannot read properties of undefined (reading 'close')` —— 请始终传入
  interval（教材式 OBV 用 `2`）。ADX/ATR/Stochastic 同样需要其预热窗口，
  之后才会返回非 null 值。

**次选 / 回退方案：** 如果你特别想要一个预构建的 UMD 浏览器全局对象，或一个异步批处理
API（把 KDJ 的 J 推导为 `3K − 2D`），那就用 `@ixjb94/indicators`。如果必须保留
`technicalindicators` API，`fast-technical-indicators` 是一个合理的零依赖平替。
对于专有 agent，**不要采用** `technicalindicators`（停滞 + 准确性 bug）、
`@debut/indicators`（GPL-3.0）或 `indicatorts`（npm 已弃用）。

**自写函数：** 仅当你需要完全控制种子/约定（例如与 TradingView 精确对齐）
并愿意自己承担正确性时，才是合理的。既然 `trading-signals` 已经是零依赖的 MIT
纯 TS，自定义代码除了补上它缺失的指标外收效甚微。如果你确实要写，请对齐
Wilder/TA-Lib 的预热方式（EMA 用前 n 个值的 SMA 作种子；ATR/ADX/RSI 用
RMA/Wilder 平滑），并针对 TradingView/Tulip 参考序列做单元测试。

---

## (c) 所选库能否打包为浏览器 classic-script bundle？ (Can the chosen library be bundled into a browser classic-script bundle?)

**能 —— 经实证验证，而不只是声称。**

`trading-signals` **只发布 ESM**（`package.json`：`"type":"module"`、
`"exports":"./dist/index.js"`，没有 UMD/IIFE，也没有 `browser` 字段），但它的 `dist` 是纯 JS，
**零 Node 内置模块、零依赖**。一个导入 SMA、EMA、MACD、RSI、
BollingerBands、ATR、StochasticOscillator、ADX、OBV 和 `hasCrossedOver` 的小入口用以下命令打包：

```bash
esbuild entry.mjs --bundle --format=iife --global-name=TradingAgent --outfile=bundle.js
```

结果：

- 输出 **24.5 KB**；对 `fs/path/os/http/crypto/stream` 导入的 grep → **0**。
- 把它作为 classic script 求值（`vm.runInThisContext`）后暴露出一个全局对象，该对象正确地跑通了
  整套栈：SMA、RSI、MACD `{macd, signal, histogram}`、
  Bollinger `{lower, middle, upper}`、ATR、ADX、Stochastic
  `{stochK, stochD, stochJ}`、OBV。

因此所选库**并非仅限 Node**：为图表客户端增加一个 esbuild/rollup/vite 步骤来产出 IIFE/UMD
产物即可。它也能作为原生 ES 模块工作（`<script type="module">` 或
CDN 的 `+esm` 端点）。

对比：`technicalindicators`、`@ixjb94/indicators` 和 `@debut/indicators` 附带预构建的
classic-script/UMD bundle；`fast-technical-indicators` 同时提供 ESM/CJS 但没有 UMD（需自行打包）；
`tulind` 是原生 N-API addon，仅限 Node。

---

## 结论 (Bottom line)

采用 **`trading-signals`（v8.3.0）** 作为 Node 宿主唯一的指标引擎（MA/EMA、MACD、RSI、
Bollinger、经 `stochJ` 的 KDJ、ATR、OBV/volume），每个指标使用带参数的实例；通过把同一份
源码打包为 IIFE 复用于浏览器（已验证可用）。

---

## 一手来源 (Primary sources)

**npm registry 元数据 / 下载量**
- <https://registry.npmjs.org/trading-signals>
- <https://registry.npmjs.org/technicalindicators>
- <https://registry.npmjs.org/@ixjb94%2Findicators>
- <https://registry.npmjs.org/@debut%2Findicators>
- <https://registry.npmjs.org/fast-technical-indicators>
- <https://registry.npmjs.org/indicatorts>
- <https://registry.npmjs.org/wickra>
- <https://registry.npmjs.org/tulind>
- <https://api.npmjs.org/downloads/point/last-month/trading-signals>

**npm 包页面**
- <https://www.npmjs.com/package/trading-signals>
- <https://www.npmjs.com/package/technicalindicators>
- <https://www.npmjs.com/package/@ixjb94/indicators>

**GitHub 仓库**
- <https://github.com/bennycode/trading-signals>
- <https://github.com/anandanand84/technicalindicators>
- <https://github.com/ixjb94/indicators>
- <https://github.com/debut-js/Indicators>
- <https://github.com/santoshkshirsagar/fast-technical-indicators>
- <https://github.com/cinar/indicatorts>
- <https://github.com/wickra-lib/wickra>
- <https://github.com/chironmind/CentaurTechnicalIndicators-JS>
- <https://github.com/TulipCharts/tulipnode>

**trading-signals API / 类型证据（已发布包）**
- <https://cdn.jsdelivr.net/npm/trading-signals@8.3.0/dist/base/Indicator.d.ts>
- <https://cdn.jsdelivr.net/npm/trading-signals@8.3.0/dist/momentum/STOCH/StochasticOscillator.d.ts>
- <https://cdn.jsdelivr.net/npm/trading-signals@8.3.0/dist/momentum/OBV/OBV.js>
- <https://cdn.jsdelivr.net/npm/trading-signals@8.3.0/dist/util/trading/hasCrossedOver.d.ts>
- <https://cdn.jsdelivr.net/npm/trading-signals@8.3.0/README.md>

**technicalindicators 证据**
- <https://cdn.jsdelivr.net/npm/technicalindicators@3.1.0/README.md>
- <https://cdn.jsdelivr.net/npm/technicalindicators@3.1.0/declarations/momentum/Stochastic.d.ts>
- <https://github.com/anandanand84/technicalindicators/issues/216>, /220, /249, /248, /236, /264, /266
