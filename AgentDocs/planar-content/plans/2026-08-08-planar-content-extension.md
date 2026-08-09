# SceneGIS 平面内容总体计划

## 元数据

- 计划类型（Plan type）：`extension`
- 状态（Status）：`active`
- 负责人角色（Owner role）：`architecture`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人（Architecture reviewer）：项目负责人
- 创建日期（Created）：`2026-08-08`
- 更新日期（Updated）：`2026-08-09`
- 基线（Base checkpoint）：`23d06ad14c79825f680e9397c6f4a8fa70a0f008`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：项目负责人与 Architecture Agent 已确认总体边界；未创建独立
  discussion
- 相关评审（Related reviews）：
  [C1 content contract review](../reviews/2026-08-09-c1-content-contract.md)（`approved`）、
  [C2 anchor and model review](../reviews/2026-08-09-c2-anchor-and-model.md)（`approved`）、
  [C3 polyline and polygon review](../reviews/2026-08-09-c3-polyline-polygon.md)（`approved`）、
  [C4 Entity/DataSource/Viewer integration review](../reviews/2026-08-09-c4-entity-datasource-viewer-integration.md)
  （`approved`）
- ADR：
  [ADR-0013：平面内容坐标、高度、朝向与兼容性基线](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014：平面锚点内容与普通 Model Visualizer](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)、
  [ADR-0015：平面 Polyline、Polygon 与顶点采样地表](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016：平面 DataSourceDisplay 与 Viewer 内容集成](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)、
  [ADR-0017：平面内容资格验证与批量边界](../../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)
- SGP：C4复用active `SGP-0001`；只允许在CesiumWidget增加instance-owned visualizer callback seam

## 目标

在已完成的 `SceneGISPlanarWorld` 和 planar terrain 上建立平面内容能力，使常见矢量、标注、
Entity/DataSource 与普通 glTF Model 能以真正的平面坐标、高度和朝向语义工作，同时最大限度复用
Cesium 已有的 Property、Entity、Primitive、选择和渲染基础设施。

本扩展必须提供明确的 planar compatibility profile，而不是宣称所有 Globe-oriented Entity graphics
自动兼容。支持路径不得把平面 `Cartesian3` 静默解释为 ECEF，也不得通过复制完整 Entity 或
Visualizer 系统规避真实集成边界。

## 非目标

- 不建立 `SceneGISPlanarEntity`、第二套 Property 系统或第二套 DataSource 生命周期。
- 不执行 CRS 识别、坐标重投影或单位转换；调用方负责把数据转换为 World 的米制 CRS。
- 不在首版适配 GeoJSON、CZML、KML 等以地理坐标为默认语义的数据加载器。
- 不支持 3D Tiles、Globe GroundPrimitive、geodesic/rhumb arc 或全部 Entity graphics。
- 不包含地下模式、碰撞、阴影、PBR、Entity tracking、`flyTo`、`zoomTo` 或大规模离线切片工具链。
- 不改变默认 Globe scene、Globe Entity/DataSource 或官方数据加载器的既有行为。

## 稳定架构边界

### 坐标与朝向

- 内容位置继续使用 `Cartesian3`，单位为米；X 向东、Y 向北、Z 向上。
- 公共内容 API 只接受已经位于 `SceneGISPlanarWorld.coordinateSystem` 中的坐标，不根据 opaque
  `crs` 自动转换。
- 大坐标对象继续依赖局部 geometry + `modelMatrix` 保持 GPU 精度；不得把完整世界坐标直接固化为
  低精度顶点数据。
- 普通 glTF Model 属于本扩展；它的世界位置和朝向必须按 planar axes 定义，不能调用依赖 ECEF
  east-north-up 的 helper 后假装得到平面结果。

### Entity 与 DataSource

- 复用 Cesium `Entity`、`EntityCollection`、`CustomDataSource` 和 Property/event 模型。
- 不承诺一次支持所有 graphics。每个阶段必须维护明确的 supported、unsupported 与 deferred
  compatibility matrix。
- 支持路径只为 Globe-dependent 的 visualizer、geometry、height 或 orientation 行为增加
  SceneGIS-owned adapter/runtime；不能复制整套上游 DataSources 实现。
