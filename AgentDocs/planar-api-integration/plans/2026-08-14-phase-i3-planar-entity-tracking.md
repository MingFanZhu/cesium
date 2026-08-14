# Phase Plan: I3 Planar Entity Tracking

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Planar API integration extension](2026-08-14-planar-api-integration-extension.md)
- Phase: `I3`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture code review: `approved`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- I2 checkpoint: `e755ad95a2`（`实现平面实体与数据源定位`，not pushed）
- Assignment base: `8386eef2bd18bffb817c67235ae263ac44539d20`
- Architecture checkpoint: `63cf8bbe44`（`实现平面实体跟踪`，not pushed）
- Related discussion:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- ADR: create `ADR-0038` and amend `ADR-0006`; consume `ADR-0037`
- SGP: create proposed `SGP-0006` for paired `CesiumWidget.js` / `Viewer.js` tracking seams

## Objective

在primary World为live `SceneGISPlanarWorld`时，让直接`CesiumWidget`及live/declarative planar `Viewer`的
`trackedEntity`按native `Clock.currentTime`跟随明确的平面Entity profile，并恢复Viewer left-double-click与InfoBox camera的
track/untrack交互。跟踪必须使用固定`+X East / +Y North / +Z Up`、I1 public Camera能力和ControllerHost时序，不复用或修改
Earth `EntityView`的ellipsoid/inertial算法。

## Non-goals

- 不支持`ReferenceFrame.INERTIAL`、`TrackingReferenceFrame.INERTIAL/VELOCITY`、VVLH、轨道、ellipsoid ENU或速度定向。
- 不让Entity `orientation`旋转tracking frame；orientation仍可供现有visualizer显示，但I3 camera保持固定世界轴。
- 不支持3D Tiles feature、ImageryLayer、Voxel、point cloud、plain object或非Entity作为tracked target。
- 不新增公开tracker/controller类型，不修改`EntityView`、`Entity`、`PositionProperty`、`ControllerHost`或native tracking算法。
- 不实现clamping、terrain following、实体碰撞、路径预测、runtime CRS转换或格式loader适配。
- 不修改I1 Camera/CameraFlightPath fixed-axis算法，不扩展I2 framing target profile。
- 不修改World/Surface/Terrain/Environment、Shader、Worker、构建器、InfoBox widget源码或生成文件。

## Entry conditions

- Branch=`feature/planar-api-integration`，assignment base=
  `8386eef2bd18bffb817c67235ae263ac44539d20`。
- I2 Architecture/code review approved，I2-R001/R002 closed，项目负责人manual gate passed；最终I2 checkpoint为
  `e755ad95a2`。阶段外Test拆分checkpoint=`74b41bb999`，当前I3 direct page为`Test/平面API集成.html`。
- Working tree只允许保留Architecture-owned `AgentDocs/planar-viewer-bootstrap/**`历史diff和项目负责人untracked
  `Test/地形.html`；Execution不得读取、修改、暂存或提交这些排除项。
- Execution开始前读取root/engine AGENTS、DevelopmentGuide相关章节、Architecture、ADR-0006/0037、extension
  index/plan/discussion、本phase plan与当前SGP manifest。

## Current source facts

1. `CesiumWidget.render`先执行`Clock.tick()`；其`onTick`同步完成`DataSourceDisplay.update(time)`，随后`Scene.render(time)`才按
   priority调用`ControllerHost.update(scene, time)`。因此内部tracking Controller可在同一host frame读取当前时间的Entity状态。
2. Earth path在`CesiumWidget._onTick`更新`EntityView`；初次tracking由`_postRender/updateTrackedEntity`等待position与bounds。
   `EntityView`依赖ellipsoid ENU、inertial transforms、velocity与Earth reference frames，不能解除guard后复用。
3. 当前planar `Viewer.trackedEntity=defined`与left-double-click仍由`SGP-0002`拒绝；InfoBox camera由`SGP-0005`只执行
   zoom。I3需要替换对应guard，但必须保留SGP-0002的construction/controller/Home与SGP-0005的framing lifecycle。
4. I2 private framing helper拥有独立operation与bounds transaction，但成功Camera mutation尚不会清除未来planar tracker；I3必须恢复
   native zoom/flight与tracking互斥，同时让PENDING/FAILED framing不错误终止已有tracking。
5. `ControllerHost`按registration顺序更新，后注册Controller覆盖先前Camera结果。V1 planar camera controller先于lazy tracker注册；
   tracker可作为最后的Camera authority运行，但必须暂停输入controller，而不是每帧与它争夺Camera。
