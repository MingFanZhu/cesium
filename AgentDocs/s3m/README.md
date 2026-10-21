# S3M compatibility

## Metadata

| Field                  | Value                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| Extension slug         | `s3m`                                                                   |
| Status                 | 首版已验收；runtime transform 完成，负责人已确认提交                    |
| Planning model         | `extension` + follow-up `standalone`                                    |
| Active extension plan  | None；[已完成首版](plans/2026-10-20-s3m-loading.md)                     |
| Current phase          | Runtime transform standalone 完成实现与自动验证                         |
| Active phase plan      | None；[已完成 S2](plans/2026-10-20-phase-s2-layer.md)                   |
| Active standalone plan | None；[已完成 Runtime transform](plans/2026-10-21-runtime-transform.md) |
| Architecture contact   | 当前任务自检                                                            |
| Execution contact      | 当前任务                                                                |
| Last updated           | `2026-10-21`                                                            |

## Scope and engineering links

- 目标：兼容超图 S3M 图层加载，检查 SCP 和 iServer 图层 config 入口。
- 官方样例优先，用户旧 CBD 服务作为回归补充；球面和平面分别明确坐标契约。
- 资格限定 S3M 1.0 样例，不承诺商业 iClient 全部功能或所有 S3M 版本兼容。
- Source: `packages/engine/Source/SceneGIS/Core/_private/_SceneGISS3m*.js`、
  `packages/engine/Source/SceneGIS/Scene/SceneGISS3MLayer.js`
- Specs: `packages/engine/Specs/SceneGIS/Core/SceneGISS3mDecodeSpec.js`、
  `Specs/e2e/scenegis-s3m-bridge.spec.js`、`Specs/e2e/scenegis-s3m-layer.spec.js`
- Example: [S3M 加载](../../Test/S3M/图层加载.html)
- User guide: [S3M](../../Documentation/SceneGIS/S3M.md)
- Current branch: `feature/viewshed`
- ADR: [ADR-0174](../../Documentation/SceneGIS/Decisions/ADR-0174-s3m-model-loading.md)
- SGP: None；没有修改 upstream-owned files。
- Open discussion: [数据覆盖与集成边界](discussions/2026-10-20-loading-boundaries.md)
- Latest review: [Runtime transform review](reviews/2026-10-21-runtime-transform-review.md)

## Current handoff

S1 检查点 `1a15263a2b`，S2 检查点 `ec2d5fc702`。
S2 已完成 Layer、LOD、严格 World 绑定、定位和示例。
12 Specs、2 bridge E2E 通过；三类数据双世界 6 场景在开发及发布 runtime 均通过，
发布版包含环境开启和热帧资源稳定检查；完整构建与类型检查通过。
负责人于 `2026-10-20` 确认本轮视觉验收通过。新版格式继续 deferred，由 architecture 角色在取得
样例后另立 phase；其余限制见 S2 review。

2026-10-21 补齐公开可写 `modelMatrix`，支持赋值及原位修改、同步 bounds / LOD、
异步内容和独立拾取。局部源数据和原生 Model 被保留，无需清空缓存或重新解码。
13 Layer Specs、4 个精模/实例化双世界 WebGL E2E、完整构建和类型检查通过；
示例已增加矩阵调节和复位。源码自检完成，负责人于 2026-10-21 确认提交；
本轮代码、Specs、示例、ADR 和 AgentDocs 一起形成独立本地提交，未推送或合并。
本轮没有上游修改；之前验收的 viewshed 辅助线已独立提交 `1d21b2bf3b`。
