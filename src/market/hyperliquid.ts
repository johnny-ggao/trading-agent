/**
 * Hyperliquid 行情源（补充源，工单 08）。
 *
 * 相对 Binance 的两处硬差异必须诚实暴露，不能静默：
 * 1. **K 线保留上限 5000 根**（1h ≈ 208 天、1m ≈ 3.5 天），没有回填；请求更早的窗口会拿到
 *    空数组——那不代表"当时没有行情"，而是"超出保留范围"。
 * 2. 速率限制按 IP 共享 1200 weight/min，`candleSnapshot` 为 20 + n/60，比 Binance 紧。
 *
 * 公开读无需 key；事实见 docs/research/crypto-data-apis.md 与 hyperliquid-extra-data.md。
 */
import { baseCoin } from "./symbol";
import type {
  Candle,
  CandleBatch,
  DerivativesSnapshot,
  FetchLike,
  HttpResponseLike,
  MarketDataProvider,
} from "./types";

/** HL 按周期的 K 线保留上限（官方文档：Only the most recent 5000 candles are available）。 */
export const HL_RETENTION_LIMIT = 5_000;

export const DEFAULT_HL_BASE_URL = "https://api.hyperliquid.xyz";

/** HL `candleSnapshot` 支持的周期。 */
const HL_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M"]);

/** 周期校验：HL 不支持的就抛错，绝不悄悄换成别的周期给出误导性数据。 */
export function hlInterval(interval: string): string {
  const trimmed = interval.trim();
  if (!HL_INTERVALS.has(trimmed)) {
    throw new Error(`hyperliquid 不支持周期 "${interval}"；支持：${[...HL_INTERVALS].join("/")}`);
  }
  return trimmed;
}

interface CandleSnapshotRow {
  t: number;
  T?: number;
  s?: string;
  i?: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n?: number;
}

/** HL 的 K 线行长这样：价格是字符串、时间是毫秒。 */
function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error("hyperliquid candleSnapshot: expected an array");
  return raw.map((row) => {
    const candle = row as CandleSnapshotRow;
    if (candle === null || typeof candle !== "object" || candle.t === undefined) {
      throw new Error("hyperliquid candleSnapshot: malformed row");
    }
    return {
      time: Math.floor(Number(candle.t) / 1000),
      open: Number(candle.o),
      high: Number(candle.h),
      low: Number(candle.l),
      close: Number(candle.c),
      volume: Number(candle.v),
    };
  });
}

export interface HyperliquidProviderOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

/** Hyperliquid 公共 Info API 的行情源。 */
export class HyperliquidProvider implements MarketDataProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: HyperliquidProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_HL_BASE_URL;
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init as RequestInit) as unknown as Promise<HttpResponseLike>);
  }

  async fetchCandles(
    symbol: string,
    interval: string,
    options: { limit?: number; endTime?: number } = {},
  ): Promise<Candle[]> {
    const batch = await this.fetchCandleBatch(symbol, interval, options);
    return batch.candles;
  }

  /**
   * 带来源与保留信息的取数：让上层能说明"这段历史超出保留范围"，
   * 而不是把空数组当成"没有行情"。
   */
  async fetchCandleBatch(
    symbol: string,
    interval: string,
    options: { limit?: number; endTime?: number } = {},
  ): Promise<CandleBatch> {
    const hlIv = hlInterval(interval);
    const requested = Math.max(options.limit ?? 500, 1);
    // HL 没有分页，一次最多给 5000 根；要更多也只能拿到 5000。
    const endTime = options.endTime ?? Date.now();
    const startTime = endTime - Math.min(requested, HL_RETENTION_LIMIT) * intervalMs(hlIv);
    const raw = await this.post({
      type: "candleSnapshot",
      req: { coin: baseCoin(symbol), interval: hlIv, startTime, endTime },
    });
    // 防御：即便上游多给了，也不越过自己声明的保留上限（否则 note 的措辞与数字会自相矛盾）。
    const candles = parseCandles(raw).slice(-HL_RETENTION_LIMIT);
    return this.withRetention(symbol, hlIv, requested, startTime, candles);
  }

  /** 判断这次取数是否撞上保留上限，并给出可读说明。 */
  private withRetention(
    symbol: string,
    interval: string,
    requested: number,
    startTime: number,
    candles: Candle[],
  ): CandleBatch {
    const base = { source: "hyperliquid", candles, retentionLimit: HL_RETENTION_LIMIT } as const;
    // 要的比保留上限多，或要到了比保留窗口更早的起点：都算截断。
    const askedBeyondLimit = requested > HL_RETENTION_LIMIT;
    const nowMs = Date.now();
    const retentionFloorMs = nowMs - HL_RETENTION_LIMIT * intervalMs(interval);
    const askedBeforeFloor = startTime < retentionFloorMs;
    const truncated = askedBeyondLimit || askedBeforeFloor || candles.length === 0;
    if (!truncated) return { ...base, truncated: false };
    const note = candles.length === 0
      ? `${symbol} ${interval} 在该窗口没有取到 K 线：Hyperliquid 只保留最近 ${HL_RETENTION_LIMIT} 根`
        + `（${interval} 约 ${Math.floor((HL_RETENTION_LIMIT * intervalMs(interval)) / 86_400_000)} 天），更早的历史请用 Binance。`
      : `${symbol} ${interval} 本次取到 ${candles.length} 根（已到 Hyperliquid 的保留上限 ${HL_RETENTION_LIMIT} 根），`
        + `更早的历史请用 Binance。`;
    return { ...base, truncated: true, note };
  }

  /**
   * 衍生品快照：一次 `metaAndAssetCtxs` 调用就带回资金费/OI/标记价/预言机价/溢价/冲击价/24h 量价。
   * Binance 现货源给不了这些。
   */
  async fetchDerivatives(symbol: string): Promise<DerivativesSnapshot> {
    const coin = baseCoin(symbol);
    const raw = await this.post({ type: "metaAndAssetCtxs" });
    return parseAssetContext(coin, raw);
  }

  /**
   * 跨场所预测资金费（`predictedFundings`）——**Binance 原理上给不了的数据**：
   * 同一个币在 BinPerp / BybitPerp / HlPerp 等场所的预测资金费并排给出，是判断
   * "多头拥挤集中在哪个场所"的直接依据。没有该币种时返回空数组。
   */
  async fetchPredictedFunding(symbol: string): Promise<PredictedFunding[]> {
    const coin = baseCoin(symbol);
    const raw = await this.post({ type: "predictedFundings" });
    return parsePredictedFunding(coin, raw);
  }

  /** OI 已达上限、无法再开新仓的资产清单（HL 独有）。 */
  async fetchOpenInterestCap(): Promise<string[]> {
    const raw = await this.post({ type: "perpsAtOpenInterestCap" });
    if (!Array.isArray(raw)) throw new Error("hyperliquid perpsAtOpenInterestCap: expected an array");
    return raw.map((coin) => String(coin));
  }

  private async post(body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`hyperliquid http ${response.status}`);
    }
    return response.json();
  }
}

