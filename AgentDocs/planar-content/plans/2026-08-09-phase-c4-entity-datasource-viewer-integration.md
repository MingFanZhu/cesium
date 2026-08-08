# C4 Entity、DataSource 与 Viewer 集成

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C4-entity-datasource-viewer-integration`
- 状态（Status）：`completed`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`approved`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`2015aa188f4aff5322b24ade5832547ad1c626df`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；C4源码审计与完整设计直接提升为ADR-0016
- 相关评审（Related reviews）：实现ready后创建
  `AgentDocs/planar-content/reviews/2026-08-09-c4-entity-datasource-viewer-integration.md`
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)
- SGP：复用active `SGP-0001`；同一upstream file不重复登记SGP

## 阶段目标

在保持默认 Globe 行为、既有 planar World/terrain contract和C1-C3 private visualizer语义不变的前提下：

1. 让 `CesiumWidget/Viewer({ world: SceneGISPlanarWorld })` 的默认 `entities` 自动使用C2/C3 planar
   visualizer；
2. 让加入现有 `DataSourceCollection` 的 `CustomDataSource` 自动使用相同profile，并随DataSource顺序、
   remove和destroy正确管理内容；
3. 在子visualizer normal update和低层资源mutation前拒绝非`CustomDataSource`、enabled clustering、未支持Cesium graphics和未知
   top-level Entity Property，防止平面Cartesian3静默进入Globe语义；
4. 复用现有 original Entity pick、`DataSourceDisplay.getBoundingSphere`和Viewer selection，不新增第二套
   selection或Entity系统；
5. 通过一个最小upstream `CesiumWidget` seam完成instance-owned callback安装，并用既有`SGP-0001`完整
   追踪。

C4完成后，`viewer.entities`和`CustomDataSource`才正式属于planar-content supported path。C4不处理
GeoJSON/CZML/KML转换、批量性能、Sandcastle或交付资格。

## 非目标

- 不修改 `DataSourceDisplay.js`、`Viewer.js`、默认 visualizer classes或全局 registry。
- 不支持 `GeoJsonDataSource`、`CzmlDataSource`、`KmlDataSource`及其他非`CustomDataSource`实现。
- 不支持 Box、Corridor、Cylinder、Ellipse、Ellipsoid、Cesium3DTileset、Path、Plane、
  PolylineVolume、Rectangle、Wall或未来未知 top-level graphics。
- 不允许 enabled `EntityCluster`；C2中的disabled cluster contract不扩张。
- 不增加 public constructor option、World API、content readiness API、tracking、`zoomTo`或`flyTo`。
- 不修改C1坐标/高度语义、C2/C3 Property profile、terrain runtime、Shader、Worker、build generator或package
  配置。
- 不做跨Entity batching、对象数量压力测试、性能优化、Sandcastle、E2E或人工交付；这些属于C5。
- 不进入C5设计或实现。

## 进入条件

- C3已通过Architecture focused re-review并形成checkpoint
  `2015aa188f4aff5322b24ade5832547ad1c626df`。
- ADR-0016已approved，C4 phase plan由Architecture Agent形成独立planning checkpoint。
- Execution从干净planning checkpoint继续`feature/planar-content`，不另建阶段分支。
- 开始前完整阅读根、`packages/engine`、`packages/widgets`和`AgentDocs`的`AGENTS.md`，以及
  `Architecture.md`、`DevelopmentGuide.md`、`PlanarContentGuide.md`、父计划、ADR-0013～0016、C1-C3
  completed plans和open reviews。
- 修改`CesiumWidget.js`前读取`.scenegis/upstream-base.json`、`.scenegis/upstream-patches.json`，确认
  `SGP-0001`为active，并在新Spec文件存在后把C4 tests追加到该entry；不得为同一file登记第二个SGP。
- 使用codebase knowledge graph重新确认`CesiumWidget -> DataSourceDisplay`构造链、callback/update/
  bounding-sphere/destroy顺序、Entity built-in Property names和C2/C3构造签名。源码事实实质变化时先回写
  deviation；只有需要大范围Cesium修改时才暂停请求Architecture裁决。

## 当前源码事实

1. `CesiumWidget`是唯一创建`DataSourceDisplay`的运行时入口；Viewer只转发world/dataSources并消费
   selection结果。直接改Viewer无法覆盖CesiumWidget调用方。
2. `DataSourceDisplay`支持per-instance `visualizersCallback`，默认值才是Globe-oriented
   `defaultVisualizersCallback`。全局`registerVisualizer`会污染所有Scene，不可使用。
3. `_onDataSourceAdded`先建立per-data-source primitive/ground containers、初始化并插入EntityCluster，
   再调用callback；callback直接抛错没有上游事务回滚。
4. `update`在进入visualizer loop前快照数组长度，因此gate可以在一次update末尾原子追加四个child，并让
   children从下一次update开始执行。
5. `getBoundingSphere`跳过没有该方法的visualizer，并联合各child的DONE sphere；gate无需复制bounds逻辑。
6. `_onDataSourceRemoved`逐visualizer destroy后才移除per-data-source containers；Widget destroy又先销毁
   display后销毁Scene/World。
7. default DataSource是`CustomDataSource`；`viewer.entities`和`widget.entities`是其EntityCollection捷径。
8. DataSource move通过移动其`_primitives`与`_groundPrimitives` container维持顺序。C2 Model和C3 buffer
   owner当前默认加入`scene.primitives`，C4必须允许把它们指向`dataSource._primitives`。
9. C2 Anchor使用caller-owned EntityCluster；它已对disabled invariant、slot lifecycle、original Entity pick
   和union bounds负责。
10. C2/C3的Model、Polyline和Polygon均返回original Entity pick并实现独立`getBoundingSphere`，可直接被
    Viewer现有selection使用。
11. `Entity.propertyNames`包含全部标准names以及custom additions。Planar gate必须只在某个Property已定义时
    判断；否则每个新Entity都会因未使用的标准graphics names被错误拒绝。

## 固定设计

### Private factory 与 gate

新增：

```text
packages/engine/Source/SceneGIS/DataSources/_private/
  _SceneGISPlanarVisualizersCallback.js
