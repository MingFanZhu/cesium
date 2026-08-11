# SceneGIS Planar Terrain Advanced

## Metadata

- Extension slug: `planar-terrain-advanced`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [总体计划：SceneGIS 平面高级地形](plans/2026-08-10-planar-terrain-advanced-extension.md)
- Current phase: None；A5 `planar-quantized-mesh` completed，A6尚未激活
- Active phase plan: None
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent
- Last updated: `2026-08-11`

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 让平移、旋转和缩放使用与当前画面及真实地形一致的导航锚点。
- 建立明确的地表、地下、碰撞和防穿透模式边界。
- 把 LERC 解码与 terrain mesh 构建迁移到可取消、可转移、可发布的 Worker 管线。
- 增加坐标系无关的 planar quantized-mesh terrain data/provider 能力。
- 改善逐三角形法线和 LOD 切换造成的地形明暗不连续。
- 完成现有 heightmap 路径、新增能力和真实浏览器/GPU 的统一资格验证。

### Out of scope

- 把 `SceneGISPlanarWorld` 伪装为 `Globe`，或复用 ellipsoid/cartographic 运行时语义。
- 自动重投影 CRS、猜测数据坐标系或把 EPSG:3857 固化到公共 provider。
- 洞穴、悬挑和多值 Z 等非 2.5D height field terrain。
- 在没有阶段源码事实和测量证据时预先固定 Shader、Worker、build seam 或性能阈值。
- 在本扩展中建设通用 DEM/quantized-mesh 离线生产工具链。

## Engineering links

- Dependencies:
  [completed `planar-world`](../planar-world/README.md)、
  [completed `planar-terrain`](../planar-terrain/README.md) 和
  [completed `planar-content`](../planar-content/README.md)
- Expected source roots: `packages/engine/Source/SceneGIS/Core`、
  `packages/engine/Source/SceneGIS/Scene`、`packages/engine/Source/SceneGIS/Renderer`；A4唯一特殊entry为
  `packages/engine/Source/Workers/SceneGISPlanarTerrainWorker.js`，Shader精确路径延迟到对应phase审计
- Expected test roots: `packages/engine/Specs/SceneGIS/**`；必要时增加既有 SceneGIS
  Sandcastle/E2E 的最小扩展
- Sandcastle: 复用并按阶段更新 `scenegis-planar-terrain`；不预先增加重复案例
- Branch: `feature/planar-terrain-advanced`，基线 checkpoint `14a7206f41`
- ADR: 继承 ADR-0002、ADR-0004、ADR-0007～ADR-0012；A1-A5 新增
  [ADR-0024](../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、
  [ADR-0025](../../Documentation/SceneGIS/Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)、
  [ADR-0026](../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)、
  [ADR-0027](../../Documentation/SceneGIS/Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)、
  [ADR-0028](../../Documentation/SceneGIS/Decisions/ADR-0028-planar-quantized-mesh-terrain.md)
- SGP: None planned；若 Shader、Worker 或 build phase 必须修改 upstream-owned file，先建立或
  复用合法 SGP

## Current handoff

- Current state: A1/A2/A3分别在`6657aac8fe`、`5ff4753579`、`c03f7d9a56`完成；A4 checkpoint为
  `bf339ee853`。A5 public Quantized-mesh data/provider、Worker/runtime/query/GPU/package闭环已通过Architecture
  review，A5-R001～R003全部关闭。
- Next action: 形成A5独立中文checkpoint；随后重新审计法线/光照源码事实并建立A6 phase plan。
- Current phase status: None；A5 `completed`
- Open discussions: None；A5 public/data/provider、triangle child clip、per-tile index和bounded query grid已由ADR-0028裁决。
- Unresolved reviews: None；
  [A5 Quantized-mesh review](reviews/2026-08-11-a5-planar-quantized-mesh.md)已`approved`。
- Known risks: TaskProcessor 1.144没有per-task abort，active stale task只能完成后丢弃；Quantized binary safe parsing、
  child clip/edge continuity、per-tile index lifecycle与query-grid memory bound是A5重点。后续还有smooth normal内存和
  LOD seam。
