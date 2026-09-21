import { defineTool } from "@deepseek-ai/dsh-tools";
import { TOOL_NAME } from "./shared/tool";
import { BinanceProvider } from "./market/binance";
import { resolveSymbol } from "./market/symbol";
import { barsForInterval, buildChartSpec } from "./market/chart";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Cordis 插件名。 */
export const name = "trading-agent";

/** 所需服务：工具注册表。 */
export const inject = ["tools"];

interface HostContext {
  tools: { register(tool: ReturnType<typeof defineTool>): unknown };
}

const provider = new BinanceProvider();

/** 注册 trading_chart 工具（数据来自 Binance 现货）。 */
export function apply(ctx: HostContext): void {
  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description: "在对话中渲染一张加密行情 K 线图。数据来自 Binance 现货，图表规格由客户端半边渲染。",
      parameters: {
        symbol: { type: "string", description: "交易对或币种，例如 BTC 或 BTCUSDT。" },
        interval: { type: "string", description: "周期，例如 1h、4h、1d。" },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: { type: "string", required: true },
            interval: { type: "string", required: true },
            bars: { type: "number", required: true },
            chartSpec: { type: "json", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `已渲染 ${value.symbol} / ${value.interval} 的 ${value.bars} 根 K 线（Binance 现货）。`,
          },
        ],
        presentationMeta: (_args, value) => value.chartSpec,
      },
      execute: async (args) => {
        const symbol = args.symbol !== undefined ? String(args.symbol) : "BTC";
        const interval = args.interval !== undefined ? String(args.interval) : "1h";
        const market = resolveSymbol(symbol);
        const candles = await provider.fetchCandles(symbol, interval, { limit: barsForInterval(interval) });
        const chartSpec = buildChartSpec(market, interval, candles);
        return {
          symbol: chartSpec.symbol,
          interval,
          bars: candles.length,
          chartSpec: chartSpec as unknown as Json,
        };
      },
    }),
  );
}
