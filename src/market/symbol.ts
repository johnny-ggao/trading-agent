/** 现货报价货币后缀（按长度从长到短匹配）。 */
const QUOTES = ["USDT", "USDC", "FDUSD", "TUSD", "BUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "BRL"];

/** 把裸币种解析为现货交易对（如 BTC -> BTCUSDT）；已带报价货币的保持原样。 */
export function resolveSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const hasQuote = QUOTES.some((q) => upper.length > q.length && upper.endsWith(q));
  return hasQuote ? upper : `${upper}USDT`;
}
