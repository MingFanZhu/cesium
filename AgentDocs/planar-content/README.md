# SceneGIS Planar Content

## Metadata

- Extension slug: `planar-content`
- Status: `completed`
- Planning model: `extension`
- Active extension plan:
  [SceneGIS 平面内容总体计划](plans/2026-08-08-planar-content-extension.md)
- Current phase: None
- Active phase plan: None
- Latest completed phase:
  [C11 Planar Depth/Stencil Ground Rendering](plans/2026-08-10-phase-c11-planar-depth-stencil-ground-rendering.md)
- Active standalone plan: None
- Architecture contact: Architecture Agent
- Execution contact: Execution Agent task `019fcff7-3313-7d03-b970-57b3d08e3a32`
- Last updated: `2026-08-10`

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
  [ADR-0019：平面普通体与面 Graphics 的公共 Geometry 降级与 Entity 适配](../../Documentation/SceneGIS/Decisions/ADR-0019-planar-common-solid-and-area-graphics.md)、
  [ADR-0020：平面路径衍生 Geometry 与动态 Path](../../Documentation/SceneGIS/Decisions/ADR-0020-planar-route-derived-geometry-and-path.md)、
  [ADR-0021：平面连续贴地与 Ground Primitive 晚阶段渲染协议](../../Documentation/SceneGIS/Decisions/ADR-0021-planar-continuous-ground-and-ground-primitive.md)、
  [ADR-0022：平面内容兼容性矩阵与最终交付](../../Documentation/SceneGIS/Decisions/ADR-0022-planar-content-compatibility-and-delivery.md)、
  [ADR-0023：平面 Depth/Stencil Ground Rendering](../../Documentation/SceneGIS/Decisions/ADR-0023-planar-depth-stencil-ground-rendering.md)
- SGP: 复用active `SGP-0001`；C4只允许在`packages/engine/Source/Widget/CesiumWidget.js`新增两个paired
  hunks

## Current handoff

- Current state: C1-C11均已完成；C11以单一planar depth/stencil backend替换C9 actual-mesh runtime，
  C11-R001～C11-R008全部关闭，Architecture review与项目负责人真实浏览器/GPU人工验收均已通过。
- Next action: 由Architecture形成C11独立中文本地提交检查点；后续能力进入新的extension planning，不继续扩张
  `planar-content`范围。
- Current phase status: C11=`completed`；extension=`completed`。
- Open discussions: None；resolved ground backend discussion已提升到ADR-0023；3D Tiles与GeoJSON/CZML/KML
  转换继续属于独立扩展。
- Latest completed review:
  [C11 planar depth/stencil ground rendering review](reviews/2026-08-10-c11-planar-depth-stencil-ground-rendering.md)
  （`approved`；C11-R001～C11-R008已关闭，项目负责人人工验收通过）。
- Unresolved review: None。
- Known risks: Classification之外的ordered ground layers与arbitrary Material仍不自动进入范围；Label的
  `showBackground`保持Cesium既有屏幕空间像素语义，远距离固定尺寸属于调用方显示策略而非planar缺陷。
