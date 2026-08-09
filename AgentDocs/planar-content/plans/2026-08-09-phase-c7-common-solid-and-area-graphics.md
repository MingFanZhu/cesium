# C7 普通锚定、体与面 Entity Graphics

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C7-common-solid-and-area-graphics`
- 状态（Status）：`active`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`525bb1046a4f7989aaacdd73432063a193914ee9`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；C7源码审计与长期语义直接提升为ADR-0019
- 相关评审（Related reviews）：implementation ready后创建
  `AgentDocs/planar-content/reviews/2026-08-09-c7-common-solid-and-area-graphics.md`
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)、
  [ADR-0018](../../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)、
  [ADR-0019](../../../Documentation/SceneGIS/Decisions/ADR-0019-planar-common-solid-and-area-graphics.md)
- SGP：C7预期`0`；不得修改历史`SGP-0001/0002` hunk或manifest语义

## 阶段目标

在不进入C8路径衍生几何或C9 continuous ground的前提下：

1. 为Box、Cylinder、Ellipsoid、Plane、Ellipse与Rectangle建立可执行的planar Entity Graphics profile；
2. 新增public `SceneGISPlanarBoxGeometry`、`SceneGISPlanarCylinderGeometry`与
   `SceneGISPlanarEllipsoidGeometry`，扩展C6封闭public Primitive kind；
3. 让Plane/Ellipse/Rectangle确定降级为既有public Polygon/Polyline Geometry，避免第二套mesh runtime；
4. 通过两个private visualizer接入C4 instance-owned callback，保持既有六类content行为和顺序；
5. 固定米制coordinates、fixed-axis orientation、HeightReference、material/outline、picking、bounds、动态更新与
   exactly-once lifecycle。

## 非目标

- 不实现Corridor、Wall、PolylineVolume或Path；它们属于C8。
- 不实现continuous terrain subdivision、planar ground primitive、classification或terrain request；它们属于C9。
- 不支持inner/partial Ellipsoid、texture material、`stRotation`、shadow、3D Tiles classification或zIndex。
- 不复用默认GeometryVisualizer、GeometryUpdaterSet、GroundPrimitive、EllipseGeometry或RectangleGeometry。
- 不改变Point、Billboard、Label、Model、Polyline、Polygon的public语义、owner粒度或automatic ordering。
- 不新增跨Entity batching、Worker、Shader、build/release seam、Sandcastle、E2E或package qualification。
- 不修改任何upstream-owned file、generated file、Viewer或DataSourceDisplay。

## 当前源码事实与架构裁决

### 可复用与不可复用的Core Geometry

- `BoxGeometry`与`CylinderGeometry`只生成局部笛卡尔mesh；`EllipsoidGeometry`的radii/normal计算也是原点参数
  曲面，不建立Earth frame。三者可以通过SceneGIS public descriptor进行完整preflight后同步复用。
- `PlaneGeometry`只是单位局部平面；PlaneGraphics所需的normal/distance/dimensions可以直接计算四角并降级为
  public Polygon。
- `EllipseGeometry`、`RectangleGeometry`直接进入Cartographic、Ellipsoid、GeographicProjection、geodetic
  normal/height和ground路径，不能复用。
- C6 public Polygon已经支持simple ring、bottom positions、caps和side walls；Ellipse/Rectangle extrusion没有必要
  新建另一种public mesh type。

### 默认Entity geometry路径不能局部替换

- Box/Cylinder/Ellipsoid updater通过`Entity.computeModelMatrixForHeightReference`进入ellipsoid Cartographic和
  ENU；Plane updater使用`Entity.computeModelMatrix`；Ellipse/Rectangle updater继承GroundGeometryUpdater。
- GeometryUpdaterSet固定创建全部updater，GeometryVisualizer又创建ground/material/shadow batches。C7不能把它们
  注册到planar callback后只覆盖一个position helper。
- C4 callback已经在每个CustomDataSource拥有独立gate、EntityCluster和primitive target；新增SceneGIS child即可，
  无需新的upstream seam。

ADR-0019裁决：只为不可由C6 geometry表达的三个volume新增public类型；三类area graphic降级到C6 Polygon/
Polyline；automatic路径使用两个SceneGIS private visualizer，保持zero-upstream。

## Public Geometry 与 Primitive 扩展

### SceneGISPlanarBoxGeometry

- Required finite `center`和三个finite positive `dimensions`；构造clone输入。
- `center`固定为local origin，Core Box以原点为中心，vertex format只生成position+normal所需attributes。
- 提供只读clone getter、finite local bounding sphere和private synchronous create seam；不接受orientation、
  HeightReference、Appearance或World。

### SceneGISPlanarCylinderGeometry

- Required finite `center`、positive `length`、non-negative top/bottom radius且至少一个positive；`slices`默认沿用
  当前Cesium值，但必须是safe integer且`>=3`。
- local Z是轴向，center为origin；同步Core mesh和analytic/created finite bounds必须一致。
- 不接受numberOfVerticalLines；该值只控制Entity outline sampling。

### SceneGISPlanarEllipsoidGeometry

- Required finite `center`和positive finite `radii`；stack/slice partitions为safe integer且`>=3`。
- 只表示full solid ellipsoid。Public API不接收inner radii、clock/cone partial range或outline subdivisions。
- 复用Core local ellipsoid position/normal，center为origin，local sphere半径为最大radii。

### SceneGISPlanarPrimitive

- 显式导入并识别三个新kind；same-kind replacement、required id、attributes、model matrix、candidate/current和
  Context规则保持C6。
- Volume kind只接受closed、non-flat `PerInstanceColorAppearance`和finite color instance attribute；
  Polygon仍只接受flat variant。
- 新kind的constructor/replacement失败必须保持CPU或candidate原子性，不能影响existing line/polygon current。

## Entity Graphics compatibility matrix

### 共同行为

| Property/行为             | C7决定                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Entity show/availability  | 支持                                                           |
| graphic show/fill/outline | 支持；fill与outline可独立，outlineWidth=0表示outline隐藏       |
| material                  | undefined或`ColorMaterialProperty`；其他fail-fast              |
| outlineColor/outlineWidth | 支持finite color与finite non-negative pixel width              |
| distanceDisplayCondition  | 支持并映射标准instance attribute                               |
| shadows                   | undefined或`ShadowMode.DISABLED`；其他fail-fast                |
| pick/bounds               | original Entity id；visualizer内同Entity全部active graphic联合 |
| hidden/outside            | 隐藏并保留current owner；graphic/Entity remove才释放           |

Color alpha跨opaque/translucent class、geometry/topology、outline primitive count或local origin变化使用完整owner
candidate replacement；同class color/show/distance变化优先复用current attributes。

### Box

- Required Entity position与positive dimensions；支持Entity orientation和三个HeightReference值。
- `NONE`中心保持position.z；clamp/relative解析anchor后加`dimensions.z / 2`，使未旋转local bottom接触地表。
- Fill使用public Box Geometry；outline由public Polyline Geometry构成closed top/bottom rings与vertical edges。

### Cylinder

- Required position、positive length、合法top/bottom radius；支持slices和non-negative integer
  numberOfVerticalLines。
- Clamp/relative support offset为`length / 2`；orientation沿fixed planar Quaternion应用。
- Fill使用public Cylinder Geometry；outline使用top/bottom rings和按numberOfVerticalLines确定的vertical polylines。

### Ellipsoid

- Required position与positive radii；支持stack/slice partitions、outline subdivisions、orientation和heightReference。
- Clamp/relative support offset为实际local bottom distance `radii.z`。
- C7只支持full solid：innerRadii必须undefined；minimumClock/maximumClock/minimumCone/maximumCone只允许undefined或
  full-range默认值。其他值在mutation前拒绝。
- Fill使用public Ellipsoid Geometry；outline以确定的planar parametric rings降级为一个或多个public Polyline。

### Plane

- Required Entity position、finite nonzero Plane normal、finite distance和positive Cartesian2 dimensions；支持
  Entity orientation，不新增HeightReference。
- Plane equation在Entity local frame中解释；先构造finite orthonormal basis和四角，再用public Polygon/Polyline。
- 失败不能修改Model共享transform helper、existing graphic或caller collection。

### Ellipse

- Required Entity position XY、positive axes且semiMajorAxis>=semiMinorAxis。Position必须finite且center X/Y在World
  inclusive extent；position.z不作为surface height。
- `height`/`heightReference`与`extrudedHeight`/reference按每个generated perimeter vertex使用C1 resolver；bottom
  不得高于top。
- `rotation`为从+Y/north绕+Z counter-clockwise；positive finite granularity是perimeter parameter radian step，
  derived segment count必须safe且至少3。
- numberOfVerticalLines只控制extrusion outline；`stRotation`、classificationType、zIndex和non-disabled shadows拒绝。
- Fill/extrusion与outline分别使用public Polygon/Polyline。

### Rectangle

- Required `Rectangle.coordinates`的west/south/east/north全部作为meters，严格有序且不wrap；coordinates center必须在
  World inclusive extent。
- `rotation`为从+Y/north绕中心clockwise；straight planar edges不消费Globe angular granularity，defined
  granularity拒绝。
- Height/extruded-height按四个rotated supplied vertices走C1 resolver；bottom不得高于top。
- `stRotation`、classificationType、zIndex与non-disabled shadows拒绝；fill/extrusion/outline使用public
  Polygon/Polyline。

Ellipse/Rectangle的terrain clamp仍是generated-vertex sampling，triangle内部线性；C7不得宣称continuous ground。
`HeightReference.NONE`可以让合法anchor geometry延伸World extent外；ground-referenced generated vertex若resolver
返回undefined则当前graphic隐藏，不做clipping或request。

## Private runtime 与集成

### 新角色

- `_SceneGISPlanarSolidVisualizer`：Box、Cylinder、Ellipsoid。
- `_SceneGISPlanarAreaVisualizer`：Plane、Ellipse、Rectangle。
- `_SceneGISPlanarEntityTransform`：实际出现三个consumer后提炼fixed-axis Quaternion normalize/model matrix；迁移
  Model使用该helper并保持C2行为。

两个visualizer遵循现有`update(time)`、`getBoundingSphere`、`isDestroyed`、`destroy`习惯，使用
`_SceneGISPlanarPrimitiveOwner`管理每个graphic的一个或多个public wrapper。Automatic path显式使用
`dataSource._primitives`；focused private constructor允许省略target时沿用`scene.primitives`，与C2/C3一致。

### C4 callback调整

- Gate allowlist新增`box`、`cylinder`、`ellipsoid`、`plane`、`ellipse`与`rectangle`。
- 第一次合法activation在既有Anchor、Model、Polyline、Polygon之后构造Solid、Area两个candidate，再一次性追加；
  任一constructor失败反向清理全部candidate并保留原错误。
- 后续gate继续在child normal update/低层resource mutation前检查top-level profile；每个graphic内部Property合法性由
  对应visualizer原子检查。
- 不修改CesiumWidget现有两个SGP-0001 hunks，不修改DataSourceDisplay或Viewer。

## 允许影响路径

### 新增public runtime与Specs

- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarBoxGeometry.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarCylinderGeometry.js`
- `packages/engine/Source/SceneGIS/Core/SceneGISPlanarEllipsoidGeometry.js`
- 对应`packages/engine/Specs/SceneGIS/Core/*Spec.js`

