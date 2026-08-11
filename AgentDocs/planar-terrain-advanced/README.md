# SceneGIS Planar Terrain Advanced

## Metadata

- Extension slug: `planar-terrain-advanced`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [总体计划：SceneGIS 平面高级地形](plans/2026-08-10-planar-terrain-advanced-extension.md)
- Current phase: None；A6已完成，A7尚未激活
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
- ADR: 继承 ADR-0002、ADR-0004、ADR-0007～ADR-0012；A1-A6 新增
  [ADR-0024](../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、
  [ADR-0025](../../Documentation/SceneGIS/Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)、
  [ADR-0026](../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)、
  [ADR-0027](../../Documentation/SceneGIS/Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)、
  [ADR-0028](../../Documentation/SceneGIS/Decisions/ADR-0028-planar-quantized-mesh-terrain.md)、
  [ADR-0029](../../Documentation/SceneGIS/Decisions/ADR-0029-planar-smooth-terrain-normals-and-lod-lighting.md)
- SGP: None planned；若 Shader、Worker 或 build phase 必须修改 upstream-owned file，先建立或
  复用合法 SGP

## Current handoff

- Current state: A1-A5均已有独立checkpoint；A6已实现Heightmap/Quantized统一area-weighted oct normals、
  two-buffer GPU lifecycle与unlit/geometric/smooth shader variants。六个focused suites unique `65/65`，build/release、
  focused re-review与zero-upstream/zero-SGP审计均通过。
- Next action: 先形成A6独立本地checkpoint，再依据当前源码事实建立A7统一交付验收phase plan。
- Current phase status: None；A6 `completed`，A7 `planned`
- Open discussions: None；normal storage、Worker/GPU ownership、Shader/build边界已由ADR-0029裁决。
- Unresolved reviews: None；
  [A6 implementation review](reviews/2026-08-11-a6-smooth-terrain-normals-and-lod-lighting.md)已`approved`。
- Known risks: TaskProcessor 1.144没有per-task abort，active stale task只能完成后丢弃；A6新增2 bytes/vertex
  normal buffer与第二vertex-buffer lifecycle。Task-local normals不能保证任意独立provider的边界梯度bit-identical，
  representative cross-tile/LOD continuity与最终人工画面仍是验收重点。
