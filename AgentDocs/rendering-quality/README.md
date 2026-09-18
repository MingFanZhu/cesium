# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | R6 Screen-space reflections                                |
| Active phase plan      | [R6](plans/2026-09-19-r6-screen-space-reflections.md)      |
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

- Current state: R3 accepted and checkpointed; R6 SSR implemented, technically reviewed and explicitly accepted by the owner on 2026-09-19.
- Next action: Checkpoint R6, then investigate local water rendering as requested by the owner.
- Priority assumption: Desktop WebGL2; Globe / Planar outdoor PBR models and 3D Tiles.
- Open discussions: None.
- Latest review: [R6 review](reviews/2026-09-19-r6-screen-space-reflections.md).
- Known risks: Screen-space misses, approximate glossy filtering, opaque-only receivers and full-resolution replay/storage costs.
- Validation: 27 focused strict GPU Specs, build/release/types and patch audit pass. Bounded GPU timing and resource costs are in the R6 review.
- Checkpoints: R1 `4ea24b89ef`; R2 `c824cfec1e`; R3 `2e2dc02ce6`, all accepted.
- ADR: [ADR-0085](../../Documentation/SceneGIS/Decisions/ADR-0085-physical-sky-specular-ibl.md); SGP: `SGP-0015`.

- Active R6 ADR: [ADR-0086](../../Documentation/SceneGIS/Decisions/ADR-0086-forward-screen-space-reflections.md); SGP: `SGP-0016`.
