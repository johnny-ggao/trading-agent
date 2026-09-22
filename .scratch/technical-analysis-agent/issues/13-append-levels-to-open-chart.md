# 13: 把分析认定的价位补画到已打开的图上

**要构建什么：** 模型在分析之后，能把**点名的价位**补画到行情图上——而不只是"出图时固定画每侧 N 条"。
例如结论里的失效位、或从 `trading_levels` 里挑出的关键支撑阻力/斐波那契。

**Blocked by:** 12（已 done）

**Status:** done（2026-09-22；渲染观感待用户实测）

## 设计决定（grilling 第一轮，用户已确认）

1. **入口形态 = 给 `trading_chart` 加显式价位参数**，不加新工具、不加新端点。依据（实测的机制事实）：
   tab 身份是 `(kind, 会话/回合)`，**同一回合内再次调用 `trading_chart` 会更新同一个 tab**
   （`openResourceIn` 按地址去重并更新参数）；跨回合则新建 tab。
2. **替换语义**：给了 `levels` 就替换机械选择，且与 `levelsPerSide`/`levelKinds` **互斥**（同时给明确报错，
   不静默取其一）。想"再加一条"就把机械那几条一起写上。
3. **失效位在图面上单独一类**：`ChartLevel.kind` 扩 `"invalidation"`（琥珀色 `#f5a623`），
   与机械三类区分——它是图上唯一的**判读**元素，混在一起会被误读成算出来的候选。
   机械候选那侧（`PriceLevel`）仍只有三类。
4. **格式 `"<价格>:<类别>"`**，类别 ∈ support/resistance/fib/invalidation；价格必须正数；上限 20 条；
   越界、拼错、格式错一律明确报错（沿用候选 8 的姿态）。

## 明确不做

- **不支持跨回合补画到旧图**：tab 按回合稳定是刻意的（每张图是可回溯的产物），跨回合再画就是新图。
- **不叠独立的"标注层"**：不做一层与机械价位分离的渲染层；追加走同一份 spec（重画整图）。
- **工具栏重拉不丢线**：为此把价位设置写进 `ChartSpec.controls`，并让客户端的 `ControlTarget` /
  `chartQuery` 保真回传（`levels` 原文用 `|` 分隔）——否则用户点任一开关重拉时，模型挑的线会消失。

## 验收标准

- [x] 显式价位出现在图上，且不产生新的对话消息（同回合的一次工具调用；tab 被更新而非新开）
- [x] 失效位在视觉上与机械三类区分（琥珀色 + `invalidation` 类别）
- [x] 格式/类别/互斥/超限不合法时明确报错，不静默
- [x] 纯逻辑部分（解析器、替换语义、控件保真）有单测
- [ ] 渲染观感由用户实测（本沙箱起不了浏览器）

## 实现

- `src/market/chartLevels.ts`：`parseChartLevels`（纯函数，含上限与错误信息）+ `ExplicitLevel`。
- `shared/chartSpec.ts`：`ChartLevel.kind` 扩 `invalidation`；`ChartControls` 增价位设置（保真）。
- `presentation.ts`：`ChartLevelOptions.explicitLevels`（替换语义）+ `LEVEL_COLORS.invalidation`。
- `intent.ts`：`ChartRequest.levels`、互斥校验、`levelOptions.explicitLevels`、`levelControls`（原文）。
- `request.ts`：query 解析 `levels`（`|` 分隔）；`buildChartSpec` 把设置写进 `controls`。
- `client/controls.ts`：`ControlTarget` 读/编码价位设置。
- `trading_chart` 暴露 `levels`；skill 增参数表与「把结论里的价位补画到图上」一节。

实测（真实 Binance，经构建产物走工具）：
① 缺省 → 5 条机械价位；② `levels:["85237.96:support","86361.24:resistance","84843:invalidation"]`
→ 恰好 3 条，失效位为 `#f5a623`；③ `levels` + `levelsPerSide` → 互斥报错；④ `"100:suport"` → 报错并列出合法类别；
⑤ `controls` 保真为 `{"levels":["84843:invalidation"],...}`。

测试：chartLevels 5、presentation 3、intent 3、client controls 3、skill 3；全库 380 例通过。
