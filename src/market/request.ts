import type { ChartCandidates, MarketContext, RuleSignal, TimeframeResonance } from "../shared/analysis";
import type { Candle, ChartSpec, LinePoint, SeriesSpec } from "../shared/chartSpec";
import { barsForInterval, buildChartSpec, intervalToMs } from "./chart";
import { computeCandidates } from "./candidates";
import { allClosed, partitionCandles, type CandleClosure } from "./closedCandles";
import { computeMarketContext } from "./context";
import { computeIndicators } from "./indicators";
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

/** 规格里的 MarketView：图表 + 机械候选/信号 + 市场状态 + 多周期共振。 */
export interface MarketView extends LoadedChart {
  context: MarketContext;
  /**
   * 多周期共振：**按需取**，不在出图时无条件计算（ADR-0008 的延伸）。
   * 模型的共振来自 `trading_chart(compareTo)`；Jev 的证据来自 `trading_confidence(compareTo)`
   * ——两者用同一个周期对，因此必然同源。出图本身不再多取一次高周期 K 线。
   */
  resonance?: TimeframeResonance;
  /** 尾部形成中 K 线的根数：0 或 1；它们不参与任何机械判断。 */
  formingBars: number;
  /** 最后一根**已收盘** K 线的开盘时间（秒）；回答里引用数值时的锚点。 */
  lastClosedBar?: number;
  /** 本次取数的服务器时刻（毫秒），用于说明数据有多新。 */
  fetchedAt: number;
}

/** 需要「现在时刻」的调用点可注入它（测试用固定值复现收盘边界）。 */
export interface ClockOptions {
  now?: number;
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

/**
 * 截掉落在形成中 K 线上的指标点：形成中的那根只作为裸 K 线展示，
 * 不让它带出「看起来像定论」的指标数值。K 线序列本身不动——形成中的那根要留在图上。
 */
function dropFormingPoints(series: SeriesSpec[], closure: CandleClosure): SeriesSpec[] {
  if (closure.formingBars === 0 || closure.lastClosed === undefined) return series;
  const throughTime = closure.lastClosed.time;
  return series.map((item) => {
    if (item.type === "candlestick") return item;
    return { ...item, data: item.data.filter((point) => point.time <= throughTime) };
  });
}

/** 由已取到的 K 线组装 chartSpec 与机械层（不含市场状态）。 */
function assemble(resolved: ResolvedChartRequest, closure: CandleClosure): LoadedChart {
  const candles = closure.all;
  const baseSpec = buildChartSpec(
    resolveSymbol(resolved.symbol),
    resolved.interval,
    candles,
    resolved.indicators,
    closure.formingBars,
  );
  const spec: ChartSpec = { ...baseSpec, series: dropFormingPoints(baseSpec.series, closure) };
  // 机械层一律只用已收盘 K 线：结构、价位、规则信号都不许被未收盘的跳动触发。
  const closed = closure.closed;
  const closedIndicators = computeIndicators(closed, resolved.indicators);
  const candidates = computeCandidates(closed, seriesMaValues(closedIndicators));
  const ruleSignals = computeRuleSignals(closed, seriesSignalInputs(closedIndicators));
  const presentation = buildChartPresentation(candidates, ruleSignals);
  const withPresentation: ChartSpec = {
    ...spec,
    ...(presentation.markers.length > 0 ? { markers: presentation.markers } : {}),
    ...(presentation.levels.length > 0 ? { levels: presentation.levels } : {}),
    ...(presentation.notes.length > 0 ? { notes: presentation.notes } : {}),
  };
  return { spec: withPresentation, resolved, bars: candles.length, candidates, ruleSignals };
}

/** 只取当前周期的 K 线并构图（HTTP 端点用这条，避免多余的高周期取数）。 */
export async function loadChart(
  provider: MarketDataProvider,
  request: ChartRequest,
  options: ClockOptions = {},
): Promise<LoadedChart> {
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  return assemble(resolved, partitionCandles(candles, resolved.interval, options.now ?? Date.now()));
}

/** 完整 MarketView：当前周期图表 + 市场状态 + 高一级周期的共振（工具用这条）。 */
export async function buildMarketView(
  provider: MarketDataProvider,
  request: ChartRequest,
  options: ClockOptions = {},
): Promise<MarketView> {
  const now = options.now ?? Date.now();
  const resolved = resolveChartRequest(request);
  const limit = barsForInterval(resolved.interval, resolved.indicators);
  const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
  const closure = partitionCandles(candles, resolved.interval, now);
  const loaded = assemble(resolved, closure);

  const context = computeMarketContext(closure.closed, resolved.indicators);
  // 不再无条件取高周期：共振由 trading_chart(compareTo) / trading_confidence(compareTo) 按需取。
  return {
    ...loaded,
    context,
    formingBars: closure.formingBars,
    ...(closure.lastClosed === undefined ? {} : { lastClosedBar: closure.lastClosed.time }),
    fetchedAt: now,
  };
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