- 如果公共扩展入口收到已知不支持的 Globe-only 配置，必须显式拒绝或保持明确的 unsupported
  状态，不能静默落入 ellipsoid 语义。具体 enforcement 在 C1 依据源码确定。

### 高度与地表

- 首版公共词汇复用 `HeightReference.NONE`、`CLAMP_TO_GROUND` 和
  `RELATIVE_TO_GROUND`；3D Tiles height reference 不属于本扩展。
- `NONE` 表示 planar absolute Z；另外两种模式以 `SceneGISPlanarWorld` 的逻辑地表为目标。
- Terrain 尚未 ready、provider replacement、LOD/revision、extent 外位置和 terminal failure 下的
  fallback、更新与 readiness 语义必须在 C1 phase 基于现有 terrain query/runtime 决定并提升为 ADR。
- 内容 runtime 不得取得 terrain provider 的生命周期所有权，也不得破坏 terrain normal-render-only
  mutation、query snapshot 或 depth replay 契约。

### 内容范围

- 锚点类：Point、Billboard、Label 和普通 glTF Model。
- 线面类：planar straight Polyline、Polygon、per-position height、extrusion，以及批准范围内的 terrain
  clamp/drape。
- 集成类：Entity/CustomDataSource、Property 更新、object picking、Viewer selection 与销毁顺序。
- 3D Tiles、GeoJSON/CZML/KML reprojection 和 Globe ground pipeline 保留为独立后续扩展。

### 所有权与上游集成

- 默认只修改 SceneGIS-owned 路径，并优先使用组合、显式 adapter 和现有公共扩展点。
- C1-C3保持zero-upstream。C4源码审计确认CesiumWidget创建DataSourceDisplay时缺少world-aware
  per-instance callback；由于同一upstream file只能由一个SGP负责，C4复用`SGP-0001`，只允许一个
  upstream-owned file与两个paired hunks。
- 不使用 prototype monkey patch、隐式全局 registry、加载顺序技巧或大段复制 Cesium 实现。
- 每个内容 runtime 的 request、CPU object、Primitive、GPU resource、event subscription 与 owner
  必须有成对创建/失效/销毁协议。

## 当前基线事实

- `planar-world` 与 `planar-terrain` extension 已完成，基线 checkpoint 为
  `23d06ad14c79825f680e9397c6f4a8fa70a0f008`。
- 平面世界位置和地形统一使用米制 `Cartesian3`；terrain 提供 resident height、actual-cover ray
  picking 和独立 provider sampling，但三类读取接口职责不同。
- Planar Viewer 已保留基本 Entity selection 与 InfoBox 文本，但 tracking、InfoBox camera、
  `zoomTo` 和 `flyTo` 不在现有契约内。
- 当前架构允许新增 `SceneGIS/DataSources` 层；该层可以依赖 Core、Scene、Cesium DataSources 与
  SceneGIS DataSources，但不得依赖 Widgets。
- 低层 Primitive、Entity visualizer、GeometryUpdater、height reference、ground 与 Model 路径的
  真实兼容性尚未按本扩展重新审计。总体计划不根据目录或历史经验预判具体修改文件。

## 阶段路线图

### C1：基础契约与兼容性基线

- 目标：依据当前 Cesium 源码确定坐标、朝向、`HeightReference`、terrain 更新及 supported graphics
  matrix，并实现所需的最小 Core/DataSources 基础契约。
- 依赖：extension plan 已确认；planar-world 与 planar-terrain 已完成。
- 进入门槛：创建 C1 phase plan，完成相关调用链、构建入口和生成边界审计。
- 完成门槛：公共契约、错误边界、fallback/readiness、ownership 与 ADR 获批；最小 deterministic
  Specs 和 public generation 通过。
- 状态：`completed`；phase plan：
  [C1 平面内容基础契约与兼容性基线](2026-08-09-phase-c1-content-contract.md)。

### C2：锚点内容与普通 Model

- 目标：支持 Point、Billboard、Label 和普通 glTF Model 的 planar absolute、clamp 和 relative anchor。
- 依赖：C1。
- 进入门槛：C1 已 review并提交；重新审计相应 collection、visualizer 与 Model orientation 路径。
- 完成门槛：静态/动态 anchor、terrain 更新、picking、精度和 exactly-once lifecycle 成立。
- 状态：`completed`；phase plan：
  [C2 平面锚点内容与普通 Model](2026-08-09-phase-c2-anchor-and-model.md)。

