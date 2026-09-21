# 领域文档 (Domain Docs)

工程类 skill 在探索代码库时应如何使用本仓库的领域文档。

## 探索之前，先读这些 (Before exploring, read these)

- 仓库根部的 **`CONTEXT.md`**，或者
- 如果存在，仓库根部的 **`CONTEXT-MAP.md`**：它为每个 context 指向一个 `CONTEXT.md`。读取与主题相关的每一个。
- **`docs/adr/`**：读取涉及你即将处理区域的 ADR。在多 context 仓库中，还要检查 `src/<context>/docs/adr/` 中按 context 划分的决策。

如果这些文件中有任何一个不存在，**静默继续**。不要指出它们缺失；不要主动建议创建它们。`/domain-modeling` skill（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 到达）会在术语或决策真正被确定时按需创建它们。

## 文件结构 (File structure)

单 context 仓库（大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多 context 仓库（根部存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 按 context 划分的决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表的词汇 (Use the glossary's vocabulary)

当你的输出命名某个领域概念时（在 issue 标题、重构提案、假设、测试名称中），使用 `CONTEXT.md` 中定义的术语。不要漂移到术语表明确避免的同义词。

如果你需要的概念还不在术语表中，这是一个信号：要么你在发明项目不使用的语言（重新考虑），要么存在真实的空缺（记录下来交给 `/domain-modeling`）。

## 标记 ADR 冲突 (Flag ADR conflicts)

如果你的输出与现有 ADR 矛盾，明确揭示出来，而不是悄悄覆盖：

> _与 ADR-0007（event-sourced orders）矛盾，但值得重新开启，因为……_
