import { describe, it, expect } from "vitest";
import { credentialRefOf, credentialStatusText, remoteFailureText, DEFAULT_API_KEY_ENV } from "./config";

describe("凭据引用解析", () => {
  it("取 section 里的 apiKeyEnv", () => {
    expect(credentialRefOf({ apiKeyEnv: "MY_KEY" })).toBe("MY_KEY");
  });

  it("缺省或空白时回落到 TYPESAFE_API_KEY", () => {
    expect(credentialRefOf(undefined)).toBe(DEFAULT_API_KEY_ENV);
    expect(credentialRefOf({})).toBe(DEFAULT_API_KEY_ENV);
    expect(credentialRefOf({ apiKeyEnv: "   " })).toBe(DEFAULT_API_KEY_ENV);
  });
});

describe("凭据状态文案", () => {
  it("未配置时说明引用名", () => {
    expect(credentialStatusText({ configured: false, writable: true }, "K")).toBe("未配置（K）。");
  });

  it("已配置时带出来源", () => {
    expect(credentialStatusText({ configured: true, writable: false, source: "env" }, "K")).toBe("已配置（K，来源：env）。");
    expect(credentialStatusText({ configured: true, writable: true }, "K")).toBe("已配置（K）。");
  });
});

describe("远程失败结果解析", () => {
  it("成功或不认识的形状返回 undefined", () => {
    expect(remoteFailureText(undefined)).toBeUndefined();
    expect(remoteFailureText(null)).toBeUndefined();
    expect(remoteFailureText({ ok: true })).toBeUndefined();
    expect(remoteFailureText("done")).toBeUndefined();
  });

  it("失败时取 error 文案", () => {
    expect(remoteFailureText({ ok: false, error: "rejected" })).toBe("rejected");
    expect(remoteFailureText({ ok: false, error: { message: "shadowed" } })).toBe("shadowed");
    expect(remoteFailureText({ ok: false })).toBe("保存被宿主拒绝。");
  });
});
