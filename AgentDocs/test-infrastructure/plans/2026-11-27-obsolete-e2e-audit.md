# SceneGIS 浏览器用例复查

- 类型 `standalone plan`
- 状态 `completed`
- 日期 `2026-11-27`
- 负责人角色 `架构 / 执行`
- [ADR-0211](../../../Documentation/SceneGIS/Decisions/ADR-0211-scenegis-test-layout.md)
- [验收评审](../reviews/2026-11-27-obsolete-e2e-audit.md)

复查迁移后 192 项 Playwright 用例。分别核对生产 API、夹具及既有 Jasmine 覆盖。
六个 spec 跟随 Cesium `release` 入口，移除八次重复注册。平面地形计时由既有 Jasmine 用例覆盖。
同步更新分屏视口、相机面板、零高度地形、岸线索引和大气环境用例的前提。
开发和发行入口各发现 183 项 Playwright 用例，本地 `Test/` 原有的 411 个文件均已核对。

待定位用例与本次验证状态见评审。同步 `origin/scenegis/develop` 时使用正常快进，核对远程树的 `Test/` 路径计数。
