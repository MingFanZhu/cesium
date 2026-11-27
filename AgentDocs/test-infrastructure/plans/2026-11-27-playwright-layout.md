# Playwright 用例与夹具迁移

- 类型 `phase plan`
- 状态 `completed`
- 日期 `2026-11-27`
- 负责人角色 `架构 / 执行`
- 父计划 [测试目录与依赖分离](2026-11-27-test-layout.md)
- 架构评审 `confirmed`
- 决策 [ADR-0211](../../../Documentation/SceneGIS/Decisions/ADR-0211-scenegis-test-layout.md)
- 上游补丁 `SGP-0076`
- [迁移评审](../reviews/2026-11-27-playwright-layout.md)

`Specs/e2e/playwright.config.js` 递归收集用例。SceneGIS 有 71 个浏览器 spec，另有一个
共用断言模块。64 个 spec 引用 `Test/` 下的页面或数据。发行测试需要独立 server。
现有通用收集在 `ktx-parse` 导入报错，原因是依赖安装在 engine workspace。

迁移用例和实际共享夹具到 `Specs/e2e/SceneGIS/`。保留定向配置的运行条件与测试选择，
停止对本地试验目录导航和旧路由做发布断言。用静态双色 KTX2 夹具验证原有 IBL 场景。
解除 `Test/` 的版本追踪前核查剩余引用，本地工作目录完整保留。

验收检查覆盖 Playwright 收集、发行测试路由、测试夹具请求、球面和平面代表用例、
Jasmine 生成链、npm 包边界和上游补丁登记。负责人确认 Bistro 和 Sponza 仅用于本地场景，
退役依赖两份数据的专项，PBR 校准以原生 Box 和合成图收集到通用配置。
