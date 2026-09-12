# ADR-0020：平面路径衍生 Geometry 与动态 Path

## 状态

- Status：`approved`
- Date：`2026-08-10`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-10-phase-c8-route-derived-geometry-and-path.md`
- Related patch：无；C8 默认 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

C6/C7 已建立 public `SceneGISPlanarPrimitive`、Polyline/Polygon、三个 local volume Geometry，以及
automatic Entity adapter。C8 需要支持 Corridor、Wall、PolylineVolume 与 Path，但 Cesium 1.144 的默认实现
仍包含明确的 Globe 假设：

1. `CorridorGeometry.createGeometry` 先把 positions `scaleToGeodeticSurface`，再通过
   `CorridorGeometryLibrary`、`PolylinePipeline.generateArc`、ellipsoid normal 与 geodetic height生成网格。
2. `WallGeometryLibrary` 把 positions 转为 `Cartographic`，以 ellipsoid radius和angular granularity生成arc；
   `WallGeometry` 的normal也读取 `ellipsoid.geodeticSurfaceNormal`。
3. `PolylineVolumeGeometryLibrary` 使用 `Cartographic`、`EllipsoidTangentPlane`、
   `Transforms.eastNorthUpToFixedFrame` 与geodesic subdivision建立截面frame。
4. 默认 `PathVisualizer` 把 `PathGraphics` 映射到独立`PolylineCollection`，并支持INERTIAL、entity-relative
   VVLH、`PathMode.PORTIONS`等非平面语义。其private `_subSample` 已把Property时间采样与renderer分离；当调用方
   固定传入`ReferenceFrame.FIXED`且拒绝relative/inertial输入时，该采样过程本身不需要Ellipsoid。
5. `SceneGISPlanarPolygonGeometry`能表达平面Corridor的top/bottom/caps/sides，
   `SceneGISPlanarPolylineGeometry`能表达Corridor outline与Path；垂直Wall和沿路径扫掠的PolylineVolume不能由
   XY triangulation Polygon无损表达。

因此，C8必须自建Euclidean path geometry与fixed-frame Path adapter，但不需要复制Cesium renderer、修改
`DataSourceDisplay`或引入新的Worker/build seam。

## 决策

### Public Geometry集合只增加Wall与PolylineVolume

C8新增：

```text
SceneGISPlanarWallGeometry
SceneGISPlanarPolylineVolumeGeometry
```

二者都是CPU-only immutable snapshot，clone输入，以finite完整XYZ origin重基并生成local DOUBLE positions、
finite normals、indices和local bounding sphere。它们不拥有World、terrain、Scene、Context、Appearance或GPU，
同步`_createGeometry`不使用Worker、pack/unpack或raw Cesium Globe Geometry。

`SceneGISPlanarWallGeometry`：

- required `positions`至少两个，每个position的X/Y定义米制wall route，Z是未提供`maximumHeights`时的top；
- optional `minimumHeights`/`maximumHeights`必须与positions等长且finite；bottom默认Z=0，top默认position.z，
  每站bottom不得高于top；相邻route XY必须不同，每段不能整体零面积；
- 每个route segment独立生成四个局部vertex与两个triangle，使转角保持hard normal；normal由planar segment与
  world +Z确定，不调用geodetic normal；
- optional finite `origin`默认使用第一个bottom position；private outline seam只返回top、bottom与vertical
  edge的clone，不形成额外public类型。

`SceneGISPlanarPolylineVolumeGeometry`：

- required `polylinePositions`至少两个，所有相邻segment必须有nonzero XY长度；Z表示route center elevation；
- required `shapePositions`是simple、nondegenerate Cartesian2 ring，闭合重复点只规范化一次，并将clockwise
  snapshot规范化为counter-clockwise顺序；shape的axis-aligned bounding rectangle center平移到route center，
  以保持Cesium Graphics既有居中预期和closed side/cap outward winding；
- fixed sweep frame定义为：route tangent取XY normalized方向，shape +X映射到route left，shape +Y映射到world +Z；
  vertical-only segment、180-degree reversal、non-finite miter或自交route/shape在任何资源mutation前拒绝；
- `CornerType.MITERED`使用一个finite miter station，`BEVELED`使用相邻两个station，`ROUNDED`按positive finite
  `cornerGranularity`生成角步长不超过该值的stations；默认沿用`CesiumMath.RADIANS_PER_DEGREE`；
- adjacent station rings形成side triangles，start/end使用shape triangulation封口。实际triangle cross product生成
  finite normal；退化triangle可以省略，但结果必须保持closed、nonempty并通过finite bounds验证；
- optional finite `origin`默认使用第一route position；private outline seam提供start/end ring与各shape vertex的
  longitudinal route，不暴露内部station/cap layout。

Corridor不新增public `SceneGISPlanarCorridorGeometry`：它确定降级为C6 Polygon/Polyline。Path也不新增Geometry：
采样结果确定降级为C6 Polyline。这样应用direct primitive与Entity adapter继续使用同一封闭低层集合，而不为
等价mesh扩大兼容面。

### SceneGISPlanarPrimitive Appearance扩展

`SceneGISPlanarPrimitive`保持constructor-time fixed kind、same-kind replacement、single synchronous standard
Primitive、candidate/current、single Context、pick/depth与exactly-once lifecycle。

- Wall要求open、non-flat `PerInstanceColorAppearance`与finite color instance attribute；`closed`必须为false。
- PolylineVolume要求closed、non-flat `PerInstanceColorAppearance`与finite color instance attribute。
- 既有Polyline、Polygon、Box/Cylinder/Ellipsoid矩阵不变；raw Cesium Wall/PolylineVolume Geometry继续拒绝。

### Corridor planar profile

Corridor centerline只解释positions的X/Y；position.z不作为第二个height来源。所有supplied centerline points必须
finite且位于World inclusive extent，相邻XY不得重复，route不得自交或180-degree reversal。Width必须finite
positive。

- `cornerType`支持ROUNDED、MITERED、BEVELED；undefined保持ROUNDED。
- `granularity`在planar profile中是rounded join/end-cap的positive radian step，默认
  `CesiumMath.RADIANS_PER_DEGREE`，不表示地球角距离。
- MITERED/BEVELED使用square end caps；ROUNDED使用semicircle end caps。生成的outer ring必须是simple、
  nondegenerate Polygon，否则fail-fast。
- `height`/`heightReference`与`extrudedHeight`/reference沿用ADR-0013三个值，但在生成后的corridor perimeter
  vertices读取resident terrain。`NONE`允许合法centerline生成的ring越过extent；ground-referenced generated
  vertex outside则当前graphic隐藏。Bottom不得高于top。
- fill/extrusion使用public Polygon，outline使用public Polyline；material只接受Color，outline width为finite
  nonnegative，distance condition支持，non-disabled shadows、classification和zIndex拒绝。

这一terrain语义仍是generated-vertex sampling，不增加沿edge的terrain误差预算；continuous ground属于C9。

### Wall与PolylineVolume Entity profile

Wall Graphics直接映射到public Wall Geometry：supplied route X/Y必须位于World inclusive extent，top/bottom规则与
public constructor一致。`granularity`只具有Globe arc含义，因此defined值在C8拒绝。Wall没有HeightReference；
minimumHeights undefined稳定表示Z=0 reference plane，不隐式查询terrain。

PolylineVolume Graphics直接映射到public PolylineVolume Geometry。所有route anchors必须位于extent；shape sweep可
合法延伸extent外。`cornerType`和`granularity`映射到上述planar corner规则。它没有HeightReference，不隐式
terrain clamp。Wall与PolylineVolume均支持show、fill、Color material、outline/color/finite nonnegative width、
distance condition、original Entity pick与bounds；non-disabled shadows和未批准字段fail-fast。

### Path fixed-frame profile

C8新增private `_SceneGISPlanarPathSampler`，把Cesium `PathVisualizer._subSample`隔离为一个升级敏感依赖，只在以下
preflight全部成立后以`ReferenceFrame.FIXED`调用：

- Entity存在position与Path；position Property的effective reference frame必须为FIXED；
- `relativeTo`只允许undefined或字符串`"FIXED"`；INERTIAL与entity-relative/VVLH拒绝；
- `materialMode`只允许undefined或`PathMode.WHOLE`；PORTIONS拒绝；
- `resolution`默认60秒且必须finite positive；lead/trail若定义必须finite nonnegative；Entity必须有availability，
  或leadTime与trailTime同时定义；最终sample interval必须finite有序。

Sampler复用result array并返回FIXED Cartesian3 snapshots，不拥有Property或时间区间。Visualizer完整验证所有sample
finite且位于World extent；任一outside使当前Path隐藏，不做clipping。连续重复sample在显示判断前规范化，至少两个
distinct positions才显示；静止区间隐藏但保留current owner。Path使用public
Polyline Geometry，支持finite nonnegative width、Color material、distance condition、original Entity pick与
availability/show。相同sample/style保持warm owner；时间窗口或sample变化走candidate replacement并exactly once释放。

C8不复制`PathVisualizer`数百行property dispatch，不复用其PolylineCollection/VVLH renderer，也不承诺PORTIONS
temporal material。Cesium升级时若private `_subSample`消失或语义变化，只替换SceneGIS private sampler，不改变
fixed-frame public profile。

### Private visualizer与automatic gate

C8新增：

```text
_SceneGISPlanarRouteVisualizer  // Corridor, Wall, PolylineVolume
_SceneGISPlanarPathVisualizer   // Path
```

Route visualizer可以增加一个供Corridor/Volume共享的private XY path helper；只有真实复用成立时才提炼，不建立public
parallel scene graph。两个visualizer复用`_SceneGISPlanarPrimitiveOwner`、public Geometry/Primitive与C4
per-DataSource target。Callback顺序固定扩展为：Anchor、Model、Polyline、Polygon、Solid、Area、Route、Path；
existing child顺序不变。Gate top-level allowlist加入`corridor`、`wall`、`polylineVolume`与`path`。

每个visualizer必须先完整evaluate其所有tracked graphics的Property、route/shape、derived counts、terrain result、
appearance、condition、world origin/transform、bounds与signature，再修改current owner。Geometry、origin/transform、
topology、translucency或primitive count变化走
candidate/current；同topology style优先原地更新。Temporary hidden/outside保留current，graphic/Entity removal、
replacement和destroy exactly once释放。`getBoundingSphere`联合该visualizer内同Entity全部active graphics。

## 不采用的方案

### 直接复用Cesium Corridor/Wall/PolylineVolume Geometry

拒绝。三条createGeometry路径分别进入geodetic surface、Cartographic/arc或ENU/tangent-plane计算，输入换成米制
Cartesian3不能移除其Globe语义。

### 为Corridor与Path再新增public Geometry

拒绝。Corridor输出已经由public Polygon/Polyline完整表达，Path就是time-sampled public Polyline。新增等价类型会
扩大API且让Entity与direct primitive出现重复runtime。

### 复用默认PathVisualizer或支持relative/inertial Path

拒绝。默认renderer拥有独立PolylineCollection，并引入INERTIAL、VVLH和entity-relative frame。C8只复用隔离的
FIXED property sampler，保持平面fixed axes。

### 在C8实现continuous ground、PORTIONS material或Worker

拒绝。Continuous terrain属于C9；PORTIONS需要temporal segment/material ownership；Worker需要pack/build协议。
三者都不能在没有独立需求、性能证据与验收边界时混入C8。

## 兼容性、所有权与构建

C8默认只修改`packages/engine/Source/SceneGIS/**`、对应SceneGIS Specs、SceneGIS durable docs与AgentDocs。
预计upstream-owned files=`0`、C8 SGP=`0`；不得改变`Scene.js`、`CesiumWidget.js`、`Viewer.js`、
`.scenegis/upstream-patches.json`或历史SGP-0001/0002 hunks。

两个public Geometry必须进入engine/Cesium root runtime、declarations与API HTML。Path sampler、Route/Path visualizer及
其他private helper不得进入declarations/API。不得手工修改generated barrel、types、SpecList或Build产物。

## 测试与升级检查点

C8至少验证：

- Wall与PolylineVolume public Geometry的snapshot、origin、topology/corner、normal、finite bounds与invalid atomicity；
- Primitive新增open/closed Appearance matrix、same-kind replacement、pick/depth、second Context、warm与destroy；
- Corridor三个corner/end-cap、height/extrusion/generated-vertex terrain、simple ring与dynamic topology；
- Wall/PolylineVolume static/dynamic、Color/outline/distance、original Entity pick、bounds与lifecycle；
- Path FIXED sampling、availability/lead/trail/resolution、dynamic window、unsupported frame/mode与resource convergence；
- EPSG:3857量级real Context中的Corridor、Wall、PolylineVolume、Path像素、depth、pick、warm和destroy；
- C4 gate activation/order/rollback、existing C1-C7 automatic content与zero-upstream boundary。

每次Cesium升级复核`PathVisualizer._subSample`与PositionProperty类型dispatch、CornerType/PathMode/Graphics字段默认值、
standard Primitive vertex format与Appearance closed/flat规则、C4 callback order和public/private generation结果。