### Private Entity runtime与Specs

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarSolidVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAreaVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTransform.js`
- 对应`packages/engine/Specs/SceneGIS/DataSources/_private/**`

### 必要修改

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js`及其Spec
- `_SceneGISPlanarModelVisualizer.js`及其focused Spec，只迁移共享fixed-axis transform
- `_SceneGISPlanarVisualizersCallback.js`、C4 callback/Widget/Viewer SceneGIS Specs
- 现有SceneGIS real Context content fixture与C5 qualification，仅补代表性C7 closure或必要回归
- `Documentation/SceneGIS/**`与`AgentDocs/planar-content/**`

任何upstream-owned product/test/build file、Shader、Worker、Sandcastle、E2E、package脚本或C8/C9路径都不在C7
授权范围。若实现必须越界，先回写phase plan和review evidence并停止请求Architecture裁决。

## 实现步骤

### C7-A：Public volume Geometry与Primitive kind

1. 实现三个immutable descriptor；constructor完成type、finite、strict-positive、safe-integer与derived allocation
   preflight后才保存clone snapshot。
2. `_createGeometry`同步调用审计过的Core Geometry，固定position+normal vertex format；对undefined/non-finite result
   fail-fast。`_getLocalBoundingSphere`不得读取Scene/Context。
3. 扩展Primitive geometry/appearance matrix与JSDoc union；保持same-kind replacement和existing kind behavior。
4. Focused Specs锁定input alias safety、local origin/bounds、合法代表值、invalid atomicity、new-kind render/pick/depth/
   replacement/Context/warm/destroy；不扩大极端numeric matrix。

### C7-B：Solid visualizer

1. 提炼private fixed-axis transform并迁移Model；先复跑C2 transform/failure regression。
2. 对每个Box/Cylinder/Ellipsoid先evaluate完整state：position、HeightReference、support offset、orientation、geometry、
   style、distance与bounds。
3. Fill创建public volume wrapper；outline创建public polyline wrappers，一个owner原子insert/replace。
4. 静态warm update不新建Geometry/owner/command；dynamic property只影响目标graphic，invalid mutation保留current。
5. Spec覆盖三类graphics、三个HeightReference代表路径、orientation、outline、unsupported profile、pick/bounds、target/
   rollback与destroy。

### C7-C：Area visualizer与automatic gate

1. Plane稳健归一化normal并计算basis/四角；Ellipse/Rectangle生成确定perimeter，完整解析top/bottom后构造public
   Polygon/Polyline。
2. 固定Ellipse/Rectangle rotation、meter coordinates、granularity与vertex-only terrain语义；全部derived vertex/
   index/count finite后才创建candidate。
3. 扩展gate allowlist和deferred candidate list；保持既有四child顺序与rollback。
4. Real Context closure至少绘制一个volume、Plane、terrain-relative Ellipse与rotated/extruded Rectangle，验证大坐标
   pixel/depth/original Entity pick/selection、finite union bounds、warm identity和destroy balance。
5. Automatic Widget/DataSource remove/reorder/invalid profile与default Globe代表性回归只运行受C7影响的focused cases。

### C7-D：文档、生成与review

1. 更新Architecture、DevelopmentGuide、PlanarContentGuide与UpgradeChecklist，加入六类compatibility matrix、
   meter Rectangle、height/rotation、public volume与C9 boundary。
2. 验证engine/Cesium root runtime、`.d.ts`与API HTML只新增三个public Geometry；private roles不进入声明/API。
3. 创建pending C7 review，回写实际source-to-spec mapping、case count、commands、ownership、偏差与remaining risks。
4. Execution停止，不commit、不push、不进入C8。

## 测试与验收

### Hard behavior/resource gates

- 三个public Geometry为CPU-only immutable local mesh；EPSG:3857-scale center不进入local vertex，bounds finite。
- Public Primitive新kind可见、depth finite、pick返回wrapper/caller id；candidate failure保留old current，second Context和
  destroy contract不回归。
- 六类Graphics的approved Property组合静态/动态可见；unsupported值在该graphic mutation前fail-fast，不落入Globe
  updater。
- Fixed-axis orientation不调用ENU；Box/Cylinder/Ellipsoid clamp/relative support offset符合ADR-0019。
- Plane local equation、Ellipse counter-clockwise-from-north、Rectangle meter coordinates/clockwise rotation有直接
  deterministic evidence。
- Ellipse/Rectangle height/extrusion使用generated-vertex resident terrain/Z=0 fallback，不发request、不改变
  world.tilesLoaded且不冒充continuous ground。
- Original Entity picking、DataSource/Viewer selection、per-DataSource ordering、联合bounds、warm identity与exactly-once
  owner/resource release成立。
- Existing Point/Billboard/Label/Model/Polyline/Polygon与default Globe代表性路径保持。

### 最小充分命令

Execution记录实际runner语法，至少包括：

1. 三个新Core Geometry suites与扩展后的public Primitive suite；
2. Solid、Area、shared transform focused suites；
3. C4 callback、automatic Widget和一个real Context aggregate；按实际影响复跑Model与C5 qualification；
4. `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`；C7新增public API，四项必须运行；
5. scoped ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`；
6. `node scripts/scenegis/audit-upstream-patches.mjs`，确认current delivery upstream-owned=`0`、C7 SGP=`0`、
   generated status=`0`；
7. root JS/types/API精确断言三个public类型存在，三个private role在declarations/API命中`0`。

不运行无关Cesium全库Specs、build-release、Sandcastle/E2E/package smoke、超大对象profile、极端numeric matrix或长时间
soak。若C7实际触及未授权边界，验证矩阵随真实风险扩大，而不是预先全量运行。

## Ownership与阶段门禁

- 预期upstream-owned product/test/build files=`0`，C7 SGP=`0`。
- 历史`Scene.js`、`CesiumWidget.js`、`Viewer.js`、manifest与SGP-0001/0002 hunks必须unchanged。
- 生成文件、WebGL artifacts、临时bundle与profile输出不得进入status。
- Execution完成implementation、最小充分验证与AgentDocs后创建`pending` review并停止；不commit、不push、不进入
  C8。
- Architecture/code review通过后，由Architecture Agent形成C7独立中文本地提交检查点，再自动设计并派发C8。

## 当前交接

- C6已在checkpoint `525bb1046a4f7989aaacdd73432063a193914ee9`完成并提交。
- ADR-0019与本phase plan已confirmed；C7状态为`active`。
- 下一步：Execution从C7 planning checkpoint实现C7-A～C7-D，创建pending review后回报Architecture Agent。

## 偏差与结果

Implementation尚未开始。Execution必须在本节回写实际文件、source-to-spec mapping、case count、命令结果、
public generation、upstream/SGP/generated审计、偏差与剩余风险。