```

文件默认export一个factory。非live `SceneGISPlanarWorld`返回`undefined`；PlanarWorld返回
`DataSourceDisplay.VisualizersCallback`。不得export public symbol或修改generated barrel。

Planar callback每个DataSource返回同一个可增长数组，初始仅含gate visualizer。Gate必须：

- 实现`update(time)`、`isDestroyed()`和`destroy()`，不实现`getBoundingSphere()`；
- update前验证captured World live、`scene.world === world`、DataSource为`CustomDataSource`、cluster disabled；
- 遍历每个Entity的`propertyNames`，允许已定义的`point`、`billboard`、`label`、`model`、`polyline`、
  `polygon`、`position`、`orientation`、`description`、`properties`、`viewFrom`；任何其他已定义name抛
  `DeveloperError`，并在error中标识DataSource/Entity/property；
- 第一次合法update在local candidates中按`Anchor -> Model -> Polyline -> Polygon`构造；失败时反向destroy
  已构造项，不改变共享数组，保留原始异常；成功后一次性append children并返回false；
- 已激活后每帧继续先做global profile验证，再返回true，使动态新增非法graphic在child normal update和低层
  资源mutation前失败；同步collection listener允许先更新CPU tracking；
- 不拥有或destroy已append children，避免与DataSourceDisplay逐项destroy重复；未激活时destroy只终止gate。

允许用户纠正`cluster.enabled`或删除非法Entity/Property后再次update并成功激活。非CustomDataSource只能
通过从collection移除来纠正，C4不替换其类型。

### Visualizer target container

下列private实现增加optional target collection，默认保持原C2/C3行为：

- `_SceneGISPlanarModelVisualizer`
- `_SceneGISPlanarPolylineVisualizer`
- `_SceneGISPlanarPolygonVisualizer`
- `_SceneGISPlanarBufferOwner`（按调用关系调整，不独立扩大API）

C4 callback传`dataSource._primitives`；显式C2/C3构造省略时使用`scene.primitives`。必须验证target是可用的
`PrimitiveCollection`-compatible owner，并保证：

- SceneGIS只拥有自己加入的primitive/owner，不拥有target；
- add后失败按真实membership回滚，保留原始异常；
- remove、DataSource removal、Widget destroy均exactly once；
- `DataSourceCollection.raise/lower/...`通过上游container移动影响全部planar primitives；
- 不使用`_groundPrimitives`，不改变C2/C3默认target Specs。

### CesiumWidget upstream seam

只修改：

```text
packages/engine/Source/Widget/CesiumWidget.js
```

允许两个最小paired hunks：

1. import `_SceneGISPlanarVisualizersCallback.js` factory；
2. 在现有`new DataSourceDisplay` options中传
   `visualizersCallback: createSceneGISPlanarVisualizersCallback(options.world)`。

两个hunk都使用成对英文marker并引用`SGP-0001`。不能把marker放进JSDoc，不能顺手格式化邻近上游代码。
Factory返回undefined时必须精确保留default Globe、`globe:false`和其他non-planar world行为。

### Selection 与 lifecycle

- 不新增Viewer source。C2/C3 pick object的`id`必须保持original Entity；Viewer现有left-click handler直接
  设置`selectedEntity`。
- `DataSourceDisplay.getBoundingSphere`应从独立child visualizers联合bounds；SelectionIndicator位置finite/
  visible，InfoBox仍显示description且planar camera button保持disabled。
- 第一次合法activation update返回false；第二次才运行children。不得通过提前调用child update绕过Cesium
  update顺序。
- DataSource add/move/remove、Entity add/remove、Widget/Viewer destroy必须锁定subscription、cluster slot、
  Model primitive、Buffer owner和GPU资源的exactly-once cleanup。
- C4的global gate不替代每个child内部的Property preflight；不宣称跨Entity全局事务。

## 影响路径

### 允许新增/修改

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarVisualizersCallback.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarBufferOwner.js`
- `packages/engine/Source/Widget/CesiumWidget.js`（C4仅新增`SGP-0001`两个paired hunks）
- `packages/engine/Specs/SceneGIS/DataSources/_SceneGISPlanarVisualizersCallbackSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarContentCesiumWidgetSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarContentViewerSpec.js`
- 为optional target补充现有C2/C3 focused Specs；不得借机重写无关测试
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- `.scenegis/upstream-patches.json`（仅扩展SGP-0001的C4 test paths与已批准说明）
- 本phase plan、父计划、扩展/plan/review索引和新review request
- ADR-0016仅在实现事实需澄清时修改，不得悄然扩大approved contract

