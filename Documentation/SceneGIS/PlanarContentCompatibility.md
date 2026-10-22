# SceneGIS 平面内容兼容性矩阵

本文档记录 `planar-content` 在 Cesium `1.144`、upstream commit
`6d5d8b1f0725b6f831b336463f4b11c98023427b` 上的交付范围。它是版本化能力索引；源码 JSDoc、
Specs 与相关 ADR 仍是可执行契约的事实源。

## 全局前提

- 坐标是米制 `Cartesian3`，固定轴为 X east、Y north、Z up；应用负责 CRS 转换和数据一致性。
- World 只支持 `SCENE3D`。Automatic Entity path 接受 `CustomDataSource` 和显式绑定当前 World 的
  `GeoJsonDataSource`（ADR-0172）或 `CzmlDataSource`（ADR-0173）；支持原生 `EntityCluster`（ADR-0183）。
- Automatic path 是 instance-owned gate 加八个 child visualizer，共九个 visualizer object；它不会并行运行消费相同
  Graphics 的默认 Globe visualizer。
- Anchor X/Y 使用 World inclusive extent。普通 Geometry 可在合法 anchor 下延伸出 extent；ground footprint必须通过
  对应public planar Geometry的finite/extent preflight。
- `NONE`、`CLAMP_TO_GROUND`、`RELATIVE_TO_GROUND` 是支持的高度模式。Anchor-level reference 读取 resident
  terrain 并在未知时回退 Z=0；surface clamp使用C11 GPU depth/stencil backend，不消费terrain mesh或tile snapshot。

## Public package inventory

Engine 根入口共 24 个：

| 类别             | Public entry                                                                                                                                                                                                                              | 形态                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| World contract   | `SceneGISWorld`                                                                                                                                                                                                                           | constructor/interface shape            |
| Planar core      | `SceneGISPlanarExtent`、`SceneGISPlanarCoordinateSystem`、`SceneGISPlanarTilingScheme`                                                                                                                                                    | constructor                            |
| Terrain core     | `SceneGISPlanarTerrainData`、`SceneGISPlanarHeightmapTerrainData`、`SceneGISPlanarTerrainProvider`、`SceneGISPlanarUrlTemplateHeightmapTerrainProvider`                                                                                   | constructor                            |
| Terrain sampling | `SceneGISPlanarTerrainSampler`                                                                                                                                                                                                            | namespace object；调用 `sampleAtLevel` |
| World/navigation | `SceneGISPlanarWorld`、`SceneGISPlanarCameraController`                                                                                                                                                                                   | constructor                            |
| Imagery          | `SceneGISPlanarImageryProvider`、`SceneGISPlanarUrlTemplateImageryProvider`、`SceneGISPlanarImageryLayer`、`SceneGISPlanarImageryLayerCollection`                                                                                         | constructor                            |
| Public Geometry  | `SceneGISPlanarPolylineGeometry`、`SceneGISPlanarPolygonGeometry`、`SceneGISPlanarBoxGeometry`、`SceneGISPlanarCylinderGeometry`、`SceneGISPlanarEllipsoidGeometry`、`SceneGISPlanarWallGeometry`、`SceneGISPlanarPolylineVolumeGeometry` | constructor                            |
| Public Primitive | `SceneGISPlanarPrimitive`、`SceneGISPlanarGroundPrimitive`                                                                                                                                                                                | constructor                            |

Widgets 根入口共 2 个：`SceneGISPlanarHomeButton` 与 `SceneGISPlanarHomeButtonViewModel`。Planar `Viewer`
入口和 `viewer.planarCameraController` 是既有 `Viewer` 的受支持成员，不另计为 SceneGIS-named entry。

Package smoke 从 repo 外 consumer 使用 bare ESM `@cesium/engine`、`@cesium/widgets`、`cesium` 与 CJS
`require("cesium")` 验证上述 inventory。Underscore modules 是 soft-private implementation detail：生成 JS barrel 可能
包含它们，但 declarations 与 API HTML 必须隐藏。

## Automatic Entity Graphics

