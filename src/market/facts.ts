/**
 * 按需取数工具的实现侧（ADR-0008）。
 *
 * 把"取已收盘 K 线 → 交给纯计算 → 组织成模型可读的响应"这一段收成一个可单测的接缝，
 * 于是 `src/index.ts` 里的工具注册只剩下参数转译。**取数一律走已收盘边界**
 * （`closedCandles.ts`），并且所有响应都自带 grounding。
 */
import { barsForInterval, DEFAULT_BAR_POLICY, describeBarsSpan, describeFetchCoverage, intervalToMs } from "./chart";
import { partitionCandles } from "./closedCandles";
import { computeIndicatorFacts, warmupBarsFor, type IndicatorFact, type IndicatorSelector } from "./indicatorFacts";
import { DEFAULT_INDICATORS } from "./indicators";
import { computeLevelFacts, type LevelFact, type LevelKind, type LevelPivot } from "./levelFacts";
import { computeMarketContext } from "./context";
import { computeResonance, higherInterval } from "./multiTimeframe";
import { resolveInterval, type Interval } from "./timeframe";
import { baseCoin, resolveSymbol } from "./symbol";
import type { Candle, MarketDataProvider } from "./types";

/** 每次响应都带的"数据有多新、用了哪些 K 线、来自哪里"。 */
export interface Grounding {
  lastClosedBar?: number;
  formingBars: number;
  barsUsed: number;
  closedOnly: true;
  /** 数据来源（如 "binance" / "hyperliquid"）；缺省表示来源未声明。 */
  source?: string;
  /**
   * 请求的窗口是否有一部分超出该源的保留范围（例如 Hyperliquid 只保留最近 5000 根）。
   * 为真时 `note` 说明该怎么补救——**不要把空结果当成"当时没有行情"**。
   */
  truncated?: boolean;
  note?: string;
}

/** 取数的统一失败形状：说明缺多少，而不是给一个基于不足窗口的数。 */
export interface Insufficient {
  ok: false;
  reason: "insufficient_closed_bars" | "empty_request" | "derivatives_unavailable" | "invalid_args";
  required: number;
  available: number;
  hint: string;
}

/** 入参不合法时的统一失败：required/available 不适用，用 0 占位，靠 hint 说清怎么改。 */
function invalidArgs(hint: string): { ok: false; error: Insufficient } {
  return { ok: false, error: { ok: false, reason: "invalid_args", required: 0, available: 0, hint } };
}

/** 取数接缝的入参：**needs 决定要多少根**，这是取数与够不够判定的唯一策略。 */
export interface ClosedBarsInput {
  symbol: string;
  interval?: string;
  /** 本次请求需要多少根已收盘 K 线（含指标预热期的推导）。 */
  needs: number;
  /** 失败时给模型的补救提示；缺省用通用文案。 */
  hint?: string;
}

/** 取数成功的值：已收盘 K 线 + 来源与新鲜度。 */
export interface ClosedBarsValue {
  symbol: string;
  interval: string;
  candles: Candle[];
  grounding: Grounding;
}

export type ClosedBarsResult =
  | { ok: true; value: ClosedBarsValue }
  | { ok: false; error: Insufficient };

export interface IndicatorRequestInput {
  symbol: string;
  interval?: string;
  indicators: IndicatorSelector[];
}

export interface IndicatorFactsResult {
  ok: true;
  symbol: string;
  interval: string;
  grounding: Grounding;
  indicators: IndicatorFact[];
}

export type IndicatorFactsResponse = IndicatorFactsResult | Insufficient;

/** 分形枢轴要左右各 left/right 根，少于这个数不可能有枢轴。 */
const MIN_BARS_FOR_PIVOTS = 5;

/** 市场状态（ADX/ATR/量能）至少要这么多根才有意义。 */
const MIN_BARS_FOR_CONTEXT = 15;

interface ClockOptions {
  now?: number;
}

