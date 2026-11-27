# SceneGIS 测试目录与依赖分离

- 类型 `extension plan`
- 状态 `completed`
- 日期 `2026-11-27`
- 负责人角色 `架构 / 执行`
- 决策 [ADR-0211](../../../Documentation/SceneGIS/Decisions/ADR-0211-scenegis-test-layout.md)
- 上游补丁 `SGP-0076`

按当前 Cesium 测试执行方式维护 SceneGIS 用例。Jasmine 归属 engine 或 widgets workspace。
Playwright、浏览器夹具和定向配置集中在一个 SceneGIS 子目录。本地 `Test/` 可在任意开发
工作区使用，干净检出应能独立收集和运行自动化测试。

| 阶段                                               | 范围                                   | 验收                                             |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| [Playwright 迁移](2026-11-27-playwright-layout.md) | 迁出共享夹具和浏览器测试，排查失效入口 | 必需夹具均版本化，覆盖可收集，关键自动化验证通过 |

保留独立构建工具的 Node 测试入口和 Cesium Jasmine 生成链。测试目录不进入 npm 发行物。
大型 PBR 对照场景留在本地。现行自动化的覆盖与退役理由见
[迁移评审](../reviews/2026-11-27-playwright-layout.md)。
