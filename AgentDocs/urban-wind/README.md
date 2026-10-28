# 局部三维城市风场

WebGL2 局部空气 LBM 与被动示踪；独立于 PBF 液体，不修改 SDK 或复制发行包。

## Metadata

| Field                  | Value                                     |
| ---------------------- | ----------------------------------------- |
| Extension slug         | `urban-wind`                              |
| Status                 | `active`                                  |
| Planning model         | `extension`                               |
| Active extension plan  | [roadmap](plans/2026-10-28-urban-wind.md) |
| Current phase          | W1                                        |
| Active phase plan      | [solver](plans/2026-10-28-w1-solver.md)   |
| Active standalone plan | None                                      |
| Architecture contact   | Current task / self-review                |
| Execution contact      | Current task                              |
| Last updated           | `2026-10-28`                              |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 局部米制三维静态障碍绕流、示踪输运、共享 GPU 场与双世界显示。

### Out of scope

- SDK、发行包、WebGPU、运动障碍、全球气象、流固耦合、未经独立验证的工程定量预测。

## Engineering links

- Source: `packages/engine/Source/SceneGIS/{Core,Scene}/`, `Source/Shaders/SceneGIS/Wind/`
- Specs: `packages/engine/Specs/SceneGIS/{Core,Scene}/`; examples: `Test/Wind/`; no Sandcastle.
- Branch: `feature/urban-wind`; baseline: `9ac687a4bc`.
- ADR: [0193](../../Documentation/SceneGIS/Decisions/ADR-0193-local-urban-wind.md); SGP: none planned.

## Current handoff

- Current: W1 completed; numerical/GPU core and release/types qualified; checkpoint before W2.
- Discussion: [model](discussions/2026-10-28-model.md), resolved for W1.
- Review: [W1](reviews/2026-10-28-w1-solver.md), approved; no unresolved W1 findings.
- Risks: near-half relaxation time at air viscosity; coarse walls, open boundaries and unresolved LES.
- Owner visual judgment remains required for final city presentation.