/**
 * 取数接缝：**一个 needs 决定取多少、也决定够不够**。
 *
 * 此前取数按默认指标篮子推导、而够不够按请求事后判定，两者分居两模块，
 * 于是 `ma:900` 只取 720 根就被判"数据不足"，把按需取数又推回默认篮子（ADR-0008 的回归）。
 * 现在：取 `min(max(needs + 上下文余量, 默认篮子), maxBars)`，够不够用同一个数判定。
 * 失败形状也在这里统一产出，调用方不再各自手搓。
 */
export async function closedBars(
  provider: MarketDataProvider,
  input: ClosedBarsInput,
  options: ClockOptions = {},
): Promise<ClosedBarsResult> {
  const market = resolveSymbol(input.symbol);
  const interval = resolveInterval(input.interval);
  const want = Math.min(
    Math.max(input.needs + DEFAULT_BAR_POLICY.minContextBars, barsForInterval(interval)),
    DEFAULT_BAR_POLICY.maxBars,
  );
  const fetched = await fetchCandles(provider, market, interval, want);
  const closure = partitionCandles(fetched.candles, interval, options.now ?? Date.now());
  const available = closure.closed.length;

  if (available < input.needs) {
    return {
      ok: false,
      error: {
        ok: false,
        reason: "insufficient_closed_bars",
        required: input.needs,
        available,
        hint: `${input.hint ?? ""}${describeShortfall(input.needs, available, interval)}`,
      },
    };
  }

  return {
    ok: true,
    value: {
      symbol: market,
      interval,
      candles: closure.closed,
      grounding: {
        ...(closure.lastClosed === undefined ? {} : { lastClosedBar: closure.lastClosed.time }),
        formingBars: closure.formingBars,
        barsUsed: available,
        closedOnly: true,
        ...(fetched.source === undefined ? {} : { source: fetched.source }),
        ...(fetched.truncated === undefined ? {} : { truncated: fetched.truncated }),
        ...(fetched.note === undefined ? {} : { note: fetched.note }),
      },
    },
  };
}

/**
 * 把"要多少 / 拿到多少"翻译成可纠正的指引。
 *
 * 关键区分：撞上**单次取数上限**时该换更大的周期（同样根数覆盖更长历史）；
 * 只是**当前根数不够**时说明实际拿到多少。两者补救方式不同，不能混为一谈。
 */
function describeShortfall(needs: number, available: number, interval: string): string {
  const larger = higherInterval(interval);
  // 补救方向只有两个：换更大的周期（同根数覆盖更长历史），或缩短指标周期。**不要**建议去更小的周期。
  const viaLarger = larger === interval
    ? "缩短指标周期"
    : `换更大的周期（${larger} ${describeFetchCoverage(DEFAULT_BAR_POLICY.maxBars, larger)}）`;
  if (needs > DEFAULT_BAR_POLICY.maxBars) {
    return `本周期单次只能覆盖${describeBarsSpan(DEFAULT_BAR_POLICY.maxBars, interval)}的历史`
      + `（${DEFAULT_BAR_POLICY.maxBars} 根），而本次请求需要 ${needs} 根。`
      + `要覆盖更长的历史就${viaLarger}。`;
  }
  return `本次请求需要 ${needs} 根，该周期上只取到 ${available} 根已收盘 K 线；`
    + `可以${viaLarger}，或换一个该周期上历史更长的币种。`;
}

/** 优先用带来源信息的 `fetchCandleBatch`（Hyperliquid 的 5000 根上限），否则退回裸数组。 */
async function fetchCandles(
  provider: MarketDataProvider,
  symbol: string,
  interval: string,
  limit: number,
): Promise<{ candles: Candle[]; source?: string; truncated?: boolean; note?: string }> {
  if (typeof provider.fetchCandleBatch === "function") {
    const batch = await provider.fetchCandleBatch(symbol, interval, { limit });
    return {
      candles: batch.candles,
      source: batch.source,
      // 只有真被截断时才把 note 递给模型，避免噪音。
      truncated: batch.truncated,
      ...(batch.truncated && batch.note !== undefined ? { note: batch.note } : {}),
    };
  }
  return { candles: await provider.fetchCandles(symbol, interval, { limit }) };
}

