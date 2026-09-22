/**
 * `trading_chart` 的最小锚点（ADR-0008）：出图之外只给"定位信息 + 最新价 + 机械市场状态"，
 * 让模型据此决定下一步要取什么，而不是被一整包预设指标牵着走。
 *
 * 机械候选、规则信号、多周期共振**不在**这里——它们按需经 `trading_indicator` /
 * `trading_levels` / （后续）`trading_derivatives` 取。
 */
import type { MarketView } from "./request";

/** 锚点内容：刻意保持小而易读。 */
export interface ChartAnchor {
  symbol: string;
  interval: string;
  bars: number;
  formingBars: number;
  /** 最后一根已收盘 K 线的收盘价。 */
  lastClose: number;
  /** 最后一根已收盘 K 线的开盘时间（秒）。 */
  lastClosedBar?: number;
  /** 本次取数的服务器时刻（毫秒）。 */
  fetchedAt: number;
  /** 市场状态的机械事实（不是结论）。 */
  context: {
    trend: { state: string; direction: string; adx: number | null };
    volatility: { state: string; atrPct: number | null };
    volume: { state: string; ratio: number | null };
  };
  /** 指路：需要更多数据时该调什么。 */
  hint: string;
}

const HINT =
  "这只是定位与市场状态；需要指标值时用 trading_indicator（可指定周期与参数，可再发一轮），"
  + "需要支撑阻力/斐波那契/枢轴时用 trading_levels。";

/** 由 MarketView 构造锚点。 */
export function buildAnchor(view: MarketView): ChartAnchor {
  return {
    symbol: view.spec.symbol,
    interval: view.spec.interval,
    bars: view.bars,
    formingBars: view.formingBars,
    lastClose: view.candidates.lastPrice,
    ...(view.lastClosedBar === undefined ? {} : { lastClosedBar: view.lastClosedBar }),
    fetchedAt: view.fetchedAt,
    context: {
      trend: {
        state: view.context.trend.state,
        direction: view.context.trend.direction,
        adx: view.context.trend.adx,
      },
      volatility: {
        state: view.context.volatility.state,
        atrPct: view.context.volatility.atrPct,
      },
      volume: {
        state: view.context.volume.state,
        ratio: view.context.volume.ratio,
      },
    },
    hint: HINT,
  };
}
