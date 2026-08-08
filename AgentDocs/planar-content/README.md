# SceneGIS Planar Content

## Metadata

- Extension slug: `planar-content`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [SceneGIS 平面内容总体计划](plans/2026-08-08-planar-content-extension.md)
- Current phase: None；等待 C1 设计
- Active phase plan: None
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Unassigned
- Last updated: `2026-08-08`

允许的扩展状态为 `proposed`、`active`、`paused`、`completed` 或 `retired`。

## Scope

### In scope

- 让常见矢量与场景对象遵循平面世界的米制 `Cartesian3` 坐标和 Z-up 语义。
- 复用 Cesium `Entity`、`EntityCollection`、`CustomDataSource` 和 Property 模型，不建立平行
  Entity 系统。
- 建立 Point、Billboard、Label、Polyline、Polygon 和普通 glTF Model 的 planar compatibility
  profile。
- 支持绝对高度、贴合平面地表和相对平面地表的明确高度语义。
- 与已完成的 planar terrain、picking、Viewer selection 和资源生命周期协同。

### Out of scope

- 运行时 CRS 重投影，以及 GeoJSON、CZML、KML 的自动 planar 转换。
- 3D Tiles、Globe GroundPrimitive、geodesic/rhumb geometry 和全量 Entity graphics 兼容。
- 地下模式、碰撞、阴影、PBR、Viewer tracking、`flyTo` 和 `zoomTo`。
- Globe 与 planar world 的运行时切换或同场混合。

## Engineering links

- Dependencies:
  [completed `planar-world`](../planar-world/README.md) and
  [completed `planar-terrain`](../planar-terrain/README.md)
- Planned source roots: `packages/engine/Source/SceneGIS/Core`、
  `packages/engine/Source/SceneGIS/Scene`、`packages/engine/Source/SceneGIS/DataSources`；仅在实际
  Viewer UI 需求成立时进入 `packages/widgets/Source/SceneGIS`
- Planned test roots: 对应的 `packages/engine/Specs/SceneGIS/**` 与必要的
  `packages/widgets/Specs/SceneGIS/**`
- Planned Sandcastle root: `packages/sandcastle/gallery/scenegis-planar-content`
- Branch: `feature/planar-content`
- Base checkpoint: `23d06ad14c79825f680e9397c6f4a8fa70a0f008`
- ADR: C1 形成公共坐标、高度和兼容性决定后创建
- SGP: None planned；实际需要修改 upstream-owned file 时必须暂停并登记

## Current handoff

- Current state: 中文 extension plan 已确认并激活；尚未创建 C1 phase plan，也未开始实现。
- Next action: Architecture Agent 与项目负责人一次性细化 C1，再创建 C1 phase plan。
- Current phase status: None。
- Open discussions: C1 需依据当前 Cesium 源码确定 `HeightReference` 的 planar fallback、异步更新和
  unsupported graphics enforcement。
- Unresolved reviews: None。
- Known risks: Entity Visualizer、GeometryUpdater、ground/clamp 和 Model orientation 可能包含
  ellipsoid 假设；必要的上游缝隙尚未确认。
