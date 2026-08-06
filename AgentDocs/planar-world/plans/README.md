# 平面世界计划

本目录遵守 [AgentDocs plan 模板](../../_template/plans/README.md)。

## 当前计划

- 总体计划（extension plan）：
  [2026-08-05-planar-world-extension.md](2026-08-05-planar-world-extension.md)
- 最近完成的阶段计划（phase plan）：
  [2026-08-06-phase-7-manual-acceptance.md](2026-08-06-phase-7-manual-acceptance.md)
  （`completed`）
- active 阶段计划（phase plan）：无。
- proposed 阶段计划：无。

P1 至 P6 均已完成。P6-R001 至 P6-R004 已经 focused Architecture re-review 确认为`fixed`，
[2026-08-06-p6-planar-viewer-integration.md](../reviews/2026-08-06-p6-planar-viewer-integration.md)
为`approved`。Architecture Agent将P6代码、Specs、ADR/通用文档与AgentDocs形成独立本地
checkpoint；不push。项目负责人随后开始人工验收并确认wheel、boundary/home、near-side
pitch和skybox finding；terrain延期，地下模式保留未来能力边界。项目负责人已批准P7，
Execution Agent可以在计划边界内实现，但不得进入P8。

P7 initial Architecture/code review提出P7-R001至P7-R004；focused re-review已确认四项均为
`fixed`，
[2026-08-06-p7-manual-acceptance.md](../reviews/2026-08-06-p7-manual-acceptance.md)为
`approved`。项目负责人随后确认浏览器/GPU人工复测通过，P7已完成并形成独立本地checkpoint；
不push。P8尚未激活，下一步先讨论其阶段范围。

总体计划维护长期边界和 phase roadmap。阶段计划仅在对应阶段即将开始或正在执行时
细化；后续阶段不得在本目录提前创建实现级计划。

本扩展的计划正文默认使用中文，以便架构评审。API、标识符、路径、命令、
Metadata key 以及 `draft`、`pending` 等状态值保留英文，避免执行语义歧义。
