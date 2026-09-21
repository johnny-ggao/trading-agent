## 项目约定

- **所有文档一律使用中文。** 新增或修改的 Markdown（spec、工单、ADR、调研、CONTEXT、AGENTS 等）都用中文书写。代码标识符、文件名、URL、包名、命令与代码片段，以及必要的技术专名，可保留英文。

## Agent skills

### Issue tracker

本仓库的 issue 与 spec 以 markdown 文件形式存放在 `.scratch/<feature>/` 下。见 `docs/agents/issue-tracker.md`。

### Triage labels

triage 使用五个规范角色标签，字符串与角色名一致：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单 context 布局：仓库根部的 `CONTEXT.md` 与 `docs/adr/`。见 `docs/agents/domain.md`。
