# SceneGIS Planar Terrain Advanced

## Metadata

- Extension slug: `planar-terrain-advanced`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [总体计划：SceneGIS 平面高级地形](plans/2026-08-10-planar-terrain-advanced-extension.md)
- Current phase: None（A3 completed；A4 尚未激活）
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
  `packages/engine/Source/SceneGIS/Scene`、`packages/engine/Source/SceneGIS/Renderer`；
  Shader、Worker 和 build 精确路径延迟到对应 phase 审计
- Expected test roots: `packages/engine/Specs/SceneGIS/**`；必要时增加既有 SceneGIS
  Sandcastle/E2E 的最小扩展
- Sandcastle: 复用并按阶段更新 `scenegis-planar-terrain`；不预先增加重复案例
- Branch: `feature/planar-terrain-advanced`，基线 checkpoint `14a7206f41`
- ADR: 继承 ADR-0002、ADR-0004、ADR-0007～ADR-0012；A1-A3 新增
  [ADR-0024](../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)、
  [ADR-0025](../../Documentation/SceneGIS/Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)、
  [ADR-0026](../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)
- SGP: None planned；若 Shader、Worker 或 build phase 必须修改 upstream-owned file，先建立或
  复用合法 SGP

## Current handoff

- Current state: A1已在checkpoint `6657aac8fe`完成；A2已在checkpoint `5ff4753579`完成。A3-R001/R002均关闭，
  Architecture/code review与项目负责人最终Sandcastle人工验收通过；Controller 47/47且
  zero-upstream/zero-SGP边界保持。
- Next action: Architecture以本提交形成A3中文checkpoint，再从clean base重新审计并激活A4 Worker phase。
- Current phase status: None（A3 `completed`）
- Open discussions: None；A3 public clearance、point-query collision profile与no-sweep边界已由ADR-0026裁决。
- Unresolved reviews: None；[A3 approved review](reviews/2026-08-11-a3-terrain-clearance-and-penetration-prevention.md)
  的人工验收门禁已关闭。
- Known risks: A3使用最近resident terrain，new revision在下一controller update生效；endpoint clearance不承诺
  continuous sweep或free-look。后续还有Worker构建发布seam、quantized-mesh精度/边界、smooth normal内存和LOD seam。
