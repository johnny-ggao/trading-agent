import { describe, it, expect } from "vitest";
import { failurePayload, payloadCoversSchema, type JsonSchema } from "./contract";

/** 一个最小的 schema 样本：覆盖成功与失败两种形状的键。 */
const schema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    symbol: { type: "string" },
    reason: { type: "string" },
    hint: { type: "string" },
  },
};

describe("工具契约的一致性校验（schema 与 payload 不许漂移）", () => {
  it("payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(schema, { ok: true, symbol: "BTCUSDT" })).not.toThrow();
  });

  it("payload 多出 schema 没有的键时抛错（这正是静默漂移的形态）", () => {
    expect(() => payloadCoversSchema(schema, { ok: true, extra: 1 })).toThrow(/extra/);
  });

  it("失败形状也受同一约束", () => {
    const payload = failurePayload("invalid_args", "改一下参数", 0, 0);
    expect(payload).toEqual({ ok: false, reason: "invalid_args", required: 0, available: 0, hint: "改一下参数" });
  });
});
