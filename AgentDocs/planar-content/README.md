# SceneGIS Planar Content

## Metadata

- Extension slug: `planar-content`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [SceneGIS 平面内容总体计划](plans/2026-08-08-planar-content-extension.md)
- Current phase: `C4-entity-datasource-viewer-integration`
- Active phase plan:
  [C4 Entity、DataSource 与 Viewer 集成](plans/2026-08-09-phase-c4-entity-datasource-viewer-integration.md)
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent（等待C4 planning checkpoint派工）
- Last updated: `2026-08-09`

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
- ADR:
  [ADR-0013：平面内容坐标、高度、朝向与兼容性基线](../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014：平面锚点内容与普通 Model Visualizer](../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)、
  [ADR-0015：平面 Polyline、Polygon 与顶点采样地表](../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016：平面 DataSourceDisplay 与 Viewer 内容集成](../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)
- SGP: 复用active `SGP-0001`；C4只允许在`packages/engine/Source/Widget/CesiumWidget.js`新增两个paired
  hunks

## Current handoff

- Current state: C3已在checkpoint`2015aa188f4aff5322b24ade5832547ad1c626df`完成；C4源码审计、
  ADR-0016、phase plan和SGP-0001扩展裁决已形成，等待planning checkpoint派工。
- Next action: Execution实现instance-owned planar visualizers callback、CustomDataSource gate、
  per-data-source primitive targeting和最小CesiumWidget SGP seam；完成后停在C4请求review。
- Current phase status: C4 `active`。
- Open discussions: None；C4设计已完整确认。若需要修改`DataSourceDisplay.js`、`Viewer.js`或超过
  CesiumWidget两个窄hunk，Execution才暂停回报Architecture。
- Latest review:
  [C3 polyline and polygon review](reviews/2026-08-09-c3-polyline-polygon.md)（`approved`）。
- Unresolved reviews: None；C4实现ready后才创建pending review。
- Known risks: Buffer collections属于experimental升级敏感面；vertex-only terrain drape不代表连续贴地；
  per-Entity owner的批量性能留给C5；SGP-0001新增C4 seam仍位于上游高频CesiumWidget构造路径，升级时
  需重点复核。