| Graphics       | Position/source                               | 高度与 ground                                       | 主要边界                                            | Child role / evidence                                 |
| -------------- | --------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Point          | `Entity.position`                             | anchor-level NONE/clamp/relative                    | 始终使用 `PointPrimitive`                           | Anchor；Anchor focused + C10 qualification            |
| Billboard      | `Entity.position`                             | anchor-level NONE/clamp/relative                    | local image；low-level reference 固定 NONE          | Anchor；Anchor focused + C10 qualification            |
| Label          | `Entity.position`                             | anchor-level NONE/clamp/relative                    | fixed planar anchor                                 | Anchor；Anchor focused + C10 qualification            |
| Model          | `Entity.position` + optional Quaternion       | anchor-level NONE/clamp/relative                    | local glTF；fixed planar transform；无 ENU/clamping | Model；Model focused + C10 qualification/E2E          |
| Polyline       | supplied `positions`                          | NONE ordinary；`clampToGround:true` continuous      | straight `ArcType.NONE`；Fabric (ADR-0182)          | Polyline；Polyline/Ground focused + C10 qualification |
| Polygon        | hierarchy + scalar/per-position height        | ordinary；non-extruded CLAMP uses GPU surface clamp | simple outer + direct holes；caps/sides             | Polygon；Polygon/Ground focused + C10 qualification   |
| Box            | center `Entity.position`                      | anchor-level NONE/clamp/relative + lower support    | complete dimensions；Color only                     | Solid；Solid focused + C10 cohort                     |
| Cylinder       | center `Entity.position`                      | anchor-level NONE/clamp/relative + lower support    | cylinder/cone；Color only                           | Solid；Solid focused + C10 cohort                     |
| Ellipsoid      | center `Entity.position`                      | anchor-level NONE/clamp/relative + lower support    | complete radii；no partial ellipsoid                | Solid；Solid focused + C10 cohort                     |
| Plane          | `Entity.position` + orientation + local plane | NONE only                                           | canonical rectangle lowered through planar Polygon  | Area；Area focused + C10 cohort                       |
| Ellipse        | position supplies X/Y; explicit height        | ordinary；non-extruded CLAMP uses GPU surface clamp | rotation from +Y counterclockwise                   | Area；Area/Ground focused + C10 cohort                |
| Rectangle      | meter-based west/south/east/north             | ordinary；non-extruded CLAMP uses GPU surface clamp | strictly ordered; no IDL wrap/granularity           | Area；Area/Ground focused + C10 cohort                |
| Corridor       | supplied route                                | ordinary；non-extruded CLAMP uses GPU surface clamp | Euclidean XY corners/caps; no geodesic/rhumb        | Route；Route/Ground focused + C10 cohort              |
| Wall           | route + explicit top/bottom                   | no implicit continuous terrain                      | open non-flat planar wall                           | Route；Route focused + C10 cohort                     |
| PolylineVolume | route + Cartesian2 shape                      | no implicit continuous terrain                      | fixed route-left/world-up frame                     | Route；Route focused + C10 cohort                     |
| Path           | sampled FIXED position                        | source sample Z only                                | `PathMode.WHOLE`; no INERTIAL/VVLH/PORTIONS         | Path；Path focused + C10 cohort                       |

`description`, `properties` 与 `viewFrom` 可作为 top-level metadata；也支持原生 `Entity.addProperty` 的业务属性，
不自动将其解释为 Graphics。未支持的标准 Graphics 仍在 child normal update 和低层资源 mutation 前拒绝。

Polyline/Polygon 支持原生 `distanceDisplayCondition`，包括 ordinary/ground、填充和边线，沿用 GeometryInstance
包围体距离判据及 picking。动态 near/far 更新复用 ready GPU geometry；添加或清除条件时重建 attribute layout。

RectangleGraphics 的米制 west/south/east/north 是明确的平面适配约定，保留原类型和字段以避免修改 Cesium；
使用 `new Rectangle(minimumX, minimumY, maximumX, maximumY)` 传入场景米制范围，不能使用 `Rectangle.fromDegrees`
或经纬度矩形工具计算平面范围。该约定仅属于平面 Entity adapter，不改变原生 Rectangle 方法或 Camera 的类型边界。

## Direct Primitive matrix

`SceneGISPlanarPrimitive` 接受七种 public Geometry。Polyline 使用原生 Material / Fabric `PolylineMaterialAppearance` 或逐实例颜色 `PolylineColorAppearance`；Polygon 使用 flat
`PerInstanceColorAppearance`；Box/Cylinder/Ellipsoid/Wall/PolylineVolume 使用 compatible closed/open non-flat
`PerInstanceColorAppearance`。单实例 wrapper 的 geometry kind 在构造时确定，replacement 只允许同 kind。
静态 geometryInstances 数组支持兼容 Appearance 合批，closed solid 可混合 kind；拓扑更改重建批次。它拥有自己
创建的 standard synchronous `Primitive`，不拥有 caller collection、Appearance 或 Entity。