### C3：Polyline、Polygon 与地表关系

- 目标：支持 planar straight Polyline、Polygon、per-position height、extrusion 和批准范围内的
  terrain clamp/drape。
- 依赖：C2。
- 进入门槛：C2 已 review并提交；重新审计 GeometryUpdater、GeometryPipeline 和 ground 假设。
- 完成门槛：线面拓扑、边界、高度、terrain replacement、picking 和大坐标渲染成立，不调用
  ellipsoid geodesic/rhumb 语义。
- 状态：`completed`；phase plan：
  [C3 平面 Polyline、Polygon 与地表关系](2026-08-09-phase-c3-polyline-polygon.md)。

### C4：Entity、DataSource 与 Viewer 集成

- 目标：将已批准内容能力接入 Entity/CustomDataSource Property 更新、Viewer selection 和完整生命周期。
- 依赖：C3。
- 进入门槛：C3 已 review并提交；重新审计 DataSourceDisplay、Visualizer 与 Viewer 当前实现。
- 完成门槛：supported compatibility matrix 可执行，默认 Globe 回归不变，unsupported 配置不会静默
  使用 Globe 语义。
- 状态：`completed`；phase plan：
  [C4 Entity、DataSource 与 Viewer 集成](2026-08-09-phase-c4-entity-datasource-viewer-integration.md)。

### C5：动态更新、批量性能与交付

- 目标：完成代表性动态更新、批量对象、资源收敛、Sandcastle、文档和升级资格。
- 依赖：C4。
- 进入门槛：C4 已 review并提交；依据真实对象数量与 profiling 决定批量和资格范围。
- 完成门槛：功能、生命周期、warm-frame、有限性能、types/docs/package 和人工视觉验收达到扩展交付
  标准。
- 状态：`active`；phase plan：
  [C5 动态更新、批量性能与交付](2026-08-09-phase-c5-dynamic-performance-and-delivery.md)。

阶段默认串行推进。每个阶段在 implementation、验证和 Architecture/code review 完成后，由
Architecture Agent形成独立中文本地提交检查点，再进入下一阶段。

## 跨阶段验证

- 每项行为变化提供与风险相称的 deterministic Specs；渲染能力包含必要的真实 WebGL 像素、depth、
  picking 和资源生命周期证据。
- 支持的 Entity/graphics/property 组合必须进入版本化 compatibility matrix，并通过代表性静态与动态
  fixture；不以 Sandcastle 代替 Specs。
- 大坐标验证必须检查局部顶点、`modelMatrix`、finite bounds 和可见像素，不能只检查 JavaScript
  double 结果。
- Terrain clamp/relative 更新必须覆盖 pending、ready、replacement、detach、failure、late settlement
  与 destroy，但每个 phase 只运行受该阶段影响的最小充分矩阵。
- 默认 Globe、无 world 和既有 planar-world/terrain contract 在越过相关集成边界时运行对应回归。
- 公共 API 必须通过 engine/Cesium root JS、types 和 API docs；私有模块不得进入公共声明或文档。
- 每阶段交付报告记录 upstream-owned files、SGP、generated status 和剩余风险。

## 全局风险与依赖

- Cesium Entity Visualizer、GeometryUpdater、ground 和 Model orientation 可能把 `Cartesian3` 解释为
  ECEF 或调用 Ellipsoid；兼容范围必须由阶段源码事实决定。
- Terrain LOD 与 provider replacement 会改变地表高度；内容更新若缺少 generation isolation，可能
  出现跳回旧高度、泄漏 subscription 或销毁后复活。
- 线面 terrain drape 可能需要额外细分、采样和 GPU geometry 更新；不得在没有性能证据前承诺无限
  精度或每帧重建。
- Entity convenience 与批量性能存在张力。若大规模对象需要独立 batch layer，应由后续 phase/ADR
  明确，而不是让 compatibility adapter 隐式演化为第二套场景图。
