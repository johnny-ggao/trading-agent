import type { Candle } from "../shared/chartSpec";
import type { DerivativesSnapshot, FetchLike, HttpResponseLike, MarketDataProvider } from "./types";
import { resolveSymbol } from "./symbol";

export interface BinanceProviderOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  cacheTtlMs?: number;
}

/** 把 Binance klines 的数组数组解析为领域 Candle（时间取秒）。 */
export function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error("binance klines: expected an array");
  return raw.map((row) => {
    if (!Array.isArray(row) || row.length < 5) throw new Error("binance klines: malformed row");
    return {
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    };
  });
}

const MAX_PAGE = 1000;
const MAX_RETRIES = 3;

/** Binance 现货行情源（公共、免 key）。 */
export class BinanceProvider implements MarketDataProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, { at: number; candles: Candle[] }>();

  constructor(options: BinanceProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://data-api.binance.vision";
    this.fetchImpl = options.fetch
      ?? ((url) => fetch(url) as unknown as Promise<HttpResponseLike>);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
  }

  async fetchCandles(
    symbol: string,
    interval: string,
    options: { limit?: number; endTime?: number } = {},
  ): Promise<Candle[]> {
    const market = resolveSymbol(symbol);
    const limit = Math.min(Math.max(options.limit ?? 300, 1), 5000);
    const key = `${market}|${interval}|${limit}|${options.endTime ?? ""}`;
    const hit = this.cache.get(key);
    if (hit !== undefined && this.now() - hit.at < this.cacheTtlMs) return hit.candles;

    const collected: Candle[] = [];
    let endTime = options.endTime;
    while (collected.length < limit) {
      const page = Math.min(MAX_PAGE, limit - collected.length);
      const raw = await this.request(this.url(market, interval, page, endTime));
      const candles = parseKlines(raw);
      if (candles.length === 0) break;
      collected.unshift(...candles);
      if (candles.length < page) break;
      endTime = candles[0]!.time * 1000 - 1;
    }

    const result = collected.slice(-limit);
    this.cache.set(key, { at: this.now(), candles: result });
    return result;
  }

  async fetchDerivatives(symbol: string): Promise<DerivativesSnapshot> {
    return { symbol: resolveSymbol(symbol) };
  }

  private url(symbol: string, interval: string, limit: number, endTime?: number): string {
    const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
    if (endTime !== undefined) params.set("endTime", String(endTime));
    return `${this.baseUrl}/api/v3/klines?${params.toString()}`;
  }

  /** 单次请求；对 429/418 按 Retry-After 退避重试。 */
  private async request(url: string): Promise<unknown> {
    for (let attempt = 1; ; attempt += 1) {
      const res = await this.fetchImpl(url);
      if (res.status === 429 || res.status === 418) {
        if (attempt > MAX_RETRIES) throw new Error(`binance rate limited (${res.status})`);
        const retryAfter = Number(res.headers.get("retry-after"));
        const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
        await this.sleep(ms);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new Error(`binance http ${res.status}`);
      return res.json();
    }
  }
}