`SceneGISPlanarGroundPrimitive`只接受existing planar Polyline或non-extruded Polygon Geometry、live World与compatible
appearance（面 MaterialAppearance 见 ADR-0178，线 PolylineMaterialAppearance 见 ADR-0182）。Clamp是implicit；public height-reference options不存在。它通过`Pass.TERRAIN_CLASSIFICATION`提交
stable GPU shadow/segment volumes；不读取actual terrain triangles、不发terrain request、不拥有World/provider，也不提供
extrusion、RELATIVE、classification、zIndex、arbitrary material或arbitrary model matrix。
静态 ground 数组同批仅包含线或面，均要求 depth texture。Line 按地表片元裁剪，每 VA 一条颜色命令并保持独立 pick ID；
area 通过 stencil 精确轮廓与实例 extent 裁剪，使不相交范围共用 stencil/fill pair，保留重叠顺序。
完整边界见 ADR-0168 与 PlanarContentGuide。

两种 wrapper 都保留 caller `id` 用于 picking，提供 last-successful current bounds，固定单 Context，并在 candidate
failure/replacement/destroy 中维持 exactly-once ownership。

## 明确不支持

- `Cesium3DTilesetGraphics`、3D Tiles/classification、ordered ground layers 与 Globe GroundPrimitive path。
- 未绑定当前 World 的 `GeoJsonDataSource` / `CzmlDataSource`、其他格式 DataSource、同时运行默认 Globe visualizer。
- 隐式/逐帧 reprojection、Cartographic/Ellipsoid/ENU、geodesic/rhumb、IDL wrap 与格式自动转换。
  GeoJSON / TopoJSON 的显式加载转换见 ADR-0172；不改变运行时坐标契约。
- 超出 ADR-0178 / ADR-0182 st/uniform 契约的 Material、外层 custom shader、terrain request from content、continuous ground for Model/solid/Wall/
  PolylineVolume/Path。
- Globe-specific graphics fields。Unsupported combinations must fail fast; they are not silently ignored.

`planar-api-integration` I2/I3 已补齐受支持 Entity/DataSource profile 内的 `zoomTo`/`flyTo` 与
`trackedEntity`，沿用 Viewer/CesiumWidget 原入口；具体坐标和目标边界见
[PlanarWorldGuide](PlanarWorldGuide.md) 与 [ADR-0038](Decisions/ADR-0038-planar-entity-tracking.md)。
上面的 Graphics 限制并不表示所有原生 Entity 辅助方法已完成平面适配；缺省 orientation 的
`Entity.computeModelMatrix` 仍使用球面 ENU，与平面 visualizer 的固定轴矩阵不同。

## 交付证据与升级

- Focused C1-C11 Specs define per-type validation, topology, lifecycle, picking and ground behavior.
- `SceneGISPlanarContentQualificationSpec` covers the fixed moderate profile, all eight child roles, direct ordinary/ground
  primitives, deterministic local terrain, warm/mutation/provider/lifecycle gates.
- `Specs/e2e/scenegis-planar-content.spec.js` runs the same local-network-zero scenario against development and release bundles.
- `scenegis-planar-content` is the executable manual example; public imagery/terrain there is best-effort and is not automated
  evidence.

Any Cesium baseline, public inventory, Entity property profile, Geometry/Appearance pair, ground protocol or package export change
requires this matrix, [PlanarContentGuide](PlanarContentGuide.md), and
[PlanarWorldUpgradeChecklist](PlanarWorldUpgradeChecklist.md) to be reviewed together.

## R1 阴影资格补充

按 [ADR-0083](Decisions/ADR-0083-planar-cascaded-shadows.md)，普通 Model / Primitive 以及
Solid、Area、Route、Polyline、Polygon Entity 路径支持原生 shadows / ShadowMode 字段。
Model 默认 ENABLED，其他普通 Graphics 与 Primitive 默认 DISABLED。全局开关和地形投射/接收
沿用 Viewer / World 原生式入口。动态更新复用几何，非法 enum 在发布前拒绝。
连续 ground classification、vector tile、billboard / label 的阴影资格没有扩宽。
