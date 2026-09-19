# Rendering Quality

## Metadata

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                        |
| Status                 | `active`                                                   |
| Planning model         | `extension`                                                |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md) |
| Current phase          | R10 Shadow refinement                                      |
| Active phase plan      | [R10](plans/2026-09-19-r10-shadow-refinement.md)           |
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

- Current state: R10 technically complete; owner advanced to direct-only shadow lighting after the zoom fix.
- Next action: Checkpoint R10, then activate direct-only shadow lighting.
- Acceptance follow-up: Example wheel crash fixed by retaining the native camera far range;
  real zoom-in/out regression passes in both Worlds. No additional engine or upstream change.
- Priority: Photogrammetry first; future shadows, indirect light, reflection completeness and night lighting each keep focused examples.
- Open discussions: None.
- Latest review: [R10 review](reviews/2026-09-19-r10-shadow-refinement.md).
- Known risks: Baked photogrammetry lighting, single-leaf sample scope, distance-band rescaling and native final-color shadow modulation. R9 Globe shadow bands are fixed.
- Validation: 47 native shadow tests, 9 Planar GPU tests, 5 new GPU tests in dev/release, and 5 E2E pass. Builds/types, scoped ESLint and patch audit pass. Matched GPU median rises 1.719 to 2.597 ms; details in R10 review.
- Checkpoints: R1 `4ea24b89ef`; R2 `c824cfec1e`; R3 `2e2dc02ce6`; R6 `f9301bf8cd`, all accepted.
- Active phase ADR / SGP: [ADR-0088](../../Documentation/SceneGIS/Decisions/ADR-0088-directional-shadow-refinement.md), `SGP-0013`.
- Example: [阴影精细度](../../Test/Rendering/阴影精细度.html)、[实景对比](../../Test/Rendering/实景对比.html)、[独立效果目录](../../Test/Rendering/示例目录.html).
