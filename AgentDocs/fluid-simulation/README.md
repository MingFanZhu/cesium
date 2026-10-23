# Native Fluid Simulation

原生局部 GPU 流体与连续液体渲染，独立于已有粒子喷泉。

## Metadata

| Field                  | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| Extension slug         | `fluid-simulation`                                      |
| Status                 | `completed`                                             |
| Planning model         | `extension`                                             |
| Active extension plan  | [首版](plans/2026-10-23-native-fluid.md)                |
| Current phase          | None; engine delivery completed                         |
| Active phase plan      | None                                                    |
| Active standalone plan | None; [法线细线已完成](plans/2026-10-23-normal-seam.md) |
| Architecture contact   | Current task / self-review                              |
| Execution contact      | Current task                                            |
| Last updated           | `2026-10-23`                                            |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- GPU 邻域查询、密度约束、重力、连续发射、局部容器与粒子回收。
- 连续液体深度 / 厚度 / 法线、光照、反射 / 折射和场景遮挡。
- 球面 ENU / 平面米制同一图元契约，供 SDK 直接调用。

### Out of scope

- 全球水文、任意场景网格碰撞、刚体双向耦合、水下相机、透明物体递归折射。
- SDK 修改与示例接入：项目负责人于 2026-10-23 明确移出本任务，当前任务未修改 SDK 文件。

## Engineering links

- Source paths: `packages/engine/Source/SceneGIS/Scene/`, `Source/Shaders/SceneGIS/Fluid/`
- Test paths: `packages/engine/Specs/SceneGIS/Scene/`, `Test/Rendering/`
- Sandcastle: None; local Test previews
- Branches: `feature/native-fluid`; baseline `14bf727b70`
- ADR: ADR-0187; reuse ADR-0087 / ADR-0102 boundaries
- SGP: None; all changes are SceneGIS-owned, reuse existing WaterFrame scheduling

## Current handoff

- Current state: P1 `e2fb6a0dee`, P2 `fc0cbc030e`; native engine API/surface and release qualified.
- Follow-up: runtime `renderRadius` and full HDR background transmission completed and reviewed.
- Follow-up: reduced-resolution normal seam corrected with integer reconstruction-grid neighbors.
- Next action: SDK integration belongs to the caller; no SDK work in this task.
- Current phase status: P1/P2 completed; proposed P3 removed from scope by project owner.
- Open discussions: none; [algorithm and rendering](discussions/2026-10-23-algorithm.md) resolved.
- Unresolved reviews: none; [P1](reviews/2026-10-23-p1.md) and [P2](reviews/2026-10-23-p2.md) resolved.
- Previous review: [size and horizon](reviews/2026-10-23-size-horizon.md), resolved; 8 fluid + 17 water Specs pass.
- Latest review: [normal seam](reviews/2026-10-23-normal-seam.md), resolved; 9 fluid Specs pass.
- Known risks: sorting bandwidth / worst-case neighbor density; screen-space front-layer approximation;
  box collision only; visual quality remains subject to project owner judgment.
