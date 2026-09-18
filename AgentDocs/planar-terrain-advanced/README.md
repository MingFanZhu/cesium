# SceneGIS Planar Terrain Advanced

## Metadata

- Extension slug: `planar-terrain-advanced`
- Status: `completed`
- Planning model: `extension`
- Active extension plan:
  [总体计划：SceneGIS 平面高级地形](plans/2026-08-10-planar-terrain-advanced-extension.md)
- Current phase: None
- Active phase plan: None
- Latest completed phase:
  [A7 平面高级地形统一资格与交付](plans/2026-08-11-phase-a7-unified-qualification-and-delivery.md)
- Active standalone plan: None
- Latest completed standalone plan: [低俯角旋转距离修复](plans/2026-09-18-surface-orbit-distance-fix.md)
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent
- Last updated: `2026-09-18`

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

2026-09-18：基础平面页中键低俯角旋转距离发散已修复，见
[standalone plan](plans/2026-09-18-surface-orbit-distance-fix.md)与
[技术自审](reviews/2026-09-18-surface-orbit-distance-fix.md)。54 项 focused Specs 与当前页同路径复测通过，
无上游或 SGP 改动。负责人已确认；在 `scenegis/develop` 形成独立本地 checkpoint，未 push。
原 A1–A7 完成状态保持，以下保留原阶段交接。

- Current state: A1-A7均已完成；A7-R001/R002关闭，Architecture focused re-review与项目负责人公开
  EPSG:3857/LERC Sandcastle人工验收均已通过。
- Next action: 由Architecture形成A7独立中文本地提交检查点；后续能力进入新的extension planning。
- Current phase status: A7=`completed`；extension=`completed`。
- Open discussions: None；A7不改变A1～A6架构契约，默认不新增ADR。
- Latest completed review:
  [A7 implementation/release-evidence review](reviews/2026-08-11-a7-unified-qualification-and-delivery.md)为
  `approved`；A7-R001/R002 fixed，项目负责人人工验收通过。
- Unresolved reviews: None。
- Known risks: A7 direct case保持单根Level-0 actual cover，multi-level/four-child/upsample继续复用既有focused evidence；
  timing仅同机advisory；公网服务稳定性与任意provider边界normal完全连续性仍不作产品保证。
