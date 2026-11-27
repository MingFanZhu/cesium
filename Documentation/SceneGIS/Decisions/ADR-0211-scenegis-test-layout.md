# ADR-0211 SceneGIS 测试目录与本地试验边界

- 状态 `accepted`
- 日期 `2026-11-27`
- 决策负责人 `Architecture Agent`
- 上游补丁 `SGP-0076`
- [迁移计划](../../../AgentDocs/test-infrastructure/plans/2026-11-27-playwright-layout.md)

## 测试所有权

Cesium 用 `packages/engine/Specs/` 和 `packages/widgets/Specs/` 组织 Jasmine，生成的
SpecList 由 Gulp 和 Karma 消费。SceneGIS Jasmine 继续放在各 workspace 的 `Specs/SceneGIS/`。
独立构建工具的 Node 测试随对应工具维护。

`Specs/e2e/SceneGIS/` 是 SceneGIS 自有 Playwright 子目录。用例在目录内集中维护，共享的
HTML、模块和数据放在 `fixtures/`，专用 Playwright 配置放在 `config/`。根开发服务已支持
静态访问 `Specs/`。通用配置递归发现普通浏览器用例，发行包专用用例使用独立配置和服务。
PBR 校准验证使用 Cesium 的小型 Box glTF 和合成对照图。Bistro、Sponza 和 Blender 导出结果用于本地画面对比。
现有 `.npmignore` 排除 `Specs/`。本地 `Test/` 同时由 Git 和 npm 忽略，独立于干净检出的验证路径。

## 上游接入

`SGP-0076` 登记仓库根 ignore 规则以及 Playwright 发行用例过滤。浏览器和 Jasmine
继续使用现有 Cesium 构建、引擎资源与测试设施。升级时核对 Playwright 递归发现、
默认快照路径、开发 server 静态根和 npm 发布排除规则。
