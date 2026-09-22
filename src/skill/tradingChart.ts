import skillBody from "../../assets/trading-chart.md";

/** 随包 skill 的 kebab-case 名称（模型通过 skill 工具按名加载）。 */
export const SKILL_NAME = "trading-chart";

/**
 * 目录里展示给模型的描述，必须自带触发分支。
 * 模型只看得见 name 与 description，正文要等它调用 skill 工具才加载。
 */
export const SKILL_DESCRIPTION =
  "当用户想了解某个加密资产（币种或交易对）的行情或技术面时使用：走势、K 线、"
  + "均线与 MACD/RSI/布林带/KDJ/ATR 等指标、支撑阻力，或要求画一张行情图。"
  + "它规定 trading_chart 的调用时机、时间词与指标参数怎么填，如何用 trading_confidence 校准置信度，"
  + "以及如何在回答里声明所用默认值。";

/** 注册表只用到 register，本地声明以保持零额外依赖。 */
export interface SkillRegistryLike {
  register(skill: TradingChartSkill): unknown;
}

/** 交给 DSH skills 注册表的随包 skill 定义（结构等价于 SkillRegistration）。 */
export interface TradingChartSkill {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean };
  readonly content: string;
}

/** 随包 skill 定义：正文来自 assets/trading-chart.md（构建时内联）。 */
export const tradingChartSkill: TradingChartSkill = {
  name: SKILL_NAME,
  description: SKILL_DESCRIPTION,
  source: "bundled",
  invocation: { modelInvocable: true, userInvocable: true },
  content: skillBody,
};

/** 把随包 skill 注册进 skills 服务，返回其 disposer 以便由插件 fiber 统一清理。 */
export function registerTradingChartSkill(skills: SkillRegistryLike): unknown {
  return skills.register(tradingChartSkill);
}
