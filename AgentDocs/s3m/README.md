# S3M compatibility

## Metadata

| Field                  | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Extension slug         | `s3m`                                                       |
| Status                 | `active`                                                    |
| Planning model         | `extension`                                                 |
| Active extension plan  | [S3M loading](plans/2026-10-20-s3m-loading.md)              |
| Current phase          | S1 完成，等待提交检查点后进入 S2                            |
| Active phase plan      | None                                                        |
| Active standalone plan | None；[已完成评估](plans/2026-10-20-compatibility-audit.md) |
| Architecture contact   | 当前任务自检                                                |
| Execution contact      | 当前任务                                                    |
| Last updated           | `2026-10-20`                                                |

## Scope and engineering links

- 目标：兼容超图 S3M 图层加载，检查 SCP 和 iServer 图层 config 入口。
- 官方样例优先，用户旧 CBD 服务作为回归补充；球面和平面分别明确坐标契约。
- 资格限定 S3M 1.0 样例，不承诺商业 iClient 全部功能或所有 S3M 版本兼容。
- Source: `packages/engine/Source/SceneGIS/Core/_private/_SceneGISS3m*.js`
- Specs: `packages/engine/Specs/SceneGIS/Core/SceneGISS3mDecodeSpec.js`、
  `Specs/e2e/scenegis-s3m-bridge.spec.js`
- Branch: `feature/s3m-loading`
- ADR: [ADR-0174](../../Documentation/SceneGIS/Decisions/ADR-0174-s3m-model-loading.md)
- SGP: None；没有修改 upstream-owned files。
- Open discussion: [数据覆盖与集成边界](discussions/2026-10-20-loading-boundaries.md)
- Latest review: [S1 review](reviews/2026-10-20-s1-review.md)

## Current handoff

S1 已验证 Worker → 内存 GLB → 原生 Model 的普通 / 实例化绘制、拾取和销毁。
建立本地检查点后，S2 实现 Layer、LOD、严格 World 绑定、定位与三类双世界示例。
新版格式继续 deferred；其余未解决项保留在 discussion / review 中。
