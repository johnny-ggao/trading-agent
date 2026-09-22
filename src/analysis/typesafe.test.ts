import { describe, it, expect } from "vitest";
import type { Fetch } from "@typesafe-ai/sdk";
import {
  ConfidenceUnavailableError,
  DEFAULT_TYPESAFE_BASE_URL,
  TypeSafeConfidenceScorer,
} from "./typesafe";
import { SUPPORT_LEVELS, SUFFICIENCY_LEVELS, type ConfidenceEvidence, type ConfidenceThesis } from "./confidence";

const evidence: ConfidenceEvidence = {
  symbol: "BTCUSDT",
  interval: "1h",
  bars: 300,
  indicators: "MA20/50/200、成交量、MACD",
  lastPrice: 64200,
  context: {
    trend: { adx: 28, pdi: 30, mdi: 18, state: "trending", direction: "up" },
    volatility: { atr: 800, atrPct: 0.012, state: "normal" },
    volume: { ratio: 1.4, state: "high" },
    summary: "走势：趋势；波动：正常；量能：放量",
  },
  resonance: {
    higherInterval: "4h",
    higher: {
      trend: { adx: 30, pdi: 32, mdi: 16, state: "trending", direction: "up" },
      volatility: { atr: 900, atrPct: 0.014, state: "normal" },
      volume: { ratio: 1.2, state: "normal" },
      summary: "走势：趋势；波动：正常；量能：常态",
    },
    aligned: true,
    summary: "共振向上。",
  },
  levels: [{ kind: "support", price: 63900, label: "S", touches: 2 }],
  pivots: [{ time: 1, price: 64000, kind: "high" }],
  signals: [{ kind: "breakout-high", time: 11, price: 64200, direction: "bullish", label: "突破前高" }],
};

const thesis: ConfidenceThesis = { direction: "bullish", invalidation: "跌破 63000", rationale: "均线多头排列，突破前高" };

const okBody = {
  model: "jev-1.13.0",
  answers: {
    support: {
      type: "score",
      score: 2.4,
      confidence: 0.78,
      legend: { 0: SUPPORT_LEVELS[0], 1: SUPPORT_LEVELS[1], 2: SUPPORT_LEVELS[2], 3: SUPPORT_LEVELS[3], 4: SUPPORT_LEVELS[4] },
      probabilities: { 0: 0, 1: 0.1, 2: 0.7, 3: 0.2, 4: 0 },
    },
    data_sufficiency: {
      type: "score",
      score: 3,
      confidence: 1,
      legend: { 0: SUFFICIENCY_LEVELS[0], 1: SUFFICIENCY_LEVELS[1], 2: SUFFICIENCY_LEVELS[2], 3: SUFFICIENCY_LEVELS[3] },
      probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 },
    },
    direction_agreement: { type: "noul", noul: 0.82 },
  },
  usage: { input_tokens: 800, output_tokens: 40 },
};

describe("TypeSafeConfidenceScorer：走官方 SDK", () => {
  it("向 /v1/systemone 发 POST，带 Bearer key 与三个问题，并收敛为评估", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: Fetch = async (input, init) => {
      calls.push({ url: input, init });
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "content-type": "application/json" } });
    };
    const scorer = new TypeSafeConfidenceScorer({ apiKey: "secret-key", fetch: fetchImpl, retry: { maxRetries: 0 } });
    const assessment = await scorer.score(evidence, thesis);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${DEFAULT_TYPESAFE_BASE_URL}/v1/systemone`);
    expect(calls[0]!.init?.method).toBe("POST");
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-key");
    const body = JSON.parse(String(calls[0]!.init?.body)) as {
      state: { thesis: { direction: string } };
      questions: Record<string, { type: string }>;
      model: string;
    };
    expect(body.state.thesis.direction).toBe("bullish");
    expect(body.questions.support?.type).toBe("score");
    expect(body.questions.data_sufficiency?.type).toBe("score");
    expect(body.questions.direction_agreement?.type).toBe("noul");
    expect(body.model).toBe("jev-latest");

    expect(assessment.support.level).toBe(2);
    expect(assessment.confidence).toEqual({ value: 0.78, level: "高" });
    expect(assessment.agreement).toEqual({ yesProbability: 0.82 });
  });

  it("空 key 直接抛 credentials_missing", () => {
    expect(() => new TypeSafeConfidenceScorer({ apiKey: "  " })).toThrowError(ConfidenceUnavailableError);
    try {
      new TypeSafeConfidenceScorer({ apiKey: "" });
    } catch (error) {
      expect((error as ConfidenceUnavailableError).reason).toBe("credentials_missing");
    }
  });

  it("HTTP 非 2xx 映射成 http_error 且带状态码", async () => {
    const fetchImpl: Fetch = async () => new Response("unauthorized", { status: 401 });
    const scorer = new TypeSafeConfidenceScorer({ apiKey: "k", fetch: fetchImpl, retry: { maxRetries: 0 } });
    const error = await scorer.score(evidence, thesis).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfidenceUnavailableError);
    expect(error).toMatchObject({ reason: "http_error", status: 401 });
  });

  it("网络异常映射成 network_error", async () => {
    const fetchImpl: Fetch = async () => { throw new TypeError("fetch failed"); };
    const scorer = new TypeSafeConfidenceScorer({ apiKey: "k", fetch: fetchImpl, retry: { maxRetries: 0 } });
    const error = await scorer.score(evidence, thesis).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfidenceUnavailableError);
    expect((error as ConfidenceUnavailableError).reason).toBe("network_error");
  });

  it("响应体不合法时映射成可分类错误而不是抛出原始异常", async () => {
    const fetchImpl: Fetch = async () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } });
    const scorer = new TypeSafeConfidenceScorer({ apiKey: "k", fetch: fetchImpl, retry: { maxRetries: 0 } });
    const error = await scorer.score(evidence, thesis).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfidenceUnavailableError);
    expect(["invalid_response", "http_error", "network_error"]).toContain((error as ConfidenceUnavailableError).reason);
  });

  it("调用方取消时映射成 aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl: Fetch = async (_input, init) => {
      if (init?.signal?.aborted === true) throw init.signal.reason;
      return new Response(JSON.stringify(okBody), { status: 200, headers: { "content-type": "application/json" } });
    };
    const scorer = new TypeSafeConfidenceScorer({ apiKey: "k", fetch: fetchImpl, retry: { maxRetries: 0 } });
    const error = await scorer.score(evidence, thesis, controller.signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfidenceUnavailableError);
    expect((error as ConfidenceUnavailableError).reason).toBe("aborted");
  });
});
