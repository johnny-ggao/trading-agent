import * as React from "react";

/** settings 命名空间：与宿主 installSection 注册的一致。 */
export const CONFIG_NAMESPACE = "trading-agent";
/** 行配置槽的 key：<组合包包名>#<patch 行 id>。 */
export const CONFIG_ROW_KEY = "dsh-trading-agent#trading-agent";
/** 未配置 apiKeyEnv 时使用的凭据引用。 */
export const DEFAULT_API_KEY_ENV = "TYPESAFE_API_KEY";

/** 宿主 Config 在客户端可见的非密钥字段（secret 字段不会下发）。 */
export interface TradingAgentSection {
  apiKeyEnv?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  highThreshold?: number;
  mediumThreshold?: number;
  evidenceTtlMs?: number;
}

/** 该 section 指向的凭据引用；缺省回落到 TYPESAFE_API_KEY。 */
export function credentialRefOf(section: TradingAgentSection | undefined): string {
  const ref = section?.apiKeyEnv?.trim();
  return ref !== undefined && ref !== "" ? ref : DEFAULT_API_KEY_ENV;
}

export interface CredentialView {
  configured: boolean;
  writable: boolean;
  /** 当前供给该引用的层（如 env / file / store）。 */
  source?: string;
}

/** 凭据状态的人读描述。 */
export function credentialStatusText(credential: CredentialView, ref: string): string {
  if (!credential.configured) return `未配置（${ref}）。`;
  const source = credential.source !== undefined && credential.source !== "" ? `，来源：${credential.source}` : "";
  return `已配置（${ref}${source}）。`;
}

/** 远程调用失败结果里的人读错误；成功或形状不可辨时返回 undefined。 */
export function remoteFailureText(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const record = result as { ok?: unknown; error?: unknown };
  if (record.ok !== false) return undefined;
  const error = record.error;
  if (typeof error === "string" && error !== "") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return "保存被宿主拒绝。";
}

export interface SettingsScopeSnapshotLike<T> {
  status: "loading" | "ready" | "unavailable";
  value: T | undefined;
}

export interface SettingsScopeLike<T> {
  getSnapshot(): SettingsScopeSnapshotLike<T>;
  subscribe(listener: () => void): () => void;
}

export interface CredentialsRemoteLike {
  describe(refs: readonly string[]): Promise<{ ok: boolean; value?: Readonly<Record<string, CredentialView>> }>;
  /** 远程结果：成功/失败都可能以 `{ ok, error }` 返回，而不是抛出。 */
  set(ref: string, value: string): Promise<unknown>;
}

export interface TradingAgentConfigCardProps {
  /** 插件管理页对同一 entry 索取两种视图：summary 与 page。 */
  view?: string;
  scope?: SettingsScopeLike<TradingAgentSection>;
  credentials?: CredentialsRemoteLike;
  subscribeCredentialUpdates?: (listener: (ref: string) => void) => () => void;
}

interface SaveMessage {
  readonly kind: "ok" | "error";
  readonly text: string;
}

const STYLES = {
  root: { display: "flex", flexDirection: "column", gap: "6px", maxWidth: "520px" } as React.CSSProperties,
  status: { margin: "0", font: "12px/1.5 ui-sans-serif, system-ui, sans-serif", opacity: 0.75 } as React.CSSProperties,
  label: { font: "12px/1.5 ui-sans-serif, system-ui, sans-serif", opacity: 0.85 } as React.CSSProperties,
  input: {
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid rgba(128, 128, 128, 0.4)",
    background: "transparent",
    color: "inherit",
    font: "12px/1.5 ui-sans-serif, system-ui, sans-serif",
  } as React.CSSProperties,
  actions: { display: "flex", gap: "8px", alignItems: "center" } as React.CSSProperties,
  button: {
    padding: "3px 10px",
    borderRadius: "4px",
    border: "1px solid rgba(128, 128, 128, 0.5)",
    background: "transparent",
    color: "inherit",
    font: "12px/1.5 ui-sans-serif, system-ui, sans-serif",
    cursor: "pointer",
  } as React.CSSProperties,
  message: { margin: "0", font: "12px/1.5 ui-sans-serif, system-ui, sans-serif" } as React.CSSProperties,
  hint: { margin: "0", font: "11px/1.5 ui-sans-serif, system-ui, sans-serif", opacity: 0.6 } as React.CSSProperties,
};

