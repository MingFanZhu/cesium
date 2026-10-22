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
- Active standalone plan: None；[Roll 导航维护](plans/2026-10-22-camera-roll-navigation.md) 技术完成
- Pending roll visual acceptance: [技术自审](reviews/2026-10-22-camera-roll-navigation.md)
- Previous maintenance: [缺失子级地形连续覆盖](plans/2026-10-20-missing-terrain-cover.md)
- Pending orbit visual acceptance: [地表锚点旋转与中心边界解耦](plans/2026-10-20-anchored-orbit-boundary.md)
- Pending visual acceptance: [地形元数据接入](plans/2026-09-18-terrain-layer-metadata.md)
- Latest completed standalone plan: [地形剖切与多边形裁剪](plans/2026-09-18-terrain-clipping.md)（技术与视觉验收通过）
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent
- Last updated: `2026-10-22`

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

2026-10-22：负责人确认保留平面 Camera 的程序 roll，pan/wheel 不清零，中键围绕有效
锚点逐步扶正。[Roll 导航维护](plans/2026-10-22-camera-roll-navigation.md) 技术完成，
102 项 Specs 与两种投影真实鼠标 E2E 通过，[review](reviews/2026-10-22-camera-roll-navigation.md)
记录验证与手感验收边界。只调整 owned controller；既有 terrain/orbit 未决视觉记录保持原状态。

2026-10-20：模型压平与 S3M 已快进合并到 `scenegis/develop@12171614c5`。
多级地形缺失时的 FLAT 提前发布与高度包围体收紧已修复，
见[独立维护计划](plans/2026-10-20-missing-terrain-cover.md)与
[技术自审](reviews/2026-10-20-missing-terrain-cover.md)。
17 项 runtime、两项新增 GPU 连续覆盖、18 项 Quadtree 通过；扩大检查的三项旧像素失败
已在旧实现复现，详见 review。按负责人要求形成本地提交，未推送；原场景复测待定，原 A1–A7 完成状态保持。

2026-10-20：高空、extent 外相机围绕有效地表锚点旋转时，center target clamp 会额外拉远相机。
本轮按负责人确认保留有效锚点 orbit，允许 center target 越界，并处理再次拖动；
pan boundary、pointer miss fallback 与 terrain clearance 保持。61 项 Controller 与 5 项真实 terrain/depth Specs
通过，当前综合页高空连续旋转、惯性和再次拖动实测通过；见[计划](plans/2026-10-20-anchored-orbit-boundary.md)
和[技术自审](reviews/2026-10-20-anchored-orbit-boundary.md)。待负责人视觉复测；
2026-10-20 按负责人要求形成本地提交并汇入 `scenegis/develop`，未推送。

2026-09-18：平面剖切和多边形裁剪已实现，直接复用原生 Cesium collection / polygon API。
91 项相关 Specs、2 项真实地形 dev/release E2E、完整 build/release/types 与 engine tarball 定向 smoke 通过。
见 [技术自审](reviews/2026-09-18-terrain-clipping.md)，负责人可在 Test/Planar“地形剖切”页验收。
随后视觉复测发现的共面裙边碎点已修复；新增像素回归从 79 个残留降为 0，Clipping 当前 13 项通过，
原相机与参数画面复测正常，负责人已确认验收通过，裁剪 standalone plan 关闭。
工作分支为 `codex/planar-terrain-clipping`，继承 metadata 与独立大气变更；本项只变更裁剪范围，未提交或 push。

2026-09-18：负责人进一步要求与 TileWorker 任务对齐地形公共字段，允许平面特需私有字段。
[跨仓库讨论](discussions/2026-09-18-terrain-layer-contract.md) 已 resolved，双方确认完整协议，ADR-0080 已修订。
消费端仅支持当前 v2 profile，未知格式统一拒绝；11 项 Specs 通过，两个真实 Chromium E2E 联合验收通过。
TW-R001/R002/R003 已关闭；连同未改的 URL provider / World 为 54 项 Specs。完整 build/buildTs/tsc、lint 与画面检查通过，
active standalone plan 仅待负责人视觉验收；本仓库未提交或 push。
[技术自审](reviews/2026-09-18-terrain-layer-metadata.md) 与
[兼容性清单](reviews/2026-09-18-tileworker-compatibility.md) 记录当前契约和验证证据。

2026-09-18：平面相机默认惯性已实现，见[惯性计划](plans/2026-09-18-planar-camera-inertia.md)、
[技术自审](reviews/2026-09-18-planar-camera-inertia.md)与 ADR-0079。64 项 Specs、真实鼠标松手及
requestRenderMode 验证、完整 build/build-ts/tsc 与上游审计通过。无上游或 SGP 改动，
负责人已验收通过；本项形成独立本地 checkpoint，未 push。低俯角修复 checkpoint 为 `a7a6e8650a`。

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
