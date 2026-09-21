import type { IncomingMessage, ServerResponse } from "node:http";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { TOOL_NAME } from "./shared/tool";
import { BinanceProvider } from "./market/binance";
import { describeIndicators } from "./market/intent";
import { buildMarketView, chartRequestFromQuery, loadChart } from "./market/request";
import { registerTradingChartSkill, type TradingChartSkill } from "./skill/tradingChart";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Cordis 插件名。 */
export const name = "trading-agent";

/** 所需服务：工具注册表与 skill 注册表。 */
export const inject = ["tools", "skills"];

interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

interface HostContext {
  tools: { register(tool: ReturnType<typeof defineTool>): unknown };
  skills: { register(skill: TradingChartSkill): unknown };
  /** Cordis 动态依赖：webServer 可用后才注册 HTTP 端点，非 web profile 不受影响。 */
  inject(deps: string[], callback: (ctx: { webServer: WebServerLike }) => void): unknown;
}

const provider = new BinanceProvider();

/** 图卡控件点按钮时请求的端点：直接返回一份新 chartSpec（不经过模型）。 */
const CHART_ROUTE = "/trading-agent/chart";

function chartRouteHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const { spec } = await loadChart(provider, chartRequestFromQuery(url.searchParams));
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok: true, chartSpec: spec }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  };
}

/** 注册随包 skill 与 trading_chart 工具（数据来自 Binance 现货；支持时间词与指标覆盖）。 */
export function apply(ctx: HostContext): void {
  registerTradingChartSkill(ctx.skills);
  ctx.inject(["webServer"], ({ webServer }) => {
    webServer.register({ kind: "exact", path: CHART_ROUTE, handler: chartRouteHandler() });
  });
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
            candidates: { type: "json", required: true },
            ruleSignals: { type: "json", required: true },
            context: { type: "json", required: true },
            resonance: { type: "json", required: true },
            chartSpec: { type: "json", required: true },
          },
        },
        render: (_args, value) => [
          {
            type: "text",
            text: `已渲染 ${value.symbol} / ${value.interval} 的 ${value.bars} 根 K 线（Binance 现货）；指标：${value.indicators}。`,
          },
          {
            type: "text",
            text: "机械数据（确定性计算，未作判断）："
              + JSON.stringify({
                candidates: value.candidates,
                ruleSignals: value.ruleSignals,
                context: value.context,
                resonance: value.resonance,
              }),
          },
        ],
        presentationMeta: (_args, value) => value.chartSpec,
      },
      execute: async (args) => {
        const { spec, resolved, bars, candidates, ruleSignals, context, resonance } = await buildMarketView(provider, {
          symbol: args.symbol,
          timeframe: args.timeframe,
          ma: args.ma,
          rsi: args.rsi,
          bollinger: args.bollinger,
          kdj: args.kdj,
          atr: args.atr,
        });
        return {
          symbol: spec.symbol,
          interval: resolved.interval,
          bars,
          indicators: describeIndicators(resolved.indicators),
          candidates: candidates as unknown as Json,
          ruleSignals: ruleSignals as unknown as Json,
          context: context as unknown as Json,
          resonance: resonance as unknown as Json,
          chartSpec: spec as unknown as Json,
        };
      },
    }),
  );
}
