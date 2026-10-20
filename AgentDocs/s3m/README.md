# S3M compatibility

## Metadata

| Field                  | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Extension slug         | `s3m`                                                       |
| Status                 | `implemented`；负责人视觉验收待进行                         |
| Planning model         | `extension`                                                 |
| Active extension plan  | None；[已完成首版](plans/2026-10-20-s3m-loading.md)         |
| Current phase          | S1 / S2 实现、自动化验收与自检完成                          |
| Active phase plan      | None；[已完成 S2](plans/2026-10-20-phase-s2-layer.md)       |
| Active standalone plan | None；[已完成评估](plans/2026-10-20-compatibility-audit.md) |
| Architecture contact   | 当前任务自检                                                |
| Execution contact      | 当前任务                                                    |
| Last updated           | `2026-10-20`                                                |

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
- Branch: `feature/s3m-loading`
- ADR: [ADR-0174](../../Documentation/SceneGIS/Decisions/ADR-0174-s3m-model-loading.md)
- SGP: None；没有修改 upstream-owned files。
- Open discussion: [数据覆盖与集成边界](discussions/2026-10-20-loading-boundaries.md)
- Latest review: [S2 review](reviews/2026-10-20-s2-review.md)

## Current handoff

S1 检查点 `1a15263a2b`。S2 已完成 Layer、LOD、严格 World 绑定、定位和示例。
12 Specs、2 bridge E2E 通过；三类数据双世界 6 场景在开发及发布 runtime 均通过，
发布版包含环境开启和热帧资源稳定检查；完整构建与类型检查通过。
当前交付等待负责人视觉判断。新版格式继续 deferred，由 architecture 角色在取得
样例后另立 phase；其余限制见 S2 review。未推送或合并功能分支。
