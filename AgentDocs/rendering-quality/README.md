# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | R15 Bistro correction complete; owner review pending       |
| Active phase plan      | None                                                       |
| Active standalone plan | None                                                       |
| Architecture contact   | Current task                                               |
| Execution contact      | Current task                                               |
| Last updated           | `2026-09-21`                                               |

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
- R4 correction checkpoint `c3add1660a` is owner accepted as usable on 2026-09-21. Existing moving-content limitations remain documented.
- Previous accepted plan / review: [R4 plan](plans/2026-09-20-r4-temporal-antialiasing.md), [zoom/reference review](reviews/2026-09-21-r4-temporal-reference-adaptation.md).
- Verification: 45 strict feature/regression Specs, full release/types and patch audit pass. Native AutomaticUniforms has 87 passes and one pre-existing overlay constant mismatch.
- Owner-reported static TAA jitter is corrected by current-pixel reconstruction and slope-aware depth rejection. The real reference ROI improves 87%; the new regression fails on the prior release and passes on the correction.
- Follow-up to `9255216681`: retain actual covered-pixel depth and adapt the pinned Filament resolve after owner-reported zoom instability. Twelve dev/release TAA Specs pass; moving-camera spatial-reference error improves 22%. The isolated resolve costs about 0.01 ms more at 1198x852, with no new geometry, pass or target. This correction changes no upstream file.
- Real-view FPS is essentially unchanged at 37–38; estimated auxiliary storage saving is 59.2 MiB. TAA stays optional, with no native-default changes.
- Both-world [standalone AA example](../../Test/Rendering/时域抗锯齿.html) and the [reference scene](../../Test/Rendering/实景对比.html) expose comparison controls.
- Decision / seam: ADR-0094 / SGP-0022. Three upstream files; camera-only reprojection retains moving-content limitations.
- [R15 PBR reference scene](plans/2026-09-21-r15-pbr-reference-scene.md) and [technical review](reviews/2026-09-21-r15-pbr-reference-scene.md) are complete: local Intel Sponza main/composite pages, explicit 2K delivery and retained original 4K, Khronos material targets, pool and fixed comparisons. Five fixture/E2E checks pass; owner visual review is pending. No upstream or renderer change. Retain R7 night and Viewer startup-camera follow-ups; no new GI/glass phase is active.
- Follow-up: physical atmosphere controls are owner accepted; standard navigation is restored
  with downward inspection poses. The owner prefers a GIS street scene and plans to prepare
  converted city assets. The supplied Bistro GLB and original FBX/texture archive now
  complete the [Bistro fixture follow-up](plans/2026-09-21-r15-bistro-scene.md).
- [Bistro review](reviews/2026-09-21-r15-bistro-scene.md): default street fixture, restored
  source material channels, explicit 1K delivery, both-world checks and retained Sponza
  composite. Three Bistro tests and one existing Planar composite regression pass. Original
  GLB/FBX/DDS remain intact; glass/source conversion limitations are documented. Owner visual
  acceptance is pending. No upstream files, SGP or next renderer phase.
- Railing follow-up to `388a4d8162`: singular UVs without tangents produced white
  speckles in native material normals. The [Bistro plan](plans/2026-09-21-r15-bistro-scene.md)
  and [review](reviews/2026-09-21-r15-bistro-scene.md) record the correction, GPU tests
  and unchanged-view inspection. One upstream shader, `SGP-0023` /
  [ADR-0095](../../Documentation/SceneGIS/Decisions/ADR-0095-degenerate-model-normal-mapping.md).
  Camera/settings are restored. No subsequent renderer phase is active.