### 禁止范围

- `packages/engine/Source/DataSources/DataSourceDisplay.js`及其他上游DataSources source
- `packages/widgets/Source/Viewer/Viewer.js`及其他widgets product source
- Scene、World、terrain、camera、picking、Shader、Worker、build/release/package source
- `DataSourceDisplay.registerVisualizer`、default callback mutation、prototype patch或隐式global state
- C1 resolver、Anchor行为或C2/C3 graphics profile修正；发现blocking defect时写入review并先保持边界
- public exports、new public options、Sandcastle、E2E、performance/batching工作
- generated `index.js`/`.d.ts`、SpecList、API HTML和`Build/**`
- C5 plan或实现

如果实现必须修改上述禁止的upstream product file或需要超过`CesiumWidget.js`两个窄hunk，Execution暂停并
提交源码事实；仅普通SceneGIS-owned实现调整或同一SGP范围内的小修不需要项目负责人再次审批。

## 执行步骤

1. 重新发现callback、update、getBoundingSphere、DataSource move/remove、Widget/Viewer destroy和Entity
   propertyNames源码事实；在phase plan记录任何偏差。
2. 先实现private factory/gate及纯CPU focused Specs，锁定deferred activation、fail-fast和constructor
   rollback；Spec文件存在后把路径追加到active SGP-0001。
3. 为Model/Polyline/Polygon/BufferOwner增加optional target collection，保持默认target回归；补最小focused
   assertions。
4. 在CesiumWidget增加两个paired SGP hunks，验证non-planar factory结果为undefined且无其他上游diff。
5. 完成真实CesiumWidget closure：默认entities、CustomDataSource、ordering、pixel/depth/pick、invalid
   profile与lifecycle。
6. 完成Viewer closure：原Entity selection、bounds、SelectionIndicator、InfoBox和default路径回归。
7. 更新durable docs，把C4 automatic path、CustomDataSource-only matrix、metadata/unsupported规则、SGP和
   upgrade checklist提升为长期约束。
8. 运行最小充分验证与ownership/generated audit，创建pending review request并停在C4；不提交、不push、
   不进入C5。

## Specs 与验收

### Private callback focused Spec

- non-planar/generic/undefined world返回undefined；live PlanarWorld返回instance callback；
- default CustomDataSource初始只有gate，第一次合法update append四个children并返回false，下一次按固定顺序
  更新；
- non-CustomDataSource、enabled cluster、每类代表性unsupported standard graphic和unknown custom top-level
  Property在child normal update和低层资源mutation前抛错；同步CPU tracking允许；`Entity.properties`允许；
- invalid配置删除或cluster disable后可激活；
- 第二/第三child constructor失败时反向清理先前candidate，不append、不覆盖原始异常；
- activated gate不重复构造；dynamic invalid Entity在四个child update前失败；
- gate无bounds，children仍是独立数组成员；destroy前后identity与exactly-once成立；
- C4向Model/Polyline/Polygon传入同一个per-data-source target collection。