/** 一个场所的预测资金费。 */
export interface PredictedFunding {
  venue: string;
  fundingRate: number;
  nextFundingTime: number;
}

/** 解析 `predictedFundings`：[[coin, [[venue, {...}], ...]], ...]。 */
export function parsePredictedFunding(coin: string, raw: unknown): PredictedFunding[] {
  if (!Array.isArray(raw)) throw new Error("hyperliquid predictedFundings: expected an array");
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) {
      throw new Error("hyperliquid predictedFundings: malformed entry");
    }
    const [name, venues] = entry as [unknown, unknown];
    if (String(name).toUpperCase() !== coin) continue;
    if (!Array.isArray(venues)) throw new Error("hyperliquid predictedFundings: malformed venues");
    return venues.flatMap((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return [];
      const [venue, info] = pair as [unknown, { fundingRate?: string; nextFundingTime?: number }];
      const rate = Number(info?.fundingRate);
      if (!Number.isFinite(rate)) return [];
      return [{
        venue: String(venue),
        fundingRate: rate,
        nextFundingTime: Number(info?.nextFundingTime ?? 0),
      }];
    });
  }
  return [];
}

function intervalMs(interval: string): number {
  const match = /^(\d+)([mhdwM])$/.exec(interval);
  if (match === null) throw new Error(`hyperliquid: cannot derive ms for interval "${interval}"`);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000, M: 2_592_000_000 }[match[2]!] ?? 0;
  return Number(match[1]) * unit;
}

/** `metaAndAssetCtxs` 的响应：[universe 元数据, assetCtxs 数组]，两者按下标对齐。 */
export function parseAssetContext(coin: string, raw: unknown): DerivativesSnapshot {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("hyperliquid metaAndAssetCtxs: expected [meta, assetCtxs]");
  }
  const meta = raw[0] as { universe?: Array<{ name?: string }> };
  const contexts = raw[1];
  if (!Array.isArray(meta?.universe) || !Array.isArray(contexts)) {
    throw new Error("hyperliquid metaAndAssetCtxs: malformed payload");
  }
  const index = meta.universe.findIndex((entry) => entry?.name === coin);
  if (index < 0) throw new Error(`hyperliquid: 未上市的永续合约 "${coin}"`);
  const ctx = contexts[index] as Record<string, string | string[] | undefined>;
  const num = (key: string): number | undefined => {
    const value = ctx[key];
    if (typeof value !== "string") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const impact = ctx.impactPxs;
  const impactPrices = Array.isArray(impact) && impact.length >= 2
    ? ([Number(impact[0]), Number(impact[1])] as [number, number])
    : undefined;
  return {
    symbol: coin,
    source: "hyperliquid",
    // HL 的资金费按小时结算（官方文档：funding is paid every hour）。
    fundingIntervalHours: 1,
    ...pick("funding", num("funding")),
    ...pick("premium", num("premium")),
    ...pick("openInterest", num("openInterest")),
    ...pick("markPrice", num("markPx")),
    ...pick("oraclePrice", num("oraclePx")),
    ...pick("midPrice", num("midPx")),
    ...pick("dayNotionalVolume", num("dayNtlVlm")),
    ...pick("dayBaseVolume", num("dayBaseVlm")),
    ...pick("prevDayPrice", num("prevDayPx")),
    ...(impactPrices === undefined ? {} : { impactPrices }),
  };
}

/** 只把取到的字段放进结果，避免出现一堆 `undefined` 键。 */
function pick<K extends string>(key: K, value: number | undefined): Record<K, number> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Record<K, number>;
}
