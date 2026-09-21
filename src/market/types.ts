import type { Candle } from "../shared/chartSpec";

export type { Candle };

/** 最小 HTTP 响应形状，便于测试注入假 fetch。 */
export interface HttpResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<HttpResponseLike>;

/** 衍生品快照（现货返回空；永续在工单 08 接入）。 */
export interface DerivativesSnapshot {
  symbol: string;
  funding?: number;
  openInterest?: number;
  markPrice?: number;
}

/** 行情数据源接口——本项目唯一的外部 I/O 边界（缝 2）。 */
export interface MarketDataProvider {
  fetchCandles(
    symbol: string,
    interval: string,
    options?: { limit?: number; endTime?: number },
  ): Promise<Candle[]>;
  fetchDerivatives(symbol: string): Promise<DerivativesSnapshot>;
}
