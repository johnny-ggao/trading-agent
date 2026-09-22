/**
 * 符号解析：**币种名与现货交易对是两个概念**（见 CONTEXT.md）。
 *
 * - `baseCoin("BTC")` / `baseCoin("BTCUSDT")` → `"BTC"`：有的场所（Hyperliquid）只认币种名；
 * - `resolveSymbol("BTC")` → `"BTCUSDT"`：Binance 现货要交易对。
 *
 * 这个区分以前不存在，导致 skill 推荐的写法 `"BTCUSDT"` 在 Hyperliquid 路径上被当成
 * 未上市币种（错误还归因给场所）。
 */

/** 现货报价货币后缀（按长度从长到短匹配）。 */
const QUOTES = ["USDT", "USDC", "FDUSD", "TUSD", "BUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "BRL"];

/** 取出匹配到的报价货币后缀；没有则 undefined。 */
function quoteSuffix(upper: string): string | undefined {
  return QUOTES.find((q) => upper.length > q.length && upper.endsWith(q));
}

/** 把裸币种解析为现货交易对（如 BTC -> BTCUSDT）；已带报价货币的保持原样。 */
export function resolveSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  return quoteSuffix(upper) === undefined ? `${upper}USDT` : upper;
}

/**
 * 从任意写法取出**币种名**（如 BTCUSDT -> BTC）。
 *
 * 注意不要误剥：`USDT` 本身就是币种，只有严格长于报价货币时才算"带了后缀"。
 */
export function baseCoin(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const quote = quoteSuffix(upper);
  return quote === undefined ? upper : upper.slice(0, -quote.length);
}
