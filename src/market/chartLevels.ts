/**
 * 显式价位：**模型点名要画哪条线**。
 *
 * 背景（工单 13）：图上的价位此前只能按"每侧最近 N 条 / 哪几类"由机械候选选出，模型没法说
 * "就把这条 85237.96 画上"。分析完（`trading_levels` 拿到完整清单）之后要补画挑出来的关键位，
 * 就需要这个入口——同一回合再调 `trading_chart` 会更新同一个 tab，因此无需新的传输机制。
 *
 * 写法：`"<价格>:<类别>"`，类别 ∈ support / resistance / fib / **invalidation**（失效位）。
 * `invalidation` 是图上唯一的"模型判读"元素，用不同样式区分，避免被误认为机械候选。
 */
import type { ChartLevel } from "../shared/chartSpec";

/** 图上价位线可用的类别：机械三类 + 失效位（判读）。 */
export type ChartLevelKind = ChartLevel["kind"];

/** 显式价位的条数上限：再多就糊成一片，明确回绝好过画一团线。 */
export const MAX_EXPLICIT_LEVELS = 20;

const KINDS: readonly ChartLevelKind[] = ["support", "resistance", "fib", "invalidation"];

const LABELS: Record<ChartLevelKind, string> = {
  support: "S",
  resistance: "R",
  fib: "Fib",
  invalidation: "失效",
};

/** 解析后的一条显式价位。 */
export interface ExplicitLevel {
  price: number;
  kind: ChartLevelKind;
  label: string;
}

const USAGE = `levels 写法："<价格>:<类别>"，类别只能是 ${KINDS.join(" / ")}（例如 "85237.96:support"）`;

/** 解析一组显式价位；不合法直接抛错，绝不静默丢弃。 */
export function parseChartLevels(specs: readonly string[]): ExplicitLevel[] {
  if (specs.length > MAX_EXPLICIT_LEVELS) {
    throw new Error(`levels 超过上限 ${MAX_EXPLICIT_LEVELS} 条（收到 ${specs.length} 条）`);
  }
  return specs.map((raw) => {
    const parts = raw.split(":").map((part) => part.trim());
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      throw new Error(`${USAGE}；收到 ${JSON.stringify(raw)}`);
    }
    const [priceText, kindText] = parts as [string, string];
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`levels 的价格必须是正数；收到 ${JSON.stringify(priceText)}`);
    }
    const kind = KINDS.find((candidate) => candidate === kindText.toLowerCase()) as ChartLevelKind | undefined;
    if (kind === undefined) {
      throw new Error(`${USAGE}；不认识的类别 ${JSON.stringify(kindText)}`);
    }
    return { price, kind, label: LABELS[kind] };
  });
}