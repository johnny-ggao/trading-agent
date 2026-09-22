# 09: 可选视觉（PNG 给模型）

**要构建什么：** 当模型路由声明支持图片输入时，宿主把同一 `chartSpec` 栅格化为 PNG 并作为图片内容块附上，供模型"看"形态；纯文本路由自动静默降级为数值路径。

**Blocked by:** 03

**Status:** ready-for-agent（**前置：用户开启图像输入**，见下）

**前置条件（用户侧，插件不改用户 harness 配置）**：当前会话路由必须声明 `image` 输入。
开启方式由用户在「设置 → 模型 → 模型选项 → 勾选图片」里自行操作；机制与坑点见
[docs/research/dsh-image-input-gate.md](../../../docs/research/dsh-image-input-gate.md)。
要点：`llm-deepseek.models` 是**全量替换**，只写 `id`+`name` 的覆盖条目会把多模态模型降级为纯文本。

- [ ] 服务端把 `chartSpec` 栅格化为 PNG
- [ ] 以图片内容块附给模型
- [ ] 纯文本路由静默降级
- [ ] 尺寸/格式符合 DSH 限制（`imageMaxBytes` 与 `imagePixelBudget`，本机 vision 条目为 1 MiB / 640000 px）
- [ ] 启用后做一次真实联调：小 PNG → 确认端点接受且模型能描述形态（勾选 ≠ 端点支持）

## Comments

- 2026-09-22：**查清了闸门机制与前置条件，并把事实落成文档。**
  - 新增 [docs/research/dsh-image-input-gate.md](../../../docs/research/dsh-image-input-gate.md)：
    闸门在 `read-image` / ACP 图像路径上按**会话路由**解析出的 `inputModalities` 判定；
    `llm-deepseek.models` 全量替换，缺 `inputModalities` 按 `?? ['text']` 落地。
  - 本机实测：内置目录里 `deepseek-flash` 是 `['text','image']`（多模态），但本机
    `~/.dsh/settings.yaml` 的覆盖条目只写了 `id`+`name`，实测解析结果是 `['text']` ——
    模型本身多模态，被本地覆盖降级了（连带丢掉 `systemPromptUpdate: 'in-history'`）。
  - 因此本工单**动工前需要用户先开启图像输入**；否则宿主只能走数值路径，无法验证图像链路。
  - 已知硬约束：图片预算由活动路由声明（本机 `imageMaxBytes: 1048576`、`imagePixelBudget: 640000`），
    栅格化产物必须落在预算内。