6. `SceneGISPlanarCameraController`已有exactly-once flight suspension token和soft-private registered-controller lookup；I3应新增独立
   tracking suspension count/token，使flight与tracking可以嵌套且不改caller `enabled`值。
7. `Entity.position`是`PositionProperty`，其`referenceFrame`可为FIXED或INERTIAL；`getValue`会做Earth fixed转换。I3必须先验证
   `referenceFrame===ReferenceFrame.FIXED`，不能借`getValue`隐式接受Earth inertial输入。
8. `Entity.trackingReferenceFrame`默认`AUTODETECT`，另有`ENU/INERTIAL/VELOCITY`。平面第一版只接受
   `AUTODETECT/ENU`并把两者都解释为固定world axes；不得执行velocity auto-detect。
9. `viewFrom`是建议初始offset的Property。I3只在Camera authority首次获取时采样；后续保留该fixed-axis offset，不把它变成
   per-frame body/inertial frame。
10. Entity removal、DataSource removal、Home与Viewer clear路径已经通过public `trackedEntity=undefined`清理；I3应让这些既有入口
    统一释放tracker listener、Camera transform和input token。

## Detailed design

### Exact tracked Entity profile

- 仅当`scene.world instanceof SceneGISPlanarWorld`且World live、Scene为`SCENE3D`时进入I3；不得按CRS字符串、ellipsoid或坐标值推断。
- Defined target必须是`Entity`，具有defined `position`，且`position.referenceFrame===ReferenceFrame.FIXED`。
- `trackingReferenceFrame`只接受`TrackingReferenceFrame.AUTODETECT`或`ENU`；两者都表示
  translation-only fixed planar axes。`INERTIAL`、`VELOCITY`和未知值在旧tracking/framing/request/event mutation前同步
  `DeveloperError`。
- Entity `orientation`允许继续存在并供visualizer使用，但planar tracker不读取它，不旋转Camera frame。JSDoc、ADR与Guide必须明确，
  不能宣传body-frame tracking。
- 当前position为`undefined`表示Entity在该时刻不可用：assignment仍成立，Camera和input authority保持原状态，待后续Clock frame恢复；
  defined position必须是finite `Cartesian3`。
- `viewFrom`只在该Entity首次获得Camera authority时采样。Defined value必须是finite、non-zero `Cartesian3`，按固定world axes
  解释；undefined时进入bounds/current-camera fallback。已经active后不逐帧重采样`viewFrom`。
- 静态profile在public setter publication前验证；time-dynamic position与authority acquisition时采样的viewFrom必须在对应Camera
  mutation前验证。动态invalid不得部分修改Camera、offset、listener、token或tracked publication。

### Acquisition and per-frame Camera contract

- 新增唯一basename的SceneGIS-owned private tracker/controller，持有widget、Entity、definition listener、fixed offset、last state和全部scratch；
  不持有provider、World ownership或GPU资源，不使用timer、Promise、DOM input listener或模块全局registry。
- Tracker由planar CesiumWidget按需创建并注册一次；无target时`enabled=false`，replacement复用同一实例，widget destroy前显式
  unregister/destroy。ControllerHost registration必须晚于V1 planar camera controller；不支持同时注册第二个Camera input authority。
- `firstUpdate`只验证host Scene/World/registration，不重复移动Camera；`update(scene,time)`在
  `DataSourceDisplay.update(time)`之后消费同一显式JulianDate。
- 首次finite position：
  1. defined valid `viewFrom`时直接以该fixed offset调用I1 planar `camera.lookAt`；
  2. 无viewFrom且bounds为PENDING时等待，不获取input token；
  3. bounds为DONE时先用I1 `camera.viewBoundingSphere`取得完整frustum framing，再以Entity position建立translation-only look-at并保存
     fixed offset；
  4. bounds为FAILED时使用当前Camera world position减Entity position作为fixed offset并面向target；若结果nonfinite或zero，抛
     `DeveloperError`且Camera/token不变。
- authority建立后，每个host frame以当前finite Entity position与保存的fixed offset更新`camera.lookAt`。position临时undefined时保留
  最后Camera/offset及已获取的input suspension，恢复后继续。
- Direct I1 Camera flight存在`camera._currentFlight`时tracker不覆盖tween；tracking publication和token保留，flight complete/cancel后按当前
  Clock position恢复跟随。`viewer.zoomTo/flyTo`则在成功Camera candidate进入mutation时清除tracking，不在framing PENDING、empty、
  all-FAILED或validation failure时误清除。