- 任何 upstream-owned DataSources、Scene 或 Viewer 修改都会增加官方升级成本，必须保持窄小并通过
  SGP 跟踪。

## 整体验收条件

- C1-C5 均完成 implementation、最小充分验证、Architecture/code review、AgentDocs 回写和独立本地
  提交。
- 已批准的 Point、Billboard、Label、Polyline、Polygon、普通 glTF Model 与
  Entity/CustomDataSource 组合具有明确可执行的 planar contract。
- absolute、clamp 和 relative 高度在 flat/terrain、异步更新和 provider 生命周期中结果一致且可预测。
- object picking、Viewer selection、dynamic Property 更新和 destroy 不破坏既有 planar world/terrain
  或默认 Globe 行为。
- 大坐标精度、GPU/CPU resource ownership、warm-frame allocation 和代表性批量性能达到已批准门槛。
- public exports/types/API docs、Sandcastle、使用指南与升级清单完整，所有 upstream-owned 修改均由
  active SGP 覆盖。
- 项目负责人完成真实浏览器/GPU人工验收并明确批准 extension 完成。

## 进展与交接

- `2026-08-08`：项目负责人与 Architecture Agent确认建立独立 `planar-content` 大型扩展；批准复用
  Entity/DataSource、米制 Cartesian3、`HeightReference` planar subset、Point/Billboard/Label/
  Polyline/Polygon/普通 glTF Model范围，并明确排除运行时重投影与3D Tiles。
- `2026-08-08`：从完成的 planar-terrain checkpoint
  `23d06ad14c79825f680e9397c6f4a8fa70a0f008` 创建 `feature/planar-content`，extension plan状态设为
  `active`。
- `2026-08-09`：项目负责人批准 C1 的 coordinate domain、HeightReference subset、resident
  terrain/Z=0 fallback、eventual consistency、fixed planar orientation 与 compatibility
  enforcement；ADR-0013 approved，C1 phase plan active。
- `2026-08-09`：Execution完成C1 private resolver、`11`个focused cases、build/types/docs、
  `PlanarContentGuide`和durable rules，创建pending review request；实现保持zero-upstream/zero-SGP。
- `2026-08-09`：Architecture/code review通过，无阻断项；独立复跑focused resolver `11/11`与
  upstream audit均通过，C1状态更新为`completed`。
- `2026-08-09`：项目负责人批准C2完整设计：使用private Anchor/Model visualizer复用低层collection/
  Model，不复用默认Globe visualizer；EntityCluster仅允许disabled，Model采用fixed planar transform与
  generation-isolated lifecycle，自动Viewer/DataSourceDisplay集成延后至C4。ADR-0014 approved，C2
  phase plan active。
- `2026-08-09`：Execution完成C2两个private visualizer、`15`个新增direct cases、build/types/docs与
  durable docs；zero-upstream/zero-SGP，创建pending review。首轮real Context报告capability skip，随后
  Architecture review确认是未初始化`ContextLimits` module identity导致的测试接线问题，并非有效GPU
  capability结论。
- `2026-08-09`：Architecture/code review提出C2-R001～C2-R006：动态cluster invariant、Billboard
  image cache、合并Anchor bounds、Model activation/preflight atomicity、direct-property合法Infinity与real
  Context module identity/证据缺口。Review状态为`changes-requested`；均可在zero-upstream C2边界内修复。
- `2026-08-09`：Execution完成六项focused fix；Anchor `11/11`、Model `9/9`与real Context `1/1`
  通过，本机实际执行四类content branch、Model pixel region及完整slot/listener/cluster/Model lifecycle。
- `2026-08-09`：Architecture focused re-review确认C2-R001～C2-R006全部关闭；独立复跑三个focused
  suites、build与upstream audit均通过，C2状态更新为`completed`。
- `2026-08-09`：Architecture形成C2独立checkpoint
  `3bdd638661c14bfbf127b12dec3bd8c5e8e3f3ba`，重新审计Graphics、GeometryUpdater、
  `PolygonPipeline`与experimental Buffer collections；ADR-0015批准planar straight、supplied-vertex
  terrain sampling、Polygon height/extrusion、private render owner与C4/C5边界，C3 phase plan激活。
