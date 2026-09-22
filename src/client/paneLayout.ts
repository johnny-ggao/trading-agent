/**
 * 窗格比例：**K 线主图要明显大于副图**。
 *
 * lightweight-charts 的 `setStretchFactor` 决定各窗格分到多少高度；此前是主图 2、副图各 1，
 * 副图一多（成交量 + MACD + RSI + KDJ + ATR）主图就被压扁。这里把比例收成一处常量与一个纯函数，
 * 便于调整与测试。
 */

/** 主图（价格/K 线）的比例。 */
export const PRICE_PANE_STRETCH = 3;

/** 每个副图的比例。 */
export const SUB_PANE_STRETCH = 1;

/** 按窗格数量给出各窗格的比例：首个是主图，其余是副图。 */
export function paneStretchFactors(paneCount: number): number[] {
  const count = Math.max(1, Math.floor(paneCount) || 1);
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? PRICE_PANE_STRETCH : SUB_PANE_STRETCH);
}