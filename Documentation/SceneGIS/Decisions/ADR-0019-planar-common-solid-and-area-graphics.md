# ADR-0019：平面普通体与面 Graphics 的公共 Geometry 降级与 Entity 适配

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c7-common-solid-and-area-graphics.md`
- Related patch：无；C7 默认 upstream-owned files=`0`、SGP=`0`

## 上下文与源码事实

C6 已交付 public `SceneGISPlanarPrimitive`、`SceneGISPlanarPolylineGeometry` 与
`SceneGISPlanarPolygonGeometry`，并让 Polyline/Polygon Entity adapter 复用同一标准同步
`Primitive` 后端。C7 需要补齐 Box、Cylinder、Ellipsoid、Plane、Ellipse 与 Rectangle，但不能把
Cesium 的 Globe GeometryUpdater 或 ellipsoid Geometry 直接当成平面实现。

Cesium 1.144 当前实现具有以下事实：

1. `BoxGeometry`、`CylinderGeometry` 和 `EllipsoidGeometry` 都在局部原点生成笛卡尔 mesh。
   Box/Cylinder 不读取 Ellipsoid、Cartographic 或 geodesic；Ellipsoid Geometry 内部的
   `Ellipsoid` 只描述原点处参数曲面的 radii/normal，不建立 Earth-fixed frame。因此三者可在完整
   preflight 后作为 coordinate-neutral local mesh 复用。
2. `PlaneGeometry` 是局部原点的单位平面，但 `PlaneGraphics` 还需要把 `Plane.normal/distance`、
   dimensions 与 Entity transform 组合。该结果可直接降级为四顶点 public planar Polygon，无需新增
   另一种 public Geometry kind。
3. `EllipseGeometry` 和 `RectangleGeometry` 明确导入并调用 Cartographic、Ellipsoid、
   GeographicProjection、geodetic surface normal 与 geodetic-height pipeline。它们不能通过把输入
   Cartesian3 换成米制坐标而获得 planar 语义。
4. `GeometryUpdaterSet` 固定实例化包含 ground-oriented updater 的全局类型数组；
   `GeometryVisualizer` 同时建立 ground/color/material/shadow batches，并读取 Scene ellipsoid 能力。
   它不是可以只替换坐标解释的窄 hook。
5. C4 的 instance-owned visualizers callback 已能在不修改 `DataSourceDisplay` 的情况下追加新的
   SceneGIS private visualizer；C7 只需扩大同一 gate 的明确 top-level allowlist。
6. C6 `SceneGISPlanarPrimitive` 采用封闭 `instanceof` geometry 集合、构造时固定 kind、
   normal-render candidate/current、single Context 与 exactly-once ownership。C7 必须扩展这个封闭集合，
   不能放宽为 raw Cesium Geometry。

## 决策

### Public Geometry 只增加三个不可替代的 volume kind

C7 新增：

```text
SceneGISPlanarBoxGeometry
SceneGISPlanarCylinderGeometry
SceneGISPlanarEllipsoidGeometry
```

三者都是 CPU-only immutable snapshot：

- `center` 是 finite 米制 world `Cartesian3`，同时作为完整 XYZ local origin；输入必须 clone，公开 getter
  返回 clone。
- GPU geometry 始终以该 center 为局部原点，使用 DOUBLE position 与 normal-compatible vertex format；
  world placement 继续由 `SceneGISPlanarPrimitive` 的 `translation(origin) * modelMatrix` 恢复。
- Box 要求三个 dimensions 严格为 finite positive。
- Cylinder 要求 finite positive length、finite non-negative top/bottom radius、至少一个 radius positive，
  以及安全 integer `slices >= 3`。
- Ellipsoid 要求三个 radii finite positive、safe integer stack/slice partitions `>= 3`。C7 public kind只表示
  完整实心 ellipsoid，不暴露 inner radii 或 partial clock/cone。
- `_createGeometry` 只同步调用已审计的 Cesium Core createGeometry，不增加 Worker、pack/unpack 或 build seam；
  derived undefined/non-finite geometry 在任何 scene/GPU mutation 前转为 `DeveloperError`。

Plane、Ellipse 和 Rectangle 不增加同名 public Geometry：

- Plane 计算 local plane basis 后形成一个 `SceneGISPlanarPolygonGeometry`，outline 使用
  `SceneGISPlanarPolylineGeometry`。
- Ellipse 按 planar angular perimeter sampling 形成 simple Polygon，extrusion 复用 public Polygon 的
  top/bottom/side contract。
- Rectangle 把四角与可选 extrusion 降级为同一 public Polygon；rotation 先在 CPU 中围绕矩形中心完成。

这一降级使 Entity adapter 与应用可直接使用的 C6 public geometry 保持同一运行时，同时避免为几何上等价的
四边形和采样 polygon 扩张长期 API。

### SceneGISPlanarPrimitive 的新增 Appearance profile

`SceneGISPlanarPrimitive` 的封闭 geometry kind 增加上述三个 volume 类型，并继续只允许 same-kind
replacement。

- Polyline 继续要求 Color `PolylineMaterialAppearance`。
- Polygon（包括 Plane/Ellipse/Rectangle 的降级结果）继续要求 flat `PerInstanceColorAppearance` 与 finite
  color instance attribute。
- Box/Cylinder/Ellipsoid 要求 closed、non-flat `PerInstanceColorAppearance` 与 finite color instance
  attribute，使 Core mesh normal 进入标准 light path。
- 任意 raw `BoxGeometry`、`CylinderGeometry`、`EllipsoidGeometry`、其他 Cesium Geometry、
  `MaterialAppearance` 或不匹配 kind 的 Appearance 仍在 CPU preflight 阶段拒绝。

C6 的 id、attributes、model matrix、candidate/current、pick/depth、Context、warm identity 与 destroy
契约完全保留。

### 固定平面坐标、朝向与高度

所有 automatic content 继续使用 X east、Y north、Z up 和 ADR-0013 的三个 HeightReference 值。

Box、Cylinder、Ellipsoid：

- `Entity.position` 是中心 anchor；`HeightReference.NONE` 时中心 Z 保持 position.z。
- `CLAMP_TO_GROUND`/`RELATIVE_TO_GROUND` 先按 C1 resolver 解析 anchor，再沿 world +Z 加上未旋转 local
  geometry 的下部 support：Box 为 `dimensions.z / 2`、Cylinder 为 `length / 2`、Ellipsoid 为
  `radii.z`。因此默认朝向下几何底部落在逻辑地表；orientation 后的倾斜不重新做接触求解。
- `Entity.orientation` undefined 表示 identity；defined Quaternion 直接映射 fixed planar axes。C7提炼一个
  private transform helper并让既有 Model与新visualizer共同使用，禁止重新引入 ENU。

Plane：

- 使用完整 Entity position和orientation；没有隐式 HeightReference。
- `Plane.normal/distance` 在 Entity local frame中解释，normal必须finite/nonzero，distance finite；dimensions
  是 local plane basis上的finite positive width/height。

Ellipse：

- Entity position只提供 center X/Y和extent anchor；surface Z由`height`与`heightReference`决定，position.z
  不作为第二个高度来源。
- `rotation`解释为从 planar north（+Y）观察、绕 +Z counter-clockwise；`granularity`解释为轮廓参数角的
  positive radian step，不表示地球角距离。

Rectangle：

- `Rectangle.coordinates.west/south/east/north`在 planar World中明确解释为 CRS meters；要求全部finite、
  `west < east`、`south < north`，不允许 IDL wrap。
- `rotation`解释为从 planar north（+Y）绕中心 clockwise。平面直边不消费 Globe angular
  `granularity`；defined granularity在 C7 fail-fast。
- Rectangle没有 Entity position；coordinates center作为extent anchor。Height/extruded-height仍按每个
  generated vertex解析。

Ellipse/Rectangle 的 `heightReference` 与 `extrudedHeightReference` 对生成的 supplied perimeter vertices
逐点读取 resident terrain；undefined terrain稳定回退Z=0。`NONE`使用对应 scalar height，
`CLAMP_TO_GROUND`忽略scalar，`RELATIVE_TO_GROUND`使用terrain+scalar。任一bottom高于对应top时原子拒绝。
这仍是 vertex-only terrain approximation；连续贴地、误差预算和ground primitive保持C9边界。

### Graphics compatibility profile

六类 Graphics 共同支持 Entity `isShowing`、availability、graphic `show`、`fill`、默认/`ColorMaterialProperty`、
`outline`、`outlineColor`、finite non-negative `outlineWidth`、`distanceDisplayCondition`、original Entity pick、
bounds和动态Property。零outline width表示outline隐藏。

- Box支持dimensions、heightReference与Entity orientation。
- Cylinder支持length、top/bottom radius、slices、numberOfVerticalLines、heightReference与orientation。
- Ellipsoid支持radii、stack/slice partitions、subdivisions、heightReference与orientation；innerRadii以及非默认
  minimum/maximum clock/cone在C7 fail-fast。
- Plane支持plane、dimensions与orientation。
- Ellipse支持semi axes、height/extruded height references、rotation、planar granularity和
  numberOfVerticalLines。
- Rectangle支持meter coordinates、height/extruded height references与planar rotation。

下列配置不静默忽略：非Color material、非`ShadowMode.DISABLED` shadows、`stRotation`、classification、zIndex、
Ellipse/Rectangle的3D Tiles或Globe ground语义，以及上文未批准的advanced Ellipsoid/Rectangle granularity。
它们必须在该graphic的scene/resource/current mutation前抛英文`DeveloperError`。

Volume fill使用新增public volume Geometry；所有outline以及Plane/Ellipse/Rectangle fill都使用C6 public
Polyline/Polygon Geometry。Outline可以由多个 public wrapper组成，但必须由一个per-graphic candidate owner
原子插入、替换和释放。

### Private visualizer 与 C4 gate

C7 新增两个 private visualizer：

```text
_SceneGISPlanarSolidVisualizer   // Box, Cylinder, Ellipsoid
_SceneGISPlanarAreaVisualizer    // Plane, Ellipse, Rectangle
```

二者复用 `_SceneGISPlanarPrimitiveOwner`、C1 resolver、C6 public wrapper与C4 per-DataSource target；不拥有
World、Scene、Entity、Property、terrain provider或caller collection。C4 gate把六个top-level property加入
allowlist，并在既有四个child之后追加两个新child，保证existing six graphics的构造/更新顺序不变。

每个graphic完整evaluate Property、height samples、topology、appearance class、model matrix与bounds后才修改
current。Geometry/topology/translucency/outline-count变化使用owner candidate/current；相同geometry的show、color和
distance attribute优先原地更新。临时hidden/outside保留current owner，graphic/Entity移除、replacement与destroy
exactly once释放。`getBoundingSphere`联合该visualizer内同一Entity的全部active graphics。

## 不采用的方案

### 直接复用 GeometryVisualizer/GeometryUpdaterSet

拒绝。它们固定实例化Globe updaters和ground batches，并通过Entity ECEF/ellipsoid height path生成model matrix；
无法只替换一个坐标helper。

### 为六类 Graphics 全部新增同名 public Geometry

拒绝。Plane/Ellipse/Rectangle在planar语义下已经是C6 public Polygon/Polyline的确定降级；新增三种等价类型只会
扩大compatibility surface。只有局部volume mesh无法由现有单polygon表达，因此增加Box/Cylinder/Ellipsoid。

### 直接复用 EllipseGeometry/RectangleGeometry

拒绝。二者显式依赖Cartographic、Ellipsoid、GeographicProjection、geodetic normal/height和ground pipeline，
不是coordinate-neutral mesh factory。

### 在 C7 同时实现 continuous ground 或 arbitrary material

拒绝。Continuous terrain subdivision属于C9；texture/material coordinates、shadow与classification需要新的vertex
format和resource ownership契约。C7通过明确Color profile与fail-fast形成完整可执行矩阵，不用silent ignore伪装
全支持。

## 兼容性、所有权与构建

C7默认只修改`packages/engine/Source/SceneGIS/**`、对应SceneGIS Specs、SceneGIS durable docs和AgentDocs。
预计upstream-owned files=`0`、C7 SGP=`0`；不得修改`Scene.js`、`CesiumWidget.js`、`Viewer.js`、
`.scenegis/upstream-patches.json`或历史SGP-0001/0002 hunks。

三个public Geometry必须进入engine/Cesium root runtime、declarations和API HTML。两个visualizer、transform helper与
其他private role必须从declarations/API隐藏。不得手工修改generated barrel、types、SpecList或Build产物。

## 测试与升级检查点

C7至少验证：

- 三个public volume Geometry的clone、local origin、参数preflight、finite bounds与Core mesh closure；
- public Primitive对三个新增kind的Appearance、normal render replacement、pick/depth、second Context、warm与destroy；
- 六类Graphics的static/dynamic、height/orientation、fill/outline/color/distance、unsupported fail-fast、original
  Entity pick、联合bounds、DataSource target/order和exactly-once lifecycle；
- EPSG:3857-scale real Context中的代表性volume、plane、ellipse、rotated/extruded rectangle像素、depth与selection；
- existing Model fixed-axis transform以及Point/Billboard/Label/Model/Polyline/Polygon automatic regression。

每次Cesium升级复核Core Box/Cylinder/Ellipsoid createGeometry的坐标中立事实与vertex format、
`PerInstanceColorAppearance` flat/closed/normal要求、Graphics Property/default变化、C4 callback child order、
PrimitiveCollection membership与C6 candidate/current语义。若上游未来提供真正world-aware、instance-owned且不经过
Ellipsoid/Cartographic的GeometryUpdater profile，再评估删除对应private visualizer。
