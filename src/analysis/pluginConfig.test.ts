import { describe, it, expect } from "vitest";
import { normalizeAnalysisConfig } from "./pluginConfig";
import { DEFAULT_TYPESAFE_BASE_URL, DEFAULT_TYPESAFE_MODEL, DEFAULT_TYPESAFE_TIMEOUT_MS } from "./typesafe";

describe("插件配置的空值兜底（DSH 传 {} 时不得抛错）", () => {
  it("空配置得到全部默认值", () => {
    const config = normalizeAnalysisConfig({});
    expect(config).toEqual({
      apiKey: "",
      apiKeyEnv: "TYPESAFE_API_KEY",
      baseURL: DEFAULT_TYPESAFE_BASE_URL,
      model: DEFAULT_TYPESAFE_MODEL,
      timeoutMs: DEFAULT_TYPESAFE_TIMEOUT_MS,
      highThreshold: 0.7,
      mediumThreshold: 0.4,
      evidenceTtlMs: 300000,
    });
  });

  it("undefined 也不抛错", () => {
    expect(() => normalizeAnalysisConfig(undefined)).not.toThrow();
    expect(normalizeAnalysisConfig(undefined).apiKeyEnv).toBe("TYPESAFE_API_KEY");
  });

  it("部分配置与显式空串都能兜住", () => {
    const config = normalizeAnalysisConfig({ baseURL: "  ", apiKey: undefined, apiKeyEnv: "", timeoutMs: 0 });
    expect(config.baseURL).toBe(DEFAULT_TYPESAFE_BASE_URL);
    expect(config.apiKeyEnv).toBe("TYPESAFE_API_KEY");
    expect(config.timeoutMs).toBe(DEFAULT_TYPESAFE_TIMEOUT_MS);
  });

  it("用户给出的值原样保留（含空白裁剪）", () => {
    const config = normalizeAnalysisConfig({
      apiKey: "  sk-test  ", apiKeyEnv: " MY_KEY ", baseURL: "https://example.test", model: "m1",
      timeoutMs: 1234, highThreshold: 0.9, mediumThreshold: 0.2, evidenceTtlMs: 60_000,
    });
    expect(config.apiKey).toBe("sk-test");
    expect(config.apiKeyEnv).toBe("MY_KEY");
    expect(config.baseURL).toBe("https://example.test");
    expect(config.model).toBe("m1");
    expect(config.timeoutMs).toBe(1234);
    expect(config.highThreshold).toBe(0.9);
    expect(config.mediumThreshold).toBe(0.2);
    expect(config.evidenceTtlMs).toBe(60_000);
  });

  it("阈值越界时回落到默认（不让 0 或 1 之外的分数把分档搞乱）", () => {
    const config = normalizeAnalysisConfig({ highThreshold: 5, mediumThreshold: -1 });
    expect(config.highThreshold).toBe(0.7);
    expect(config.mediumThreshold).toBe(0.4);
  });
});
