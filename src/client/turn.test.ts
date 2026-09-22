import { describe, it, expect } from "vitest";
import { TOOL_NAME } from "../shared/tool";
import type { ChartSpec } from "../shared/chartSpec";
import {
  AUTO_OPEN_INITIAL,
  autoOpenReducer,
  chartAddress,
  extractChartSpec,
  findChartSpec,
  isChartSpec,
  maxTurnOf,
  partialTurnOf,
  turnClosed,
  turnFromAddress,
  type ChatSnapshotLike,
} from "./turn";

const spec = (symbol: string): ChartSpec => ({
  symbol,
  interval: "1h",
  timeframes: ["15m", "1h", "4h", "1d"],
  panes: [{ id: "price" }],
  series: [{ id: "candles", type: "candlestick", pane: "price", data: [] }],
});

/** 用一组节点 key 构造最小快照；tool-call 的 meta 即 presentationMeta。 */
function snapshot(entries: Record<string, { kind: string; name?: string; meta?: unknown }>): ChatSnapshotLike {
  const nodes = new Map(Object.entries(entries).map(([key, value]) => [key, {
    kind: value.kind,
    data: { root: { call: value.name === undefined ? null : { name: value.name }, meta: value.meta } },
  }]));
  return {
    locations: { getTurn: () => Object.keys(entries) },
    nodes: { get: (key) => nodes.get(key) },
  };
}

/** 给快照补上时间线与流式状态。 */
function withTimeline(
  base: ChatSnapshotLike,
  turnOrder: number[],
  statuses: Record<number, string>,
  partialTurn?: number,
): ChatSnapshotLike {
  return {
    ...base,
    timeline: { turnOrder, turns: new Map(Object.entries(statuses).map(([k, v]) => [Number(k), { status: v }])) },
    legacy: { partial: partialTurn === undefined ? null : { turn: partialTurn } },
  };
}

describe("chartSpec 形状判别", () => {
  it("接受带 series 数组与 symbol 的对象", () => {
    expect(isChartSpec(spec("BTCUSDT"))).toBe(true);
  });

  it("拒绝缺字段或非对象", () => {
    expect(isChartSpec(undefined)).toBe(false);
    expect(isChartSpec(null)).toBe(false);
    expect(isChartSpec({ symbol: "BTCUSDT" })).toBe(false);
    expect(isChartSpec({ series: [] })).toBe(false);
  });
});

describe("从回合里找 trading_chart 的 chartSpec", () => {
  it("跳过非 tool-call 与别的工具，取 trading_chart 的 meta", () => {
    const snap = snapshot({
      a: { kind: "assistant-text" },
      b: { kind: "tool-call", name: "other_tool", meta: spec("ETHUSDT") },
      c: { kind: "tool-call", name: TOOL_NAME, meta: spec("BTCUSDT") },
    });
    expect(findChartSpec(snap, 1)?.symbol).toBe("BTCUSDT");
  });

  it("同一回合多次出图时取最后一次", () => {
    const snap = snapshot({
      a: { kind: "tool-call", name: TOOL_NAME, meta: spec("BTCUSDT") },
      b: { kind: "tool-call", name: TOOL_NAME, meta: spec("ETHUSDT") },
    });
    expect(findChartSpec(snap, 1)?.symbol).toBe("ETHUSDT");
  });

  it("没有回合号、没有图、或 meta 形状非法时返回 undefined", () => {
    expect(findChartSpec(snapshot({}), undefined)).toBeUndefined();
    const snap = snapshot({ a: { kind: "tool-call", name: TOOL_NAME, meta: { symbol: "BTCUSDT" } } });
    expect(findChartSpec(snap, 1)).toBeUndefined();
  });
});

describe("会话时间线读取", () => {
  it("取最大回合号、正在跑的回合、以及回合开关状态", () => {
    const snap = withTimeline(snapshot({}), [1, 2, 3], { 1: "closed", 2: "closed", 3: "open" }, 3);
    expect(maxTurnOf(snap)).toBe(3);
    expect(partialTurnOf(snap)).toBe(3);
    expect(turnClosed(snap, 2)).toBe(true);
    expect(turnClosed(snap, 3)).toBe(false);
  });

  it("没有时间线时都返回 undefined / false", () => {
    const bare = snapshot({});
    expect(maxTurnOf(bare)).toBeUndefined();
    expect(partialTurnOf(bare)).toBeUndefined();
    expect(turnClosed(bare, 1)).toBe(false);
  });
});

