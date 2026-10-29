# 局部三维城市风场

WebGL2 局部空气 LBM 与被动示踪；独立于 PBF 液体，不修改 SDK 或复制发行包。

## Metadata

| Field                  | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Extension slug         | `urban-wind`                                                       |
| Status                 | `completed`                                                        |
| Planning model         | `extension`                                                        |
| Active extension plan  | [roadmap](plans/2026-10-28-urban-wind.md)                          |
| Current phase          | W6 technically complete; owner visual gate pending                 |
| Active phase plan      | None; [completed W6](plans/2026-10-29-w6-particle-trajectories.md) |
| Active standalone plan | None                                                               |
| Architecture contact   | Current task / self-review                                         |
| Execution contact      | Current task                                                       |
| Last updated           | `2026-10-29`                                                       |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 局部米制三维静态障碍绕流、示踪输运、共享 GPU 场与双世界显示。

### Out of scope

- SDK、发行包、WebGPU、运动障碍、全球气象、流固耦合、未经独立验证的工程定量预测。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/{Core,Scene}/`, `Source/Shaders/SceneGIS/Wind/`
- Specs: `packages/engine/Specs/SceneGIS/{Core,Scene}/`; examples: `Test/Wind/`; no Sandcastle.
- Branch: `feature/wind-display-api`; base: `scenegis/develop`; original feature baseline: `9ac687a4bc`.
- ADR: [0197](../../Documentation/SceneGIS/Decisions/ADR-0197-local-urban-wind.md); SGP: none planned.

## Current handoff

- W6 [review](reviews/2026-10-29-w6-particle-trajectories.md) approves independent
  dimensions and GPU three-dimensional history. Owner drops compatibility;
  particleSize is removed. Fifteen development GPU, 34 related release and two
  city browser cases plus full build/types pass. No solver/SDK/upstream changes;
  owner visual acceptance pending. API/defaults/cost: UrbanWind and ADR-0203.

- Integrated W1–W5 and generic voxelization into `scenegis/develop` on 2026-10-29. The wind ADR is now ADR-0197 to avoid the independently assigned split-view ADR-0193; implementation is unchanged by this identifier reconciliation.

- W5 replaces default lines with GPU flow markers; [review](reviews/2026-10-28-w5-particles.md) approved. Physical solver and concentration transport unchanged.

- Current: W1 `1b915bd940`, W2 `b86f621118`, W3 `0cb9ad10a9`; W4 implementation completed and reviewed.
- Discussion: [model](discussions/2026-10-28-model.md), resolved for W1.
- Review: [W1](reviews/2026-10-28-w1-solver.md), [W2](reviews/2026-10-28-w2-boundaries.md)
  [W3](reviews/2026-10-28-w3-tracer-display.md) and [W4](reviews/2026-10-28-w4-city.md), approved.
- SDK integration / API / evidence: [UrbanWind](../../Documentation/SceneGIS/UrbanWind.md).
- Risks: near-half relaxation time at air viscosity; coarse walls, open boundaries and unresolved LES.
- Owner visual judgment remains required for final city presentation.
