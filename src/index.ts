import type { IncomingMessage, ServerResponse } from "node:http";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { CONFIDENCE_TOOL_NAME, TOOL_NAME } from "./shared/tool";
import { BinanceProvider } from "./market/binance";
import { buildConfidenceEvidence, type ConfidenceDirection } from "./analysis/confidence";
import {
  ConfidenceUnavailableError,
  DEFAULT_TYPESAFE_BASE_URL,
  DEFAULT_TYPESAFE_MODEL,
  DEFAULT_TYPESAFE_TIMEOUT_MS,
  TypeSafeConfidenceScorer,
} from "./analysis/typesafe";
import { describeIndicators } from "./market/intent";
import { buildMarketView, chartRequestFromQuery, loadChart, type MarketView } from "./market/request";
import { resolveSymbol } from "./market/symbol";
import { resolveInterval } from "./market/timeframe";
import { registerTradingChartSkill, type TradingChartSkill } from "./skill/tradingChart";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Cordis 插件名。 */
export const name = "trading-agent";

/** 所需服务：工具注册表与 skill 注册表。 */
export const inject = ["tools", "skills"];

// ── 配置：TypeSafe API key 与阈值（在侧栏「插件」页本行的「配置」里改）──

export interface Config {
  /** TypeSafe API key；secret 字段，经 credentials 域存储。 */
  apiKey: string;
  /** 也可让宿主按这个环境变量名解析 key。 */
  apiKeyEnv: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
  /** Jev 置信度 >= 此值为「高」。 */
  highThreshold: number;
  /** Jev 置信度 >= 此值为「中」。 */
  mediumThreshold: number;
  /** trading_chart 的证据缓存有效期；超时后需重新出图。 */
  evidenceTtlMs: number;
}

export const Config = Schema.object({
  apiKey: Schema.string().role("secret").default(""),
  apiKeyEnv: Schema.string().role("credential-ref").default("TYPESAFE_API_KEY"),
  baseURL: Schema.string().default(DEFAULT_TYPESAFE_BASE_URL),
  model: Schema.string().default(DEFAULT_TYPESAFE_MODEL),
  timeoutMs: Schema.number().step(1).min(1000).default(DEFAULT_TYPESAFE_TIMEOUT_MS),
  highThreshold: Schema.number().min(0).max(1).default(0.7),
  mediumThreshold: Schema.number().min(0).max(1).default(0.4),
  evidenceTtlMs: Schema.number().step(1).min(0).default(300000),
});

interface SettingsSectionHooksLike {
  setSource(source: () => Config): void;
  onChange(): void;
}

interface SettingsServiceLike {
  installSection(owner: unknown, ns: string, schema: unknown, entry: unknown, hooks: SettingsSectionHooksLike): void;
}

interface CredentialProviderLike {
  resolve(ref: string): Promise<{ value?: string } | undefined>;
}

