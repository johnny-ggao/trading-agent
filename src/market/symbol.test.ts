import { describe, it, expect } from "vitest";
import { resolveSymbol } from "./symbol";

describe("交易对解析", () => {
  it("裸币种补上 USDT 现货对", () => {
    expect(resolveSymbol("BTC")).toBe("BTCUSDT");
  });
  it("小写归一化为大写", () => {
    expect(resolveSymbol("eth")).toBe("ETHUSDT");
  });
  it("已带报价货币的保持原样", () => {
    expect(resolveSymbol("BTCUSDT")).toBe("BTCUSDT");
    expect(resolveSymbol("ETHBTC")).toBe("ETHBTC");
  });
});
