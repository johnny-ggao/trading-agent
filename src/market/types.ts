import type { Candle } from "../shared/chartSpec";

export type { Candle };

/** 最小 HTTP 响应形状，便于测试注入假 fetch。 */
export interface HttpResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** 与真实 fetch 同形：第二个参数可选，POST 类端点（如 Hyperliquid 的 /info）需要它。 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

/** 衍生品快照：现货源只给 symbol；永续源（Binance USDⓈ-M / Hyperliquid）填得更多。 */
export interface DerivativesSnapshot {
  symbol: string;
  /** 数据来源标识（如 "hyperliquid"）；Binance 现货不填。 */
  source?: string;
  /** 结算间隔（小时）：Binance 多见 8，Hyperliquid 为 1。 */
  fundingIntervalHours?: number;
  /** 当前资金费率（小数，如 0.0000125）。 */
  funding?: number;
  /** 资金费中的溢价分量（Hyperliquid 提供）。 */
  premium?: number;
  openInterest?: number;
  markPrice?: number;
  /** 预言机价格（Hyperliquid 验证者发布的 CEX 加权中位数）。 */
  oraclePrice?: number;
  midPrice?: number;
  /** 冲击价：吃下 2 万美元后的实际均价，双边 [买, 卖]。 */
  impactPrices?: [number, number];
  /** 24h 名义成交额与基础资产成交量。 */
  dayNotionalVolume?: number;
  dayBaseVolume?: number;
  prevDayPrice?: number;
  /** 跨场所预测资金费（Hyperliquid 独有）。 */
  predictedFunding?: Array<{ venue: string; fundingRate: number; nextFundingTime: number }>;
}

/** 取数回执：谁给的、有没有被保留窗口截断。 */
export interface CandleBatch {
  source: string;
  candles: Candle[];
  /** 该源按周期保留的 K 线上限；缺省表示无硬上限（如 Binance 可翻页）。 */
  retentionLimit?: number;
  /** 请求的窗口是否有一部分超出了保留范围。 */
  truncated: boolean;
  /** 超出保留范围时的可读说明，直接给模型看。 */
  note?: string;
}

/** 行情数据源接口——本项目唯一的外部 I/O 边界（缝 2）。 */
export interface MarketDataProvider {
  fetchCandles(
    symbol: string,
    interval: string,
    options?: { limit?: number; endTime?: number },
  ): Promise<Candle[]>;
  fetchDerivatives(symbol: string): Promise<DerivativesSnapshot>;
  /**
   * 可选：带来源与保留信息的取数。实现它的源（如 Hyperliquid 的 5000 根上限）
   * 让上层能诚实说明"这段历史拿不到"；不实现的源（Binance 可翻页）按无上限处理。
   */
  fetchCandleBatch?(
    symbol: string,
    interval: string,
    options?: { limit?: number; endTime?: number },
  ): Promise<CandleBatch>;
}