/** 按需算指标：只算被点名的，数据不足时明确报缺。 */
export async function requestIndicatorFacts(
  provider: MarketDataProvider,
  input: IndicatorRequestInput,
  options: ClockOptions = {},
): Promise<IndicatorFactsResponse> {
  const interval = resolveInterval(input.interval);
  if (input.indicators.length === 0) {
    return {
      ok: false,
      reason: "empty_request",
      required: 1,
      available: 0,
      hint: "至少点名一个指标，例如 [{ id: \"rsi\", period: 14 }]。",
    };
  }
  const closed = await closedBars(provider, {
    symbol: input.symbol,
    interval,
    needs: Math.max(...input.indicators.map(warmupBarsFor)),
    hint: "" /* 由 closedBars 统一给出可纠正的说明 */,
  }, options);
  if (closed.ok !== true) return closed.error;
  const { value } = closed;
  return {
    ok: true,
    symbol: value.symbol,
    interval: value.interval,
    grounding: value.grounding,
    indicators: computeIndicatorFacts(value.candles, input.indicators),
  };
}

export interface LevelRequestInput {
  symbol: string;
  interval?: string;
  /** 收原始字符串：**不合法就报错，而不是静默丢弃**（拼错的 kind 曾会变成静默空成功）。 */
  kinds?: string[];
  pivotOptions?: { left: number; right: number };
  tolerancePct?: number;
  maxLevels?: number;
}

const LEVEL_KINDS: LevelKind[] = ["support", "resistance", "fib", "pivots"];

/** 校验价位入参；不合法则返回失败。 */
function validateLevelInput(input: LevelRequestInput): { ok: false; error: Insufficient } | undefined {
  if (input.kinds !== undefined) {
    if (input.kinds.length === 0) {
      return invalidArgs("kinds 不能是空数组；要全部类别就不要传这个字段。");
    }
    const unknown = input.kinds.filter((kind) => !LEVEL_KINDS.includes(kind as LevelKind));
    if (unknown.length > 0) {
      return invalidArgs(
        `不认识的 kinds 值 ${unknown.map((k) => JSON.stringify(k)).join("、")}；`
        + `合法值：${LEVEL_KINDS.join(" / ")}。`,
      );
    }
  }
  if (input.tolerancePct !== undefined && !(input.tolerancePct > 0)) {
    return invalidArgs(`tolerancePct 必须是正数（百分比，如 1 表示 1%），收到 ${JSON.stringify(input.tolerancePct)}。`);
  }
  if (input.maxLevels !== undefined && (!Number.isInteger(input.maxLevels) || input.maxLevels < 1)) {
    return invalidArgs(`maxLevels 必须是正整数，收到 ${JSON.stringify(input.maxLevels)}。`);
  }
  return undefined;
}

export interface LevelFactsResult {
  ok: true;
  symbol: string;
  interval: string;
  grounding: Grounding;
  pivots: LevelPivot[];
  levels: LevelFact[];
  counts: Record<LevelKind, number>;
  truncated: number;
}

export type LevelFactsResponse = LevelFactsResult | Insufficient;

/** 按需算价位：容差与取舍由请求决定。 */
export async function requestLevelFacts(
  provider: MarketDataProvider,
  input: LevelRequestInput,
  options: ClockOptions = {},
): Promise<LevelFactsResponse> {
  const invalid = validateLevelInput(input);
  if (invalid !== undefined) return invalid.error;
  const interval = resolveInterval(input.interval);
  const closed = await closedBars(provider, {
    symbol: input.symbol,
    interval,
    needs: MIN_BARS_FOR_PIVOTS,
    hint: "",
  }, options);
  if (closed.ok !== true) return closed.error;
  const series = closed.value;
  const facts = computeLevelFacts(series.candles, {
    ...(input.kinds === undefined ? {} : { kinds: input.kinds as LevelKind[] }),
    ...(input.pivotOptions === undefined ? {} : { pivotOptions: input.pivotOptions }),
    ...(input.tolerancePct === undefined ? {} : { tolerancePct: input.tolerancePct }),
    ...(input.maxLevels === undefined ? {} : { maxLevels: input.maxLevels }),
  });
  return {
    ok: true,
    symbol: series.symbol,
    interval: series.interval,
    grounding: series.grounding,
    pivots: facts.pivots,
    levels: facts.levels,
    counts: facts.counts,
    truncated: facts.truncated,
  };
}