interface WebServerLike {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

interface InjectedContext {
  webServer?: WebServerLike;
  settings?: SettingsServiceLike;
}

interface HostContext {
  tools: { register(tool: ReturnType<typeof defineTool>): unknown };
  skills: { register(skill: TradingChartSkill): unknown };
  /** Cordis 动态依赖：可选服务缺失时插件照常工作。 */
  inject(deps: string[], callback: (ctx: InjectedContext) => void): unknown;
  /** Cordis 服务查询（credentials 等）。 */
  get?(name: string): unknown;
}

const provider = new BinanceProvider();

/** 图卡控件点按钮时请求的端点：直接返回一份新 chartSpec（不经过模型）。 */
const CHART_ROUTE = "/trading-agent/chart";

// ── 证据缓存：trading_chart 的出图结果供 trading_confidence 复用 ─────────────

interface CachedView {
  readonly view: MarketView;
  readonly indicators: string;
  readonly at: number;
}

const viewCache = new Map<string, CachedView>();

function viewCacheKey(symbol: string, interval: string): string {
  return `${symbol}|${interval}`;
}

/** 解析 TypeSafe API key：设置里的字面值 → credentials 服务（env 名）→ 进程环境变量。 */
async function resolveTypesafeKey(ctx: HostContext, config: Config): Promise<string | undefined> {
  const literal = config.apiKey.trim();
  if (literal !== "") return literal;
  const ref = config.apiKeyEnv.trim() === "" ? "TYPESAFE_API_KEY" : config.apiKeyEnv.trim();
  const credentials = ctx.get?.("credentials") as CredentialProviderLike | undefined;
  if (credentials !== undefined && typeof credentials.resolve === "function") {
    try {
      const resolved = await credentials.resolve(ref);
      const value = resolved?.value;
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    } catch {
      // 凭据解析失败时回落到环境变量。
    }
  }
  const ambient = process.env[ref];
  return ambient !== undefined && ambient.trim() !== "" ? ambient.trim() : undefined;
}

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

/**
 * 注册随包 skill、trading_chart 工具、trading_confidence 工具与换图端点。
 * 插件配置（TypeSafe key 等）在「设置 → 插件 → trading-agent」里编辑。
 */
export function apply(ctx: HostContext, config: Config): void {
  let current: () => Config = () => config;
  ctx.inject(["settings"], (settingsCtx) => {
    if (settingsCtx.settings === undefined) return;
    settingsCtx.settings.installSection(ctx, "trading-agent", Config, config, {
      setSource: (source) => {
        current = source;
      },
      onChange: () => {},
    });
  });

  registerTradingChartSkill(ctx.skills);

  ctx.inject(["webServer"], ({ webServer }) => {
    if (webServer === undefined) return;
    webServer.register({ kind: "exact", path: CHART_ROUTE, handler: chartRouteHandler() });
  });

  ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        "画一张加密行情技术分析图，并自动在右侧栏的行情图 tab 中打开。数据来自 Binance 现货。"
        + "周期可传 15m/1h/4h/1d 或时间词（今天/这周/这月/短线）；可覆盖均线周期（ma），"
        + "RSI 默认关闭（传 rsi 周期即显示），布林带/KDJ/ATR 也按需开启。"
        + "出图后如需校准置信度，再调用 trading_confidence。",
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
        const view = await buildMarketView(provider, {
          symbol: args.symbol,
          timeframe: args.timeframe,
          ma: args.ma,
          rsi: args.rsi,
          bollinger: args.bollinger,
          kdj: args.kdj,
          atr: args.atr,
        });
        viewCache.set(viewCacheKey(view.spec.symbol, view.spec.interval), {
          view,
          indicators: describeIndicators(view.resolved.indicators),
          at: Date.now(),
        });
        return {
          symbol: view.spec.symbol,
          interval: view.resolved.interval,
          bars: view.bars,
          indicators: describeIndicators(view.resolved.indicators),
          candidates: view.candidates as unknown as Json,
          ruleSignals: view.ruleSignals as unknown as Json,
          context: view.context as unknown as Json,
          resonance: view.resonance as unknown as Json,
          chartSpec: view.spec as unknown as Json,
        };
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: CONFIDENCE_TOOL_NAME,
      description:
        "用 TypeSafe Jev 校准一个方向性结论的置信度：传入方向、失效位与结论理由，"
        + "宿主把 trading_chart 的机械证据与结论一起交给 Jev，返回支持度（含概率分布）、"
        + "校准置信度（0..1 与 高/中/低）与证据充分度。需要先对同一 symbol/interval 调用 trading_chart；"
        + "未配置 TypeSafe API key 或调用失败时返回 ok=false，此时按你自己的判断给置信度并声明未校准。",
      parameters: {
        symbol: { type: "string", required: true, description: "与 trading_chart 一致的交易对或币种。" },
        interval: { type: "string", required: true, description: "结论对应的周期：15m/1h/4h/1d。" },
        direction: { type: "string", required: true, description: "方向：bullish / bearish / range / unclear。" },
        invalidation: { type: "string", required: true, description: "失效位（价位或条件），例如「跌破 63000」。" },
        thesis: { type: "string", required: true, description: "你的方向性结论与理由（会发给 Jev 评分）。" },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean", required: true },
            symbol: { type: "string" },
            interval: { type: "string" },
            direction: { type: "string" },
            support: { type: "json" },
            confidence: { type: "json" },
            sufficiency: { type: "json" },
            agreement: { type: "json" },
            model: { type: "string" },
            reason: { type: "string" },
            hint: { type: "string" },
          },
        },
        render: (_args, value) => {
          if (value.ok !== true) {
            return [{
              type: "text",
              text: `未完成置信度校准（${String(value.reason ?? "unknown")}）。${String(value.hint ?? "")}`,
            }];
          }
          const support = value.support as { score?: number; label?: string; probabilities?: unknown } | undefined;
          const confidence = value.confidence as { value?: number; level?: string } | undefined;
          const sufficiency = value.sufficiency as { score?: number } | null | undefined;
          const text = `Jev 校准：支持度 ${support?.score ?? "?"}/4（${support?.label ?? "?"}）；`
            + `置信度 ${confidence?.value ?? "?"}（${confidence?.level ?? "?"}）`
            + `${sufficiency === undefined || sufficiency === null ? "" : `；证据充分度 ${sufficiency.score ?? "?"}`}。`
            + `模型 ${String(value.model ?? "?")}。`;
          const blocks = [{ type: "text" as const, text }];
          if (support?.probabilities !== undefined) {
            blocks.push({ type: "text" as const, text: `支持度概率分布：${JSON.stringify(support.probabilities)}` });
          }
          return blocks;
        },
      },
      execute: async (args, exec) => {
        const symbol = resolveSymbol(args.symbol);
        const interval = resolveInterval(args.interval);
        const cfg = current();
        const cached = viewCache.get(viewCacheKey(symbol, interval));
        if (cached === undefined || Date.now() - cached.at > cfg.evidenceTtlMs) {
          return {
            ok: false,
            symbol,
            interval,
            reason: "evidence_unavailable",
            hint: "先对同一 symbol/interval 调用 trading_chart，再用它的结果调用 trading_confidence。",
          };
        }
        const apiKey = await resolveTypesafeKey(ctx, cfg);
        if (apiKey === undefined) {
          return {
            ok: false,
            symbol,
            interval,
            reason: "credentials_missing",
            hint: "在侧栏「插件」页 → 已安装 → dsh-trading-agent → trading-agent 行的「配置」里填入 TypeSafe API key 后重试；未配置时请按自己的判断给出置信度并声明未校准。",
          };
        }
        const evidence = buildConfidenceEvidence({
          symbol,
          interval,
          bars: cached.view.bars,
          indicators: cached.indicators,
          context: cached.view.context,
          resonance: cached.view.resonance,
          candidates: cached.view.candidates,
          ruleSignals: cached.view.ruleSignals,
        });
        const thesis = {
          direction: args.direction as ConfidenceDirection,
          invalidation: args.invalidation,
          rationale: args.thesis,
        };
        try {
          const scorer = new TypeSafeConfidenceScorer({
            apiKey,
            baseURL: cfg.baseURL,
            model: cfg.model,
            timeoutMs: cfg.timeoutMs,
            thresholds: { highThreshold: cfg.highThreshold, mediumThreshold: cfg.mediumThreshold },
          });
          const assessment = await scorer.score(evidence, thesis, exec.signal);
          return {
            ok: true,
            symbol,
            interval,
            direction: thesis.direction,
            support: assessment.support as unknown as Json,
            confidence: assessment.confidence as unknown as Json,
            sufficiency: (assessment.sufficiency ?? null) as unknown as Json,
            agreement: (assessment.agreement ?? null) as unknown as Json,
            model: assessment.model,
          };
        } catch (error) {
          return {
            ok: false,
            symbol,
            interval,
            reason: error instanceof ConfidenceUnavailableError ? error.reason : "network_error",
            hint: "校准服务暂时不可用；请按你自己的判断给出置信度，并声明本次未经校准。",
          };
        }
      },
    }),
  );
}
