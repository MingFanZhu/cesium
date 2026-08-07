# SceneGIS Planar Terrain

## Metadata

| Field                  | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Extension slug         | `planar-terrain`                                                                         |
| Status                 | `active`                                                                                 |
| Planning model         | `extension`                                                                              |
| Active extension plan  | [Planar Terrain extension plan](plans/2026-08-07-planar-terrain-extension.md) (`active`) |
| Current phase          | None；T2 completed，T3 尚未激活                                                          |
| Active phase plan      | None                                                                                     |
| Active standalone plan | None                                                                                     |
| Architecture contact   | Architecture Agent                                                                       |
| Execution contact      | Unassigned                                                                               |
| Last updated           | `2026-08-07`                                                                             |

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 在已完成的 `SceneGISPlanarWorld` 上增加真正的米制高程地形。
- 以平面 heightmap 作为首个 canonical terrain format，并支持正、负高程。
- 让已有 planar imagery 贴附在地形 geometry 上。
- 支持异步加载、LOD fallback、上采样、连续覆盖、缓存和资源生命周期。
- 提供与实际地形一致的高度查询、地形拾取和可执行示例。
- 在无 terrain provider 时完整保留现有 Z=0 flat surface 行为和快速路径。

### Out of scope

- 复用或伪装 Cesium 的 ellipsoid-oriented `TerrainProvider`、`TerrainData` 或 Globe surface。
- 首版支持 quantized-mesh、运行时重投影或完整 DEM 预处理工具链。
- 地形碰撞、自动 Entity clamp、地下导航、地下材质和相机防穿透。
- 水体、大气、洞穴、悬挑或其他非 2.5D height field 表面。
- 通用地形选择器，或者 Globe 与 planar terrain 的运行时切换和混合。

## Engineering links

- Dependency: [completed `planar-world` extension](../planar-world/README.md)
- Planned source roots: `packages/engine/Source/SceneGIS/Core`、
  `packages/engine/Source/SceneGIS/Renderer` 和 `packages/engine/Source/SceneGIS/Scene`
- Planned test roots: `packages/engine/Specs/SceneGIS/Core`、
  `packages/engine/Specs/SceneGIS/Renderer` 和 `packages/engine/Specs/SceneGIS/Scene`
- Planned Sandcastle root: `packages/sandcastle/gallery/scenegis-planar-terrain`
- Current branch: `feature/planar-terrain`，从已完成的 planar-world checkpoint
  `14562040b2` 创建
- Related ADR:
  [ADR-0001](../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)、
  [ADR-0002](../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)、
  [ADR-0003](../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)、
  [ADR-0004](../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md) 和
  [ADR-0005](../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)
- New ADR:
  [ADR-0007](../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)、
  [ADR-0008](../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)
- SGP: None planned；现有 `SGP-0001` 和 `SGP-0002` 仅作为 planar-world 依赖

## Current handoff

- Current state: T2 review 已 `approved`，`T2-R001` reviewer-confirmed `fixed`；provider attachment、
  terrain mesh/runtime、三维 bounds/SSE、terrain/imagery single command、真实 depth 与 lifecycle
  已完成独立本地 checkpoint。
- Next action: 停下与项目负责人讨论 T3。只有 T3 phase plan 经明确批准后才重新指派 Execution
  Agent；当前不实现 T3。
- Current phase status: T2 `completed`；extension 继续 `active`，T3 尚未激活。
- Open discussions: None。T3 的连续 LOD/Worker、T4 query/picking、T5 provider/example 和 T6
  lighting/performance 继续延迟到对应 phase。
- Latest review:
  [T2 terrain surface review](reviews/2026-08-07-t2-terrain-surface.md)（`approved`）。
- Unresolved reviews: None；`T2-R001` 已由 Architecture Agent 确认为 `fixed`。
- Known risks: terrain 会扩大现有 planar surface 的 CPU/GPU 与异步状态；Worker/build
  接入、跨 LOD seam、主线程 mesh、CPU 内存规模、公开 DEM 的许可/CORS/稳定性，以及未来
  地下模式兼容性必须在相应 phase 重新评估。
