import type { IncomingMessage, ServerResponse } from "node:http";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { CONFIDENCE_TOOL_NAME, DERIVATIVES_TOOL_NAME, INDICATOR_TOOL_NAME, LEVELS_TOOL_NAME, TOOL_NAME } from "./shared/tool";
import { BinanceProvider } from "./market/binance";
import { buildConfidenceEvidence, type ConfidenceDirection } from "./analysis/confidence";
import {
  DEFAULT_EVIDENCE_TTL_MS,
  DEFAULT_HIGH_THRESHOLD,
  DEFAULT_MEDIUM_THRESHOLD,
  normalizeAnalysisConfig,
  type AnalysisConfig,
  type AnalysisConfigInput,
} from "./analysis/pluginConfig";
import {
  ConfidenceUnavailableError,
  DEFAULT_TYPESAFE_BASE_URL,
  DEFAULT_TYPESAFE_MODEL,
  DEFAULT_TYPESAFE_TIMEOUT_MS,
  TypeSafeConfidenceScorer,
} from "./analysis/typesafe";
import { describeIndicators, InvalidChartArgsError } from "./market/intent";
import { DEFAULT_BAR_POLICY, describeBarsSpan } from "./market/chart";
import { buildAnchor } from "./market/anchor";
import { requestDerivatives, requestIndicatorFacts, requestLevelFacts, requestResonance } from "./market/facts";
import { HyperliquidProvider } from "./market/hyperliquid";
import { parseIndicatorSelectors } from "./market/indicatorSpec";
import { failurePayload } from "./tools/contract";
import { INDICATOR_OUTPUT_SCHEMA, indicatorBlocks, indicatorPayload } from "./tools/indicator";
import { CHART_OUTPUT_SCHEMA, chartBlocks, chartPresentationMeta } from "./tools/chart";
import { LEVELS_OUTPUT_SCHEMA, levelsBlocks } from "./tools/levels";
import { DERIVATIVES_OUTPUT_SCHEMA, derivativesBlocks } from "./tools/derivatives";
import { CONFIDENCE_OUTPUT_SCHEMA, confidenceBlocks } from "./tools/confidence";
import type { IndicatorSelector } from "./market/indicatorFacts";
import { buildMarketView, chartRequestFromQuery, loadChart, type MarketView } from "./market/request";
import { resolveSymbol } from "./market/symbol";
import { resolveInterval } from "./market/timeframe";
import { registerTradingChartSkill, type TradingChartSkill } from "./skill/tradingChart";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Cordis 插件名。 */
export const name = "trading-agent";

/** 所需服务：工具注册表与 skill 注册表。 */
export const inject = ["tools", "skills"];

// ── 配置：TypeSafe API key 与阈值（在侧栏「插件」页本行的「配置」里改）──

export interface Config {
  /** TypeSafe API key；secret 字段，经 credentials 域存储。 */
  apiKey: string;
  /** 也可让宿主按这个环境变量名解析 key。 */
  apiKeyEnv: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
  /** Jev 置信度 >= 此值为「高」。 */
  highThreshold: number;
  /** Jev 置信度 >= 此值为「中」。 */
  mediumThreshold: number;
  /** trading_chart 的证据缓存有效期；超时后需重新出图。 */
  evidenceTtlMs: number;
}

export const Config = Schema.object({
  apiKey: Schema.string().role("secret"),
  apiKeyEnv: Schema.string().role("credential-ref").default("TYPESAFE_API_KEY"),
  baseURL: Schema.string().default(DEFAULT_TYPESAFE_BASE_URL),
  model: Schema.string().default(DEFAULT_TYPESAFE_MODEL),
  timeoutMs: Schema.number().step(1).min(1000).default(DEFAULT_TYPESAFE_TIMEOUT_MS),
  highThreshold: Schema.number().min(0).max(1).default(DEFAULT_HIGH_THRESHOLD),
  mediumThreshold: Schema.number().min(0).max(1).default(DEFAULT_MEDIUM_THRESHOLD),
  evidenceTtlMs: Schema.number().step(1).min(0).default(DEFAULT_EVIDENCE_TTL_MS),
});

