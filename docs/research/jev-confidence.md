# 用 TypeSafe Jev 校准技术分析结论的置信度

**截至 2026-09-22。** 为工单 07（分析契约 + skill v2）做的事实调查：为什么以及如何用
TypeSafe 的 Jev（System One）替代模型自评的「高/中/低置信度」。

**方法。** 只读核对官方文档与公开资料（见文末来源）。未据本文做任何代码改动判断之外的事。

## Jev 是什么

TypeSafe AI 的旗舰 **System One** 模型：不生成段落，而是接收 **state + 一组带类型的
questions**，返回**带类型的答案 + 概率分布 + confidence**，毫秒级、约 fractions of a cent
一次。定位是「让代码保留控制权、把窄而结构化的判断交给模型」。它经 TypeSafe 直连、
Vercel AI Gateway（`typesafe-ai/jev`）与 OpenRouter 可得。

## API 契约（TypeSafe 直连）

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json
```

请求：

```json
{
  "state": "可以是字符串，也可以是 JSON 结构",
  "model": "jev-latest",
  "questions": {
    "support": { "type": "score", "instructions": "…", "criteria": ["最低", "…", "最高"] },
    "agreement": { "type": "noul", "instructions": "…" }
  }
}
```

响应：

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "support": { "type": "score", "score": 2.4, "confidence": 0.78,
                 "legend": { "2": "…" }, "probabilities": { "2": 0.7, "3": 0.2 } },
    "agreement": { "type": "noul", "noul": 0.82 }
  },
  "usage": { "input_tokens": 800, "output_tokens": 40 }
}
```

### 三种原语

| 原语 | 输入 | 输出 |
|---|---|---|
| `choice` | 一组命名选项 | `choice` + 各选项 `probabilities` + `confidence` |
| `score` | 有序档位描述 | 连续 `score`（可小数）+ 各档 `probabilities` + `confidence` |
| `noul` | 一个 yes/no 判据 | 答案为「是」的概率 `noul`（**无 confidence**） |

一次调用可同时问多个问题（speculative fan-out），便于把复杂判断拆成原子问题。

## confidence 与 probabilities 的关系

- `probabilities` 是答案在各选项/档位上的**概率分布**；分布越集中越确定。
- `confidence` 是 TypeSafe 从该分布导出的 0..1 统计量，便于直接设阈值；官方明确允许
  不用它的定义、直接用 `probabilities` 自己算。
- 二者分工即官方 **confidence-gated routing** 的语义：**answer 告诉你「是什么」，
  confidence 告诉你「该不该照它行动」**。

因此我们同时保留两者：支持度（`score` + `probabilities`，说明证据多强）与
置信度（`confidence` → 高/中/低，说明这次评分有多可信）。

## 与本项目的结合（方案 B）

1. 模型先用 `trading_chart` 出图，拿到机械证据；形成「方向 + 失效位 + 理由」。
2. 模型调用第二个工具 `trading_confidence`，把方向/失效位/理由交给宿主。
3. 宿主用**自己算出的真实机械证据**（不是模型转述）加结论，构造一个 `score`
   （支持度）、一个 `score`（证据充分度）与一个 `noul`（单看证据是否同向），调用 Jev。
4. 宿主返回支持度、置信度、充分度与一致概率；模型据此报告，不再自评置信度。

**方向仍由模型判断**，Jev 只校准置信度——这保留了 ADR-0002 的「机械候选 + 模型判断」
分工，只是把「主观置信度」换成一个可校准的外部决策模型。

## 官方 SDK

JS/TS 使用官方 **`@typesafe-ai/sdk`**（写作时 0.6.0，Node >= 20，零依赖，附 ESM/CJS 与类型）：

```ts
import { noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({ apiKey, baseURL, defaultModel, timeout });
const result = await client.systemOne({ state, questions: { support: score("…", ["a", "b", "c"]) } }, { signal });
result.answers.support.score;        // 连续分
result.answers.support.confidence;   // 0..1
result.answers.support.probabilities;
```

- 配置优先级：显式参数 → 环境变量（`TYPESAFE_API_KEY` / `TYPESAFE_BASE_URL` / `TYPESAFE_DEFAULT_MODEL`）→ SDK 默认（`https://api.typesafe.ai`、`jev-latest`、超时 10s）。
- 默认自带**退避重试**（2 次，408/429/5xx），并可注入 `fetch`（便于测试）。
- 错误分类：`APIError`（含 `status`）、`APITimeoutError`、`APIConnectionError`、`APIUserAbortError`、`TypeSafeError`。
- 源码：<https://github.com/typesafe-ai/typesafe-sdk-js>；JS 文档：<https://docs.typesafe.ai/sdk/javascript>。

## 边界与风险

- **必须有 API key**：与 ADR-0003「安装即可用、零 key 可分享」冲突。因此 Jev 一律**可选**：
  无 key / 超时 / 服务错误时返回结构化失败，模型退回自评并声明未校准，插件其余功能不受影响。
- **数据出境**：发给 TypeSafe 的 state 含公开行情、机械特征与**模型自己的结论文本**
  （不含用户原文）；用户需知情。
- **成本/延迟**：每次结论一次调用，毫秒级、约 fractions of a cent；有超时与取消。
- **不把 key 写进仓库或对话**：key 经侧栏「插件」页本行的配置页写入 credentials 域
  （第三方插件不走「设置 → 插件」的官方配置页），或由 `TYPESAFE_API_KEY` 环境变量提供。

## 来源

- TypeSafe 快速开始：<https://docs.typesafe.ai/introduction/quickstart>
- 原语（Choice/Score/Noul）：<https://docs.typesafe.ai/primitives>
- Confidence 与概率：<https://docs.typesafe.ai/confidence>
- Composite scoring：<https://docs.typesafe.ai/patterns/composite-scoring>
- Confidence-gated routing：<https://docs.typesafe.ai/patterns/confidence-routing>
- 社区索引（通道与生态）：<https://github.com/ckaraca/awesome-jev>
- API key 控制台：<https://console.typesafe.ai/keys>
