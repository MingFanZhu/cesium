# Phase Plan: I2 Planar Entity/DataSource Framing

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Planar API integration extension](2026-08-14-planar-api-integration-extension.md)
- Phase: `I2`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Parent checkpoint: `ff7c1916d6604400465414305f3f647ef9347d5c`
- Architecture checkpoint: `7e4f574a83`（`实现平面实体与数据源定位`，not pushed）
- Related discussion:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- ADR: amend `ADR-0006`; consume `ADR-0037`
- SGP: create proposed `SGP-0005` for the paired `CesiumWidget.js` / `Viewer.js` framing seam

## Objective

在primary World为live `SceneGISPlanarWorld`时，让直接`CesiumWidget`及live/declarative planar `Viewer`的
`zoomTo`/`flyTo`复用Cesium现有Entity可视化与`DataSourceDisplay.getBoundingSphere`流程，并把最终bounds交给I1已完成的
fixed-axis `Camera.viewBoundingSphere`/`flyToBoundingSphere`。同时启用InfoBox camera的zoom-only入口，保持tracking、
double-click tracking及非Entity target明确不可用。

## Non-goals

- 不实现或解除`trackedEntity`、`EntityView`、position/orientation跟随、`viewFrom` tracking或double-click tracking；这些属于I3。
- 不开放`ImageryLayer`、`Cartographic`、`Cesium3DTileset`、`TimeDynamicPointCloud`、`VoxelPrimitive`或
  `BufferPrimitiveCollection`作为planar zoom target。
- 不为GeoJSON/CZML/KML等地理格式做CRS转换；调用方必须保证传入Entity属性已经是当前平面World的米制Cartesian语义。
- 不新增Entity visualizer、bounds系统、clamping、terrain following或unsupported graphics的伪bounds。
- 不修改I1 Camera/flight/controller、World/Surface/Terrain/Environment、Shader、Worker、构建器或公共类型签名。
- 不改变Globe、`globe:false`或generic custom World的既有`CesiumWidget`/`Viewer` target矩阵。

## Entry conditions

- Branch=`feature/planar-api-integration`，I1 parent checkpoint=
  `ff7c1916d6604400465414305f3f647ef9347d5c`（`实现平面相机视图与飞行接口`，not pushed）。
- I1 Architecture/code review approved，I1-R001-I1-R003 closed，项目负责人direct Test manual gate passed。
- Working tree允许保留Architecture-owned `AgentDocs/planar-viewer-bootstrap/**`历史交接diff和项目负责人untracked
  `Test/地形.html`；Execution不得读取、修改、暂存或提交这些排除项。
- Execution开始前读取root/engine AGENTS、DevelopmentGuide相关章节、Architecture、ADR-0001/0006/0037、
  extension index/plan/discussion和本phase plan。

## Current source facts

1. `CesiumWidget.zoomTo/flyTo`统一进入`zoomToOrFly`：创建`Promise<boolean>`，异步归一化target，在每帧
   `_postRender`的`updateZoomTarget`等待visualizer bounds，再调用Camera。
2. `updateZoomTarget`已使用`DataSourceDisplay.getBoundingSphere`聚合Entity bounds；SceneGIS八类visualizer已有
   world-space bounds，因此I2不需要复制或新建bounds系统。
3. 上游target归一化目前接受大量Globe-specific对象，也会把未知对象包装为单元素数组；在planar World直接解除Viewer guard会让
   `Cartographic`、ImageryLayer、3D Tiles等重新进入球面路径或产生延迟错误。
4. 当前`Promise.resolve(target).then(...)`没有为input rejection、异步非法target或post-render Camera validation建立完整的
   reject/clear contract；DataSource loading listener也没有被replacement/destroy统一移除。I2不能留下pending Promise或listener。
5. I1已使`Camera.viewBoundingSphere`/`flyToBoundingSphere`支持fixed axes、四frustum、offset validation、Cartesian flight、
   controller suspension及callback/cancel；I2应只做target与bounds orchestration。