/**
 * 插件管理页里的 trading-agent 行配置页。
 *
 * secret 字段（apiKey）不会下发到客户端，所以这里只读「是否已配置」，
 * 写入走 credentials 域（引用取自 section 的 apiKeyEnv）。每次保存都给明确反馈：
 * 成功、宿主拒绝（含只读来源遮蔽）、服务不可用都会显示一行带颜色的结果。
 */
export function TradingAgentConfigCard(props: TradingAgentConfigCardProps): React.ReactElement | null {
  if (props.view === "summary") {
    return React.createElement("span", null, "TypeSafe API key（Jev 置信度校准）");
  }
  const scope = props.scope;
  if (scope === undefined) {
    return React.createElement("p", { style: STYLES.status }, "设置不可用。");
  }

  const subscribe = React.useCallback((listener: () => void) => scope.subscribe(listener), [scope]);
  const getSnapshot = React.useCallback(() => scope.getSnapshot(), [scope]);
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const ref = credentialRefOf(snapshot.value);

  const [draft, setDraft] = React.useState("");
  const [credential, setCredential] = React.useState<CredentialView>({ configured: false, writable: true });
  const [message, setMessage] = React.useState<SaveMessage | null>(null);
  const [saving, setSaving] = React.useState(false);
  const credentials = props.credentials;

  const readCredential = React.useCallback(async (): Promise<void> => {
    if (credentials === undefined) return;
    try {
      const response = await credentials.describe([ref]);
      const view = response.ok ? response.value?.[ref] : undefined;
      setCredential({
        configured: view?.configured ?? false,
        writable: view?.writable ?? true,
        ...(view?.source === undefined ? {} : { source: view.source }),
      });
    } catch {
      setCredential({ configured: false, writable: true });
    }
  }, [credentials, ref]);

  React.useEffect(() => {
    void readCredential();
  }, [readCredential]);

  const subscribeUpdates = props.subscribeCredentialUpdates;
  React.useEffect(() => {
    if (subscribeUpdates === undefined) return undefined;
    return subscribeUpdates((changed) => {
      if (changed === ref) void readCredential();
    });
  }, [subscribeUpdates, ref, readCredential]);

  const save = async (): Promise<void> => {
    if (credentials === undefined) {
      setMessage({ kind: "error", text: "凭据服务不可用，无法保存。" });
      return;
    }
    const value = draft.trim();
    if (value === "") {
      setMessage({ kind: "error", text: "请先输入 API key。" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await credentials.set(ref, value);
      const failure = remoteFailureText(result);
      if (failure !== undefined) {
        setMessage({ kind: "error", text: `保存失败：${failure}` });
        return;
      }
      setDraft("");
      await readCredential();
      setMessage({ kind: "ok", text: "已保存，已生效。" });
    } catch (error) {
      setMessage({ kind: "error", text: `保存失败：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setSaving(false);
    }
  };

  const statusText = snapshot.status === "unavailable"
    ? "宿主未提供该设置（settings 服务不可用）。"
    : credentialStatusText(credential, ref);

  return React.createElement("div", { "data-trading-config": "1", style: STYLES.root }, [
    React.createElement("p", { key: "status", style: STYLES.status }, statusText),
    React.createElement("label", { key: "label", style: STYLES.label }, `TypeSafe API key（写入凭据 ${ref}）`),
    React.createElement("input", {
      key: "input",
      type: "password",
      value: draft,
      autoComplete: "off",
      placeholder: credential.configured ? "已配置；留空表示不改动" : "粘贴 TypeSafe API key",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setDraft(event.target.value);
        setMessage(null);
      },
      style: STYLES.input,
    }),
    React.createElement("div", { key: "actions", style: STYLES.actions }, [
      React.createElement("button", {
        key: "save",
        type: "button",
        disabled: saving,
        onClick: () => void save(),
        style: STYLES.button,
      }, saving ? "保存中…" : "保存"),
      message === null ? null : React.createElement(
        "span",
        {
          key: "message",
          "data-trading-config-message": message.kind,
          role: "status",
          "aria-live": "polite",
          style: { ...STYLES.message, color: message.kind === "ok" ? "#26a69a" : "#ef5350" },
        },
        message.text,
      ),
    ]),
    credential.writable === false
      ? React.createElement("p", { key: "readonly", style: STYLES.hint }, "该引用由只读来源提供（例如环境变量），在此保存会被拒绝；如需在界面里保存，请先移除同名环境变量。")
      : null,
    React.createElement("p", { key: "hint", style: STYLES.hint }, "未配置也能用：置信度会退回模型自评并声明未校准。"),
  ]);
}
