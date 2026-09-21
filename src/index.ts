import { defineTool } from "@deepseek-ai/dsh-tools";
import { TOOL_NAME } from "./shared/tool";
import { BinanceProvider } from "./market/binance";
import { resolveSymbol } from "./market/symbol";
import { barsForInterval, buildChartSpec } from "./market/chart";
import { describeIndicators, resolveChartRequest } from "./market/intent";

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

/** 注册 trading_chart 工具（数据来自 Binance 现货；支持时间词与指标覆盖）。 */
export function apply(ctx: HostContext): void {
  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        "画一张加密行情技术分析图并渲染到对话中。数据来自 Binance 现货。"
        + "周期可传 15m/1h/4h/1d 或时间词（今天/这周/这月/短线）；可覆盖均线周期（ma），"
        + "RSI 默认关闭（传 rsi 周期即显示），布林带/KDJ/ATR 也按需开启。",
      parameters: {
        symbol: { type: "string", description: "交易对或币种，例如 BTC 或 BTCUSDT。" },
        timeframe: { type: "string", description: "周期或时间词：15m/1h/4h/1d，或 今天/这周/这月/短线。" },
        ma: { type: "array", items: { type: "number" }, description: "均线周期覆盖，例如 [50, 200]。" },
        rsi: { type: "number", description: "RSI 周期；传值即显示 RSI（如 14），不传则不显示。" },
        bollinger: { type: "boolean", description: "是否叠加布林带（默认关闭）。" },
        kdj: { type: "boolean", description: "是否显示 KDJ 副图（默认关闭）。" },
        atr: { type: "boolean", description: "是否显示 ATR 副图（默认关闭）。" },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            symbol: { type: "string", required: true },
            interval: { type: "string", required: true },
            bars: { type: "number", required: true },
            indicators: { type: "string", required: true },
            chartSpec: { type: "json", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `已渲染 ${value.symbol} / ${value.interval} 的 ${value.bars} 根 K 线（Binance 现货）；指标：${value.indicators}。`,
          },
        ],
        presentationMeta: (_args, value) => value.chartSpec,
      },
      execute: async (args) => {
        const resolved = resolveChartRequest({
          symbol: args.symbol,
          timeframe: args.timeframe,
          ma: args.ma,
          rsi: args.rsi,
          bollinger: args.bollinger,
          kdj: args.kdj,
          atr: args.atr,
        });
        const market = resolveSymbol(resolved.symbol);
        const limit = barsForInterval(resolved.interval, resolved.indicators);
        const candles = await provider.fetchCandles(resolved.symbol, resolved.interval, { limit });
        const chartSpec = buildChartSpec(market, resolved.interval, candles, resolved.indicators);
        return {
          symbol: chartSpec.symbol,
          interval: resolved.interval,
          bars: candles.length,
          indicators: describeIndicators(resolved.indicators),
          chartSpec: chartSpec as unknown as Json,
        };
      },
    }),
  );
}