6. `Viewer.zoomTo/flyTo`当前以`SGP-0002`同步拒绝所有planar调用；InfoBox tick永久把`enableCamera=false`，camera click对
   positioned Entity优先赋值`trackedEntity`；planar Viewer也没有安装left-double-click action。
7. `DataSource`在Cesium中是documentation interface，concrete DataSource不统一继承可用的runtime base；稳定的运行时边界是
   `target.entities instanceof EntityCollection`。Entity和EntityCollection本身具有真实constructor identity。
8. `CesiumWidget.destroy`当前不会主动结算pending zoom；planar-specific pending state必须在World/Context销毁前取消并清理。
9. `CesiumWidget.js`已由`SGP-0001`登记，`Viewer.js`已由`SGP-0002`登记；audit支持同一upstream path的多个独立paired
   SGP。I2不应扩大旧补丁目的或把新行为混入旧guard身份。

## Detailed design

### Planar target profile

- 仅当`scene.world instanceof SceneGISPlanarWorld`且World live时启用I2分支；不得根据ellipsoid、CRS字符串、坐标值或
  duck typing推断planar World。
- 支持的resolved target严格为`Entity`、纯`Entity[]`、`EntityCollection`、具有真实`EntityCollection`的DataSource interface
  instance，以及resolve为上述类型的Promise/thenable。
- EntityCollection/DataSource/array在接纳时复制当前values/array；后续caller mutation不能改变本次target snapshot。
- DataSource若`isLoading===true`且具有有效`loadingEvent`，沿用等待完成语义；replacement、cancel、reject和destroy必须移除
  listener exactly once。格式来源不代表CRS转换，调用方仍负责planar Cartesian语义。
- Mixed Entity数组、plain object及全部Globe-specific target拒绝。同步resolved非法target在取消现有zoom或写入pending state前抛
  `DeveloperError`；异步非法target拒绝本次returned Promise并原子清理。
- Empty array、没有任何DONE bounds的集合或全部FAILED boundsresolve `false`且不移动Camera；mixed DONE/FAILED只合并DONE；
  任一PENDING时继续等待，不发布部分Camera state。

### Promise and lifecycle transaction

- Planar branch使用明确的per-operation record持有resolve/reject、target snapshot、loading listener和options；不得以跨操作共享
  `_completeZoom`造成旧callback结算新operation。
- 第二次zoom/fly、trackedEntity清理、explicit cancel及widget destroy均只结算当前operation一次：cancel/replacement/destroy
  resolve `false`；input Promise rejection透传；unsupported resolved target或Camera validation以`DeveloperError`拒绝。
- Stale Promise、loading event及旧flight callback通过operation identity忽略，不能改写新operation。
- Camera/bounds candidate失败前不清理旧Camera flight或修改Camera；I1 Camera helper抛错时清理本次operation且不得在后续
  `_postRender`重复抛错。每个public start只按现有contract请求render，不增加timer。
- Direct invalid target与invalid planar offset/options尽可能同步fail-fast并保持既有operation；依赖异步resolution或computed bounds的
  失败通过returned Promise拒绝。

### CesiumWidget integration

- 在`packages/engine/Source/SceneGIS/DataSources/_private/`增加唯一basename private target helper，集中保存planar detection、
  exact target validation/snapshot与option validation；不得复制`DataSourceDisplay` bounds算法。
- `CesiumWidget.js`只增加paired `SGP-0005`窄dispatch和必要operation lifecycle hook。Globe/generic path执行原函数和target矩阵。
- Planar Entity aggregation继续调用现有`_dataSourceDisplay.getBoundingSphere(entity, false, scratch)`和
  `BoundingSphere.fromBoundingSpheres`，最终只调用I1 public Camera bounds API。
- `zoomTo`使用`camera.viewBoundingSphere`并恢复identity transform；`flyTo`传递supported `duration`、`maximumHeight`和
  `HeadingPitchRange offset`，complete/cancel精确映射到returned Promise boolean。
