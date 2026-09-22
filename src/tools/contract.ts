/**
 * 工具契约的共用形状。
 *
 * 起因（架构候选 1）：每个工具的响应契约曾被写三遍——`output.schema` 描述一遍、
 * `execute` 里拼 payload 一遍、`render` 里再读一遍，住在一个 700 多行、**零测试**的
 * `src/index.ts` 里。任何一处漏改都不会有编译错误。
 *
 * 现在：每个工具的 schema 与 payload/blocks 住在 `src/tools/<tool>.ts`，并有一致性测试
 * 断言"payload 的键必须在 schema 里"。注册处只剩参数转译。
 */

import type { InferValue, ObjectValueSchemaSpec } from "@deepseek-ai/dsh-tools";

/** 与 @deepseek-ai/dsh-util-values 的 JsonValue 结构等价，避免额外依赖。 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 渲染出的文本块（render 的返回元素）。 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * 工具输出 schema：**直接用 DSH 的 `ObjectValueSchemaSpec`**，不自造一套——自造的类型会与
 * `defineTool` 的 `InferValue` 不兼容（表现为 render 的 `value` 被推成 `never`）。
 * 注意 `additionalProperties` 必须显式为字面量，推断依赖它。
 */
export type JsonSchema = ObjectValueSchemaSpec;

/** 由输出 schema 推断出的 payload 类型：类型与契约同源，不再手写一遍。 */
export type SchemaValue<S> = InferValue<S>;

/**
 * 工具的通用失败 shape：**一个建造点**，各工具不再各自手搓。
 * 用 type 别名而非 interface：别名会获得隐式索引签名，因而可直接当作 `Json` 使用。
 */
export type ToolFailure = {
  ok: false;
  reason: string;
  required: number;
  available: number;
  hint: string;
};

/** 构造失败 payload（required/available 不适用时传 0）。 */
export function failurePayload(reason: string, hint: string, required = 0, available = 0): ToolFailure {
  return { ok: false, reason, required, available, hint };
}

/**
 * 断言 payload 的每个键都出现在 schema 的 properties 里。
 *
 * 这是"三处并行"漂移的探测器：schema 是给模型看的契约、payload 是实际给的东西，
 * 两者不一致时模型会按错误的契约理解数据（`additionalProperties: false` 还会直接拒收）。
 */
export function payloadCoversSchema(schema: JsonSchema, payload: Json): void {
  const properties = schema.properties;
  if (properties === undefined) throw new Error("schema 没有 properties，无法校验契约");
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("payload 不是对象，无法与 schema 比对");
  }
  const allowed = new Set(Object.keys(properties));
  const extra = Object.keys(payload).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error(`payload 含 schema 未声明的键：${extra.join("、")}（契约漂移）`);
  }
}