### CesiumWidget real Context Spec

- EPSG:3857-scale World中`widget.entities`自动显示Point、Billboard、Label、Model、Polyline、Polygon的代表性
  组合；至少覆盖anchor/model/line/polygon像素、finite depth和original Entity pick；
- caller-owned `CustomDataSource` add/move/remove保持container顺序、可见性、pick和资源收敛；
- dynamic Property/show/Entity remove保持C2/C3契约，不产生额外visualizer或subscription；
- Box、unknown custom top-level、enabled cluster和non-CustomDataSource fail-fast，不运行Globe visualizer、不留下
  SceneGIS resource；
- default Globe、`globe:false`与一个non-planar world代表性construction/update仍使用默认callback；
- Widget destroy先清理gate/children/EntityCluster slots/Model/Buffer/GPU，再销毁Scene/World，所有owned resource
  exactly once。

### Viewer Spec

- `viewer.entities`与added CustomDataSource无需手工visualizer即可显示；
- real pick返回original Entity，left click设置`selectedEntity`；SelectionIndicator位置finite且visible，InfoBox
  description正常、camera action保持disabled；
- Entity/DataSource remove清理selection相关状态和visual resources；
- planar controller identity、tracking/zoom/fly guards保持P6契约；
- default Globe和`globe:false`选取最小受影响回归，不扩张为无关全量矩阵。

### 最小充分命令

Execution应以仓库实际runner语法记录精确命令，至少包括：

1. private callback、C2 Anchor/Model、C3 Polyline/Polygon和C3 geometry focused suites；
2. 新CesiumWidget与Viewer SceneGIS suites；
3. P1 `SceneGISWorldCesiumWidget`、P6 `SceneGISPlanarViewer`以及上游CesiumWidget/Viewer受影响的focused
   regressions；只在focused evidence提示公共回归时扩大范围；
4. `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`；
5. scoped ESLint、JS/Markdown Prettier、Markdownlint、`git diff --check`；
6. `npm run scenegis:audit-upstream-patches`；
7. declarations/API private symbol和`SCENEGIS_PATCH`生成物命中为0，generated files不进入status。

不为追求极端边界或大范围数字矩阵增加无关测试；验证集中在callback integration、默认路径隔离、selection
和lifecycle风险。

## 完成条件

- `widget.entities`、`viewer.entities`与`CustomDataSource`自动运行六类C2/C3 planar content；
- invalid DataSource/cluster/Entity profile在任何child normal update和低层资源mutation前显式失败，合法修正
  路径可恢复；
- original Entity picking、Viewer selection、union bounds、dynamic update和destroy顺序通过；
- Model/Polyline/Polygon自动path使用per-data-source primitive container，默认显式构造path不回归；
- default Globe、`globe:false`和non-planar world仍走原Cesium callback；
- upstream-owned product files恰好一个：`packages/engine/Source/Widget/CesiumWidget.js`；C4只新增
  SGP-0001的两个paired hunks，无其他上游改动；
- public API delta=0，private factory/gate不出现在supported declarations/API；generated status=0；
- 最小充分Specs/build/types/docs/lint/audit通过，任何环境限制如实记录；
- review request为`pending`，phase/extension保持`active`；Execution停止，不commit、不push、不进入C5。

## 偏差与结果

### 实际设计与路径

- 新增`_SceneGISPlanarVisualizersCallback.js`：factory只为live planar World返回instance callback；gate在每次
  update先验证World/Scene、`CustomDataSource`、disabled cluster与Entity top-level allowlist。首次合法
  update按Anchor/Model/Polyline/Polygon顺序原子append并返回false，constructor失败反向清理且保留原异常。
- Model/Polyline/Polygon及Buffer owner增加optional primitive target；C4传`dataSource._primitives`，省略时
  保持`scene.primitives`。Model candidate与Buffer collection都按真实membership回滚，target保持caller-owned。
- `CesiumWidget.js`仅增加factory import和`DataSourceDisplay.visualizersCallback`两个paired `SGP-0001`
  hunks；`.scenegis/upstream-patches.json`只追加三个C4 test paths。
- Factory liveness直接使用`SceneGISPlanarWorld#isDestroyed()`正式契约；live World即使绑定或覆盖五个frame
  lifecycle方法仍安装planar callback，真实destroyed World返回`undefined`。P6 fixture按合法新增liveness call
  观察controller构造前死亡，不再依赖硬编码旧调用次数。