- Direct low-level `CesiumWidget({world})`必须与Viewer获得同一行为；没有planar controller时I1仍允许flight，有注册controller时
  继续使用suspension token。

### Viewer and InfoBox integration

- `Viewer.zoomTo/flyTo`不再整体拒绝planar Viewer，而是委托I2 validation的`CesiumWidget`。JSDoc明确planar supported
  profile、fixed-axis offset和unsupported target，不宣传所有上游overload。
- I2使用new `SGP-0005`登记`Viewer.js`。被取代的旧`SGP-0002` zoom/fly/InfoBox guard hunk可删除或换成独立
  `SGP-0005` pair；不得嵌套marker。SGP-0002 construction/controller/Home/tracking其余pairs保持。
- Planar InfoBox只在selected Entity bounds状态为DONE时启用camera；PENDING不使用stale scratch，FAILED position fallback仍可供
  SelectionIndicator显示，但不能宣传可zoom。
- 点击planar InfoBox camera只调用`viewer.zoomTo(selectedEntity)`，不赋值`trackedEntity`；Globe handler保持track-or-zoom。
- Planar left-double-click action仍不安装，`viewer.trackedEntity=defined`继续同步拒绝；I2不触碰I3 authority。

### ADR, SGP, and public docs

- 创建`SGP-0005`并登记两个files/tests/ADR/removal condition；`SGP-0001/0002/0004`保持独立。
- 修订ADR-0006中永久禁用InfoBox/zoom/fly的旧决定，增加supported profile、Promise lifecycle、InfoBox zoom-only及低层
  CesiumWidget入口。ADR-0037仅作为Camera dependency。
- Architecture、PlanarWorldGuide、UpgradeChecklist记录长期API矩阵；不把format/3D Tiles/tracking写成已支持。
- `Test/平面环境.html`在中文lil-gui中加入Entity/DataSource framing controls和状态；只使用public Viewer API。

## Affected paths

### Allowed product paths

- 新增一个`packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanar*Target*.js` private helper
- `packages/engine/Source/Widget/CesiumWidget.js`（upstream-owned；paired `SGP-0005` only）
- `packages/widgets/Source/Viewer/Viewer.js`（upstream-owned；paired `SGP-0005`及必要移除被替代的SGP-0002 guard pair）
- `.scenegis/upstream-patches.json`（新增`SGP-0005`；不得改写无关registration）

### Allowed Specs