describe("图表资源地址", () => {
  it("会话 + 回合构成稳定地址并可就地解析回去", () => {
    const address = chartAddress("session-abc", 3);
    expect(address).toBe("dsh-resource://trading-chart/session-abc/3");
    expect(turnFromAddress(address)).toBe(3);
  });

  it("会话 id 里的特殊字符被编码，解析仍正确", () => {
    const address = chartAddress("session/a b", 5);
    expect(address).not.toContain(" ");
    expect(turnFromAddress(address)).toBe(5);
  });

  it("不是本插件的地址时返回 undefined", () => {
    expect(turnFromAddress(undefined)).toBeUndefined();
    expect(turnFromAddress("dsh-resource://plan/x/3")).toBeUndefined();
    expect(turnFromAddress("dsh-resource://trading-chart/only-session")).toBeUndefined();
  });
});

describe("从侧栏 tab 的 params 里取 chartSpec", () => {
  it("取出 { spec }", () => {
    expect(extractChartSpec({ spec: spec("BTCUSDT") })?.symbol).toBe("BTCUSDT");
  });

  it("params 缺失或形状非法时返回 undefined", () => {
    expect(extractChartSpec(undefined)).toBeUndefined();
    expect(extractChartSpec(null)).toBeUndefined();
    expect(extractChartSpec({})).toBeUndefined();
    expect(extractChartSpec({ spec: { symbol: "BTCUSDT" } })).toBeUndefined();
  });
});

describe("自动打开状态机：只在看着回合跑完时产生目标", () => {
  it("刷新/切会话：一直是 idle，观察不到跳变，不产生目标", () => {
    const state = autoOpenReducer(AUTO_OPEN_INITIAL, { type: "observe", running: false, partialTurn: undefined, maxTurn: 7 });
    expect(state).toEqual(AUTO_OPEN_INITIAL);
    expect(state.targetTurn).toBeNull();
  });

  it("运行中记录正在跑的回合，结束时把它定为待打开目标", () => {
    const runningState = autoOpenReducer(AUTO_OPEN_INITIAL, { type: "observe", running: true, partialTurn: 3, maxTurn: 3 });
    expect(runningState).toEqual({ running: true, activeTurn: 3, targetTurn: null });
    const settled = autoOpenReducer(runningState, { type: "observe", running: false, partialTurn: undefined, maxTurn: 3 });
    expect(settled.targetTurn).toBe(3);
  });

  it("没有 partial 时用最大回合号兜底", () => {
    const runningState = autoOpenReducer(AUTO_OPEN_INITIAL, { type: "observe", running: true, partialTurn: undefined, maxTurn: 4 });
    const settled = autoOpenReducer(runningState, { type: "observe", running: false, partialTurn: undefined, maxTurn: 4 });
    expect(settled.targetTurn).toBe(4);
  });

  it("已结算后清除目标，且不因再次 observe(false) 而复现", () => {
    const withTarget = { running: false, activeTurn: 3, targetTurn: 3 };
    const cleared = autoOpenReducer(withTarget, { type: "settled" });
    expect(cleared.targetTurn).toBeNull();
    const again = autoOpenReducer(cleared, { type: "observe", running: false, partialTurn: undefined, maxTurn: 8 });
    expect(again).toBe(cleared);
  });

  it("连续两个回合各自产生一次目标", () => {
    let state = autoOpenReducer(AUTO_OPEN_INITIAL, { type: "observe", running: true, partialTurn: 1, maxTurn: 1 });
    state = autoOpenReducer(state, { type: "observe", running: false, partialTurn: undefined, maxTurn: 1 });
    expect(state.targetTurn).toBe(1);
    state = autoOpenReducer(state, { type: "settled" });
    state = autoOpenReducer(state, { type: "observe", running: true, partialTurn: 2, maxTurn: 2 });
    state = autoOpenReducer(state, { type: "observe", running: false, partialTurn: undefined, maxTurn: 2 });
    expect(state.targetTurn).toBe(2);
  });
});
