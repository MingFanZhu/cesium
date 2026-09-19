# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | R14 technically complete; owner visual review pending      |
| Active phase plan      | None; latest [R14](plans/2026-09-19-r14-main-pass-ao.md)   |
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
- Development examples: [AdvancedEnvironment](../../Test/AdvancedEnvironment/)、[Planar](../../Test/Planar/)、[Rendering](../../Test/Rendering/)
- Sandcastle: No new example planned yet.
- Related ADR: [ADR-0039](../../Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)、[ADR-0054](../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)、[ADR-0055](../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Related SGP: `SGP-0007`、`SGP-0008`、`SGP-0009`、`SGP-0010`; R1 adds `SGP-0013` and updates `SGP-0001/0002` seams.

- R1 ADR: [ADR-0083](../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md).
- R1 example: [级联阴影](../../Test/Planar/级联阴影.html).

## Current handoff

- Current state: R14 shared main-pass AO MRT and technical review are complete after R13 `6b472fa2e4`.
- Next action: Owner visually reviews the updated Viewer; choose further performance work separately. Retain startup-camera configuration and R7 night follow-ups.
- Latest review: [R14 review](reviews/2026-09-19-r14-main-pass-ao.md); previous [R13 review](reviews/2026-09-19-r13-pass-submission.md).
- Open discussions: None. Probes/GI remain deferred by the owner.
- Known risks: Qualified AO has zero geometry draws and about 18% lower paired frame time, with extra MRT storage. LDR/multi-frustum/classification and unqualified post-lighting paths retain prepasses. R13's existing native no-depth-texture failure remains.
- Validation: 14 AO, 9 SSR and 12 Water tests pass in development/release; full build/types, patch audit and real-scene inspection pass. Six upstream files and the exact performance/resource tradeoff are recorded in the review.
- Previous checkpoint: R13 `6b472fa2e4`; R14 receives its own independent commit.
- Related ADR / SGP: `ADR-0093`; `SGP-0014/0016`.
- Examples: [夜景光照](../../Test/Rendering/夜景光照.html)、[实景对比](../../Test/Rendering/实景对比.html)、[独立效果目录](../../Test/Rendering/示例目录.html).
