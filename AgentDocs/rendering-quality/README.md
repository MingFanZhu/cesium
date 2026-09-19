# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | Real-scene performance maintenance                         |
| Active phase plan      | None                                                       |
| Active standalone plan | [Performance](plans/2026-09-19-real-scene-performance.md)  |
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
- Development examples: [AdvancedEnvironment](../../Test/AdvancedEnvironment/)、[Planar](../../Test/Planar/)、[Rendering](../../Test/Rendering/)
- Sandcastle: No new example planned yet.
- Related ADR: [ADR-0039](../../Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)、[ADR-0054](../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)、[ADR-0055](../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Related SGP: `SGP-0007`、`SGP-0008`、`SGP-0009`、`SGP-0010`; R1 adds `SGP-0013` and updates `SGP-0001/0002` seams.

- R1 ADR: [ADR-0083](../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md).
- R1 example: [级联阴影](../../Test/Planar/级联阴影.html).

## Current handoff

- Current state: [Real-scene performance maintenance](plans/2026-09-19-real-scene-performance.md) implementation and technical review complete; final release package loaded in Viewer.
- Next action: Owner visual confirmation at the restored near view; retain the saved startup-camera configuration follow-up and R7 night visual acceptance.
- Latest review: [Performance review](reviews/2026-09-19-real-scene-performance.md); previous [R7 review](reviews/2026-09-19-r7-local-lights.md).
- Open discussions: None. Probes/GI remain deferred by the owner.
- Known risks: Draw submission, AO depth replay, SSR shaded replay and shadow/effect GPU work remain; fixed-view frame rate is approximately 14–15 FPS versus 5 FPS before this fix.
- Validation: 18 development GPU tests, 2 release regressions, development/release builds and scoped checks pass. Saved rendering settings and original near-view workload are preserved.
- Previous checkpoint: R7 `f1a002ae46`; independent from performance maintenance.
- Related ADR / SGP: `ADR-0084/0086`, existing `SGP-0014/0016`; this maintenance changes no upstream file or SGP entry.
- Examples: [夜景光照](../../Test/Rendering/夜景光照.html)、[实景对比](../../Test/Rendering/实景对比.html)、[独立效果目录](../../Test/Rendering/示例目录.html).
