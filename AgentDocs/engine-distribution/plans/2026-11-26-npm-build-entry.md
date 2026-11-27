# SceneGIS 发行构建 npm 入口

- 类型 `standalone plan`
- 状态 `completed`
- 日期 `2026-11-26`
- 负责人角色 `架构 / 执行`
- 决策 [ADR-0205](../../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md)
- 上游补丁 `SGP-0073`
- [评审](../reviews/2026-11-26-npm-build-entry.md)

在根 `package.json` 新增 `build-scenegis`，复用 `gulp buildSceneGIS` 生成发行目录。
在发行说明与开发指南中使用 npm 入口。根 JSON 使用 SGP-0073 的 `manifest-only` 登记。

`npm run build-scenegis` 已生成完整发行目录。声明、运行时导出和文档的 7 项测试通过。
