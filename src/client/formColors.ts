import type { Candle } from "../shared/chartSpec";

/**
 * 带逐根样式覆盖的 K 线：lightweight-charts 支持对单根 K 线覆盖
 * color / borderColor / wickColor。这是**客户端内部**的渲染类型，
 * 宿主契约 `Candle` 只承载行情语义。
 */
export interface StyledCandle extends Candle {
  color?: string;
  borderColor?: string;
  wickColor?: string;
}

/**
 * 形成中（未收盘）K 线的弱化样式。
 *
 * 只改透明度、不改色相：涨跌语义仍是同一套颜色，一眼能看出「这根还没走完」。
 * 宿主契约（`ChartSpec.formingBars`）只说有几根，怎么画由客户端决定。
 */
export const FORMING_UP_COLOR = "rgba(38, 166, 154, 0.45)";
export const FORMING_DOWN_COLOR = "rgba(239, 83, 80, 0.45)";

/**
 * 把尾部 `formingBars` 根 K 线换成弱化色（lightweight-charts 支持逐根覆盖）。
 * 纯函数：不改动入参数组，返回新数组。
 */
export function muteFormingBars(data: Candle[], formingBars: number): StyledCandle[] {
  if (formingBars <= 0 || data.length === 0) return data;
  const from = Math.max(0, data.length - formingBars);
  return data.map((candle, index) => {
    if (index < from) return candle;
    const color = candle.close >= candle.open ? FORMING_UP_COLOR : FORMING_DOWN_COLOR;
    return { ...candle, color, borderColor: color, wickColor: color };
  });
}
