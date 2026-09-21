# 工单跟踪器 (Issue tracker)：本地 Markdown

本仓库的 issue 与规格以 markdown 文件形式存放在 `.scratch/` 下。

## 约定 (Conventions)

- 每个功能一个目录：`.scratch/<feature-slug>/`
- 规格是 `.scratch/<feature-slug>/spec.md`
- 实现工单是每个工单一文件，位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，绝不使用单个合并的工单文件
- triage 状态记录为每个 issue 文件顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论和对话历史追加到文件底部 `## Comments` 标题下

## 当 skill 说“发布到 issue tracker”时 (When a skill says "publish to the issue tracker")

在 `.scratch/<feature-slug>/` 下创建新文件（如需要则创建目录）。

## 当 skill 说“获取相关工单”时 (When a skill says "fetch the relevant ticket")

读取所引用路径下的文件。用户通常会直接传入路径或 issue 编号。

## Wayfinding 操作 (Wayfinding operations)

由 `/wayfinder` 使用。**map** 是一个文件，每个工单对应一个 **child** 文件。

- **Map**：`.scratch/<effort>/map.md`（Notes / Decisions-so-far / Fog 正文）。
- **Child 工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，正文中写问题。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞 (Blocking)**：顶部附近的 `Blocked by: NN, NN` 行。当它列出的每个文件都是 `resolved` 时，工单即解除阻塞。
- **Frontier**：扫描 `.scratch/<effort>/issues/`，找出处于打开、未阻塞且未认领状态的文件；编号最小者优先。
- **Claim**：在做任何工作前设置 `Status: claimed` 并保存。
- **Resolve**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后把一条上下文指针（gist + 链接）追加到 `map.md` 中 map 的 Decisions-so-far。
