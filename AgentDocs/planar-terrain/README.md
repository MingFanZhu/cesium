# SceneGIS Planar Terrain

## Metadata

| Field                  | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Extension slug         | `planar-terrain`                                                                         |
| Status                 | `active`                                                                                 |
| Planning model         | `extension`                                                                              |
| Active extension plan  | [Planar Terrain extension plan](plans/2026-08-07-planar-terrain-extension.md) (`active`) |
| Current phase          | `T1-terrain-core` completed；T2 not activated                                            |
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
  [ADR-0007](../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
- SGP: None planned；现有 `SGP-0001` 和 `SGP-0002` 仅作为 planar-world 依赖

## Current handoff

- Current state: T1 architecture/code review 已 `approved`；三个纯 Core 公共类型、17 个 direct
  unique Specs、root/types/API evidence 与 zero-upstream/zero-SGP 审计已形成独立阶段
  checkpoint。
- Next action: 项目负责人与 Architecture Agent 讨论 T2；依据届时 surface/Renderer/Shader
  源码事实形成 T2 phase plan，获明确批准后才重新指派 Execution Agent。
- Current phase status: T1 `completed`；extension 继续 `active`，T2 尚未激活。不得先行实现
  World/Renderer/Worker 或 terrain geometry。
- Open discussions: None。mesh、Worker、runtime 请求状态机和具体 URL provider 继续延迟到
  对应 phase。
- Latest review:
  [T1 terrain Core review request](reviews/2026-08-07-t1-terrain-core.md)（`approved`）。
- Unresolved reviews: None；T1-R001 已由 Architecture Agent 确认为 `fixed`。
- Known risks: terrain 会扩大现有 planar surface 的 CPU/GPU 与异步状态；Worker/build
  接入、跨 LOD seam、内存规模、公开 DEM 的许可/CORS/稳定性，以及未来地下模式兼容性
  必须在相应 phase 重新评估。