- Stop/replacement把Camera从translation-only target transform恢复到`Matrix4.IDENTITY`而保持world pose，再release token；若有active
  Camera flight，不能破坏其published candidate。Camera恢复与token释放必须failure-safe/exactly once。

### Input authority and lifecycle

- `SceneGISPlanarCameraController`新增独立`_trackingSuspensionCount`与
  `_suspendForEntityTracking/_resumeFromEntityTracking`soft-private token。`update/firstUpdate`在flight或tracking任一count非零时清空
  aggregator并跳过navigation/terrain-clearance；不得改写caller `enabled`。
- Tracker只在首次成功Camera mutation前获取matching registered planar controller token；低层CesiumWidget没有该controller时仍可track。
- Flight token和tracking token允许嵌套、乱序complete/cancel；每个token只resume一次。clear、replacement、Entity/DataSource removal、
  Home、successful framing、controller disconnect、widget destroy均释放tracking token；下一normal controller frame重新sync rig并恢复
  terrain clearance。
- Active Entity的`definitionChanged`只用于请求一帧更新；replacement/clear/destroy移除listener exactly once。Same-reference setter和
  stable frame不得重复注册、重复request或泄漏token。

### CesiumWidget and Viewer integration

- `CesiumWidget.js`通过paired `SGP-0006`在trackedEntity setter/destroy的最小位置委托private tracker。Planar candidate必须先
  validate，再cancel I2 framing、publish `_trackedEntity`/event/requestRender；invalid replacement不能清除旧tracking或pending framing。
- Earth/Globe、`globe:false`与generic custom World继续逐字走原`EntityView`、legacy controller和setter lifecycle。
- `Viewer.js`以SGP-0006取代SGP-0002的defined-tracking guard与double-click omission；不嵌套marker，不改变SGP-0002其他hunks。
- Private tracker提供side-effect-free trackability query供Viewer soft-private integration使用。Planar InfoBox camera在selected Entity可按当前时间
  tracking，或bounds为DONE可zoom时启用：已track同一Entity时click清除；可track时开始tracking；否则只对DONE bounds执行I2 zoom。
- Planar left-double-click对当前可track Entity赋值`viewer.trackedEntity`；否则保持I2 `zoomTo(entity)` fallback。Left-click selection不变，
  InfoBox不进入Earth `EntityView`。
- Home、successful zoom/fly、Entity collection removal、DataSource removal与Viewer destroy沿既有public清理入口停止tracking；selection不因stop
  自动清除。

### ADR, SGP, docs, and direct example

- 新建`ADR-0038-planar-entity-tracking.md`，记录fixed profile、ControllerHost authority、bounds fallback、interaction/lifecycle、
  `EntityView`隔离与upgrade seam；修订ADR-0006的tracking禁用历史边界，ADR-0037只作Camera dependency。
- 新增proposed `SGP-0006`，只登记`CesiumWidget.js`、`Viewer.js`、focused tests、ADR-0038与removal condition。
  `SGP-0001/0002/0004/0005`保持独立；被取代hunk可以换marker，但不得嵌套或扩大旧SGP理由。
- Architecture、DevelopmentGuide、PlanarWorldGuide、UpgradeChecklist同步public profile与仍不支持的inertial/body-frame行为。
- 只修改`Test/平面API集成.html`：在现有I1/I2中文lil-gui中增加本地time-dynamic fixed-position Entity、native Clock、
  track/stop与InfoBox/double-click说明；不把Environment/Surface页面能力重新堆回本页，不依赖公网成功。

## Affected paths

### Allowed product paths

- `.scenegis/upstream-patches.json`
- `packages/engine/Source/Widget/CesiumWidget.js`（upstream-owned；paired `SGP-0006` only）
- `packages/widgets/Source/Viewer/Viewer.js`（upstream-owned；paired `SGP-0006`及必要替换旧guard marker）
- 新增`packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTracker.js`
- `packages/engine/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityFraming.js`，仅successful framing与tracking互斥
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`，仅独立tracking suspension token

### Allowed Specs

- 新增`packages/engine/Specs/SceneGIS/DataSources/_private/SceneGISPlanarEntityTrackerSpec.js`
- 新增`packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEntityTrackingCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
- 必要时`packages/widgets/Specs/SceneGIS/SceneGISPlanarContentViewerSpec.js`，只覆盖真实pick/InfoBox交互

