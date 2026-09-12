# C8 路径衍生 Geometry 与动态 Path

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C8-route-derived-geometry-and-path`
- 状态（Status）：`completed`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- 创建/更新日期：`2026-08-10`
- Planning base / implementation diff base：`480a865fda210c4e49b8a0d9eea4efa91111c38c`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；长期语义直接提升为ADR-0020
- 相关评审（Related reviews）：
  [C8 architecture/code review](../reviews/2026-08-10-c8-route-derived-geometry-and-path.md)（`approved`）
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0018](../../../Documentation/SceneGIS/Decisions/ADR-0018-planar-public-primitive-and-geometry.md)、
  [ADR-0019](../../../Documentation/SceneGIS/Decisions/ADR-0019-planar-common-solid-and-area-graphics.md)、
  [ADR-0020](../../../Documentation/SceneGIS/Decisions/ADR-0020-planar-route-derived-geometry-and-path.md)
- SGP：C8预期`0`；不得修改历史SGP-0001/0002 hunk或manifest语义

## 阶段目标

在不进入C9 continuous ground与C10最终交付的前提下：

1. 新增public `SceneGISPlanarWallGeometry`和`SceneGISPlanarPolylineVolumeGeometry`，扩展既有public
   `SceneGISPlanarPrimitive`的open/closed non-flat geometry matrix；
2. 以Euclidean XY path算法把Corridor降级为public Polygon/Polyline，并把Wall/PolylineVolume接入对应public
   Geometry；
3. 复用Cesium Property时间采样而不复用默认Globe Path renderer，把fixed-frame Path降级为public Polyline；
4. 新增Route/Path private visualizer并接入C4 instance-owned callback，保持既有六个child顺序与行为；
5. 固定四类Graphics的静态/动态、material、outline、distance、picking、bounds、warm与exactly-once lifecycle。

## 非目标

- 不实现continuous terrain subdivision、planar GroundPrimitive、classification或terrain request；属于C9。
- 不实现`PathMode.PORTIONS`、INERTIAL、entity-relative/VVLH Path、path orientation或temporal material segments。
- 不复用默认Corridor/Wall/PolylineVolume Geometry、GeometryUpdater、PathVisualizer renderer或PolylineCollection。
- 不支持texture material、shadow、classification、zIndex、raw Cesium Geometry或任意custom Appearance。
- 不新增public Corridor/Path Geometry；二者必须复用已有public Polygon/Polyline。
- 不新增Worker、Shader、build/release seam、Sandcastle、E2E、package qualification或跨Entity batching。
- 不修改upstream-owned file、generated file、Viewer、DataSourceDisplay、CesiumWidget或planar terrain runtime。

## 当前源码事实与架构裁决

### Cesium默认Geometry不能直接复用

- `CorridorGeometry.createGeometry`先scale到geodetic surface，再通过ellipsoid normal、
  `PolylinePipeline.generateArc`与geodetic height组合mesh。
- `WallGeometryLibrary`把route转成Cartographic并按ellipsoid radius/angular granularity细分，Wall normal读取
  geodetic surface normal。
- `PolylineVolumeGeometryLibrary`使用Cartographic、EllipsoidTangentPlane、ENU transform与geodesic
  subdivision建立shape frame。
- 结论：只复用四类Graphics/Property数据模型与无地球语义的enum；三种upstream Core Geometry及默认updater均禁止。

### Path采样与renderer可以拆开

- 默认`PathVisualizer`的private `_subSample`按PositionProperty类型处理Sampled/Callback/Composite/Interval/
  Reference与generic sampling；传入FIXED reference frame时可以只得到Cartesian3 samples。
- 默认renderer同时支持INERTIAL、entity-relative/VVLH、PORTIONS material与独立PolylineCollection，不能进入planar
  callback。
- 裁决：用private `_SceneGISPlanarPathSampler`隔离`PathVisualizer._subSample`，在调用前拒绝任何non-FIXED或
  relative frame；render仍走public SceneGISPlanarPolylineGeometry/Primitive。

### Public低层类型边界

- Corridor top/bottom/caps/sides可由C6 public Polygon表达，outline由Polyline表达；不新增等价public type。
- Path sample本身就是Polyline；不新增等价public type。
- Wall在XY投影可退化为零面积，不能使用现有Polygon triangulation；PolylineVolume需要shape sweep、normal与caps。
  二者新增public Geometry是必要且最小的长期API扩展。
- `SceneGISPlanarPrimitive`必须保持封闭instanceof集合、construction-time kind与same-kind replacement；不得放宽为
  raw Geometry。

## Public Geometry与Primitive详细契约

### SceneGISPlanarWallGeometry

- Constructor options：required `positions`，optional `minimumHeights`、`maximumHeights`、`origin`。
- positions clone；至少2个finite Cartesian3；相邻XY严格不同。minimum/maximum若定义必须为等长finite array。
- Top默认position.z，bottom默认0；每站`bottom <= top`，每个segment至少有一个endpoint具有正高度跨度。
- 每segment独立四vertex/two triangle，避免转角normal平均；normal由XY segment与world +Z计算。
- Origin默认第一个bottom point；输出local DOUBLE position、FLOAT normal、indices和finite local sphere。
- Public getter只返回clone snapshot；private `_createGeometry`、`_getLocalBoundingSphere`与outline seam不进入types/API。

### SceneGISPlanarPolylineVolumeGeometry

- Constructor options：required `polylinePositions`、`shapePositions`；optional `cornerType`、
  `cornerGranularity`、`origin`。
- Route至少2点，finite，所有segment nonzero XY；拒绝180-degree reversal、non-adjacent XY crossing/touch与derived
  non-finite miter。
- Shape clone并规范化唯一closing duplicate；至少3个不同点、simple、nonzero area。以shape bounding rectangle
  center归零，保持Cesium Graphics居中预期。
- Shape +X映射route-left，+Y映射world +Z；route position.z是center elevation。
- MITERED一个station、BEVELED两个station、ROUNDED按`cornerGranularity`插值stations；默认
  `CesiumMath.RADIANS_PER_DEGREE`且必须finite positive。
- Connect station rings并用shape triangulation封start/end caps；triangle normals finite，result closed且nonempty。
- Origin默认第一route position；输出local DOUBLE position、FLOAT normal、indices与finite sphere；private outline
  seam提供end rings和longitudinal paths。

### SceneGISPlanarPrimitive

- `validateGeometry`/kind/JSDoc加入Wall与PolylineVolume，constructor/getter types同步。
- Wall只接受open、non-flat `PerInstanceColorAppearance`；PolylineVolume接受closed、non-flat appearance；两者都要求
  finite color instance attribute。
- 保持C6/C7 desired/current、normal-render promotion、pick/depth last-current、published attribute preservation、
  model matrix/bounds、single Context、warm identity与destroy contract。
- Public API变化必须通过root runtime、engine/Cesium declarations与API HTML；private seam命中必须为0。

## Entity Graphics compatibility profile

### 共同规则

| Property/行为            | C8决定                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Entity show/availability | 支持                                                                   |
| fill/material            | fill默认true；仅undefined或ColorMaterialProperty                       |
| outline/color/width      | 支持；width finite nonnegative，0隐藏outline                           |
| distanceDisplayCondition | 支持value snapshot与原地attribute update                               |
| shadows                  | undefined或ShadowMode.DISABLED                                         |
| pick/bounds              | original Entity；同visualizer内联合active graphics                     |
| dynamic Property         | 完整preflight后candidate/current；静态warm不重建                       |
| terrain/readiness        | 仅Corridor generated vertices使用C1 resident resolver；不新增readiness |

### Corridor

- Required positions至少2点、width positive；centerline positions仅使用XY，Z不作为height。
- Supplied centerline全部位于World inclusive extent；相邻XY不同、route simple、无180 reversal。
- CornerType支持ROUNDED/MITERED/BEVELED。Rounded使用positive radian granularity与semicircle ends；其余square ends。
- CPU生成simple outer ring；fill/extrusion使用public Polygon，outline使用Polyline。
- Height/extrudedHeight与两个HeightReference按generated perimeter逐点走C1 resolver；bottom不得高于top。
- `NONE`可让ring延伸extent外；ground ref生成点outside则隐藏current。Classification/zIndex/non-disabled shadows拒绝。

### Wall

- Required positions按public Wall规则；所有supplied XY位于extent。
- minimumHeights默认0，maximumHeights默认positions.z；不读取terrain。
- Defined granularity拒绝，因为其唯一upstream含义是Globe arc subdivision。
- Fill使用public Wall；outline为top/bottom route与每站vertical edge。

### PolylineVolume

- Required positions/shape映射public Geometry，所有route XY anchors位于extent；shape可延伸extent外。
- CornerType与Graphics granularity映射planar corner rules；不查询terrain。
- Fill使用closed public PolylineVolume；outline使用两个end rings与每个shape vertex longitudinal path。

### Path

- Entity必须有position；effective reference frame只允许`ReferenceFrame.FIXED`。
- `relativeTo`只允许undefined/`"FIXED"`；`materialMode`只允许undefined/`PathMode.WHOLE`。
- resolution默认60秒且finite positive；lead/trail若定义必须finite nonnegative。
- 有availability时与lead/trail窗口相交；无availability时必须同时定义lead/trail。区间无正长度或samples少于2时隐藏。
- Sampler输出全部finite且在extent内才显示；不clip。Geometry使用public Polyline。

## Private runtime与automatic集成

### 允许的新角色

- `_SceneGISPlanarRouteVisualizer`：同时跟踪Corridor、Wall、PolylineVolume并联合bounds。
- `_SceneGISPlanarPathVisualizer`：跟踪Path时间窗口、sample、public Polyline owner与bounds。
- `_SceneGISPlanarPathSampler`：FIXED-only wrapper；无subscription/resource ownership。
- 可选一个private Core XY path/topology helper；只有Corridor与PolylineVolume实际复用时才创建。

Route/Path构造参数与C7一致：live World、Scene、EntityCollection、optional caller-owned PrimitiveCollection。
Automatic path必须使用`dataSource._primitives`；direct private Specs省略target时仍使用`scene.primitives`。

### Callback与gate

- Top-level allowlist新增`corridor`、`wall`、`polylineVolume`、`path`。
- Child顺序固定：Anchor、Model、Polyline、Polygon、Solid、Area、Route、Path。
- Activation constructor rollback覆盖第七/第八child异常，保留original error并exactly once销毁先前candidates。
- Existing six child identity/order、default Globe、generic World和`globe:false`不变；不改C4 upstream hunk。

### 原子性与lifecycle

- 每个visualizer在一个update内先计算其全部tracked states，再执行任何owner insert/update/remove。
- Missing graphic释放owner；temporary hidden/outside只setShow(false)并保留current。
- Geometry/topology/translucency/primitive-count/local-origin变化创建完整candidate、insert成功后再替换current。
- Same topology的color/show/distance只更新appearance/attributes；distance保存near/far value snapshot。
- Post-insertion event failure通过现有PrimitiveOwner real membership rollback，原始异常不被cleanup覆盖。
- Static warm frame保持wrapper/internal Primitive/DrawCommand/VA/shader/attributes；Path sample不变时同样复用。

## 影响路径与允许修改范围

### Product source

- 新增：
  - `packages/engine/Source/SceneGIS/Core/SceneGISPlanarWallGeometry.js`
  - `packages/engine/Source/SceneGIS/Core/SceneGISPlanarPolylineVolumeGeometry.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarRouteVisualizer.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathVisualizer.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathSampler.js`
- 可选新增：一个C8确实共享的private Core path/topology helper。
- 修改：
  - `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarPrimitive.js`
  - `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarVisualizersCallback.js`
- 只有提炼真实共享验证逻辑时，才允许最小修改既有SceneGIS Polygon/helper；不得改变C1-C7 public语义。

### Specs

- 新增两个public Core Geometry Specs、Route/Path/Sampler private Specs。
- 扩展Primitive、callback、automatic Widget、real Context content fixture与受影响qualification断言。
- 只运行C8影响的C1-C7 representative regression；不跑无关全库矩阵。

### Docs与AgentDocs

- 更新`Architecture.md`、`DevelopmentGuide.md`、`PlanarContentGuide.md`与升级清单中C8稳定规则。
- Execution回写本phase实际source-to-spec mapping、case count、偏差、验证、ownership与remaining risks。
- Implementation ready后创建
  `AgentDocs/planar-content/reviews/2026-08-10-c8-route-derived-geometry-and-path.md`。

## 执行步骤

### C8-A：Core Geometry与Primitive kind

1. 实现Wall Geometry snapshot/mesh/outline seam与focused Spec。
2. 实现PolylineVolume route/shape/corner/station/mesh/outline seam与focused Spec。
3. 扩展SceneGISPlanarPrimitive appearance matrix与replacement/render/lifecycle Specs。
4. 验证root runtime/types/API与private generation boundary。

### C8-B：Route visualizer

1. 实现Corridor XY offset/join/end-cap与Polygon/Polyline lowering。
2. 实现Wall、PolylineVolume Property profile、owner creation、dynamic signature、style attribute与union bounds。
3. 覆盖invalid preflight、outside/hidden、terrain generated-vertex、candidate/current、real collection rollback与destroy。

### C8-C：Path sampler与visualizer

1. 封装FIXED-only Path sampler，锁定各PositionProperty代表类型与unsupported frame。
2. 实现availability/lead/trail/resolution window、WHOLE Color material与public Polyline owner。
3. 覆盖动态time/window/sample、missing/outside、warm reuse、bounds/pick与resource convergence。

### C8-D：Automatic closure与文档

1. 扩展gate allowlist/child order/constructor rollback与automatic per-DataSource target。
2. 扩展一个real Context fixture，闭环四类pixel/depth/original Entity pick、大坐标、warm和destroy。
3. 回写durable docs、phase结果与pending review，停止等待Architecture review；不进入C9。

## 验收矩阵

Execution记录实际命令和case count，至少包括：

1. 两个public Geometry、Primitive、Route、Path Sampler、Path Visualizer focused suites；
2. callback、automatic Widget与一个representative real Context aggregate；
3. 受影响的C6/C7 public Primitive、C4 automatic integration与C5 small qualification regression；
4. `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`；
5. scoped ESLint、JS/Markdown Prettier、Markdownlint与`git diff --check`；
6. `node scripts/scenegis/audit-upstream-patches.mjs`，确认current delivery upstream-owned=`0`、C8 SGP=`0`、
   generated status=`0`；
7. root JS/types/API精确断言两个public类型存在，三个private roles及可选helper在declarations/API命中`0`。

不运行无关Cesium全库Specs、build-release、Sandcastle/E2E/package、超大对象profile、极端numeric matrix或长时间
soak。若实现实际越过边界，再按真实风险扩大验证。

## Ownership与阶段门禁

- 预期upstream-owned product/test/build files=`0`、C8 SGP=`0`。
- 历史`Scene.js`、`CesiumWidget.js`、`Viewer.js`、manifest与SGP-0001/0002 hunks必须unchanged。
- 生成文件、WebGL artifacts与临时输出不得进入status。
- Execution完成implementation、最小充分验证与AgentDocs后创建pending review并停止；不commit、不push、不进入C9。
- Architecture/code review通过后，由Architecture Agent形成C8独立中文本地提交检查点，再自动进入C9设计。

## 当前交接

- Architecture focused re-review已关闭C8-R001～C8-R004；phase=`completed`、review=`approved`，
  zero-upstream/zero-SGP边界不变。
- 下一步：Architecture Agent形成C8独立中文本地提交检查点，然后重新发现C9源码事实并建立phase plan。

## 偏差与结果

### 实际设计与路径

- 新增public `SceneGISPlanarWallGeometry`和`SceneGISPlanarPolylineVolumeGeometry`；前者按segment生成hard
  normal，后者使用fixed XY left/+Z frame、三种corner station、side triangles与双cap。
- `SceneGISPlanarPrimitive`只扩展两个fixed geometry kind：Wall要求open/non-flat，PolylineVolume要求
  closed/non-flat；C6/C7 candidate/current、attribute preservation、Context和lifecycle未改变。
- 新增`_SceneGISPlanarRouteVisualizer`，Corridor使用本文件Euclidean XY offset/join/cap helper降级到public
  Polygon/Polyline；没有新增可选shared Core helper。Wall/PolylineVolume直接使用新public Geometry。
- 新增`_SceneGISPlanarPathSampler`，唯一隔离复用`PathVisualizer._subSample`并锁定FIXED frame；
  `_SceneGISPlanarPathVisualizer`把WHOLE path降级到public Polyline。
- callback保持既有六child顺序并追加Route、Path；automatic target继续使用`dataSource._primitives`。
- 首轮review后，Route signature加入public Geometry的world origin，刚性平移走candidate/current replacement；
  PolylineVolume将clockwise shape canonicalize为counter-clockwise并用scale-normalized原始segment components拒绝
  exact reversal；Path在shown/signature前移除连续重复sample，静止区间隐藏并保留current owner。
- 最终product paths为phase列出的七个文件；Specs新增五个focused文件，并扩展Primitive、callback、automatic
  Widget、real Context aggregate和C5 qualification listener baseline。

### Source-to-Spec mapping与case count

| Source                                    | Direct Spec                                    | 结果                                        |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| `SceneGISPlanarWallGeometry.js`           | `SceneGISPlanarWallGeometrySpec.js`            | `2/2`                                       |
| `SceneGISPlanarPolylineVolumeGeometry.js` | `SceneGISPlanarPolylineVolumeGeometrySpec.js`  | `4/4`                                       |
| `SceneGISPlanarPrimitive.js`              | `SceneGISPlanarPrimitiveSpec.js`               | aggregate `9/9`；C8新增`1`                  |
| `_SceneGISPlanarRouteVisualizer.js`       | `SceneGISPlanarRouteVisualizerSpec.js`         | `6/6`                                       |
| `_SceneGISPlanarPathSampler.js`           | `SceneGISPlanarPathSamplerSpec.js`             | `2/2`                                       |
| `_SceneGISPlanarPathVisualizer.js`        | `SceneGISPlanarPathVisualizerSpec.js`          | `4/4`                                       |
| `_SceneGISPlanarVisualizersCallback.js`   | `_SceneGISPlanarVisualizersCallbackSpec.js`    | aggregate `10/10`；C8新增`1`并扩展既有cases |
| automatic/real Context/qualification      | Widget、ContentVisualizer、Qualification Specs | `4/4`、`2/2`、`3/3`                         |

C8新增direct `it` cases=`20`；上述focused suites aggregate=`46`，各suite互不重叠。Widget、real Context和
qualification主要扩展既有cases，不冒充新增direct cases。

### 验证矩阵

- Focused runner：Wall `2/2`、PolylineVolume `4/4`、Primitive `9/9`、Route `6/6`、Path Sampler
  `2/2`、Path Visualizer `4/4`、callback `10/10`、automatic Widget `4/4`、real Context aggregate
  `2/2`、C5 qualification `3/3`，均Exit `0`。Context/qualification仅有既有Node `DEP0060` warning。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：Exit `0`；type/docs生成仅输出
  既有upstream TSD-JSDoc warnings。
- Architecture focused re-review串行独立复跑PolylineVolume Geometry `4/4`、Route Visualizer `6/6`与Path
  Visualizer `4/4`，均Exit `0`。
- Changed-scope ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`与official upstream audit：
  Exit `0`。Audit报告current-delivery upstream-owned entries=`0`、registered historical SGP=`SGP-0001, SGP-0002`、
  generated status=`0`。
- Root runtime、engine/Cesium declarations和API HTML均可见两个public Geometry；三个private role在`.d.ts`与
  API HTML命中`0`。两个public类型在engine root JS/`.d.ts`/API HTML各命中`1`；生成文件不进入Git status。

### Ownership与剩余风险

- upstream-owned files=`0`；C8 SGP=`0`；manifest、SGP-0001/0002及其hunks unchanged；new patch marker=`0`。
- 没有Shader、Worker、build seam、Sandcastle、E2E或C9 terrain subdivision改动。
- R001～R004 focused fixes保持product diff仅在既有C8 SceneGIS-owned paths；translated Corridor real Context
  bounds/original Entity pick、clockwise outward normals、三种corner exact reversal及stationary Path lifecycle均已锁定。
- `PathVisualizer._subSample`和standard synchronous Primitive仍是Cesium升级敏感private/standard依赖；
  Corridor terrain继续是generated-vertex sampling，continuous ground明确留给C9。
