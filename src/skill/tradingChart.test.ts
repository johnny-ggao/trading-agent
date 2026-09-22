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

  it("教模型用锚点里的市场状态（多周期共振已随 ADR-0008 移出锚点）", () => {
    expect(body).toContain("市场状态");
    expect(body).toContain("context");
  });

  it("指标推荐只作文本、不改图", () => {
    expect(body).toContain("指标推荐");
    expect(body).toContain("不要改动图表");
  });
});

describe("skill 正文的分层契约与不构成建议", () => {
  const body = tradingChartSkill.content;

  it("给出三层产出的显式顺序与各层职责", () => {
    expect(body).toContain("规则信号（机械） → 结构/形态判断（模型） → 综合结论（模型）");
    for (const layer of ["规则信号", "结构/形态判断", "综合结论"]) {
      expect(body).toContain(layer);
    }
  });

  it("要求结构/形态判断指出依据，依据不足就说不足以判定", () => {
    expect(body).toContain("依据");
    expect(body).toContain("不足以判定");
  });

  it("要求结论三件套齐全", () => {
    expect(body).toContain("方向 + 失效位 + 置信度");
  });

  it("规定判定只用已收盘 K 线", () => {
    expect(body).toContain("已收盘 K 线");
    expect(body).toContain("形成中");
  });

  it("明确不给交易建议，并列出禁止项与允许项", () => {
    for (const banned of ["入场价", "止损止盈", "目标价", "仓位", "杠杆", "收益承诺"]) {
      expect(body).toContain(banned);
    }
    expect(body).toContain("不提供交易建议");
    expect(body).toContain("不构成投资建议");
  });

  it("失效位按「判读不成立」表述，而不是止损位", () => {
    expect(body).toContain("不成立");
    expect(body).toContain("不要写成");
  });

  it("说明图上只有 K 线/均线/支撑阻力，其余不上图", () => {
    expect(body).toContain("K 线 + 均线");
    expect(body).toContain("斐波那契回撤");
    expect(body).toContain("枢轴点");
    expect(body).toContain("规则信号箭头");
    expect(body).toContain("不要说");
  });
});

describe("skill v3：按需取数的引导词", () => {
  const body = tradingChartSkill.content;

  it("给出调用顺序，且指明先出图拿锚点", () => {
    expect(body).toContain("trading_indicator");
    expect(body).toContain("trading_levels");
    expect(body).toContain("调用顺序");
    expect(body).toMatch(/1\. `trading_chart`/);
  });

  it("指标清单列出精确 id 与参数，并警告拼错会失败", () => {
    for (const id of ["ma:50", "ema:20", "rsi:14", "macd", "mfi:14", "bollinger:20/2", "atr:14", "supertrend:10/3", "adx:14", "vwma:20", "obv"]) {
      expect(body).toContain(id);
    }
    expect(body).toContain("拼错会调用失败");
  });

  it("说明每轮 ≤8 项且互补，并指出这是单轮上限", () => {
    expect(body).toContain("不超过 8 项");
    expect(body).toContain("单轮上限");
    expect(body).toContain("再发一轮");
  });

  it("要求参数用常用档位，偏离要说明理由", () => {
    expect(body).toContain("档位");
    expect(body).toContain("说明理由");
  });

  it("单一事实来源：引数可追溯、冲突要指出、禁止无依据的声明", () => {
    expect(body).toContain("单一事实来源");
    expect(body).toContain("追到某次工具响应");
    expect(body).toContain("指出冲突");
    expect(body).toContain("禁止");
  });

  it("数据不足时不许硬算", () => {
    expect(body).toContain("ok=false");
    expect(body).toContain("required");
    expect(body).toContain("不要");
  });

  it("要求回答结尾附关键点表格", () => {
    expect(body).toContain("Markdown 表格");
  });
});