### Allowed docs, example, and delivery

- `Documentation/SceneGIS/Decisions/ADR-0038-planar-entity-tracking.md`
- `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
- `Documentation/SceneGIS/Architecture.md`、`DevelopmentGuide.md`、`PlanarWorldGuide.md`、
  `PlanarWorldUpgradeChecklist.md`
- `Test/平面API集成.html`；严禁读取/修改/暂存`Test/地形.html`
- `scripts/scenegis/verify-planar-packages.mjs`，仅用于installed JSDoc/API/private visibility资格
- `AgentDocs/planar-api-integration/**`现有index/extension/phase/review/handoff

### Forbidden in I3

- `EntityView.js`、`Entity.js`、PositionProperty implementations、`TrackingReferenceFrame.js`、`ControllerHost.js`
- `Camera.js`、`CameraFlightPath.js`、I1 private Camera/flight算法及其SGP-0004 hunk
- DataSourceDisplay、SceneGIS visualizers、InfoBox/SelectionIndicator widget源码
- World/Surface/Terrain/Environment、Shader、Worker、build/package manifests、generated files
- format loader、CRS转换、3D Tiles/Imagery/Voxel/point-cloud tracking
- `AgentDocs/planar-viewer-bootstrap/**`和项目负责人`Test/地形.html`

## Steps

1. Execution重审当前setter、tick/postRender、collection removal、ControllerHost priority、I2 framing与Viewer InfoBox/double-click，
   将真实源码偏差写入本plan；不得依赖旧聊天或旧line number。
2. 先新增ADR-0038草案和proposed SGP-0006 registration，再实现private tracker的validation/acquisition/lifecycle单元闭环。
3. 增加独立tracking suspension token及public CesiumWidget Specs，再加入最小CesiumWidget dispatch/destroy hook。
4. 让successful I2 framing与tracking互斥；证明PENDING/FAILED/cancel与Camera candidate failure不误清除。
5. 开放Viewer setter、double-click与InfoBox toggle/fallback，证明Globe、`globe:false`及generic path仍使用Earth behavior。
6. 用real Context及native Clock覆盖time-dynamic position、input ownership、Perspective/Orthographic、remove/destroy和warm resources。
7. 更新中文direct Test、JSDoc/ADR/formal docs/installed verifier，创建open review request并停止。Architecture批准前不请求manual gate。

## Validation

### Deterministic behavior and lifecycle

- Direct CesiumWidget及live/declarative planar Viewer覆盖valid Entity、same-ref no-op、undefined-current-position wait、FIXED
  Callback/Sampled position与AUTODETECT/ENU。
- Direct invalid target、missing/non-FIXED position、INERTIAL/VELOCITY、invalid finite position/viewFrom在旧tracking/framing/event/request/
  Camera mutation前失败；dynamic invalid sample保持最后Camera与state且无partial publication。
- viewFrom initial fixed offset、DONE bounds framing、FAILED current-camera offset与PENDING wait分别闭环；four-frustum math复用I1，不复制。
- Clock前进移动Camera；same time/stable position不泄漏listener/token/resource；position gap保留最后pose并恢复。
- tracking replacement、clear、Home、successful zoom/fly、Entity/DataSource removal、controller disconnect和destroy均exactly once释放。
- flight/tracking tokens可嵌套；direct Camera flight期间tracker不覆盖，complete/cancel后恢复；caller controller enabled原值不变。
- InfoBox track/untrack/zoom fallback与left-double-click工作；SelectionIndicator/description不变，Globe InfoBox/EntityView行为不变。

### Real Context and regressions

- Perspective与Orthographic representative经native Clock实际移动time-dynamic Entity和Camera；low-level no-controller path也可track。
- Active tracking阻止实际wheel/left/middle planar input；stop后下一frame输入与terrain clearance恢复。
- Tracking只改变Camera/CPU state；warm Surface tile/terrain mesh/DrawCommand/ShaderProgram/VA、imagery binding/texture、Environment
  light/body/atmosphere/SkyBox identities保持，command count与pick/depth不受污染。
- 运行focused SceneGIS tracker/controller/Widget/Viewer Specs及必要upstream `Widget/CesiumWidget`、`Viewer/Viewer` aggregates。

### Delivery and static

- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`。
- `node scripts/scenegis/verify-planar-packages.mjs`；生成声明/API只读验证，不进入status。
- Direct `Test/平面API集成.html`短浏览器检查；自动化不得依赖公网tile成功。
- Changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、official upstream audit、exact status/generated audit。
- Architecture批准后由项目负责人manual gate：Clock跟随、InfoBox/double-click toggle、tracking期间输入隔离、stop及zoom/fly/Home恢复。

## Acceptance criteria

- Public `CesiumWidget/Viewer.trackedEntity`在明确FIXED planar Entity profile下按native Clock工作，fixed axes、viewFrom和bounds
  acquisition可解释；Earth `EntityView`完全不变。
- Input、flight、framing、Home、remove、replacement、destroy没有Camera authority争夺、listener/token泄漏或重复event/request。
- Viewer double-click与InfoBox在track/untrack/zoom fallback之间行为明确；unsupported reference frame fail-fast，不产生伪ENU/VVLH。
- Globe、`globe:false`、generic custom World与I1/I2 public behavior无回归。
- ADR-0038、ADR-0006、SGP-0006、JSDoc/types/docs、direct Test和upgrade checklist闭环；upstream-owned仅两个窄文件，generated=0。

## Stop conditions

- 若必须修改`EntityView`、`ControllerHost`、Entity/PositionProperty、Camera/CameraFlightPath、DataSourceDisplay/visualizer、
  InfoBox widget或第三个upstream product file，停止并回报Architecture。
- 若FIXED position无法与某目标visualizer同Clock frame发布，不得引入timer或复制Earth transform；先提交源码证据。
- 若必须支持orientation/body frame或INERTIAL/VELOCITY才能完成基本tracking，停止并把它作为后继profile讨论，不得静默忽略语义。
- 若I2 framing无法在失败原子性下终止tracking，先报告transaction blocker，不得通过全局状态或prototype patch绕过。
- Architecture review、owner manual gate与独立checkpoint完成前，不commit/push、不进入I4。

## Execution source audit and implementation

- 实际call order与plan一致：`CesiumWidget._onTick`先执行`DataSourceDisplay.update(time)`，随后`Scene.render(time)`中的
  `ControllerHost.update(scene,time)`消费同一native Clock time；无需修改`ControllerHost`、`EntityView`或visualizer。
- 新增lazy one-per-widget `_SceneGISPlanarEntityTracker`。Static replacement先完整验证；dynamic sample在Camera/token mutation前
  验证；PENDING不发布，DONE复用I1 `viewBoundingSphere`，FAILED从当前world pose生成fixed offset。Position gap保留最后pose，
  稳定frame重新assert fixed `lookAt` authority且不分配新scratch对象。
- Tracking token与flight token独立；tracker在direct Camera flight期间等待，complete/cancel后的下一host frame恢复。Successful I2
  framing、Home、replacement/clear、Entity removal、disconnect/destroy释放listener、Camera transform与token exactly once。
- `CesiumWidget.js`与`Viewer.js`只增加paired SGP-0006 seams；被I3取代的tracking/InfoBox guard不与SGP-0002/0005嵌套。
  未修改`Camera`、`CameraFlightPath`、`EntityView`、`DataSourceDisplay`、InfoBox widget或第三个upstream product path。
- 实现偏差：无scope或public profile偏差。Installed documentation verifier以tar内实际`CesiumWidget.js`/`Viewer.js`锁定新增
  JSDoc exception，以生成API HTML `trackedEntity` anchor锁定public member；JSDoc对property exception不渲染到HTML正文。

## Execution validation results

| Scope                              | Result                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| private tracker                    | `TOTAL: 6 SUCCESS`                                                                                             |
| real-Context planar Widget         | `TOTAL: 3 SUCCESS`                                                                                             |
| planar Viewer aggregate            | `TOTAL: 23 SUCCESS`                                                                                            |
| independent flight/tracking tokens | `TOTAL: 2 SUCCESS`                                                                                             |
| existing I2 framing regression     | `TOTAL: 11 SUCCESS`                                                                                            |
| upstream CesiumWidget / Viewer     | `TOTAL: 75 SUCCESS` / `TOTAL: 59 SUCCESS`                                                                      |
| build/release/types/docs/tsc       | passed                                                                                                         |
| installed package verifier         | passed; 12/12 GLSL, 12/12 generated modules, I3 JSDoc/API/private delivery                                     |
| direct Test Chromium               | passed with public-network requests deliberately blocked; Clock step moved Camera, stop/BFCache/cleanup passed |
| official upstream audit            | passed; current delivery upstream-owned=2, SGP-0006, generated=0                                               |

Direct smoke记录的console resource failures均来自测试主动拦截OSM/Esri公网请求；page/module、GUI、tracking与lifecycle无
`pageerror`。未运行full suite、E2E、Sandcastle或public-network success；未运行I4相关Scene API资格。

## Architecture initial review

- Status：`changes-requested`；[review](../reviews/2026-08-14-i3-planar-entity-tracking.md)记录I3-R001-R004。
- I3-R001：framing必须在tracking-clear同步callback前发布实际Camera flight identity，避免reentrant replacement留下stale flight。
- I3-R002：已取得tracking authority后必须在position-gap/direct-flight early return前迁移registered controller token。
- I3-R003：已track selected Entity在position gap期间仍须保留InfoBox untrack action。
- I3-R004：ADR区分static pre-publication validation与time-dependent pre-authority validation。
- 修复轮只运行affected focused Specs与静态/audit检查；不重复broad build/package、direct browser或manual gate。

## Architecture focused re-review

- I3-R001、I3-R003与I3-R004已关闭。
- I3-R002仍有residual：active tracker在读取caller-owned`CallbackPositionProperty`前reconcile controller；callback内部A remove/B add
  后若返回undefined，B会在同一host frame保持unsuspended。
- 最终顺序必须为dynamic position read/validation → existing-authority controller reconciliation → position-gap/direct-flight early
  return；initial PENDING保持token-free。
- 只补callback内controller replacement focused regression与affected static/audit；其余证据不重复。

## Focused correction result

- I3-R001：actual Camera flight在任何tracking-clear callback前发布到current framing operation；reentrant replacement可同步
  cancel旧flight，stale callback不能settle新operation。
- I3-R002：active tracker在position gap/direct flight return前迁移registered controller token；initial PENDING保持token-free，
  controller replacement与clear/destroy均exactly-once resume。
- I3-R003：已track selected Entity在undefined sample/PENDING bounds期间仍保留InfoBox untrack action，且不会启动framing。
- I3-R004：ADR-0038已对齐static pre-publication与time-dependent pre-authority validation层次。
- Focused evidence：EntityZoom Widget `11/11`、private tracker `7/7`、planar Viewer `23/23` SUCCESS。Broad
  build/package/render/browser未重复；scoped static/diff/official audit通过，current delivery upstream-owned=`2`、
  SGP=`SGP-0006`、generated=`0`；等待Architecture focused re-review，manual gate仍禁止。

## I3-R002 residual correction result

- Dynamic position read/validation现先于existing-authority controller reconciliation；position getter内发生controller replacement
  时，tracker会迁移到getter返回后的registered controller，再进入position-gap/direct-flight return。
- 新focused regression覆盖callback内部A remove/B add并返回undefined；同一host frame中A resume once、B suspended/no Camera
  mutation，clear/destroy exact release。既有pre-frame A→B与direct-flight B→C证据保留。
- Private tracker `TOTAL: 8 SUCCESS`；只重复指定static/diff/audit，等待Architecture关闭R002 residual。

## Architecture second focused re-review

- I3-R002已关闭；dynamic position read/validation、controller reconciliation与early return顺序符合契约。
- I3-R005 open：position/viewFrom Property callback可reentrant clear/replace tracked target，tracker必须在candidate返回后核对target
  transaction identity，禁止用旧sample为新/空target取得Camera或token authority。
- 修复只限private tracker、focused Spec及I3 AgentDocs；不重复其他验证。

## I3-R005 correction result

- Tracker以monotonic target revision建立transaction；position、initial viewFrom与bounds caller candidate返回后均在任何
  Camera/token/published offset mutation前核对entity/revision。Same-reference setter不递增revision。
- Focused regression覆盖position callback clear、position callback A→B replacement、initial viewFrom replacement与same-reference
  no-op；stale candidate无异常、无Camera/token publication，新target下一host frame才取得authority。
- Private tracker `TOTAL: 9 SUCCESS`；仅重复指定static/diff/audit，等待Architecture关闭I3-R005。

## Architecture final review

- I3-R005已关闭；target revision与position/viewFrom/bounds transaction guards符合failure-atomic contract。
- I3-R001-R005全部closed，Architecture/code review approved。
- 项目负责人已在`Test/平面API集成.html`完成native Clock tracking、InfoBox/double-click、tracking input isolation及
  stop/zoom/fly/Home恢复manual gate并明确通过。
- Architecture已创建I3独立本地checkpoint `63cf8bbe44`（not pushed）；I3 completed，I4未进入。
