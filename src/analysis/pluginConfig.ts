/**
 * 分析相关的插件配置：**空值兜底**。
 *
 * 起因：`settings.yaml` 里没有本插件的段时，DSH 传给 `apply` 的 config 是 `{}`，
 * 于是 `config.apiKey.trim()` 这类读取会抛 TypeError，把 `trading_confidence` 整个打崩。
 * 这里把缺省值收成一处：所有读取都先过 `normalizeAnalysisConfig`。
 */
import { DEFAULT_TYPESAFE_BASE_URL, DEFAULT_TYPESAFE_MODEL, DEFAULT_TYPESAFE_TIMEOUT_MS } from "./typesafe";

/** Jev 校准与证据缓存的原始配置（字段可缺、可为空串）。 */
export interface AnalysisConfigInput {
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  highThreshold?: number;
  mediumThreshold?: number;
  evidenceTtlMs?: number;
}

/** 兜底之后的配置：所有字段都有确定值。 */
export interface AnalysisConfig {
  apiKey: string;
  apiKeyEnv: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
  highThreshold: number;
  mediumThreshold: number;
  evidenceTtlMs: number;
}

export const DEFAULT_HIGH_THRESHOLD = 0.7;
export const DEFAULT_MEDIUM_THRESHOLD = 0.4;
export const DEFAULT_EVIDENCE_TTL_MS = 300_000;

function text(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

/** 0..1 之外的阈值会让分档错乱，直接回落默认。 */
function ratio(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function positive(value: number | undefined, fallback: number, allowZero = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value > 0) return value;
  return allowZero && value === 0 ? 0 : fallback;
}

/** 把可能缺失/为空的配置补成确定值。 */
export function normalizeAnalysisConfig(input: AnalysisConfigInput | undefined): AnalysisConfig {
  return {
    apiKey: text(input?.apiKey, ""),
    apiKeyEnv: text(input?.apiKeyEnv, "TYPESAFE_API_KEY"),
    baseURL: text(input?.baseURL, DEFAULT_TYPESAFE_BASE_URL),
    model: text(input?.model, DEFAULT_TYPESAFE_MODEL),
    timeoutMs: positive(input?.timeoutMs, DEFAULT_TYPESAFE_TIMEOUT_MS),
    highThreshold: ratio(input?.highThreshold, DEFAULT_HIGH_THRESHOLD),
    mediumThreshold: ratio(input?.mediumThreshold, DEFAULT_MEDIUM_THRESHOLD),
    evidenceTtlMs: positive(input?.evidenceTtlMs, DEFAULT_EVIDENCE_TTL_MS, true),
  };
}
