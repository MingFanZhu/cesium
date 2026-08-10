# SceneGIS Planar Terrain Advanced

## Metadata

- Extension slug: `planar-terrain-advanced`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [总体计划：SceneGIS 平面高级地形](plans/2026-08-10-planar-terrain-advanced-extension.md)
- Current phase: `A1` planning；平移、旋转和缩放的地形感知锚点
- Active phase plan: Not created
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Unassigned；A1 phase plan 获批后指派
- Last updated: `2026-08-10`

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
  `packages/engine/Source/SceneGIS/Scene`、`packages/engine/Source/SceneGIS/Renderer`；
  Shader、Worker 和 build 精确路径延迟到对应 phase 审计
- Expected test roots: `packages/engine/Specs/SceneGIS/**`；必要时增加既有 SceneGIS
  Sandcastle/E2E 的最小扩展
- Sandcastle: 复用并按阶段更新 `scenegis-planar-terrain`；不预先增加重复案例
- Branch: `feature/planar-terrain-advanced`，基线 checkpoint `14a7206f41`
- ADR: 继承 ADR-0002、ADR-0004、ADR-0007～ADR-0012；A1 起按长期决策新增 ADR
- SGP: None planned；若 Shader、Worker 或 build phase 必须修改 upstream-owned file，先建立或
  复用合法 SGP

## Current handoff

- Current state: 项目负责人已批准总体方向和 A1 启动；中文版 extension plan 已建立，尚未创建
  A1 phase plan，也未修改产品源码。
- Next action: 形成总体规划提交检查点；随后只对 A1 重新发现 camera、depth、terrain picking 和
  input lifecycle 源码事实，编写 phase plan 与 ADR 后再派发 Execution。
- Current phase status: `A1 planning`
- Open discussions: A1 的 rendered-depth、terrain 与 Z=0 fallback 选择及对象遮挡边界，需要以当前
  Cesium/SceneGIS 源码事实细化。
- Unresolved reviews: None
- Known risks: 导航锚点与异步 terrain cover 的时序、地下模式与防穿透规则冲突、Worker 构建发布
  seam、quantized-mesh 精度/边界、smooth normal 的内存和 LOD seam。
