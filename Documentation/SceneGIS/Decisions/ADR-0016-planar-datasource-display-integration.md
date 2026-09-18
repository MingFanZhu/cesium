# ADR-0016：平面 DataSourceDisplay 与 Viewer 内容集成

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c4-entity-datasource-viewer-integration.md`
- Related patch：`SGP-0001`（复用并扩展既有 primary-world CesiumWidget integration patch）

## 上下文与源码事实

C1-C3 已经以 SceneGIS-owned private visualizer 实现 Point、Billboard、Label、普通 glTF Model、
Polyline 和 Polygon 的 planar compatibility profile，但这些 visualizer 仍需显式构造；默认
`viewer.entities` 和 `CustomDataSource` 仍由 Cesium 的 Globe-oriented visualizer list 处理。

Cesium 1.144 当前集成链路具有以下事实：

1. `CesiumWidget` 创建唯一的 `DataSourceDisplay`，并把 `scene` 与 caller-owned 或 internally-owned
   `DataSourceCollection` 传入；`Viewer` 只负责把 `world`、`dataSources` 和 UI options 传给
   `CesiumWidget`。
2. `DataSourceDisplay` 已有 instance option `visualizersCallback`。它为每个 DataSource 创建独立
   `PrimitiveCollection`、`OrderedGroundPrimitiveCollection` 和 `EntityCluster`，然后调用 callback。
3. `DataSourceDisplay.registerVisualizer` 与 `defaultVisualizersCallback` 是进程级共享状态；使用它们会把
   planar visualizer 注入默认 Globe scene，并受模块加载顺序影响。
4. callback 在 `_onDataSourceAdded` 的容器和 cluster 初始化之后调用。若 callback 构造阶段直接抛错，
   当前上游实现没有回滚已插入的 per-data-source containers，因此不能在 callback 内做可能失败的完整
   Entity profile 激活。
5. `DataSourceDisplay.update` 在进入每个 visualizer 前快照数组长度。由首个 gate visualizer 在一次
   `update` 中追加其余 visualizer，可以让新增对象从下一次 update 开始运行，并让当前 update明确返回
   `false`。
6. `getBoundingSphere` 逐 visualizer收集可选的 `getBoundingSphere` 结果；gate不提供该方法即可保持
   C2/C3 visualizer各自的 `DONE`、`PENDING`、`FAILED` 语义和联合 bounds。
7. 移除 DataSource 时，`DataSourceDisplay` 先逐个 destroy visualizer，再移除该 DataSource 的 primitive
   containers；销毁 `CesiumWidget` 时又先销毁 `DataSourceDisplay`，后销毁 Scene 与 primary World。
8. `Viewer` selection 已消费 `DataSourceDisplay.getBoundingSphere`，而 C2/C3 pick object 已返回 original
   `Entity`。因此选择、SelectionIndicator 和 InfoBox不需要新的 Viewer source seam。
9. `Entity.propertyNames` 包含当前 Cesium 的标准 Property names，并追加 custom top-level names。
   标准 Property 在 Entity.prototype 上定义，自定义 addProperty 字段在实例上定义。2026-09-18 修订：
   只拒绝未支持的标准 Property；普通业务元数据同时支持 `Entity.properties` 与 `Entity.addProperty`。

所以，C4 所需的最小集成缝隙位于 `CesiumWidget` 构造 `DataSourceDisplay` 的位置，而不是 Viewer、
`DataSourceDisplay` 本体或全局 visualizer registry。

## 决策

### 实例级 callback factory

新增 SceneGIS-owned private factory：

```text
packages/engine/Source/SceneGIS/DataSources/_private/
  _SceneGISPlanarVisualizersCallback.js
