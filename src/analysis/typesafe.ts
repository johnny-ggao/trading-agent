import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeClient,
  TypeSafeError,
  type EntryType,
  type Fetch,
  type RetryPolicy,
} from "@typesafe-ai/sdk";
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  buildConfidenceQuestions,
  summarizeConfidenceAnswers,
  type ConfidenceAssessment,
  type ConfidenceEvidence,
  type ConfidenceThesis,
  type ConfidenceThresholds,
} from "./confidence";

/** TypeSafe 默认配置（与 SDK 默认一致，仅在本插件里显式化以便配置覆盖）。 */
export const DEFAULT_TYPESAFE_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_TYPESAFE_MODEL = "jev-latest";
export const DEFAULT_TYPESAFE_TIMEOUT_MS = 15000;

/** 校准不可用的可分类原因（用于降级时告诉模型为什么没校准）。 */
export type ConfidenceFailureReason =
  | "credentials_missing"
  | "aborted"
  | "timeout"
  | "http_error"
  | "network_error"
  | "invalid_response";

/** 带分类原因的校准不可用错误：调用方据此降级，而不是把异常抛给用户。 */
export class ConfidenceUnavailableError extends Error {
  readonly reason: ConfidenceFailureReason;
  readonly status: number | undefined;

  constructor(message: string, reason: ConfidenceFailureReason, status?: number) {
    super(message);
    this.name = "ConfidenceUnavailableError";
    this.reason = reason;
    this.status = status;
  }
}

export interface TypeSafeScorerOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  /** 重试策略覆盖；缺省用 SDK 默认（2 次退避重试）。 */
  readonly retry?: Partial<RetryPolicy>;
  readonly thresholds?: ConfidenceThresholds;
  /** 便于测试注入假 fetch（与官方 SDK 的 `fetch` 选项一致）。 */
  readonly fetch?: Fetch;
}

function toUnavailable(error: unknown, signal: AbortSignal | undefined): ConfidenceUnavailableError {
  if (error instanceof ConfidenceUnavailableError) return error;
  if (signal?.aborted === true) return new ConfidenceUnavailableError("TypeSafe 请求已取消", "aborted");
  if (error instanceof APITimeoutError) return new ConfidenceUnavailableError(error.message, "timeout");
  if (error instanceof APIUserAbortError) return new ConfidenceUnavailableError(error.message, "aborted");
  if (error instanceof APIConnectionError) return new ConfidenceUnavailableError(error.message, "network_error");
  if (error instanceof APIError) return new ConfidenceUnavailableError(error.message, "http_error", error.status);
  if (error instanceof TypeSafeError) return new ConfidenceUnavailableError(error.message, "invalid_response");
  return new ConfidenceUnavailableError(error instanceof Error ? error.message : String(error), "network_error");
}

/**
 * 用官方 `@typesafe-ai/sdk` 调用 Jev 做置信度校准。
 *
 * 只负责「证据 + 结论 → 官方请求 → 收敛成评估」，并把 SDK 的异常翻译成可降级的原因；
 * 传输、重试、超时与错误类型都由 SDK 负责。
 */
export class TypeSafeConfidenceScorer {
  private readonly client: TypeSafeClient;
  private readonly thresholds: ConfidenceThresholds;

  constructor(options: TypeSafeScorerOptions) {
    if (options.apiKey.trim() === "") {
      throw new ConfidenceUnavailableError("缺少 TypeSafe API key", "credentials_missing");
    }
    this.thresholds = options.thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS;
    this.client = new TypeSafeClient({
      apiKey: options.apiKey,
      logLevel: "off",
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      ...(options.model === undefined ? {} : { defaultModel: options.model }),
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      ...(options.retry === undefined ? {} : { retry: options.retry }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  async score(
    evidence: ConfidenceEvidence,
    thesis: ConfidenceThesis,
    signal?: AbortSignal,
  ): Promise<ConfidenceAssessment> {
    // state 由本插件按可序列化结构构造；SDK 只要求 JSON 兼容。
    const state = {
      market: evidence,
      thesis: {
        direction: thesis.direction,
        invalidation: thesis.invalidation,
        rationale: thesis.rationale,
      },
    } as unknown as EntryType;
    try {
      const result = await this.client.systemOne(
        { state, questions: buildConfidenceQuestions() },
        signal === undefined ? {} : { signal },
      );
      return summarizeConfidenceAnswers(result, this.thresholds);
    } catch (error) {
      throw toUnavailable(error, signal);
    }
  }
}