- 最终product paths：上述五个private DataSources文件与`packages/engine/Source/Widget/CesiumWidget.js`；
  Specs为callback、C2/C3 optional-target、engine Widget和widgets Viewer；durable docs为Architecture、
  DevelopmentGuide与PlanarContentGuide。没有修改`DataSourceDisplay.js`或`Viewer.js`。

### Source-to-Spec 与计数

- Factory/gate -> `_SceneGISPlanarVisualizersCallbackSpec.js`：`8` cases。
- CesiumWidget automatic path -> `SceneGISPlanarContentCesiumWidgetSpec.js`：`4` cases。
- Viewer selection/DataSource path -> `SceneGISPlanarContentViewerSpec.js`：`2` cases。
- Optional target -> Model/Polyline/Polygon focused Specs各新增`1` case。
- Model真实`PrimitiveCollection` post-insertion event rollback -> Model focused Spec新增`1` case。
- C4 direct unique cases=`18`。受影响focused aggregate：Anchor`11`、Model`11`、Polyline`8`、Polygon`10`、
  geometry`1`、P1 Widget`16`、P6 Viewer`18`、upstream CesiumWidget`75`、upstream Viewer`59`；aggregate不与
  direct unique重复计数。

### 验证矩阵

- 三个新增suite：callback`8/8`、engine Widget`4/4`、widgets Viewer`2/2`，Exit 0。真实Widget fixture覆盖
  normal render pixel、original Entity pick、per-DataSource target与remove/destroy。
- C2/C3：Anchor`11/11`、Model`11/11`、Polyline`8/8`、Polygon`10/10`、geometry real Context`1/1`，Exit 0。
- 集成回归：P1 `SceneGISWorldCesiumWidget` `16/16`、P6 `SceneGISPlanarViewer` `18/18`、upstream
  `Widget/CesiumWidget` `75/75`、`Widgets/Viewer/Viewer` `59/59`，Exit 0。P6首次复跑暴露额外liveness call
  顺序回归；完成上述兼容细化后`18/18`通过。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`均Exit 0；build-ts保留仓库现有
  大量TSD-JSDoc warning，无新增C4-specific warning。
- Scoped ESLint、JS/JSON/Markdown Prettier、Markdownlint与`git diff --check`均Exit 0。计划中的
  `npm run scenegis:audit-upstream-patches`因仓库没有该npm script而Exit 1；等价正式入口
  `node scripts/scenegis/audit-upstream-patches.mjs` Exit 0，报告current delivery upstream-owned entry=`1`
  且generated status=`0`。
- Generated engine/Cesium declarations与API HTML中factory/gate和`SCENEGIS_PATCH`命中`0`；generated files
  status=`0`。
- Focused review fixes不新增case：callback`8/8`锁定正式World liveness与真实third-child rollback；P6 Viewer
  `18/18`按合法新增liveness call调整controller-death观察；engine Widget`4/4`锁定mixed profile的child
  normal-update/resource boundary、真实Billboard/Label/Polyline/Polygon target、两个DataSource move与exactly-once
  remove。Model`11/11`、Polyline`8/8`、Polygon`10/10`、widgets Viewer`2/2`与`npm run build`均Exit 0。
- C4-R001～C4-R004由Execution标为`fixed`：factory删除destroyObject shape heuristic；保证措辞收窄到child
  normal update和低层资源mutation；automatic target/order使用真实内容；third-child fixture确实在Polyline
  constructor失败并验证Anchor/Model回滚、原异常和纠正后激活。

### Ownership 与剩余风险

- Upstream-owned product files=`1`：`packages/engine/Source/Widget/CesiumWidget.js`；C4复用
  `SGP-0001`，新增paired hunks=`2`，无新SGP。`Scene.js`、`Viewer.js`与`SGP-0002` unchanged。
- Public API delta=`0`；private callback/gate不进入supported declarations/API。Manifest只扩展SGP-0001 tests。
- 剩余风险：C5前没有批量Entity性能或Sandcastle交付结论；非Custom DataSource、enabled clustering及未批准
  graphics仍明确unsupported；Buffer/Model私有升级面与CesiumWidget callback seam需在上游升级时复核。

## 当前交接

- C4-R001～C4-R004经Architecture focused re-review全部关闭；review为`approved`，phase为`completed`，
  extension继续`active`。
- 下一步：Architecture形成C4独立本地提交检查点；之后才按届时源码事实设计C5，不把C5实现混入本阶段。