```

factory 接收构造时的 `options.world`：

- 若它不是 live `SceneGISPlanarWorld`，返回 `undefined`，使 `DataSourceDisplay` 使用原有
  `defaultVisualizersCallback`；
- 若它是 live `SceneGISPlanarWorld`，返回只捕获该 World 的 instance callback；
- 不写 `DataSourceDisplay.defaultVisualizersCallback`，不调用 `registerVisualizer`，不保存进程级可变
  registry，也不依赖模块加载顺序。

`CesiumWidget` 只在现有 `new DataSourceDisplay({...})` options 中传入 factory 结果。该 import 与 option
属于 `SGP-0001` 的成对标记 hunk。不得修改 `Viewer.js` 或 `DataSourceDisplay.js`。

### CustomDataSource 边界

Planar callback 只接受 `CustomDataSource`：

- `DataSourceDisplay.defaultDataSource` 本身是 `CustomDataSource`，因此 `viewer.entities` 与
  `widget.entities` 自动进入 planar path；
- caller 加入 `DataSourceCollection` 的 `CustomDataSource` 使用同一 profile；
- `GeoJsonDataSource`、`CzmlDataSource`、`KmlDataSource` 及其他 DataSource即使暴露 EntityCollection也不
  自动解释为 planar。它们在第一次 display update 时抛英文 `DeveloperError`，直到被移除；C4不在
  loader边界猜测 CRS或重投影。

DataSource和它的 Entity、cluster、primitive containers仍由 Cesium/caller拥有。SceneGIS visualizer只拥有
自身建立的 subscription、primitive和GPU resource。

### 延迟 gate 与 profile enforcement

callback 初始只返回一个 private gate visualizer。第一次有效 `update(time)` 按顺序执行：

1. 验证 captured World仍 live、`scene.world` identity不变、DataSource是`CustomDataSource`，且
   `entityCluster.enabled === false`；
2. 遍历当前 EntityCollection。以下已定义 Property允许存在：`point`、`billboard`、`label`、`model`、
   `polyline`、`polygon`、`position`、`orientation`、`description`、`properties` 和 `viewFrom`；
3. 任何其他已定义的标准 Property 在本帧 child normal update和低层资源 mutation前抛 `DeveloperError`。
   Custom metadata可使用 `Entity.properties` 或 `Entity.addProperty`；自定义字段不自动注册为 Graphics。同步
   `collectionChanged` listener允许只更新CPU tracking；
4. 在局部 candidate数组中依次构造 Anchor、Model、Polyline、Polygon visualizer；任何构造失败时反向
   destroy已构造 candidate，保留原始异常，且不改变共享 visualizer数组；
5. 全部构造成功后一次性追加到共享数组，并让本次 gate `update` 返回`false`。由于
   `DataSourceDisplay.update` 已快照数组长度，子 visualizer从下一次 update开始运行；
6. 后续每次 update，gate仍排在首位并重新检查 World、DataSource type、cluster和所有 Entity的
   top-level profile。动态加入未支持 graphics时，必须在任何子 visualizer normal update和低层资源
   mutation前失败。

Gate实现 `update`、`isDestroyed` 和 `destroy`，但不实现 `getBoundingSphere`。它不销毁已激活的子
visualizer；这些对象作为同一数组的独立成员由 `DataSourceDisplay` 按顺序 exactly once destroy，避免
双重所有权。

该 gate只保证 C4 的 DataSource/global graphics profile在本帧子 visualizer normal update和低层资源
mutation前成立；已经订阅的同步collection listener可以在gate运行前更新CPU tracking。每个支持graphic内部的
Property validation、candidate/current replacement和资源原子性继续由 C2/C3 visualizer负责；C4不承诺多个
Entity或多个 visualizer之间的全场景事务。

### Primitive ordering 与 private visualizer 调整

Anchor visualizer继续使用 caller-owned、disabled `EntityCluster`。Model、Polyline、Polygon及其 private
buffer owner改为接受一个可选 target `PrimitiveCollection`：

- C4 自动 path显式传入`dataSource._primitives`，使内容随 DataSource add/move/remove顺序工作；
- C2/C3显式构造路径省略参数时继续默认使用`scene.primitives`，保持既有 focused contract；
- visualizer拥有加入 target collection的自身 primitive，但不拥有 target collection；remove/destroy仍
  exactly once，且 cleanup依据真实 collection membership。

不得使用 `dataSource._groundPrimitives`，也不得进入 Globe ground、classification或 ellipsoid pipeline。

### Selection、readiness 与生命周期

- 四个子 visualizer继续作为独立数组成员，因此 `DataSourceDisplay.getBoundingSphere`自然联合一个
  Entity的 anchor/model/line/polygon bounds，并保留同步/异步状态。
- Pick object继续返回 original `Entity`；Viewer现有 left-click selection、SelectionIndicator和InfoBox
  直接复用。Planar Viewer既有 InfoBox camera禁用、tracking/zoom/fly guards不变。
- 第一次合法激活帧返回`false`，下一帧才允许子 visualizer贡献 readiness；C4不引入新的 World或content
  readiness API。
- DataSource移除必须先destroy四个子 visualizer，再由上游移除per-data-source containers；Widget/Viewer
  destroy必须在Scene/World销毁前清空visualizer、subscription和owned resource。
- 如果 callback construction、gate activation或primitive insertion失败，只清理已创建的SceneGIS-owned
  candidate；不能销毁 caller-owned DataSource、EntityCollection、EntityCluster、Scene或World，也不能
  覆盖原始异常。

### 公共 API 与阶段边界

C4不新增 public class、constructor option或 World method。自动行为由现有
`CesiumWidget/Viewer({ world: SceneGISPlanarWorld })`、`entities`和`dataSources`入口触发。

C4不支持 GeoJSON/CZML/KML自动转换、Entity tracking、`zoomTo`、`flyTo`、新 graphics、跨 Entity batching、
Sandcastle或性能资格；批量、动态压力、交付页面和人工验收留给C5。

## 不采用的方案

### 修改 DataSourceDisplay 默认 callback 或注册全局 visualizer

拒绝。它会污染同一进程中的默认 Globe Viewer，并让world语义取决于注册与加载顺序。

### 在 Viewer 中重建或替换 DataSourceDisplay

拒绝。真正的所有者是 `CesiumWidget`；Viewer层替换会重复 DataSource/clock/selection wiring，并不能覆盖
直接使用 CesiumWidget 的调用方。

### 直接在 callback 中构造并验证全部 visualizer

拒绝。callback被调用时 per-data-source containers已经插入，而上游 `_onDataSourceAdded` 对callback抛错
没有事务回滚。延迟 gate把可失败的 profile检查和四个 candidate constructor放到可测试的 normal update
边界，并能自行清理。

### 用一个 composite visualizer包住四个实现

拒绝。这样必须复制 `DataSourceDisplay.getBoundingSphere` 的 partial/PENDING联合逻辑，还会改变destroy
和profiling粒度。Gate只负责验证与一次性激活，四个visualizer继续独立存在。

### 接受所有 DataSource 或未支持的标准 Entity Property

拒绝。GeoJSON/CZML/KML默认坐标含义不是本扩展的planar米制Cartesian3；未来新增的 Cesium 标准 Property
仍通过 Entity.prototype 检出并执行 allowlist。2026-09-18 取消对 addProperty 业务属性的额外限制，
不改变 Cesium Entity 实现或加入平行元数据 API。

## 上游补丁与兼容性

本决策复用`SGP-0001`，因为补丁清单与审计要求一个upstream file只能由一个SGP负责，而
`CesiumWidget.js`已经属于该primary-world integration patch。C4新增范围只覆盖：

- `packages/engine/Source/Widget/CesiumWidget.js` 的一个 private factory import hunk；
- 同文件 `new DataSourceDisplay` options中的一个 `visualizersCallback` hunk。

风险仍为`high`，因为该文件是上游高频构造与生命周期入口；但默认路径只收到`undefined`，现有 Globe、
`globe:false`和generic world行为必须通过回归锁定。`SGP-0001`的ADR-0001增加本决策的反向链接；Execution
在新Specs存在后把它们追加到同一manifest entry。若上游未来同时提供等价primary-world lifecycle与
per-instance world-aware `visualizersCallback`，即可移除相应hunks并从SceneGIS-owned调用层传入。

## 测试与升级检查点

C4至少验证：

- private callback的world/type/cluster/property gate、deferred activation、constructor rollback、子项顺序、
  correction后激活、独立bounds和exactly-once destroy；
- CesiumWidget默认entities与CustomDataSource的六类supported graphics自动显示、原Entity picking、大坐标、
  DataSource move/remove ordering、非法profile和Widget destroy顺序；
- Viewer left-click selection、SelectionIndicator、InfoBox camera禁用以及default Globe/`globe:false`代表性
  回归；
- C2/C3 visualizer默认target回归、C1 resolver、P1 planar CesiumWidget和P6 planar Viewer相关回归；
- root types/docs不暴露private factory/gate；SGP marker、manifest、generated与upstream audit成立。

每次 Cesium升级复核 `CesiumWidget` 的 `DataSourceDisplay`构造位置、callback option、
`DataSourceDisplay._onDataSourceAdded/_onDataSourceRemoved/update/getBoundingSphere` 顺序、
`CustomDataSource` identity、`Entity.propertyNames`内建集合以及per-data-source primitive containers。
