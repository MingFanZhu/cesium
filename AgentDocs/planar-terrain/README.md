# SceneGIS Planar Terrain

## Metadata

| Field                  | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Extension slug         | `planar-terrain`                                                                         |
| Status                 | `active`                                                                                 |
| Planning model         | `extension`                                                                              |
| Active extension plan  | [Planar Terrain extension plan](plans/2026-08-07-planar-terrain-extension.md) (`active`) |
| Current phase          | None；T5 已完成，T6 尚未进入                                                             |
| Active phase plan      | None                                                                                     |
| Active standalone plan | None                                                                                     |
| Architecture contact   | Architecture Agent                                                                       |
| Execution contact      | Execution Agent（idle；T6 not assigned）                                                 |
| Last updated           | `2026-08-08`                                                                             |

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
  [ADR-0008](../../Documentation/SceneGIS/Decisions/ADR-0008-planar-terrain-mesh-and-surface-integration.md)、
  [ADR-0009](../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)、
  [ADR-0010](../../Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)、
  [ADR-0011](../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)
- SGP: None planned；现有 `SGP-0001` 和 `SGP-0002` 仅作为 planar-world 依赖

## Current handoff

- Current state: T5 implementation、focused fixes与Architecture focused re-review均已完成；generic
  provider、image/LERC decode、公开best-effort Sandcastle与ownership边界通过，review为`approved`。
- Next action: 在T5独立本地提交检查点后，由项目负责人与Architecture Agent讨论并细化T6；T6尚未
  激活或派工。
- Current phase status: T5 `completed`；extension继续`active`。
- Open discussions: None。候选公网服务若不满足boundary-sampled topology、CORS或授权边界，Execution
  必须停止并交回裁决；Worker、正式 byte budget和lighting/performance仍留到T6或后续measured
  follow-up。
- Latest review:
  [T5 URL Heightmap provider review request](reviews/2026-08-08-t5-url-template-heightmap-provider.md)
  （`approved`）。
- Unresolved reviews: None；`T5-R001`～`T5-R003`均由Architecture reviewer确认为`fixed`。
- Known risks: generic URL provider无法自行验证CRS、相邻tile共享边或公开服务SLA；main-thread LERC
  decode与257×257 mesh成本需要在T6按真实画面profiling。T4的ray query与sampler既有风险不变。