- `2026-08-09`：Execution完成C3 private Polyline/Polygon visualizer与共享Buffer owner；新增`17`个
  direct cases，real Context闭环大坐标line/fill/hole/extrusion、original Entity pick、finite depth、warm与
  destroy；build/types/docs和zero-upstream audit通过，创建pending review。
- `2026-08-09`：Architecture/code review提出C3-R001～C3-R003：真实`PrimitiveCollection.add`事件后抛错
  会留下已销毁candidate、fractional width被Uint8静默截断、静态warm update每帧重复标脏并上传Buffer。
  三项均可在zero-upstream C3边界内focused修复。
- `2026-08-09`：Execution完成三项focused fix；真实membership rollback覆盖两种`destroyPrimitives`配置，
  width/outlineWidth固定为`[0,255]` integer，静态warm frame保持dirty/copy零增量且动态位置仍更新。
- `2026-08-09`：Architecture focused re-review确认三项finding全部关闭；独立复跑7/9/1 focused suites、
  build、scoped ESLint与upstream audit均通过，C3状态更新为`completed`。
- `2026-08-09`：Architecture形成C3独立checkpoint
  `2015aa188f4aff5322b24ade5832547ad1c626df`，随后重新审计CesiumWidget、DataSourceDisplay、Entity、
  CustomDataSource、Viewer selection和C2/C3 visualizer调用链。
- `2026-08-09`：ADR-0016批准instance-owned planar callback、CustomDataSource-only gate、
  per-data-source primitive target、原Entity selection与deferred activation；裁决扩展active `SGP-0001`，
  C4 phase plan激活。
- `2026-08-09`：Execution完成C4 private gate、optional primitive target、CesiumWidget两个`SGP-0001`
  hunks、Widget/Viewer closure与durable docs；新增direct cases=`18`，最小充分矩阵通过并创建pending review。
- `2026-08-09`：Architecture/code review提出C4-R001～C4-R004：factory使用destroyObject method shape误判
  live World、动态profile guarantee超过实际时序、automatic target/DataSource ordering证据未真实产生内容，以及
  third-child rollback fixture实际提前在Model constructor失败。
- `2026-08-09`：Execution完成四项focused fixes：factory使用正式World liveness契约，动态保证收窄到child
  normal update和低层资源mutation，real Widget产生Billboard/Label/Polyline/Polygon并验证两个DataSource
  ordering/remove，rollback fixture真正进入Polyline constructor。聚焦Specs与build通过。
- `2026-08-09`：Architecture focused re-review确认C4-R001～C4-R004全部关闭；独立复跑callback`8/8`、
  engine Widget`4/4`、P6 Viewer`18/18`，scoped ESLint、upstream audit与diff check通过；C4更新为
  `completed`。
- `2026-08-09`：Architecture形成C4独立checkpoint
  `1f9d8da4ca8c47425917c23642cea3123339e386`，重新审计automatic visualizer热路径、per-Entity owner、
  P8 qualification、Sandcastle/E2E与package入口；ADR-0017批准moderate profile、无证据不做跨Entity
  batching、hard gate/timing分离与最终人工验收，C5 phase plan激活。
- `2026-08-09`：Execution完成固定moderate warm/terrain/dynamic qualification与small lifecycle baseline、local
  dev/release E2E、`scenegis-planar-content` Sandcastle、installed-package private delivery smoke与最终指南。
  Baseline没有可重复SceneGIS private hotspot，product runtime delta=`0`；C5 direct unique cases=`4`。
- `2026-08-09`：C5首轮Architecture review提出R001～R003：lifecycle直接证据过强、Sandcastle batch/dynamic
  状态竞态，以及package soft-private visibility断言混淆。Execution已补primitive/controller baseline、序列化
  async controls并拆分runtime/declarations/API断言；三个finding标记fixed，等待focused re-review。
- `2026-08-09`：Architecture focused re-review确认R001～R003全部关闭；独立复跑qualification`3/3`与
  installed-package smoke通过，接受Execution的focused Sandcastle build证据。C5 review状态为`approved`。
- C5独立本地提交检查点随本次Architecture交付形成；下一步由项目负责人执行真实浏览器/GPU Sandcastle
  人工验收。C5与extension保持`active`。
