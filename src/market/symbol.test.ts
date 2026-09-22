import { describe, it, expect } from "vitest";
import { baseCoin, resolveSymbol } from "./symbol";

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

describe("币种名 vs 现货交易对（按场所各取所需）", () => {
  it("从裸币种得到币种名", () => {
    expect(baseCoin("btc")).toBe("BTC");
    expect(baseCoin(" BTC ")).toBe("BTC");
  });

  it("从现货交易对剥离报价货币得到币种名", () => {
    expect(baseCoin("BTCUSDT")).toBe("BTC");
    expect(baseCoin("ETHUSDC")).toBe("ETH");
    expect(baseCoin("SOLFDUSD")).toBe("SOL");
    expect(baseCoin("ETHBTC")).toBe("ETH");
  });

  it("本身是稳定币计价货币时不误剥（USDT 是币种，不是交易对）", () => {
    expect(baseCoin("USDT")).toBe("USDT");
    expect(baseCoin("USDC")).toBe("USDC");
  });

  it("现货对仍走 resolveSymbol（行为不变）", () => {
    expect(resolveSymbol("BTC")).toBe("BTCUSDT");
    expect(resolveSymbol("BTCUSDT")).toBe("BTCUSDT");
  });

  it("两者关系：币种名 + USDT = 默认现货对", () => {
    expect(`${baseCoin("ethusdt")}USDT`).toBe(resolveSymbol("ethusdt"));
  });
});
