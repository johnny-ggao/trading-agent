# 07: 分析契约 + 置信度校准（Jev）+ skill v2

**要构建什么：** 分层信号（规则信号 → 结构/形态判断 → 综合结论）；每条结论带方向 + 失效位 + 置信度；判定只用已收盘 K 线；未收盘仅以区别样式展示；不给交易建议。置信度改由 **TypeSafe Jev** 校准（方案 B：方向仍由模型判断，Jev 只给支持度与置信度）。skill 升级到 v2。决策见 [ADR-0007](../../../docs/adr/0007-jev-calibrated-confidence.md)，事实见 [docs/research/jev-confidence.md](../../../docs/research/jev-confidence.md)。

**Blocked by:** 06

**Status:** in-progress（置信度校准部分完成，其余待做）

- [x] 第二个工具 `trading_confidence`：模型给方向/失效位/理由，宿主用真实机械证据 + 结论调 Jev
- [x] 输出支持度（连续分 + 档位 + 概率分布）与校准置信度（0..1 + 高/中/低），并给证据充分度与方向一致概率
- [x] BYOK 可选：无 key / 超时 / HTTP / 解析失败一律结构化 `ok=false`，模型退回自评并声明未校准
- [x] 配置引导：宿主注册 settings 命名空间 + 客户端在插件管理页本行注册 `plugins.row.config`（key 走 credentials 域），`TYPESAFE_API_KEY` 环境变量兜底
- [x] 证据缓存：`trading_chart` 的 MarketView 按 symbol+interval 短 TTL 缓存，供 `trading_confidence` 复用
- [x] skill v2：说明校准调用顺序、支持度/置信度怎么报告、拿不到时怎么声明
- [ ] 分层信号产出（规则信号 → 结构/形态判断 → 综合结论）的显式契约
- [ ] 只用已收盘 K 线判定（未收盘/形成中 K 线不触发结构与形态判断）
- [ ] 未收盘 K 线的区别样式
- [ ] 不给交易建议（skill 强化 + 回答模板）

## Comments

- 2026-09-22：**按用户要求修改方案并落地置信度校准。**
  - 新模块 `src/analysis/confidence.ts`（纯逻辑：紧凑证据、问题构造、答案收敛、阈值分档）与 `src/analysis/typesafe.ts`（适配**官方 `@typesafe-ai/sdk`**：`TypeSafeClient` + `score`/`noul`；传输/重试/超时由 SDK 负责，适配层只把 SDK 异常翻译成可降级原因）。模型调用不放在 `src/market/`。
  - 宿主 `src/index.ts`：新增 `trading_confidence`、证据缓存、`Config` schema + `settings.installSection`、key 解析（设置字面值 → credentials → env）。
  - 依据：Jev 的 `score`/`noul` 原语与 confidence 语义（见调研文档）；方向仍归模型，保留 ADR-0002 分工。
  - 测试：新增 `src/analysis/typesafe.test.ts`（6，注入假 fetch 走官方 SDK）+ `src/analysis/confidence.test.ts`（8）；全库 **137 例**通过，typecheck / build 干净。
  - **未验证**：真实 TypeSafe 联调需要用户在设置页或 env 提供 `TYPESAFE_API_KEY`；本沙箱只用录制 fixture 测过客户端逻辑。
