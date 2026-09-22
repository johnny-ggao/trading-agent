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
    expect(body).toContain("规则信号（机械） → 结构/形态判断（模型） → 综合结论");
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

  it("表格改为「只在被要求时给」，且作为唯一数值台账", () => {
    expect(body).toContain("只在被要求时给");
    expect(body).toContain("默认**不附表格**");
    expect(body).toContain("唯一的数值台账");
  });

  it("结论前置：读者应在前三行拿到方向/失效位/置信度", () => {
    expect(body).toContain("结论前置");
    expect(body).toContain("前三行拿到答案");
    expect(body).toContain("方向 + 失效位 + 置信度");
  });

  it("证据按相关性筛，不是把指标全列一遍", () => {
    expect(body).toContain("与结论相关的那几条");
    expect(body).toContain("3–6 个关键数值");
    expect(body).toContain("不是把工具返回的指标全列一遍");
  });

  it("给长度预算，并禁止同一数值重复出现", () => {
    expect(body).toContain("≤400 字");
    expect(body).toContain("不要在正文里讲一遍又在表格里抄一遍");
  });
});

describe("skill v3：多周期共振的周期对由模型指定", () => {
  const body = tradingChartSkill.content;

  it("点名 compareTo 参数与用法", () => {
    expect(body).toContain("compareTo");
    expect(body).toContain('"1w"');
    expect(body).toContain('"1h"');
  });

  it("说明周期对不写死、由问题决定，并可跨两级", () => {
    expect(body).toContain("周期对由你定");
    expect(body).toContain("不写死");
    expect(body).toContain("跨两级");
  });

  it("说明 aligned 的语义与走平时不要当证据", () => {
    expect(body).toContain("aligned");
    expect(body).toContain("方向不明确");
  });
});

describe("skill v3：衍生品数据引导", () => {
  const body = tradingChartSkill.content;

  it("点名 trading_derivatives 并把字段含义列清", () => {
    expect(body).toContain("trading_derivatives");
    for (const field of ["funding", "openInterest", "markPrice", "oraclePrice", "midPrice", "impactPrices", "volume24h"]) {
      expect(body).toContain(field);
    }
  });

  it("强调按小时结算与 Binance 的差异", () => {
    expect(body).toContain("按小时结算");
  });

  it("说明 HL 独有的两项与为什么独有", () => {
    expect(body).toContain("predictedFunding");
    expect(body).toContain("openInterestCap");
    expect(body).toContain("Binance 原理上给不了");
  });

  it("要求诚实暴露 5000 根保留上限，长回看走 Binance", () => {
    expect(body).toContain("5000");
    expect(body).toContain("truncated");
    expect(body).toContain("长回看要用 Binance");
  });
});

describe("skill v3：取数上限是 agent 必须先知道的事实", () => {
  const body = tradingChartSkill.content;

  it("以时间跨度（而非根数）表述取数能力", () => {
    expect(body).toContain("按时间思考，不要按根数思考");
    expect(body).toContain("约 42 天");
    expect(body).toContain("约 1000 天");
  });

  it("指明补救方向是先确定时间跨度、再换更大的周期", () => {
    expect(body).toContain("先确定要覆盖多长时间，再选周期");
    expect(body).toContain("换更大的周期");
  });

  it("说明两个数据源在上限上的差别", () => {
    expect(body).toContain("5000 根");
    expect(body).toContain("truncated");
  });
});

describe("skill v3：lookback 让 agent 用时间表达窗口", () => {
  const body = tradingChartSkill.content;

  it("给出 lookback 的写法与语义", () => {
    expect(body).toContain("lookback");
    expect(body).toContain('"90d"');
    expect(body).toContain('"3M"');
    expect(body).toContain('"1y"');
  });

  it("说明窗口取较大者，且不必借指标撑开窗口", () => {
    expect(body).toContain("max(指标预热需求, lookback 换算的根数)");
    expect(body).toContain("不必");
  });

  it("说明写错会明确报错", () => {
    expect(body).toContain("明确报错");
  });
});

describe("skill v3：共振的周期对必须两处一致", () => {
  const body = tradingChartSkill.content;

  it("要求 trading_confidence 传与出图相同的 compareTo", () => {
    expect(body).toContain("compareTo");
    expect(body).toContain("这里要传同一个值");
  });

  it("说明不存在更高周期时不做共振（1w 不再自比）", () => {
    expect(body).toContain("不存在更高周期时不做共振");
    expect(body).toContain("跟自己比");
  });
});

describe("skill v3：图面内容可配（指标不默认画）", () => {
  const body = tradingChartSkill.content;

  it("说明指标不默认画、由开关控制", () => {
    expect(body).toContain("指标**不默认画**");
    expect(body).toContain("开关");
  });

  it("给出价位数量与类别的参数", () => {
    expect(body).toContain("levelsPerSide");
    expect(body).toContain("levelKinds");
    expect(body).toContain("默认每侧 3 条");
  });
});

describe("skill v3：把结论里的价位补画到图上（工单 13）", () => {
  const body = tradingChartSkill.content;

  it("给出 levels 的写法、类别与互斥关系", () => {
    expect(body).toContain('"85237.96:support"');
    expect(body).toContain("invalidation");
    expect(body).toContain("互斥");
  });

  it("说明同一回合重调会更新同一张图、跨回合是新图", () => {
    expect(body).toContain("同一回合的 tab 会被更新");
    expect(body).toContain("旧图按设计保留原样");
  });

  it("说明失效位在图上会被区分（判读而非候选）", () => {
    expect(body).toContain("琥珀色");
    expect(body).toContain("不是算出来的候选");
  });
});

describe("skill v3：Jev 的四项原始输出不许被精简掉", () => {
  const body = tradingChartSkill.content;

  it("要求完整给出支持度/置信度/充分度/概率分布", () => {
    expect(body).toContain("必须完整给出 Jev 的四项原始输出");
    expect(body).toContain("证据充分度");
    expect(body).toContain("概率分布");
  });

  it("明确这些数字不受长度预算约束、不得省略或改写", () => {
    expect(body).toContain("不受长度预算约束");
    expect(body).toContain("不得改写、不得四舍五入、不得省略");
  });
});
