# SceneGIS Planar Content

## Metadata

- Extension slug: `planar-content`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [SceneGIS 平面内容总体计划](plans/2026-08-08-planar-content-extension.md)
- Current phase: `C7-common-solid-and-area-graphics`
- Active phase plan:
  [C7 普通锚定、体与面 Entity Graphics](plans/2026-08-09-phase-c7-common-solid-and-area-graphics.md)
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent；等待C7 planning checkpoint后正式派工
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
- 建立可由应用直接使用、并由 Entity visualizer共同复用的public planar Primitive/Geometry层。
- 补齐Cesium普通Entity graphics的planar实现，并提供线面连续地形贴合与planar ground primitive。
- 与已完成的 planar terrain、picking、Viewer selection 和资源生命周期协同。

### Out of scope

- 运行时 CRS 识别、重投影或单位转换。
- 3D Tiles、GeoJSON/CZML/KML自动转换，以及geodesic/rhumb等球面几何语义。
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
  [ADR-0016：平面 DataSourceDisplay 与 Viewer 内容集成](../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)、
  [ADR-0017：平面内容资格验证与批量边界](../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)、
  [ADR-0018：公共平面 Primitive、Geometry 与标准 Primitive 后端](../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)、
  [ADR-0019：平面普通体与面 Graphics 的公共 Geometry 降级与 Entity 适配](../../Documentation/SceneGIS/Decisions/ADR-0019-planar-common-solid-and-area-graphics.md)
- SGP: 复用active `SGP-0001`；C4只允许在`packages/engine/Source/Widget/CesiumWidget.js`新增两个paired
  hunks

## Current handoff

- Current state: C1-C6已完成并形成独立checkpoint；public Primitive现已支持Polyline/Polygon，existing six
  graphics自动路径保持。Architecture已依据C6 checkpoint审计普通Graphics/Core Geometry并批准ADR-0019。
- Next action: Execution Agent按active C7 phase plan实现三个public volume Geometry、六类Entity profile和两个
  private visualizer，完成后创建pending review并停止。
- Current phase status: C7 `active`；implementation尚未开始。
- Open discussions: None；3D Tiles与GeoJSON/CZML/KML转换继续属于独立扩展。
- Latest review:
  [C6 public planar Primitive/Geometry review](reviews/2026-08-09-c6-public-planar-primitive-and-geometry.md)
  （`approved`；R001～R004全部关闭）。
- Unresolved reviews: None。
- Known risks: Core Box/Cylinder/Ellipsoid与standard Primitive仍是Cesium升级敏感依赖；Ellipse/Rectangle必须避免
  误入Cartographic/Ellipsoid路径。C7的terrain关系仍是generated-vertex sampling，continuous ground保持C9边界。
