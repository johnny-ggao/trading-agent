import type { ChartSpec } from "../shared/chartSpec";

/** 图卡上可逐个开关的指标。 */
export type ToggleId = "bollinger" | "kdj" | "atr" | "rsi";

/** 打开 RSI 时使用的默认周期。 */
export const DEFAULT_RSI_PERIOD = 14;

/** 图卡控件回传的完整目标状态（对应宿主端点的查询参数）。 */
export interface ControlTarget {
  symbol: string;
  interval: string;
  ma: number[];
  rsi: number | null;
  bollinger: boolean;
  kdj: boolean;
  atr: boolean;
  /** 图面价位设置：原样带上，否则点任一开关重拉时会丢掉模型挑的价位线。 */
  levelsPerSide?: number;
  levelKinds?: string[];
  levels?: string[];
}

/** 一次控件变更：换周期或开关某个指标。 */
export type ControlChange =
  | { kind: "interval"; interval: string }
  | { kind: "toggle"; id: ToggleId; on: boolean };

/** 从 chartSpec 取当前目标状态；controls 缺省时回落到主流默认。 */
export function currentTarget(spec: ChartSpec): ControlTarget {
  const controls = spec.controls;
  return {
    symbol: spec.symbol,
    interval: spec.interval,
    ma: controls?.ma ?? [20, 50, 200],
    rsi: controls?.rsi ?? null,
    bollinger: controls?.bollinger ?? false,
    kdj: controls?.kdj ?? false,
    atr: controls?.atr ?? false,
    ...(controls?.levelsPerSide === undefined ? {} : { levelsPerSide: controls.levelsPerSide }),
    ...(controls?.levelKinds === undefined ? {} : { levelKinds: controls.levelKinds }),
    ...(controls?.levels === undefined ? {} : { levels: controls.levels }),
  };
}

/** 应用一次变更，返回新的目标状态（纯函数）。 */
export function applyChange(target: ControlTarget, change: ControlChange): ControlTarget {
  if (change.kind === "interval") return { ...target, interval: change.interval };
  if (change.id === "rsi") {
    return { ...target, rsi: change.on ? target.rsi ?? DEFAULT_RSI_PERIOD : null };
  }
  if (change.id === "bollinger") return { ...target, bollinger: change.on };
  if (change.id === "kdj") return { ...target, kdj: change.on };
  return { ...target, atr: change.on };
}

/** 宿主端点路径；与宿主半边 src/index.ts 的 CHART_ROUTE 保持一致。 */
export const CHART_ENDPOINT = "/trading-agent/chart";

/** 把目标状态编码为端点查询串。 */
export function chartQuery(target: ControlTarget): string {
  const params = new URLSearchParams({
    symbol: target.symbol,
    interval: target.interval,
    ma: target.ma.join(","),
    bollinger: String(target.bollinger),
    kdj: String(target.kdj),
    atr: String(target.atr),
  });
  if (target.rsi !== null) params.set("rsi", String(target.rsi));
  if (target.levelsPerSide !== undefined) params.set("levelsPerSide", String(target.levelsPerSide));
  if (target.levelKinds !== undefined) params.set("levelKinds", target.levelKinds.join(","));
  // 显式价位原文用 `|` 分隔（每条内部含 `:`）。
  if (target.levels !== undefined) params.set("levels", target.levels.join("|"));
  return params.toString();
}

/** 最小响应形状，便于测试注入假 fetch。 */
export interface ChartFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ChartFetch = (url: string) => Promise<ChartFetchResponse>;

const defaultFetch: ChartFetch = (url) => fetch(url);

/**
 * 向宿主端点要一份新的 chartSpec：控件点击后即时换图，
 * 不产生对话消息、不占模型回合。
 */
export async function fetchChartSpec(
  target: ControlTarget,
  fetchImpl: ChartFetch = defaultFetch,
): Promise<ChartSpec> {
  const response = await fetchImpl(`${CHART_ENDPOINT}?${chartQuery(target)}`);
  const body = (await response.json()) as { ok?: boolean; chartSpec?: ChartSpec; error?: string };
  if (!response.ok || body.ok !== true || body.chartSpec === undefined) {
    throw new Error(body.error ?? `chart endpoint http ${response.status}`);
  }
  return body.chartSpec;
}
