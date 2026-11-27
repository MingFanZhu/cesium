# SceneGIS 测试基础设施

- 状态 `completed`
- Planning model `extension`
- 最近阶段 [Playwright 迁移](plans/2026-11-27-playwright-layout.md)
- 总体计划 [测试目录与依赖分离](plans/2026-11-27-test-layout.md)
- 决策 [ADR-0211](../../Documentation/SceneGIS/Decisions/ADR-0211-scenegis-test-layout.md)
- 上游补丁 `SGP-0076`
- 分支 `feature/scenegis-test-layout`

维护 Jasmine、Playwright、共享测试夹具与本地调试目录之间的边界。
Playwright 位于 `Specs/e2e/SceneGIS/`，已有 Jasmine Specs 随 engine 和 widgets workspace。
暂无开放讨论。验证结果见 [迁移评审](reviews/2026-11-27-playwright-layout.md)。
