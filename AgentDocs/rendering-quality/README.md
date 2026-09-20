# Rendering Quality

## Metadata

| Field                  | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                             |
| Status                 | `active`                                                        |
| Planning model         | `extension`                                                     |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md)      |
| Current phase          | R4 technically complete; owner review pending                   |
| Active phase plan      | None; latest [R4](plans/2026-09-20-r4-temporal-antialiasing.md) |
| Active standalone plan | None                                                            |
| Architecture contact   | Current task                                                    |
| Execution contact      | Current task                                                    |
| Last updated           | `2026-09-20`                                                    |

## Scope

提升 Globe / Planar 的场景光照、材质、遮蔽、反射和运动稳定性，按可见收益、覆盖范围、
实现成本与每帧开销逐项推进。已有大气、云、雾继续由 `atmosphere-clouds-effects` 维护。
具体实现阶段进入前再确定 ADR、SGP 和公共 API；默认延续 Cesium 原生 API。

## Engineering links

- Source: [native Scene](../../packages/engine/Source/Scene/)、[SceneGIS Scene](../../packages/engine/Source/SceneGIS/Scene/)、[SceneGIS shaders](../../packages/engine/Source/Shaders/SceneGIS/)
- Tests: [SceneGIS Specs](../../packages/engine/Specs/SceneGIS/)、[native Scene Specs](../../packages/engine/Specs/Scene/)
- Development examples: [AdvancedEnvironment](../../Test/AdvancedEnvironment/)、[Planar](../../Test/Planar/)、[Rendering](../../Test/Rendering/)
- Sandcastle: No new example planned yet.
- Related ADR: [ADR-0039](../../Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)、[ADR-0054](../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)、[ADR-0055](../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Related SGP: `SGP-0007`、`SGP-0008`、`SGP-0009`、`SGP-0010`; R1 adds `SGP-0013` and updates `SGP-0001/0002` seams.

- R1 ADR: [ADR-0083](../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md).
- R1 example: [级联阴影](../../Test/Planar/级联阴影.html).

## Current handoff

- R14 checkpoint `31ba432cc8` is owner accepted on 2026-09-20.
- R4 optional TAA implementation and technical review are complete; owner visual review is pending.
- Latest plan / review: [R4 plan](plans/2026-09-20-r4-temporal-antialiasing.md), [R4 review](reviews/2026-09-20-r4-temporal-antialiasing.md).
- Verification: 45 strict feature/regression Specs, full release/types and patch audit pass. Native AutomaticUniforms has 87 passes and one pre-existing overlay constant mismatch.
- Owner-reported static TAA jitter is corrected by current-pixel reconstruction and slope-aware depth rejection. The real reference ROI improves 87%; the new regression fails on the prior release and passes on the correction. Visual re-acceptance remains pending.
- Real-view FPS is essentially unchanged at 37–38; estimated auxiliary storage saving is 59.2 MiB. TAA stays optional, with no native-default changes.
- Both-world [standalone AA example](../../Test/Rendering/时域抗锯齿.html) and the [reference scene](../../Test/Rendering/实景对比.html) expose comparison controls.
- Decision / seam: ADR-0094 / SGP-0022. Three upstream files; camera-only reprojection retains moving-content limitations.
- Next action: owner reviews quality; no further phase active. Retain R7 night and Viewer startup-camera follow-ups.
