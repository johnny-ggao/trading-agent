import { defineTool } from "@deepseek-ai/dsh-tools";
import { TOOL_NAME } from "./shared/tool";
import type { Candle, ChartSpec } from "./shared/chartSpec";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Cordis 插件名。 */
export const name = "trading-agent";

/** 所需服务：工具注册表。 */
export const inject = ["tools"];

/** 宿主上下文的最小形状（避免耦合到完整 Cordis 类型）。 */
interface HostContext {
  tools: {
    register(tool: ReturnType<typeof defineTool>): unknown;
  };
}

/** 构造可复现的演示 K 线（工单 01 用假数据打通链路）。 */
function demoCandles(count: number): Candle[] {
  const start = 1_700_000_000;
  const out: Candle[] = [];
  let price = 30_000;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = open * (1 + Math.sin(i / 7) * 0.004 + 0.0007);
    out.push({
      time: start + i * 3600,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
    });
    price = close;
  }
  return out;
}

/** 固定 chartSpec：证明宿主↔客户端契约。 */
export const DEMO_SPEC: ChartSpec = {
  symbol: "BTCUSDT",
  interval: "1h",
  timeframes: ["15m", "1h", "4h", "1d"],
  panes: [{ id: "price", title: "价格" }],
  series: [{ id: "candles", type: "candlestick", pane: "price", data: demoCandles(120) }],
};

/** 注册 trading_chart 工具。 */
export function apply(ctx: HostContext): void {
  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description: "在对话中渲染一张加密行情 K 线图。返回图表规格，由客户端半边渲染。",
      parameters: {
        symbol: { type: "string", description: "交易对，例如 BTCUSDT。" },
        interval: { type: "string", description: "周期，例如 1h。" },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: { type: "string", required: true },
            interval: { type: "string", required: true },
            bars: { type: "number", required: true },
          },
        },
        render: (_args, value) => [
          { type: "text", text: `已渲染 ${value.symbol} / ${value.interval} 的 ${value.bars} 根 K 线。` },
        ],
        presentationMeta: () => DEMO_SPEC as unknown as Json,
      },
      execute: async () => ({
        symbol: DEMO_SPEC.symbol,
        interval: DEMO_SPEC.interval,
        bars: DEMO_SPEC.series[0]!.data.length,
      }),
    }),
  );
}
