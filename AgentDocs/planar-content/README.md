# SceneGIS Planar Content

## Metadata

- Extension slug: `planar-content`
- Status: `active`
- Planning model: `extension`
- Active extension plan:
  [SceneGIS 平面内容总体计划](plans/2026-08-08-planar-content-extension.md)
- Current phase: C11 planning pending
- Active phase plan: None
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
  [ADR-0022：平面内容兼容性矩阵与最终交付](../../Documentation/SceneGIS/Decisions/ADR-0022-planar-content-compatibility-and-delivery.md)
- SGP: 复用active `SGP-0001`；C4只允许在`packages/engine/Source/Widget/CesiumWidget.js`新增两个paired
  hunks

## Current handoff

- Current state: C1-C9已完成并独立提交；C10 architecture/release-evidence review已通过，作为自动化交付
  baseline等待本地提交。项目负责人没有把C9 actual-mesh ground后端作为最终产品人工验收通过，而是决定由
  C11以单一planar depth/stencil后端替换。
- Next action: Architecture形成C10独立中文本地提交，然后创建并激活C11 phase plan。
- Current phase status: C10=`completed`；extension继续`active`；C11尚未激活。
- Open discussions: None；3D Tiles与GeoJSON/CZML/KML转换继续属于独立扩展。
- Latest completed review:
  [C10 unified integration and delivery review](reviews/2026-08-10-c10-unified-integration-and-delivery.md)
  （`approved`；C10-R001～C10-R004均关闭）。
- Unresolved reviews: None。
- Known risks: C9同步normal-render CPU drape只作为已验证历史实现保留到C11替换；C11必须建立单一planar
  depth/stencil ground后端并重新完成人工验收。Classification之外的ordered ground layers与arbitrary Material仍
  不自动进入范围。
