# DSH 图像输入能力闸门（视觉路由）

**截至 2026-09-22。** 为工单 09（可选视觉：把 `chartSpec` 栅格化为 PNG 附给模型）做的事实
调查：DSH **凭什么**判定"当前这个模型路由能不能收图片"。

**方法。** 只读核对 DSH 检出（`/Users/johnny/Work/Project/deepseek-harness`）的源码，并用
DSH 自己的 schemastery schema 对**本机 `~/.dsh/settings.yaml` 的真实取值**做了一次实测复现。
下文每条结论都标了出处文件与行号。

## 结论速览

1. 闸门看的是**当前会话实际路由**（provider + model）解析出来的 `inputModalities`，不是内置
   目录的默认值。
2. 判定发生在 `read_image` 工具与 ACP 图像内容路径上；不声明 `image` 就直接拒绝。
3. **模型条目的 `models` 是全量替换，不合并**：用户只要在 `llm-deepseek.models` 里写了数组，
   内置目录就完全不参与；缺 `inputModalities` 时按 `?? ['text']` 落地。
   → 一个只写 `id` + `name` 的覆盖条目，会把该模型从多模态**降级成纯文本**。
4. 声明图像能力只是"路由允许"，**不代表端点真的接受图片**；DSH 源码注释明确指出未验证就声明
   会让 host 持久化端点可能拒收的输入。所以启用后必须做一次真实联调。
5. 图片有**硬预算**：`imageMaxBytes` 与 `imagePixelBudget`（或 `'low'`），栅格化产物必须落在
   预算内，否则被拒。

## 闸门在哪

`packages/fs/tool-fs/src/read-image.ts:120-131`：

```ts
const routed = exec.agent?.session.requestHeader()?.config
const provider = routed?.provider ?? exec.agent?.options.provider
const model = routed?.model ?? exec.agent?.options.model
const active = await llm.resolveModelInfo(provider, model, exec.signal)
if (active.inputModalities === undefined || !active.inputModalities.includes('image')) {
  throw new Error(`... model "${model}" does not declare image input; switch to an image-capable model to read images`)
}
```

同一个闸门在别处也有镜像实现，语义一致：`packages/acp/acp/src/content.ts:76,100`、
`packages/api/session-controller/src/commands.ts:338`。核心层把"显式省略模态"当作**负能力**保留
下来，供下游 preflight 判定图像准入（`packages/llm/llm/src/index.ts:790` 附近的注释与
`detachedModalities`）。

## 模态从哪来（关键陷阱）

`llm-deepseek` 的目录解析（`packages/llm/llm-deepseek/src/config.ts:121-123`）：

```ts
function resolveModels(models) {
  return (models ?? DEFAULT_MODELS).map((model) => { ... const inputModalities = model.inputModalities ?? ['text'] ... })
}
```

**`??` 而非深合并**：只要用户提供了 `models`，`DEFAULT_MODELS`
（`packages/llm/llm-deepseek/src/common/models.ts`，其中 `deepseek-flash` 声明 `['text','image']`
与 `systemPromptUpdate: 'in-history'`）就整体不参与，每条条目都要自己写全。

运行时把模型 id 映射成能力（`packages/llm/llm-deepseek/src/common/model-info.ts:61-74`）：

```ts
const configured = connection.models.find(entry => entry.id === model)
...
...configured === undefined
  ? { provider, id: model, name: model, inputModalities: ['text'] }   // 未编目端点按纯文本处理
  : catalogModelInfo(provider, configured)                            // inputModalities ?? ['text']
```

注释解释了保守取向：给未验证的端点声明图像能力，会让 host 持久化端点可能每轮都拒收的输入。

## 本机实测（2026-09-22）

用 `packages/llm/llm-deepseek/lib/index.js` 导出的 `Config` schema，直接喂入
`~/.dsh/settings.yaml` 里 `llm-deepseek.models` 的原文：

| 来源 | `deepseek-flash` 的 `inputModalities` |
|---|---|
| 内置目录（不覆盖） | `['text','image']`，且 `contextWindow: 1000000`、`systemPromptUpdate: 'in-history'` |
| 本机 settings.yaml 覆盖后（实测） | `['text']` |
| 本机 `deepseek-v4-flash-vision-exp` | `['text','image']`（`imagePixelBudget: 640000`、`imageMaxBytes: 1048576`） |

本机 settings.yaml 里 `deepseek-flash` 只写了 `id` + `name`，因此覆盖后是纯文本——**模型本身
多模态，是本地覆盖把它降级了**。附带损失：`systemPromptUpdate: 'in-history'` 也一并丢失。

**恢复方式（由用户自行在「设置 → 模型 → 模型选项 → 勾选图片」操作，本插件不改用户 harness
配置）**：给该条目补 `inputModalities: [text, image]`（及按需的图片预算），或直接删掉该覆盖条目
让内置目录生效。改动后需重启对应 profile。

## 对工单 09 的约束

- 栅格化 PNG 必须满足活动路由的 `imageMaxBytes`（本机 vision 条目为 1 MiB）与
  `imagePixelBudget`（本机为 640000，约 800×800 以内）；超限会被拒。
- 纯文本路由下必须**静默降级**为数值路径：闸门是抛错式的，插件不能依赖"发了图模型一定能看到"，
  而要按活动路由的模态自行决定是否附图。
- 启用后必须先做一次真实联调（小 PNG → 确认端点接受且模型能描述形态），再谈"让模型看图判形态"。
  仅勾选复选框不等于端点支持。
- 本仓库无法自动化验证该路径（沙箱起不了浏览器、当前会话路由为纯文本），只能由用户实测。

## 来源

DSH 检出（0.1.6-alpha.2 时代的工作副本）：

- `packages/fs/tool-fs/src/read-image.ts:120-131` —— 会话路由能力闸门
- `packages/acp/acp/src/content.ts:76,100`、`packages/api/session-controller/src/commands.ts:338` —— 同语义镜像
- `packages/llm/llm/src/index.ts:741-790` —— `resolveModelInfo` 与模态透传
- `packages/llm/llm-deepseek/src/config.ts:121-155,310` —— 目录解析与 `?? ['text']`
- `packages/llm/llm-deepseek/src/common/models.ts:6-20` —— 内置目录（`deepseek-flash` 多模态）
- `packages/llm/llm-deepseek/src/common/model-info.ts:47-74` —— 运行时能力映射
- `docs/user/guide/providers.zh.md:49-76` —— 官方说明：图片输入怎么开、省略 `inputModalities` 的含义
