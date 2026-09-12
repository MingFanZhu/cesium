# SceneGIS Planar Terrain

## Metadata

- Extension slug: `planar-terrain`
- Status: `completed`
- Planning model: `extension`
- Active extension plan: None
- Current phase: None；T1-T6均已完成
- Active phase plan: None
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent（extension已完成）
- Last updated: `2026-08-08`

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
  [ADR-0011](../../Documentation/SceneGIS/Decisions/ADR-0011-planar-url-template-heightmap-terrain-provider.md)、
  [ADR-0012](../../Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)
- SGP: None planned；现有 `SGP-0001` 和 `SGP-0002` 仅作为 planar-world 依赖

## Current handoff

- Current state: T1-T6均完成implementation、验证、Architecture/code review与独立阶段门禁；项目负责人
  已在真实浏览器/GPU确认T6通过，`planar-terrain` extension状态为`completed`。
- Next action: 在新的extension或standalone plan中讨论后续能力，不在本extension继续追加未规划阶段。
- Current phase status: None；T6与extension均为`completed`。
- Open discussions: None。固定环境亮度`0.3`、fragment geometric normal和不引入Worker均已获批；若
  实际画面、profiling或实现要求CPU normals、Worker、Shader build或upstream改动，Execution必须
  停止并交回裁决。
- Latest review:
  [T6 terrain lighting and delivery review request](reviews/2026-08-08-t6-terrain-lighting-and-delivery.md)
  （`approved`）。
- Unresolved reviews: None。项目负责人的真实浏览器/GPU人工视觉验收已通过。
- Known risks: fragment normal是per-triangle且可能显示LOD明暗变化；default SunLight对任意planar CRS
  没有投影语义；main-thread LERC/mesh仍需有限观察。公开服务SLA与T4 query/sampler既有风险不变。
