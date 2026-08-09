# C5 动态更新、批量性能与交付

## 元数据

- 计划类型（Plan type）：`phase`
- 阶段（Phase）：`C5-dynamic-performance-and-delivery`
- 状态（Status）：`active`
- 父计划（Parent plan）：
  [SceneGIS 平面内容总体计划](2026-08-08-planar-content-extension.md)
- 负责人角色（Owner role）：`execution`
- 架构评审（Architecture review）：`confirmed`
- 架构评审人：Architecture Agent（依据项目负责人授予的后续阶段自主设计与派工权限）
- 创建日期（Created）：`2026-08-09`
- 更新日期（Updated）：`2026-08-09`
- Planning base：`1f9d8da4ca8c47425917c23642cea3123339e386`
- 分支（Branch）：`feature/planar-content`
- 相关讨论（Related discussions）：None；C5源码审计与完整设计直接提升为ADR-0017
- 相关评审（Related reviews）：实现ready后创建
  `AgentDocs/planar-content/reviews/2026-08-09-c5-dynamic-performance-and-delivery.md`
- ADR：
  [ADR-0013](../../../Documentation/SceneGIS/Decisions/ADR-0013-planar-content-position-height-and-compatibility.md)、
  [ADR-0014](../../../Documentation/SceneGIS/Decisions/ADR-0014-planar-anchor-and-model-visualizers.md)、
  [ADR-0015](../../../Documentation/SceneGIS/Decisions/ADR-0015-planar-polyline-polygon-and-vertex-drape.md)、
  [ADR-0016](../../../Documentation/SceneGIS/Decisions/ADR-0016-planar-datasource-display-integration.md)、
  [ADR-0017](../../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)
- SGP：C5预期`0`；不得修改历史`SGP-0001/0002` hunk或manifest语义

## 阶段目标

在保持C1-C4 public/compatibility/ownership contract不变的前提下：

1. 用固定moderate profile验证automatic planar content的initial、warm、动态局部更新、terrain refresh、
   remove/re-add和destroy收敛；
2. 记录可复核的同机CPU/render timing与持久resource evidence，只在出现真实热点时做窄private优化；
3. 提供稳定`scenegis-planar-content` Sandcastle，展示六类内容、EPSG:3857、地表高度、选择和批量操作；
4. 建立local dev/release E2E与installed-package smoke，补齐最终指南和升级检查项；
5. 通过Architecture/code review后交给项目负责人做真实浏览器/GPU人工验收，完成首版扩展。

## 非目标

- 不新增跨Entity batching layer、公开batch API、ContentLayer或第二套scene graph。
- 不新增graphics、GeoJSON/CZML/KML转换、3D Tiles、tracking、`flyTo`、`zoomTo`或地下模式。
- 不改变C1 HeightReference fallback、C2 Model generation、C3 topology/drape或C4 DataSource gate语义。
- 不引入Worker、空间索引、byte budget、离线下载或公网自动化。
- 不修改CesiumWidget/DataSourceDisplay/Viewer等upstream-owned product file；不新增SGP。
- 不新增GitHub workflow、tag、push、publish或release branch。
- 不用极端对象数量、长时间soak或跨机器硬毫秒阈值拖延交付。

## 当前源码事实

### 更新与ownership

- Anchor visualizer在每个DataSource的disabled `EntityCluster` pool中复用Point/Billboard/Label低层对象；
  item/slot按Entity tracking，remove/destroy归还pool。
- Model逐Entity拥有一个active/candidate Model，URI generation异步；同URI可能由Cesium内部cache复用，但
  SceneGIS不拥有或修改该cache。
- Polyline/Polygon逐Entity拥有private Buffer owner。C3已保证未变化warm update不调用Buffer setter、
  不增加`_dirtyCount`或copy；但`computeState`仍解析Property并为geometry创建临时CPU数组。
- C4 gate每次update遍历Entity `propertyNames`，四个child随后各遍历自己的tracked items；当前不存在
  cross-Entity SceneGIS batch或全局dirty registry。

### 已有证据与缺口