- 新建一个focused `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanar*Zoom*CesiumWidgetSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
- 必要时`packages/widgets/Specs/SceneGIS/SceneGISPlanarContentViewerSpec.js`，仅复用现有real Entity/DataSource fixture
- 对应private helper Spec仅在public Widget aggregate无法完整覆盖时增加

### Allowed docs, example, and delivery

- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- `Documentation/SceneGIS/Architecture.md`、`PlanarWorldGuide.md`、`PlanarWorldUpgradeChecklist.md`
- `Test/平面环境.html`；严禁读取/修改/暂存`Test/地形.html`
- `scripts/scenegis/verify-planar-packages.mjs`仅在installed JSDoc/API/runtime资格确需新增断言时
- `AgentDocs/planar-api-integration/**`现有index/extension/phase/review/handoff

### Forbidden in I2

- I1 Camera/flight/controller source与Specs，除非Architecture基于真实blocker另行批准scope amendment
- `EntityView`、trackedEntity engine实现、double-click tracking、DataSource/Entity/EntityCollection upstream实现
- SceneGIS visualizers、World/Surface/Terrain/Environment、Shader、Worker、build/package manifests、generated files
- ImageryLayer/3D Tiles/Voxel/point-cloud/Buffer target支持、format loader或CRS转换
- `AgentDocs/planar-viewer-bootstrap/**`和项目负责人`Test/地形.html`

## Steps

1. Execution重审`zoomToOrFly`、`updateZoomTarget`、destroy、Viewer InfoBox/tick/guard和现有Specs，把源码偏差写入本plan。
2. 修改upstream前新增`SGP-0005`，登记两个files/tests/ADR/removal condition；marker不得与SGP-0001/0002嵌套。
3. 先实现SceneGIS-owned exact target/options helper和public Widget Specs，再加入最小CesiumWidget dispatch/lifecycle。
4. 开放Viewer delegation及InfoBox zoom-only，更新guard Specs并证明tracking/double-click继续拒绝。
5. 用live/declarative Viewer覆盖single/multi Entity、Collection、CustomDataSource/loading、Promise、PENDING/DONE/FAILED、
   replacement/cancel/destroy和Perspective/Orthographic framing/flight。
6. 扩展direct Test中文GUI；修订ADR/formal docs；按public JSDoc变化运行types/docs/package资格。
7. 写open review request并停在I2。Architecture批准前不请求人工gate；不commit/push、不进入I3。

## Validation

### Deterministic public behavior

- Direct planar CesiumWidget及live/declarative Viewer覆盖全部supported target和Promise target。
- DataSource loading listener在complete/replacement/cancel/reject/destroy exactly-once移除；无stale publication。
- Bounds PENDING不移动；DONE合并；全部FAILED/empty false；mixed DONE/FAILED只合并DONE。
- Promise success true、cancel/replacement/destroy false、input rejection透传、async invalid/camera failure拒绝；只结算一次。
- Invalid direct target/options在pending state/cancel/request/Camera mutation前同步失败；plain object、mixed array和Globe target拒绝。
- InfoBox DONE启用并只zoom；PENDING/FAILED禁用；position fallback不错误启用；tracking仍undefined，double-click action仍缺席。

### Real Context and regressions

- Perspective与Orthographic representative经public Viewer/Widget产生expected planar framing/pixels；包含nonzero-range offset和
  duration>0真实flight frame。
- Entity/DataSource visualizer实际compile/draw/bounds；Camera-only操作保持tile/mesh、Surface command/shader/VA、imagery
  binding/texture、Environment light/resource identities warm且不创建World/GPU资源。
- Flight input suspension/恢复沿用I1 public path；不重复I1 private math矩阵。
- Globe Viewer、`globe:false`和默认CesiumWidget的zoom/fly/InfoBox/tracking保持；运行必要upstream focused aggregates。

### Delivery and static

- Focused engine/widgets SceneGIS Specs与必要upstream aggregates。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`。
- `node scripts/scenegis/verify-planar-packages.mjs`；生成声明/API只读验证后不得进入status。
- Direct Test短浏览器检查不依赖公网tile成功。
- Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、official upstream audit、exact status/generated audit。

## Acceptance criteria

- Direct CesiumWidget及live/declarative planar Viewer的`zoomTo/flyTo`对明确Entity/DataSource profile工作，offset使用fixed axes，
  Camera framing/flight沿I1 public API完成。
- 异步、cancel、replacement、destroy和failure均有终态；无pending Promise、listener、stale callback或重复Camera mutation。
- InfoBox camera成为zoom-only入口；tracking、double-click与Globe-specific target仍不开放。
- Globe、`globe:false`、generic custom World、现有Camera与Entity显示无回归。
- ADR-0006、SGP-0005、JSDoc/types/docs、direct Test与upgrade checklist闭环；upstream-owned仅两个窄文件，generated=0。

## Stop conditions

- 若必须修改I1 Camera/Controller、DataSourceDisplay/Entity/visualizer、InfoBox widget源码或第三个upstream product file，停止并回报。
- 若某SceneGIS visualizer没有DONE bounds，不得伪造sphere；由Architecture决定收窄profile或另开修复。
- 若Promise lifecycle无法隔离Globe行为，先提交设计偏差，不得顺手改写全局Cesium语义。
- Architecture review、必要owner gate与独立checkpoint完成前，不进入I3。

## Execution results

### Implementation

- 新增`_SceneGISPlanarEntityFraming`，以per-operation record保存target/options snapshot、loading listener、bounds scratch、
  Promise settle与flight identity；sync invalid direct input在replacement/request/Camera mutation前失败，async invalid/rejection与
  bounds/Camera candidate error拒绝并清理。
- `CesiumWidget.js`通过paired SGP-0005只在live planar World分派start/update/cancel/destroy；Globe/generic path保持原逻辑。
- `Viewer.js`移除被I2取代的SGP-0002 zoom/fly/InfoBox永久guard，改以独立paired SGP-0005委托Widget；InfoBox只在DONE
  bounds启用并执行zoom，PENDING不读stale scratch，FAILED fallback仅供selection。
- `Test/平面环境.html`增加本地Point/CustomDataSource与中文`Entity/DataSource定位`lil-gui controls；不增加网络依赖。
- ADR-0006、Architecture、Guide、UpgradeChecklist与installed verifier已锁定target profile、operation lifecycle、InfoBox边界和
  SGP-0005升级条件。

### Changed paths

- `.scenegis/upstream-patches.json`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityFraming.js`
- `packages/engine/Source/Widget/CesiumWidget.js`
- `packages/widgets/Source/Viewer/Viewer.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidgetSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarContentViewerSpec.js`
- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-api-integration/README.md`
- `AgentDocs/planar-api-integration/plans/README.md`
- `AgentDocs/planar-api-integration/plans/2026-08-14-planar-api-integration-extension.md`
- 本phase plan、reviews index与I2 review request。

### Validation

- `SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidget`: `10/10 SUCCESS`。
- `SceneGIS/SceneGISPlanarViewer`: `22/22 SUCCESS`。
- `SceneGIS/SceneGISPlanarContentViewer`: `3/3 SUCCESS`。
- upstream `Widget/CesiumWidget`: `75/75 SUCCESS`；upstream `Widgets/Viewer/Viewer`: `59/59 SUCCESS`。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`通过。
- installed verifier通过：12/12 GLSL、12/12 generated shader modules、V1 Viewer与I2 framing API docs。
- Scoped ESLint/Prettier、formal/AgentDocs Markdownlint、`git diff --check`与official upstream audit通过；最终精确status audit在
  review-ready前复核，expected upstream-owned=2（SGP-0005），generated=0。

### Deviations and unrun boundary

- 无product scope偏差。因real Entity bounds使旧Content Viewer的InfoBox camera期望从`false`变为`true`，按phase允许范围
  更新该existing aggregate；首次运行`2 SUCCESS/1 FAILED`为superseded expectation，修正后`3/3 SUCCESS`。
- 首次planar Viewer运行`21 SUCCESS/1 FAILED`源于selection fixture未显式模拟FAILED bounds；补齐fixture后`22/22 SUCCESS`。
- 未运行full suite、E2E、Sandcastle或公网自动化。按phase gate，direct Test Chromium smoke留待Architecture code approval后执行。

### Architecture finding disposition

- I2-R001 addressed：planar Viewer保留严格`DONE` gating；非planar Viewer恢复原有`PENDING` position publication。
  新增focused nonplanar regression后Viewer aggregate为`23/23 SUCCESS`。
- I2-R002 addressed：settlement使用显式reject flag，`Promise.reject(undefined/null)`及bounds/Camera throw
  `undefined/null`均保持rejected reason、清理current operation且exactly once；Widget aggregate为`11/11 SUCCESS`。
- 按Architecture focused boundary未重跑build/package/render矩阵。Architecture focused re-review已批准，I2-R001/R002
  closed；项目负责人已在`Test/平面环境.html`完成人工验收并明确通过。Architecture已创建I2本地checkpoint
  `7e4f574a83`（`实现平面实体与数据源定位`，not pushed）；I2 completed，未进入I3。
