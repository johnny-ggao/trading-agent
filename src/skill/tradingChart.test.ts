import { describe, it, expect, vi } from "vitest";
import { SKILL_NAME, tradingChartSkill, registerTradingChartSkill } from "./tradingChart";

describe("随包 skill：trading-chart", () => {
  it("用 kebab-case 名称", () => {
    expect(SKILL_NAME).toBe("trading-chart");
    expect(SKILL_NAME).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("描述自带触发分支（模型唯一能看到的指针）", () => {
    const description = tradingChartSkill.description;
    expect(description).toContain("加密");
    expect(description).toContain("走势");
    expect(description.length).toBeGreaterThan(20);
  });

  it("默认对模型与用户都可见", () => {
    expect(tradingChartSkill.invocation).toEqual({ modelInvocable: true, userInvocable: true });
  });

  it("由宿主注册进 skills 服务，并原样返回其 disposer", () => {
    const register = vi.fn(() => "disposed");
    const result = registerTradingChartSkill({ register });
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(tradingChartSkill);
    expect(result).toBe("disposed");
  });
});

describe("skill 正文教模型怎么用 trading_chart", () => {
  const body = tradingChartSkill.content;

  it("点名工具与全部参数", () => {
    expect(body).toContain("trading_chart");
    for (const parameter of ["symbol", "timeframe", "ma", "rsi", "bollinger", "kdj", "atr"]) {
      expect(body).toContain(parameter);
    }
  });

  it("给出时间词到主周期的映射", () => {
    expect(body).toContain("今天 → 1h");
    expect(body).toContain("这周 → 4h");
    expect(body).toContain("这月 → 1d");
    expect(body).toContain("短线 → 15m");
  });

  it("说明默认值与 RSI 默认关闭", () => {
    expect(body).toContain("MA20/50/200");
    expect(body).toContain("RSI 默认关闭");
    expect(body).toContain("默认 1h");
  });

  it("要求回答里声明所用默认", () => {
    expect(body).toContain("声明");
  });
});