export interface ResonanceInput {
  symbol: string;
  /** 当前（较低）周期。 */
  interval?: string;
  /** 要对比的（较高）周期；缺省取默认高一级周期。 */
  compareTo?: string;
}

export interface ResonanceResult {
  ok: true;
  symbol: string;
  currentInterval: string;
  higherInterval: string;
  /** 当前周期的机械状态。 */
  current: { trend: { state: string; direction: string; adx: number | null } };
  /** 对比周期的机械状态。 */
  higher: { trend: { state: string; direction: string; adx: number | null } };
  aligned: boolean;
  summary: string;
  /** 以**当前周期**的收盘边界为准（高周期那侧各自也已切过）。 */
  grounding: Grounding;
}

export type ResonanceResponse = ResonanceResult | Insufficient;

/**
 * 多周期共振：**周期对由调用方指定**，不写死 ×4。
 *
 * 看 1d 的人可能要对 1w，看 15m 的人可能要对 1h，做结构的人可能跨两级对比——
 * 默认仍取高一级周期，但 `compareTo` 可覆盖为任意支持的周期。
 */
export async function requestResonance(
  provider: MarketDataProvider,
  input: ResonanceInput,
  options: ClockOptions = {},
): Promise<ResonanceResponse> {
  const currentInterval = resolveInterval(input.interval);
  const higher = input.compareTo === undefined
    ? higherInterval(currentInterval) as Interval
    : resolveInterval(input.compareTo);

  // 两侧都要够算市场状态（ADX 等），否则明确报缺而不是给一个空结论。
  const [currentClosed, higherClosed] = await Promise.all([
    closedBars(provider, {
      symbol: input.symbol,
      interval: currentInterval,
      needs: MIN_BARS_FOR_CONTEXT,
      hint: "",
    }, options),
    closedBars(provider, {
      symbol: input.symbol,
      interval: higher,
      needs: MIN_BARS_FOR_CONTEXT,
      hint: "",
    }, options),
  ]);
  if (currentClosed.ok !== true) return currentClosed.error;
  if (higherClosed.ok !== true) return higherClosed.error;
  const currentSeries = currentClosed.value;
  const higherSeries = higherClosed.value;

  const currentContext = computeMarketContext(currentSeries.candles, DEFAULT_INDICATORS);
  const higherContext = computeMarketContext(higherSeries.candles, DEFAULT_INDICATORS);
  const resonance = computeResonance(higher, higherContext, currentContext);
  const trendOf = (context: typeof currentContext) => ({
    trend: {
      state: context.trend.state,
      direction: context.trend.direction,
      adx: context.trend.adx,
    },
  });
  return {
    ok: true,
    symbol: currentSeries.symbol,
    currentInterval,
    higherInterval: higher,
    current: trendOf(currentContext),
    higher: trendOf(higherContext),
    aligned: resonance.aligned,
    summary: resonance.summary,
    grounding: currentSeries.grounding,
  };
}

/** 衍生品字段名（模型可点名的那些）。 */
export type DerivativeField =
  | "funding" | "premium" | "openInterest" | "markPrice" | "oraclePrice" | "midPrice"
  | "impactPrices" | "volume24h" | "prevDayPrice"
  | "predictedFunding" | "openInterestCap";

const DERIVATIVE_FIELDS: DerivativeField[] = [
  "funding", "premium", "openInterest", "markPrice", "oraclePrice", "midPrice",
  "impactPrices", "volume24h", "prevDayPrice", "predictedFunding", "openInterestCap",
];

export interface DerivativesInput {
  symbol: string;
  /** 数据来源；目前只有 hyperliquid（Binance 现货给不了这些字段）。 */
  source?: "hyperliquid";
  /** 要哪些字段；缺省给常用的一组（不含两次额外调用）。 */
  fields?: DerivativeField[];
}

export interface DerivativesResult {
  ok: true;
  symbol: string;
  source: string;
  snapshot: Record<string, unknown>;
  predictedFunding?: Array<{ venue: string; fundingRate: number; nextFundingTime: number }>;
  openInterestCap?: string[];
}

