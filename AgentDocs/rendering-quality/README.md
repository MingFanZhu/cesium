# Rendering Quality

## Metadata

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                               |
| Status                 | `active`                                                          |
| Planning model         | `extension`                                                       |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md)        |
| Current phase          | R12 technically complete; owner visual review pending             |
| Active phase plan      | None; latest [R12](plans/2026-09-19-r12-main-pass-reflections.md) |
| Active standalone plan | None                                                              |
| Architecture contact   | Current task                                                      |
| Execution contact      | Current task                                                      |
| Last updated           | `2026-09-19`                                                      |

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

- Current state: R12 main-pass MRT implementation and technical self-review are complete, following performance maintenance checkpoint `cbd429e11b`.
- Next action: Owner visually reviews the updated Viewer; then select the next bounded performance phase. Retain the saved startup-camera configuration follow-up and R7 night visual acceptance.
- Latest review: [R12 review](reviews/2026-09-19-r12-main-pass-reflections.md); previous [Performance review](reviews/2026-09-19-real-scene-performance.md).
- Open discussions: None. Probes/GI remain deferred by the owner.
- Known risks: AO depth replay, native draw/uniform submission and shadow/effect work remain. Paired MRT samples are 9–11 FPS, with 25–27% lower frame time and 1574 fewer capture draws; MSAA MRT costs about 103 MiB extra in this view. Native compatibility cases retain replay.
- Validation: 9 SSR, 11 AO and 12 water development GPU tests; final 9 SSR and 12 water release tests; complete build/declarations/types, patch audit and scoped checks pass. Saved settings and near-view workload are preserved.
- Previous checkpoint: Performance maintenance `cbd429e11b`; R12 receives its own independent commit.
- Related ADR / SGP: `ADR-0091`, amending `ADR-0086`; five upstream integration files use existing `SGP-0016`.
- Examples: [夜景光照](../../Test/Rendering/夜景光照.html)、[实景对比](../../Test/Rendering/实景对比.html)、[独立效果目录](../../Test/Rendering/示例目录.html).
