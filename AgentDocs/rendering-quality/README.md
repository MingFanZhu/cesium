# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | R2 completed; R3 physical sky reflections next             |
| Active phase plan      | [R2](plans/2026-09-18-r2-ambient-occlusion.md)             |
| Active standalone plan | None                                                       |
| Architecture contact   | Current task                                               |
| Execution contact      | Current task                                               |
| Last updated           | `2026-09-19`                                               |

## Scope

提升 Globe / Planar 的场景光照、材质、遮蔽、反射和运动稳定性，按可见收益、覆盖范围、
实现成本与每帧开销逐项推进。已有大气、云、雾继续由 `atmosphere-clouds-effects` 维护。
具体实现阶段进入前再确定 ADR、SGP 和公共 API；默认延续 Cesium 原生 API。

## Engineering links

- Source: [native Scene](../../packages/engine/Source/Scene/)、[SceneGIS Scene](../../packages/engine/Source/SceneGIS/Scene/)、[SceneGIS shaders](../../packages/engine/Source/Shaders/SceneGIS/)
- Tests: [SceneGIS Specs](../../packages/engine/Specs/SceneGIS/)、[native Scene Specs](../../packages/engine/Specs/Scene/)
- Development examples: [AdvancedEnvironment](../../Test/AdvancedEnvironment/)、[Planar](../../Test/Planar/)
- Sandcastle: No new example planned yet.
- Related ADR: [ADR-0039](../../Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)、[ADR-0054](../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)、[ADR-0055](../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Related SGP: `SGP-0007`、`SGP-0008`、`SGP-0009`、`SGP-0010`; R1 adds `SGP-0013` and updates `SGP-0001/0002` seams.

- R1 ADR: [ADR-0083](../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md).
- R1 example: [级联阴影](../../Test/Planar/级联阴影.html).

## Current handoff

- Current state: R2 accepted by owner continuation on 2026-09-19; implementation and technical self-review complete.
- Next action: Create the isolated R2 checkpoint, then enter R3 physical sky reflections.
- Priority assumption: Desktop WebGL2, outdoor city and terrain scenes, Globe / Planar both supported.
- Open discussions: None.
- Latest review: [R2 review](reviews/2026-09-18-r2-ambient-occlusion.md).
- Known risks: Screen-space/offscreen limits, thin geometry, explicit WebGL2 float requirement, ground/vector/transparent exclusions.
- Validation: 72 focused AO/shadow/native postprocess Specs with WebGL validation; build/release/types/lint/audit and GPU cost documented in R2 review.

R1 checkpoint: `4ea24b89ef`. Current phase: [R2 ambient occlusion](plans/2026-09-18-r2-ambient-occlusion.md), completed; owner acceptance confirmed.

- R2 ADR: [ADR-0084](../../Documentation/SceneGIS/Decisions/ADR-0084-forward-ambient-occlusion.md), `SGP-0014`.
- R2 example: [环境光遮蔽](../../Test/Planar/环境光遮蔽.html).