- C2/C3 small fixture已有四类anchor/model、line/fill/hole/extrusion的pixel、pick、depth、warm与destroy。
- C4已有automatic default Entity、CustomDataSource target/order/remove、Viewer selection与default Globe回归。
- 尚缺固定对象规模、局部dynamic mutation isolation、多个automatic lifecycle cycle、内容Sandcastle、
  local content E2E与installed bundle对C4内部链路的资格证据。
- 现有P8 planar-world qualification协议可借鉴hard gate/timing分离，但C5不复制其超出内容风险的tile/imagery
  大矩阵。

## 允许影响路径

### 默认新增或修改

- `packages/engine/Specs/SceneGIS/DataSources/**`
- `packages/engine/Specs/SceneGIS/Widget/**`
- `packages/widgets/Specs/SceneGIS/**`
- `Specs/e2e/scenegis-planar-content.spec.js`
- `packages/sandcastle/gallery/scenegis-planar-content/**`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`
- `Documentation/SceneGIS/PlanarContentGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0017-*.md`
- `AgentDocs/planar-content/**`

### 仅在baseline证明热点后允许

- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarBufferOwner.js`

若修改这些runtime路径，phase results必须先记录同一fixture的C4 baseline、热点位置和保留优化的直接证据。
不得把优化扩到公共API、World/terrain、Shader、Worker、upstream seam或跨Entity batching。

## 实现步骤

### C5-A：先建立资格fixture与baseline

1. 新建一个automatic Widget或等价real Context qualification suite，使用本地生成的finite planar数据。
2. 固定moderate profile：`256` Point、`128` Billboard、`128` Label、`64` Polyline、`32` Polygon；
   Billboard共享一个local canvas image，线面使用少量顶点。
3. Model另用`2`个共享local glTF URI，不进入CPU批量timing；等待ready后验证identity、transform和释放。
4. 初次update/render验证item/slot/owner数量、sampled pixel/pick、finite bounds和per-DataSource target。
5. 执行`20`个identical warm frames，锁定slot/Model/owner/collection/render context/command/VA identity、
   primitive count、dirty/copy与持久resource count不增长。
6. 记录固定viewport、Chrome/WebGL/build、warmup以及update/render五组批次的median/P95；timing只写证据，
   不创建跨机器assertion。

### C5-B：动态、terrain与lifecycle

1. 五轮只修改约`10%`对象，至少包含`32`个anchor、`8`条line和`4`个polygon；证明未变化owner/slot保持，
   changed geometry在一次normal update/render后生效并重新warm。
2. 使用local resident-height seam让代表性Point、Model、Polyline、Polygon覆盖`CLAMP_TO_GROUND`与
   `RELATIVE_TO_GROUND`；height变化只在下一normal update生效，不创建terrain request。
3. 覆盖show/availability、remove/re-add与一个async Model stale settlement；不重复C2全部边界矩阵。
4. 三个串行Widget/Viewer/DataSource cycle恢复EntityCollection listener、primitive container、cluster slot、
   Model/Buffer、controller与DOM baseline，owned resources exactly once释放。
5. 若出现可重复热点，先记录baseline，再只按ADR-0017做static/absolute CPU evaluation cache或scratch复用；
   dynamic与terrain-dependent路径不得错误缓存。没有热点则明确记录product runtime delta=`0`。

### C5-C：Sandcastle与本地E2E

1. 新增稳定`scenegis-planar-content`示例，`development: false`。
2. 显式创建EPSG:3857 planar World；可复用OSM imagery与公开LERC terrain，但Credit必须visible，失败时保留
   flat/ready-ancestor fallback并显示状态，不预取或批量下载。
3. 使用仓库local SampleData Model，默认画面同时展示Point、Billboard、Label、Model、Polyline、Polygon及
   absolute/clamp/relative差异。
4. 控件至少包含Content view、Home、启停有限动态更新和add/remove representative batch；默认状态确定，
   不运行无界随机动画。
5. 新增local Playwright用例，不访问公网；验证automatic Viewer content、一次dynamic update、original
   Entity selection、remove和destroy。按现有harness分别复核dev/release bundle，不新增workflow。

### C5-D：交付与文档

1. 更新`PlanarContentGuide`的最终compatibility、动态/批量建议、性能边界与示例入口。
2. 更新`PlanarWorldUpgradeChecklist`，加入C1-C4 private resolver/visualizer、C4 callback/SGP seam、EntityCluster、
   Model与experimental Buffer复核项。
3. 扩展installed-tarball smoke，确认C4内部Source/runtime链路被打包且private类型/API仍不进入supported surface；
   不把underscore runtime export误写成public API。
4. 创建C5 pending review，回写实际runtime delta、计数、timing、环境、E2E/Sandcastle、package和ownership。
5. Architecture review通过后停止，等待项目负责人打开Sandcastle完成视觉与交互验收；未经明确人工批准，
   extension不得标记`completed`。

## 测试与验收

### Hard behavior/resource gates

- moderate profile initial/warm/dynamic/remove/destroy全部通过，sampled对象可见、可pick且bounds finite；
- warm frame无新slot/owner/collection/render-context/command/VA或persistent GPU resource，Buffer不重复dirty/copy；
- dynamic mutation只改变目标对象，下一warm frame重新收敛；terrain height change不发请求且按eventual
  consistency更新；
- Model async、DataSource ordering、original Entity selection和caller-owned container不回归；
- 三个lifecycle cycle恢复listener/primitive/DOM/controller baseline；late settlement不复活资源；
- default Globe、`globe:false`、unsupported profile至少各保留一个代表性回归。

### Timing evidence

- 固定对象数、viewport、build、浏览器、GPU、warmup、batch size和sample count；
- 分开记录`DataSourceDisplay.update`与render的median/P95，不用单帧FPS；
- 若runtime delta=`0`，记录C4 baseline即可；若有private优化，使用同机相同fixture做baseline/candidate，结果可
  重复且hard gates不变；
- timing只用于决定是否保留优化，不因单次噪声失败或扩大验证。

### 最小充分命令

Execution记录仓库实际runner语法，至少包括：

1. 新content qualification suite、C4 callback/Widget/Viewer suites；只有runtime改动时才复跑直接受影响的
   C2/C3 visualizer和real Context suites；
2. `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`；
3. focused dev/release Playwright content spec；无WebGL的headless结果必须如实记录，允许用headed real GPU作为
   完成证据；
4. `node scripts/scenegis/verify-planar-packages.mjs`；
5. no-embedding gallery与Sandcastle build各一次；标准embedding若仍因外部metadata失败，只记录一次，不重试；
6. scoped ESLint、JS/JSON/Markdown Prettier、Markdownlint、`git diff --check`；
7. `node scripts/scenegis/audit-upstream-patches.mjs`，generated status=`0`。

不运行无关Cesium全库Specs、不新增CI workflow、不重复P8 tile/imagery压力矩阵。

### 人工验收

项目负责人在真实浏览器/GPU中检查：

- 六类content均位于正确EPSG:3857位置，高度与terrain关系可辨认；
- Point/Billboard/Label/Model/line/fill/extrusion方向、遮挡和选择正确；
- 动态开关、batch add/remove、Content view、Home与PC navigation工作；
- InfoBox/SelectionIndicator正确，Credit可见，terrain/imagery失败fallback可理解；
- console无C5引入的warning/error，操作后无明显资源持续增长或不可恢复卡顿。

## Ownership与阶段门禁

- 预期upstream-owned product/test/build files=`0`，C5 SGP=`0`。
- 历史`CesiumWidget.js`/`Scene.js`/`Viewer.js`和`SGP-0001/0002`必须unchanged；C5不新增patch marker。
- 所有生成文件、timing log、截图、临时package和profile产物不得进入status。
- Execution完成implementation、最小充分验证和AgentDocs后创建`pending` review并停止；不commit、不push、不
  标记extension completed。
- Architecture review通过后由Architecture Agent提交C5；项目负责人明确人工验收通过后，才完成整个
  `planar-content` extension。

## 当前交接

- C4 completed checkpoint：`1f9d8da4ca8c47425917c23642cea3123339e386`。
- ADR-0017与本phase plan已confirmed；C5状态为`active`。
- 下一步：Execution严格按C5-A先建立baseline与qualification，再决定是否需要任何private runtime优化。
