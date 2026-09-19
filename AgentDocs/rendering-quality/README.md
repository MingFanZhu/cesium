# Rendering Quality

## Metadata

| Field                  | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                         |
| Status                 | `active`                                                    |
| Planning model         | `extension`                                                 |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md)  |
| Current phase          | R13 technically complete; owner visual review pending       |
| Active phase plan      | None; latest [R13](plans/2026-09-19-r13-pass-submission.md) |
| Active standalone plan | None                                                        |
| Architecture contact   | Current task                                                |
| Execution contact      | Current task                                                |
| Last updated           | `2026-09-19`                                                |

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

- Current state: R13 depth/shadow/submission optimization and technical self-review are complete, after R12 checkpoint `3df2db9e84`.
- Next action: Owner visually reviews the updated Viewer; then select further optimization if needed. AO geometry, remaining cascade draws and effect processing still have costs. Retain the startup-camera configuration and R7 night visual follow-ups.
- Latest review: [R13 review](reviews/2026-09-19-r13-pass-submission.md); previous [R12 review](reviews/2026-09-19-r12-main-pass-reflections.md).
- Open discussions: None. Probes/GI remain deferred by the owner.
- Known risks: Total rendering remains about 19 FPS; R12 MRT memory cost and compatibility paths remain. The native no-depth-texture test fails identically on the previous checkpoint; this phase does not change unsupported-context initialization.
- Validation: 9 floating-array, 12 AO and 7 shadow-quality tests pass in development/release; 33 native uniform, 9 Planar shadow, 9 SSR and 46 native shadow tests pass. One native shadow failure is reproduced on the prior checkpoint. Full builds/types, patch audit, scoped checks and real-scene inspection are recorded in the review.
- Previous checkpoint: R12 `3df2db9e84`; R13 receives its own independent commit.
- Related ADR / SGP: `ADR-0092`; `SGP-0013/0014/0021`; three upstream files are changed.
- Examples: [夜景光照](../../Test/Rendering/夜景光照.html)、[实景对比](../../Test/Rendering/实景对比.html)、[独立效果目录](../../Test/Rendering/示例目录.html).
