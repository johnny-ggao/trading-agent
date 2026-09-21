import type { ChartSpec } from "../shared/chartSpec";
import { barsForInterval, buildChartSpec } from "./chart";
import { resolveChartRequest, type ChartRequest, type ResolvedChartRequest } from "./intent";
import { resolveSymbol } from "./symbol";
import type { MarketDataProvider } from "./types";

/** 一次取数 + 构图的完整结果：spec 给渲染，其余给文字声明。 */
export interface LoadedChart {
  spec: ChartSpec;
  resolved: ResolvedChartRequest;
  bars: number;
}

/** 把图表请求变成 chartSpec（宿主工具与 HTTP 端点共用同一条取数路径）。 */
export async function loadChart(provider: MarketDataProvider, request: ChartRequest): Promise<LoadedChart> {
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  const spec = buildChartSpec(resolveSymbol(resolved.symbol), resolved.interval, candles, resolved.indicators);
  return { spec, resolved, bars: candles.length };
}

/** 图卡控件把目标状态放在 URL 查询串里；缺省字段留给默认填充。 */
export function chartRequestFromQuery(query: URLSearchParams): ChartRequest {
  return {
    symbol: query.get("symbol") ?? undefined,
    timeframe: query.get("timeframe") ?? query.get("interval") ?? undefined,
    ma: parseNumberList(query.get("ma")),
    rsi: parseNumber(query.get("rsi")),
    bollinger: query.get("bollinger") === "true",
    kdj: query.get("kdj") === "true",
    atr: query.get("atr") === "true",
  };
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNumberList(value: string | null): number[] | undefined {
  if (value === null || value.trim() === "") return undefined;
  const list = value.split(",").map((part) => Number(part.trim())).filter((n) => Number.isFinite(n));
  return list.length > 0 ? list : undefined;
}