/** 衍生品源的注入点：测试可换成假 provider，生产用 HyperliquidProvider。 */
export interface DerivativesSources {
  hyperliquid: () => import("./hyperliquid").HyperliquidProvider;
}

/** 数据不足 / 不可用时的形状（与其它工具一致）。 */
export interface DerivativesUnavailable {
  ok: false;
  reason: "derivatives_unavailable";
  hint: string;
}

export type DerivativesResponse = DerivativesResult | DerivativesUnavailable;

/** 缺省字段：一次调用就能拿到的常用项。 */
const DEFAULT_DERIVATIVE_FIELDS: DerivativeField[] = [
  "funding", "openInterest", "markPrice", "oraclePrice", "premium", "impactPrices", "volume24h",
];

/**
 * 按需取衍生品数据：**Hyperliquid 原生永续**。
 *
 * 与 Binance 的差别（见 docs/research/hyperliquid-extra-data.md）：HL 一次
 * `metaAndAssetCtxs` 就带回资金费/溢价/OI/标记价/预言机价/冲击价/24h 量价，且资金费按
 * **小时**结算；`predictedFunding`（跨场所预测资金费）与 `openInterestCap`（OI 上限清单）
 * 是 Binance 原理上给不了的，只有点名时才发起额外请求。
 */
export async function requestDerivatives(
  input: DerivativesInput,
  sources: DerivativesSources,
): Promise<DerivativesResponse> {
  const fields = input.fields === undefined || input.fields.length === 0
    ? DEFAULT_DERIVATIVE_FIELDS
    : DERIVATIVE_FIELDS.filter((field) => input.fields!.includes(field));
  const provider = sources.hyperliquid();
  // Hyperliquid 用**币种名**（BTC）而非现货对（BTCUSDT）；统一在这里归一，响应里也回币种名。
  const coin = baseCoin(input.symbol);

  let snapshot: Record<string, unknown>;
  try {
    const raw = await provider.fetchDerivatives(coin);
    snapshot = projectDerivativeFields(raw as unknown as Record<string, unknown>, fields);
  } catch (error) {
    return {
      ok: false,
      reason: "derivatives_unavailable",
      hint: `${coin} 在 Hyperliquid 上没有可用的永续上下文（${error instanceof Error ? error.message : String(error)}）；`
        + "若这是 Binance 才有的币种，请改用行情与指标工具。",
    };
  }

  const result: DerivativesResult = {
    ok: true,
    symbol: coin,
    source: String(snapshot.source ?? "hyperliquid"),
    snapshot,
  };

  if (fields.includes("predictedFunding")) {
    try {
      const rows = await provider.fetchPredictedFunding(coin);
      if (rows.length > 0) result.predictedFunding = rows;
    } catch {
      // 预测资金费拿不到不影响主快照；不编造。
    }
  }
  if (fields.includes("openInterestCap")) {
    try {
      result.openInterestCap = await provider.fetchOpenInterestCap();
    } catch {
      // 同上：可选增强项，失败就省略。
    }
  }
  return result;
}

/** 字段名 → 快照键，按请求投影（不夹带未被点名的字段）。 */
function projectDerivativeFields(
  raw: Record<string, unknown>,
  fields: DerivativeField[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    symbol: raw.symbol,
    ...(raw.source === undefined ? {} : { source: raw.source }),
    ...(raw.fundingIntervalHours === undefined ? {} : { fundingIntervalHours: raw.fundingIntervalHours }),
  };
  const wanted: Record<string, string[]> = {
    funding: ["funding"],
    premium: ["premium"],
    openInterest: ["openInterest"],
    markPrice: ["markPrice"],
    oraclePrice: ["oraclePrice"],
    midPrice: ["midPrice"],
    impactPrices: ["impactPrices"],
    volume24h: ["dayNotionalVolume", "dayBaseVolume"],
    prevDayPrice: ["prevDayPrice"],
  };
  for (const field of fields) {
    for (const key of wanted[field] ?? []) {
      if (raw[key] !== undefined) out[key] = raw[key];
    }
  }
  return out;
}

// intervalToMs 的重导出仅用于测试注入时钟时的换算便利。
export { intervalToMs };
