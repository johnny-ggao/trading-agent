import type { ChartCandidates, RuleSignal } from "../shared/analysis";
import type { Candle, ChartSpec, LinePoint, SeriesSpec } from "../shared/chartSpec";
import { barsForInterval, buildChartSpec } from "./chart";
import { computeCandidates } from "./candidates";
import { resolveChartRequest, type ChartRequest, type ResolvedChartRequest } from "./intent";
import { buildChartPresentation } from "./presentation";
import { computeRuleSignals, type SignalInputs } from "./signals";
import { resolveSymbol } from "./symbol";
import type { MarketDataProvider } from "./types";

/** 一次取数 + 构图 + 机械层的完整结果：spec 给渲染，其余给模型。 */
export interface LoadedChart {
  spec: ChartSpec;
  resolved: ResolvedChartRequest;
  bars: number;
  candidates: ChartCandidates;
  ruleSignals: RuleSignal[];
}

/** 从指标 series 里取各均线最后一根的值（按周期升序）。 */
export function seriesMaValues(series: SeriesSpec[]): Array<{ period: number; value: number }> {
  const values: Array<{ period: number; value: number }> = [];
  for (const item of series) {
    const match = /^ma(\d+)$/.exec(item.id);
    if (match === null) continue;
    const last = item.data[item.data.length - 1];
    if (last !== undefined && "value" in last && typeof last.value === "number") {
      values.push({ period: Number(match[1]), value: last.value });
    }
  }
  return values.sort((a, b) => a.period - b.period);
}

function linePoints(data: Array<Candle | LinePoint>): LinePoint[] {
  return data.filter((point): point is LinePoint => "value" in point);
}

/** 从指标 series 里取规则信号需要的输入：最短两条均线、MACD、RSI。 */
export function seriesSignalInputs(series: SeriesSpec[], lookback = 20): SignalInputs {
  const inputs: SignalInputs = { breakoutLookback: lookback };
  const maSeries = series
    .map((item) => {
      const match = /^ma(\d+)$/.exec(item.id);
      if (match === null) return undefined;
      return { period: Number(match[1]), points: linePoints(item.data) };
    })
    .filter((entry): entry is { period: number; points: LinePoint[] } => entry !== undefined)
    .sort((a, b) => a.period - b.period);
  if (maSeries.length >= 2) inputs.ma = { short: maSeries[0]!.points, long: maSeries[1]!.points };
  const dif = series.find((item) => item.id === "macd");
  const dea = series.find((item) => item.id === "macdSignal");
  if (dif !== undefined && dea !== undefined) {
    inputs.macd = { dif: linePoints(dif.data), dea: linePoints(dea.data) };
  }
  const rsi = series.find((item) => item.id.startsWith("rsi"));
  if (rsi !== undefined) inputs.rsi = linePoints(rsi.data);
  return inputs;
}

/** 把图表请求变成 chartSpec（宿主工具与 HTTP 端点共用同一条取数路径）。 */
export async function loadChart(provider: MarketDataProvider, request: ChartRequest): Promise<LoadedChart> {
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  const baseSpec = buildChartSpec(resolveSymbol(resolved.symbol), resolved.interval, candles, resolved.indicators);
  const candidates = computeCandidates(candles, seriesMaValues(baseSpec.series));
  const ruleSignals = computeRuleSignals(candles, seriesSignalInputs(baseSpec.series));
  const presentation = buildChartPresentation(candidates, ruleSignals);
  const spec: ChartSpec = {
    ...baseSpec,
    ...(presentation.markers.length > 0 ? { markers: presentation.markers } : {}),
    ...(presentation.levels.length > 0 ? { levels: presentation.levels } : {}),
    ...(presentation.notes.length > 0 ? { notes: presentation.notes } : {}),
  };
  return { spec, resolved, bars: candles.length, candidates, ruleSignals };
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