interface SettingsSectionHooksLike {
  setSource(source: () => Config): void;
  onChange(): void;
}

interface SettingsServiceLike {
  installSection(owner: unknown, ns: string, schema: unknown, entry: unknown, hooks: SettingsSectionHooksLike): void;
}

interface CredentialProviderLike {
  resolve(ref: string): Promise<{ value?: string } | undefined>;
}

interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

interface InjectedContext {
  webServer?: WebServerLike;
  settings?: SettingsServiceLike;
}

interface HostContext {
  tools: { register(tool: ReturnType<typeof defineTool>): unknown };
  skills: { register(skill: TradingChartSkill): unknown };
  /** Cordis 动态依赖：可选服务缺失时插件照常工作。 */
  inject(deps: string[], callback: (ctx: InjectedContext) => void): unknown;
  /** Cordis 服务查询（credentials 等）。 */
  get?(name: string): unknown;
}

const provider = new BinanceProvider();

/** Hyperliquid 补充源：只在按需取衍生品时才用（工单 08）。 */
const hyperliquidProvider = new HyperliquidProvider();

/** 图卡控件点按钮时请求的端点：直接返回一份新 chartSpec（不经过模型）。 */
const CHART_ROUTE = "/trading-agent/chart";

/**
 * 单次取数上限的说明（按周期折算跨度）。
 *
 * 这是 agent 必须知道的事实：它通过指标周期表达"要多长历史"，如果不知道上限在哪，
 * 只能撞墙后才收到一条"换短参数"的误导提示。上限本身按用户判断足够（1d 上 1000 根≈2.7 年）。
 */
const FETCH_CAP_NOTE = (() => {
  const spans = ["15m", "1h", "4h", "1d", "1w"]
    .map((interval) => `${interval} ${describeBarsSpan(DEFAULT_BAR_POLICY.maxBars, interval)}`)
    .join("、");
  return `单次请求能覆盖的历史长度：${spans}（各周期均以 ${DEFAULT_BAR_POLICY.maxBars} 根已收盘 K 线为限）。`
    + "**先按要覆盖的时间跨度选周期**：想覆盖更长的历史就换更大的周期，而不是把指标周期拉长。";
})();

// ── 证据缓存：trading_chart 的出图结果供 trading_confidence 复用 ─────────────

interface CachedView {
  readonly view: MarketView;
  readonly indicators: string;
  readonly at: number;
}

const viewCache = new Map<string, CachedView>();

function viewCacheKey(symbol: string, interval: string): string {
  return `${symbol}|${interval}`;
}

/** 解析 TypeSafe API key：设置里的字面值 → credentials 服务（env 名）→ 进程环境变量。 */
async function resolveTypesafeKey(ctx: HostContext, config: AnalysisConfig): Promise<string | undefined> {
  if (config.apiKey !== "") return config.apiKey;
  const ref = config.apiKeyEnv;
  const credentials = ctx.get?.("credentials") as CredentialProviderLike | undefined;
  if (credentials !== undefined && typeof credentials.resolve === "function") {
    try {
      const resolved = await credentials.resolve(ref);
      const value = resolved?.value;
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    } catch {
      // 凭据解析失败时回落到环境变量。
    }
  }
  const ambient = process.env[ref];
  return ambient !== undefined && ambient.trim() !== "" ? ambient.trim() : undefined;
}

function chartRouteHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const { spec } = await loadChart(provider, chartRequestFromQuery(url.searchParams));
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, chartSpec: spec }));
    } catch (error) {
      const invalid = error instanceof InvalidChartArgsError;
      res.writeHead(invalid ? 400 : 500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

/**
 * 注册随包 skill、trading_chart 工具、trading_confidence 工具与换图端点。
 * 插件配置（TypeSafe key 等）在「设置 → 插件 → trading-agent」里编辑。
 */
export function apply(ctx: HostContext, rawConfig?: AnalysisConfigInput): void {
  // settings.yaml 里没有本插件段时传入的是 {}：先兜底，避免任何读取抛错。
  const config: AnalysisConfig = normalizeAnalysisConfig(rawConfig);
  let current: () => AnalysisConfig = () => config;
  ctx.inject(["settings"], (settingsCtx) => {
    if (settingsCtx.settings === undefined) return;
    settingsCtx.settings.installSection(ctx, "trading-agent", Config, config, {
      setSource: (source) => {
        // 设置页回传的可能是部分字段：同样兜底一次。
        current = () => normalizeAnalysisConfig(source());
      },
      onChange: () => {},
    });
  });

  registerTradingChartSkill(ctx.skills);

  ctx.inject(["webServer"], ({ webServer }) => {
    if (webServer === undefined) return;
    webServer.register({ kind: "exact", path: CHART_ROUTE, handler: chartRouteHandler() });
  });

  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        "画一张加密行情技术分析图，并自动在右侧栏的行情图 tab 中打开。数据来自 Binance 现货。"
        + "周期可传 15m/1h/4h/1d 或时间词（今天/这周/这月/短线）；可覆盖均线周期（ma），"
        + "RSI 默认关闭（传 rsi 周期即显示），布林带/KDJ/ATR 也按需开启。"
        + "返回的机械数据只用已收盘 K 线算出，形成中（未收盘）的那根不参与任何信号与判断，"
        + "画面上它会以弱化样式区分。只做技术面判读，不构成投资建议。"
        + FETCH_CAP_NOTE
        + "需要与别的周期比较方向时，传 compareTo 指定要对比的周期（例如日线对周线传 \"1w\"，"
        + "15m 对 1h 传 \"1h\"）——周期对由你决定，不写死。"
        + "出图后如需校准置信度，再调用 trading_confidence。",
      parameters: {
        symbol: { type: "string", description: "交易对或币种，例如 BTC 或 BTCUSDT。" },
        timeframe: { type: "string", description: "周期或时间词：15m/1h/4h/1d，或 今天/这周/这月/短线。" },
        ma: { type: "array", items: { type: "number" }, description: "均线周期覆盖，例如 [50, 200]。" },
        rsi: { type: "number", description: "RSI 周期；传值即显示 RSI（如 14），不传则不显示。" },
        bollinger: { type: "boolean", description: "是否叠加布林带（默认关闭）。" },
        kdj: { type: "boolean", description: "是否显示 KDJ 副图（默认关闭）。" },
        atr: { type: "boolean", description: "是否显示 ATR 副图（默认关闭）。" },
        compareTo: {
          type: "string",
          description: "要与当前周期比较方向的另一周期（15m/1h/4h/1d/1w）；不传则不比较。"
            + "看日线要对周线就传 1w，看 15m 要对 1h 就传 1h。",
        },
      },
      output: {
        schema: CHART_OUTPUT_SCHEMA,
        render: (_args, value) => chartBlocks(value),
        presentationMeta: (_args, value) => chartPresentationMeta(value),
      },
      execute: async (args) => {
        let view: MarketView;
        try {
          view = await buildMarketView(provider, {
            symbol: args.symbol,
            timeframe: args.timeframe,
            ma: args.ma,
            rsi: args.rsi,
            bollinger: args.bollinger,
            kdj: args.kdj,
            atr: args.atr,
          });
        } catch (error) {
          if (error instanceof InvalidChartArgsError) {
            // 入参不合法就明确回绝，让模型改参数重试——而不是把一个 0 值均线画出来。
            return { ok: false, reason: "invalid_args", hint: error.message };
          }
          throw error;
        }
        viewCache.set(viewCacheKey(view.spec.symbol, view.spec.interval), {
          view,
          indicators: describeIndicators(view.resolved.indicators),
          at: Date.now(),
        });
        const anchor = buildAnchor(view);
        // 周期对由模型点名（compareTo）；不传就不比较。
        const compareTo = (args.compareTo ?? "").trim();
        const resonance = compareTo === ""
          ? undefined
          : await requestResonance(provider, {
            symbol: view.spec.symbol,
            interval: view.spec.interval,
            compareTo,
          });
        return {
          symbol: anchor.symbol,
          interval: anchor.interval,
          bars: anchor.bars,
          formingBars: anchor.formingBars,
          lastClose: anchor.lastClose,
          ...(anchor.lastClosedBar === undefined ? {} : { lastClosedBar: anchor.lastClosedBar }),
          context: anchor.context as unknown as Json,
          ...(resonance === undefined ? {} : { resonance: resonance as unknown as Json }),
          hint: anchor.hint,
          chartSpec: view.spec as unknown as Json,
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: INDICATOR_TOOL_NAME,
      description:
        "按需计算技术指标值（ADR-0008：代码算、你选）。只算你点名的指标，返回每个指标的"
        + "归一化参数、需要的预热根数、最新值与最近若干个值。**只用已收盘 K 线**，"
        + "并回传 grounding（最后一根已收盘 bar、用了多少根）。"
        + "indicators 用紧凑字符串：\"ma:50\"、\"ema:20\"、\"rsi:14\"、\"atr:14\"、\"macd:12/26/9\"、\"macd\"。"
        + FETCH_CAP_NOTE
        + "每轮建议不超过 8 项且互相互补；需要更多可以再发一轮。"
        + "数据不足以算出所请求的指标时返回 ok=false 并说明缺多少根，不要基于不足窗口下结论。",
      parameters: {
        symbol: { type: "string", required: true, description: "交易对或币种，与 trading_chart 一致。" },
        interval: { type: "string", description: "周期：15m/1h/4h/1d 或时间词；默认与本次分析一致（1h）。" },
        indicators: {
          type: "array",
          items: { type: "string" },
          required: true,
          description: "指标请求，例如 [\"ma:50\",\"ma:200\",\"rsi:14\",\"macd\"]。",
        },
        lookback: {
          type: "string",
          description: "要看多长时间的历史（语义单位是时间）：如 \"90d\"、\"3M\"、\"2w\"、\"1y\"、\"36h\"，"
            + "或直接给根数 \"500\"。省略时窗口由指标预热期决定；与指标需求取较大者。"
            + "设定它可以让分析窗口不依赖于你选的指标。",
        },
      },
      output: {
        schema: INDICATOR_OUTPUT_SCHEMA,
        render: (_args, value) => indicatorBlocks(value),
      },
      execute: async (args) => {
        let selectors: IndicatorSelector[];
        try {
          selectors = parseIndicatorSelectors(args.indicators);
        } catch (error) {
          // 拼错的指标名/参数必须变成模型能读懂并纠正的失败，而不是工具级异常。
          return failurePayload("invalid_args", error instanceof Error ? error.message : String(error));
        }
        const result = await requestIndicatorFacts(provider, {
          symbol: args.symbol,
          interval: args.interval,
          indicators: selectors,
          ...(args.lookback === undefined ? {} : { lookback: args.lookback }),
        });
        return indicatorPayload(result);
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: LEVELS_TOOL_NAME,
      description:
        "按需计算价位：支撑/阻力簇（含触碰次数与距现价百分比）、斐波那契回撤、swing 枢轴。"
        + "粒度和取舍由你决定：tolerancePct 控制聚簇容差（默认 1）、pivotOptions 控制枢轴敏感度、"
        + "maxLevels 控制返回条数（按触碰次数降序；必须是正整数）。**只用已收盘 K 线**，每条价位附带形成它的"
        + "枢轴时间，便于你在回答里引用具体日期与价位。",
      parameters: {
        symbol: { type: "string", required: true, description: "交易对或币种。" },
        interval: { type: "string", description: "周期：15m/1h/4h/1d 或时间词。" },
        kinds: {
          type: "array",
          items: { type: "string" },
          description: "要哪几类：support / resistance / fib / pivots；缺省全要。",
        },
        tolerancePct: { type: "number", description: "聚簇容差（百分比），默认 1。越小簇越细。" },
        maxLevels: { type: "number", description: "返回条数上限，按触碰次数降序；缺省不截断。" },
        lookback: {
          type: "string",
          description: "用多长时间的历史价格结构来定价位（如 \"90d\"、\"3M\"）；缺省取够算枢轴的最短窗口。",
        },
      },
      output: {
        schema: LEVELS_OUTPUT_SCHEMA,
        render: (_args, value) => levelsBlocks(value),
      },
      execute: async (args) => {
        const result = await requestLevelFacts(provider, {
          symbol: args.symbol,
          interval: args.interval,
          ...(args.kinds === undefined ? {} : { kinds: args.kinds }),
          ...(args.tolerancePct === undefined ? {} : { tolerancePct: args.tolerancePct }),
          ...(args.maxLevels === undefined ? {} : { maxLevels: args.maxLevels }),
          ...(args.lookback === undefined ? {} : { lookback: args.lookback }),
        });
        if (result.ok !== true) {
          return {
            ok: false,
            reason: result.reason,
            required: result.required,
            available: result.available,
            hint: result.hint,
          };
        }
        return {
          ok: true,
          symbol: result.symbol,
          interval: result.interval,
          grounding: result.grounding as unknown as Json,
          pivots: result.pivots as unknown as Json,
          levels: result.levels as unknown as Json,
          counts: result.counts as unknown as Json,
          truncated: result.truncated,
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: DERIVATIVES_TOOL_NAME,
      description:
        "取加密永续合约的衍生品数据（来源：Hyperliquid）。一次调用给出资金费、资金费中的溢价分量、"
        + "未平仓量(OI)、标记价、预言机价、中间价、冲击价、24h 名义与基础成交量、昨日价。"
        + "资金费在 Hyperliquid 上按**小时**结算（Binance 多为 8 小时），所以样本密度更高。"
        + "fields 可点名要哪些；其中 predictedFunding（同一币在各场所的**预测资金费**，"
        + "用于判断多头拥挤集中在哪个场所）与 openInterestCap（OI 已达上限、无法再开新仓的资产清单）"
        + "是 Hyperliquid 独有、Binance 原理上给不了的数据，只有点名才会去取。"
        + "**资金费/OI 是市场状态，不是交易建议**；拿不到时返回 ok=false 并说明原因。",
      parameters: {
        symbol: { type: "string", required: true, description: "币种或交易对，例如 BTC 或 HYPE。" },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "要哪些字段：funding / premium / openInterest / markPrice / oraclePrice / midPrice / "
            + "impactPrices / volume24h / prevDayPrice / predictedFunding / openInterestCap；缺省给常用一组。",
        },
      },
      output: {
        schema: DERIVATIVES_OUTPUT_SCHEMA,
        render: (_args, value) => derivativesBlocks(value),
      },
      execute: async (args) => {
        const result = await requestDerivatives(
          {
            symbol: args.symbol,
            ...(args.fields === undefined ? {} : { fields: args.fields as never }),
          },
          { hyperliquid: () => hyperliquidProvider },
        );
        if (result.ok !== true) {
          return { ok: false, reason: result.reason, hint: result.hint };
        }
        return {
          ok: true,
          symbol: result.symbol,
          source: result.source,
          snapshot: result.snapshot as unknown as Json,
          ...(result.predictedFunding === undefined ? {} : { predictedFunding: result.predictedFunding as unknown as Json }),
          ...(result.openInterestCap === undefined ? {} : { openInterestCap: result.openInterestCap as unknown as Json }),
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: CONFIDENCE_TOOL_NAME,
      description:
        "用 TypeSafe Jev 校准一个方向性结论的置信度：传入方向、失效位与结论理由，"
        + "宿主把 trading_chart 的机械证据与结论一起交给 Jev，返回支持度（含概率分布）、"
        + "校准置信度（0..1 与 高/中/低）与证据充分度。需要先对同一 symbol/interval 调用 trading_chart；"
        + "未配置 TypeSafe API key 或调用失败时返回 ok=false，此时按你自己的判断给置信度并声明未校准。"
        + "它只校准一个判读的置信度，不产生也不背书任何交易建议。",
      parameters: {
        symbol: { type: "string", required: true, description: "与 trading_chart 一致的交易对或币种。" },
        interval: { type: "string", required: true, description: "结论对应的周期：15m/1h/4h/1d。" },
        direction: { type: "string", required: true, description: "方向：bullish / bearish / range / unclear。" },
        invalidation: { type: "string", required: true, description: "失效位（价位或条件），例如「跌破 63000」。" },
        thesis: { type: "string", required: true, description: "你的方向性结论与理由（会发给 Jev 评分）。" },
        compareTo: {
          type: "string",
          description: "若你在出图时用了 compareTo 做多周期比较，这里传**同一个**周期，"
            + "Jev 才会拿到与你相同的对比证据；不传则证据里不含共振。",
        },
      },
      output: {
        schema: CONFIDENCE_OUTPUT_SCHEMA,
        render: (_args, value) => confidenceBlocks(value),
      },
      execute: async (args, exec) => {
        const symbol = resolveSymbol(args.symbol);
        const interval = resolveInterval(args.interval);
        const cfg = current();
        const cached = viewCache.get(viewCacheKey(symbol, interval));
        if (cached === undefined || Date.now() - cached.at > cfg.evidenceTtlMs) {
          return {
            ok: false,
            symbol,
            interval,
            reason: "evidence_unavailable",
            hint: "先对同一 symbol/interval 调用 trading_chart，再用它的结果调用 trading_confidence。",
          };
        }
        const apiKey = await resolveTypesafeKey(ctx, cfg);
        if (apiKey === undefined) {
          return {
            ok: false,
            symbol,
            interval,
            reason: "credentials_missing",
            hint: "在侧栏「插件」页 → 已安装 → dsh-trading-agent → trading-agent 行的「配置」里填入 TypeSafe API key 后重试；未配置时请按自己的判断给出置信度并声明未校准。",
          };
        }
        // 与模型同一个周期对：模型出图时用什么 compareTo，这里就用什么——
        // 否则 Jev 的证据描述的是另一种对比（同一回合两个结论）。
        const compareTo = (args.compareTo ?? "").trim();
        const resonance = compareTo === ""
          ? undefined
          : await requestResonance(provider, { symbol, interval, compareTo });
        const evidence = buildConfidenceEvidence({
          symbol,
          interval,
          bars: cached.view.bars,
          indicators: cached.indicators,
          context: cached.view.context,
          ...(resonance !== undefined && resonance.ok === true
            ? {
              resonance: {
                higherInterval: resonance.higherInterval,
                higherDirection: resonance.higher.trend.direction,
                currentDirection: resonance.current.trend.direction,
                aligned: resonance.aligned,
                summary: resonance.summary,
              },
            }
            : {}),
          candidates: cached.view.candidates,
          ruleSignals: cached.view.ruleSignals,
        });
        const thesis = {
          direction: args.direction as ConfidenceDirection,
          invalidation: args.invalidation,
          rationale: args.thesis,
        };
        try {
          const scorer = new TypeSafeConfidenceScorer({
            apiKey,
            baseURL: cfg.baseURL,
            model: cfg.model,
            timeoutMs: cfg.timeoutMs,
            thresholds: { highThreshold: cfg.highThreshold, mediumThreshold: cfg.mediumThreshold },
          });
          const assessment = await scorer.score(evidence, thesis, exec.signal);
          return {
            ok: true,
            symbol,
            interval,
            direction: thesis.direction,
            support: assessment.support as unknown as Json,
            confidence: assessment.confidence as unknown as Json,
            sufficiency: (assessment.sufficiency ?? null) as unknown as Json,
            agreement: (assessment.agreement ?? null) as unknown as Json,
            model: assessment.model,
          };
        } catch (error) {
          return {
            ok: false,
            symbol,
            interval,
            reason: error instanceof ConfidenceUnavailableError ? error.reason : "network_error",
            hint: "校准服务暂时不可用；请按你自己的判断给出置信度，并声明本次未经校准。",
          };
        }
      },
    }),
  );
}
