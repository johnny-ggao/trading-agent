/**
 * `trading_chart` 的响应契约：schema 与 payload/blocks 同住一处（架构候选 1）。
 *
 * 这个工具的 payload 比较特殊：成功时是**锚点 + chartSpec**，失败时只有
 * `{ ok:false, reason, hint }`（入参不合法时没有图可展示）。
 */
import type { JsonSchema, SchemaValue, TextBlock } from "./contract";

export const CHART_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    reason: { type: "string" },
    hint: { type: "string" },
    symbol: { type: "string" },
    interval: { type: "string" },
    bars: { type: "number" },
    formingBars: { type: "number" },
    lastClose: { type: "number" },
    lastClosedBar: { type: "number" },
    context: { type: "json" },
    resonance: { type: "json" },
    chartSpec: { type: "json" },
  },
} satisfies JsonSchema;

export type ChartToolValue = SchemaValue<typeof CHART_OUTPUT_SCHEMA>;

/** payload → 文本块。 */
export function chartBlocks(value: ChartToolValue): TextBlock[] {
  if (value.ok === false) {
    return [{
      type: "text",
      text: `出图失败（${String(value.reason ?? "invalid_args")}）：${String(value.hint ?? "")}`,
    }];
  }
  return [
    {
      type: "text",
      text: `已渲染 ${String(value.symbol)} / ${String(value.interval)} 的 ${String(value.bars)} 根 K 线（Binance 现货），`
        + `已收盘到 bar ${String(value.lastClosedBar ?? "?")}，最新收盘价 ${String(value.lastClose)}。`,
    },
    { type: "text", text: `市场状态（机械事实，非结论）：${JSON.stringify(value.context)}` },
    ...(value.resonance === undefined
      ? []
      : [{ type: "text" as const, text: `周期比较（机械事实）：${JSON.stringify(value.resonance)}` }]),
    { type: "text", text: String(value.hint) },
  ];
}

/** 失败时没有图可展示；契约要求 JsonValue，回空对象而不是 undefined。 */
export function chartPresentationMeta(value: ChartToolValue): NonNullable<ChartToolValue["chartSpec"]> {
  return (value.chartSpec ?? {}) as NonNullable<ChartToolValue["chartSpec"]>;
}