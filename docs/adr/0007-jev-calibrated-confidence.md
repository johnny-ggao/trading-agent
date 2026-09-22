# 置信度由 TypeSafe Jev 校准（可选、BYOK）

工单 07 要求每条方向性结论带「方向 + 失效位 + 置信度」。让模型自评「高/中/低」无法校准，也无法证伪。TypeSafe 的 **Jev（System One）**是专门做窄而结构化判断的决策模型：接收 state 与带类型的 questions，返回概率分布与 confidence，毫秒级、约 fractions of a cent 一次（事实见 [docs/research/jev-confidence.md](../research/jev-confidence.md)）。

因此新增第二个工具 **`trading_confidence`**：模型在形成方向性结论后，把方向、失效位与理由交给宿主；宿主用**自己算出的真实机械证据**（而非模型转述）加该结论，调用 Jev 得到一个 `score`（证据支持度）、一个 `score`（证据充分度）与一个 `noul`（单看证据是否同向），返回支持度（含概率分布）与校准置信度（0..1 与 高/中/低）。

**方向仍由模型判断，Jev 只校准置信度。**这保留 [ADR-0002](0002-analysis-split-mechanical-candidates-llm-judgement.md) 的「机械候选 + 模型判断」分工，只把其中的「主观置信度」换成一个可校准的外部决策模型。

调用用官方 **`@typesafe-ai/sdk`**（`TypeSafeClient` + `score`/`noul` 构造器；传输、重试、超时与错误类型由 SDK 负责），不自搓 HTTP。这块属于「模型调用 / 分析」层，放在 `src/analysis/`（`confidence.ts` 纯逻辑 + `typesafe.ts` SDK 适配），**不进 `src/market/`**（那里是行情与机械计算）。

## 后果 (Consequences)

- **安装即可用仍然成立（ADR-0003）**：Jev 一律可选。无 key、超时、HTTP 或响应结构错误都返回结构化 `ok=false`，模型退回自评并在回答中声明「未经校准」，插件其余功能不受影响，绝不因此报错。
- **key 的用户引导走插件管理页**：宿主用 `settings.installSection` 注册并服务 `trading-agent` 命名空间，客户端在插件管理页本行（`dsh-trading-agent#trading-agent`）注册 `plugins.row.config` 配置页，把 key 经 credentials 域写入（不在响应里明文回传）；也可用 `TYPESAFE_API_KEY` 环境变量。注意：**第三方插件不会出现在「设置 → 插件」的官方配置页**（那是 `ui-settings-plugins` 为内置插件 ship 的），只会在侧栏「插件」页的本行配置里出现。
- **数据出境**：state 含公开行情、机械特征与模型自己的结论文本（不含用户原文），需用户知情。
- **可证伪**：概率分布与 confidence 都可被记录与回测，比「高/中/低」更接近 spec 的「可被证伪」要求。
- **外部依赖**：Jev 或其网络不可用时只影响校准，不影响出图与分析。
- **契约变化**：工具输出新增支持度/置信度/充分度/一致概率；skill v2 规定「先出图、再校准、拿不到就声明未校准」的顺序。

## 状态 (Status)

accepted；补充 ADR-0002（置信度改为由 Jev 校准，方向仍由模型判断）。
