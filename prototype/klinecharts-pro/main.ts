import { KLineChartPro, type Datafeed, type KLineData, type SymbolInfo } from "@klinecharts/pro";
import proCss from "@klinecharts/pro/dist/klinecharts-pro.css";

const style = document.createElement("style");
style.textContent = proCss as unknown as string;
document.head.appendChild(style);

const SYMBOL: SymbolInfo = {
  ticker: "BTCUSDT", name: "BTC/USDT", shortName: "BTC/USDT", exchange: "Binance",
  market: "crypto", pricePrecision: 2, volumePrecision: 2, priceCurrency: "USDT", type: "crypto",
};

function demo(n: number): KLineData[] {
  const out: KLineData[] = [];
  const start = 1_700_000_000_000;
  let price = 30_000;
  for (let i = 0; i < n; i += 1) {
    const open = price;
    const close = open * (1 + Math.sin(i / 7) * 0.004 + 0.0007);
    out.push({
      timestamp: start + i * 3_600_000,
      open, high: Math.max(open, close) * 1.001, low: Math.min(open, close) * 0.999, close,
      volume: 100 + (i % 10),
    });
    price = close;
  }
  return out;
}

const datafeed: Datafeed = {
  searchSymbols: async () => [SYMBOL],
  getHistoryKLineData: async () => demo(300),
  subscribe: () => {},
  unsubscribe: () => {},
};

const chart = new KLineChartPro({
  container: "chart",
  symbol: SYMBOL,
  period: { multiplier: 1, timespan: "hour", text: "1H" },
  periods: [
    { multiplier: 15, timespan: "minute", text: "15m" },
    { multiplier: 1, timespan: "hour", text: "1H" },
    { multiplier: 4, timespan: "hour", text: "4H" },
    { multiplier: 1, timespan: "day", text: "D" },
  ],
  datafeed,
  theme: "dark",
  locale: "zh-CN",
  drawingBarVisible: true,
  mainIndicators: ["MA"],
  subIndicators: ["VOL", "MACD"],
});
(window as any).__pro = chart;
