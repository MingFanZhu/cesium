# Native Fluid Simulation

原生局部 GPU 流体与连续液体渲染，独立于已有粒子喷泉。

## Metadata

| Field                  | Value                                    |
| ---------------------- | ---------------------------------------- |
| Extension slug         | `fluid-simulation`                       |
| Status                 | `active`                                 |
| Planning model         | `extension`                              |
| Active extension plan  | [首版](plans/2026-10-23-native-fluid.md) |
| Current phase          | P1 GPU solver qualification              |
| Active phase plan      | [P1](plans/2026-10-23-p1-gpu-solver.md)  |
| Active standalone plan | None                                     |
| Architecture contact   | Current task / self-review               |
| Execution contact      | Current task                             |
| Last updated           | `2026-10-23`                             |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- GPU 邻域查询、密度约束、重力、连续发射、局部容器与粒子回收。
- 连续液体深度 / 厚度 / 法线、光照、反射 / 折射和场景遮挡。
- 球面 ENU / 平面米制同一图元契约；独立 SDK 示例保留现有粒子喷泉。

### Out of scope

- 全球水文、任意场景网格碰撞、刚体双向耦合、水下相机、透明物体递归折射。

## Engineering links

- Source paths: `packages/engine/Source/SceneGIS/Scene/`, `Source/Shaders/SceneGIS/Fluid/`
- Test paths: `packages/engine/Specs/SceneGIS/Scene/`, `Test/Rendering/`
- Sandcastle: None; local Test and SDK examples
- Branches: `feature/native-fluid`; baseline `14bf727b70`
- ADR: ADR-0187; reuse ADR-0087 / ADR-0102 boundaries
- SGP: None planned; inspect existing SGP-0017 integration before P2

## Current handoff

- Current state: P1 solver qualified; strict Specs 4/4 and hardware GPU timing recorded.
- Next action: P1 checkpoint, then establish P2 surface/API phase plan.
- Current phase status: P1 completed, checkpoint pending.
- Open discussions: [algorithm and rendering](discussions/2026-10-23-algorithm.md).
- Unresolved reviews: none; [P1 self-review](reviews/2026-10-23-p1.md) resolved.
- Known risks: sorting bandwidth / worst-case neighbor density; screen-space layer approximation; SDK workspace contains unrelated changes to preserve.
