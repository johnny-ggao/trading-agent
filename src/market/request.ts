import type { ChartCandidates, MarketContext, RuleSignal, TimeframeResonance } from "../shared/analysis";
import type { Candle, ChartSpec, LinePoint, SeriesSpec } from "../shared/chartSpec";
import { barsForInterval, buildChartSpec } from "./chart";
import { computeCandidates } from "./candidates";
import { computeMarketContext } from "./context";
import { resolveChartRequest, type ChartRequest, type ResolvedChartRequest } from "./intent";
import { computeResonance, higherInterval } from "./multiTimeframe";
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

/** 规格里的 MarketView：图表 + 机械候选/信号 + 市场状态 + 多周期共振。 */
export interface MarketView extends LoadedChart {
  context: MarketContext;
  resonance: TimeframeResonance;
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

/** 由已取到的 K 线组装 chartSpec 与机械层（不含市场状态）。 */
function assemble(resolved: ResolvedChartRequest, candles: Candle[]): LoadedChart {
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

/** 只取当前周期的 K 线并构图（HTTP 端点用这条，避免多余的高周期取数）。 */
export async function loadChart(provider: MarketDataProvider, request: ChartRequest): Promise<LoadedChart> {
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  return assemble(resolved, candles);
}

/** 完整 MarketView：当前周期图表 + 市场状态 + 高一级周期的共振（工具用这条）。 */
export async function buildMarketView(provider: MarketDataProvider, request: ChartRequest): Promise<MarketView> {
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  const loaded = assemble(resolved, candles);

  const context = computeMarketContext(candles, resolved.indicators);
  const higher = higherInterval(resolved.interval);
  const higherCandles = await provider.fetchCandles(resolved.symbol, higher, {
    limit: barsForInterval(higher, resolved.indicators),
  });
  const resonance = computeResonance(higher, computeMarketContext(higherCandles, resolved.indicators), context);
  return { ...loaded, context, resonance };
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
