# Phase Plan: I1 Planar Camera View and Flight

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Planar API integration extension](2026-08-14-planar-api-integration-extension.md)
- Phase: `I1`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Related discussion:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- Related reviews:
  [I1 review](../reviews/2026-08-14-i1-planar-camera-view-flight.md)
- ADR: create one new Camera fixed-axis/flight ADR in this phase
- SGP: create one new proposed/active Camera integration SGP before editing upstream-owned files
- Architecture checkpoint: created locally（`实现平面相机视图与飞行接口`；稳定hash由后续phase作为parent记录）

## Objective

让`scene.camera`在primary World为live `SceneGISPlanarWorld`时，以fixed planar axes实现常用public view/flight API，
同时完整保持Cesium Globe path。I1只解决Camera层，不解除Viewer/CesiumWidget对planar zoom/flight/tracking的既有guard。

## Non-goals

- 不修改`Viewer.js`、`CesiumWidget.js`的zoom/fly/tracking/InfoBox/double-click行为。
- 不实现Entity tracking、DataSource target resolution、3D Tiles、format conversion或Scene height API重载。
- 不支持planar `Rectangle` destination、`flyOverLongitude*`、Cartographic flight、2D/CV/morphing或runtime World切换。
- 不把programmatic Camera flight强制限制在world extent或terrain surface；surface controller现有clearance policy保持。
- 不借机重构上游Camera/CameraFlightPath、改变Globe interpolation、默认duration/easing或公共回调语义。

## Entry conditions

- V1 checkpoint=`b6377c5e6e865c8c04041359f99d952c15be17e3`，branch=`feature/planar-api-integration`。
- `planar-world`、`planar-terrain-advanced`、`planar-content`、`planar-environment`与V1均无open review。
- Compatibility discussion resolved；Architecture confirmed本phase。
- Execution开始前读取root/engine AGENTS、DevelopmentGuide相关章节、Architecture、ADR-0004/0006/0024-0026、
  本extension index/plan/discussion和本phase plan。

## Current source facts

1. `Camera.setView` SCENE3D调用`setView3D`，其local frame来自
   `Transforms.eastNorthUpToFixedFrame(position, camera._projection.ellipsoid)`；HPR getters和direction/up转换同样依赖ellipsoid ENU。
2. `Camera.lookAt`与`flyToBoundingSphere`围绕target创建ellipsoid ENU；`viewBoundingSphere`调用`lookAt`；`flyHome`
   通过`DEFAULT_VIEW_RECTANGLE`。
3. `CameraFlightPath.createTween`的SCENE3D update将start/destination转Cartographic后插值；默认easing也读取
   `camera.positionCartographic.height`。planar Cartesian必须走独立update path。
4. Camera flight只切换legacy `scene.screenSpaceCameraController.enableInputs`。Planar Viewer将legacy inputs永久设为false，
   并在`ControllerHost`注册唯一`SceneGISPlanarCameraController`；不能复用现有wrap callback来管理planar input。
5. `_SceneGISPlanarCamera`已提供four-frustum classification、world/local pose、fixed-axis `getAxes/getHeadingPitch`、
   robust normalize、world pose mutation、Home与ray math；可扩展为Camera adapter主体。
6. `SceneGISPlanarCameraController.enabled`是public boolean，setter会clear input state；controller可通过
   `scene.controllerHost`存在，但ControllerHost没有按world查询或全局input suspension API。
7. `Camera.flyTo`由Scene tween和`_currentFlight`管理cancel/complete；preload camera调用`setView`并生成culling volume。
8. Camera构造仍以Earth default rectangle建立初始pose，随后planar controller Home。I1不重写constructor；public API在World初始化后分流。

## Detailed design

### Planar detection and helper ownership

- SceneGIS-owned private helper必须基于live `scene.world instanceof SceneGISPlanarWorld`判断planar path，并验证scene mode为SCENE3D、
  World未destroy。不要以`mapProjection`、ellipsoid identity、CRS字符串或Camera坐标值推断。
- 扩展现有`_SceneGISPlanarCamera.js`或建立职责明确的`_SceneGISPlanarCameraFlight.js`；优先复用现有scratch与
  four-frustum helpers，所有逐帧flight update不得分配对象。
- Upstream-owned `Camera.js`和必要的`CameraFlightPath.js`只加入paired SGP dispatch。若源码审计证明无需改
  CameraFlightPath，则不制造无必要diff。

### Fixed-axis orientation

- Planar HPR遵循heading从`+Y`向`+X`、pitch从XY plane、roll绕view direction。必须与
  `_SceneGISPlanarCamera.getAxes/getHeadingPitch`及Cesium `HeadingPitchRange`可逆。
- `Camera.heading/pitch/roll` getter在planar scene读取world axes，不建立ENU transform。
- `setView`：只接受finite `Cartesian3` destination或省略destination保持当前位置；orientation支持完整direction+up或HPR。
  Direction/up必须finite、non-degenerate、正交化后可表示；失败在Camera mutation前原子抛错。
- `Rectangle` destination在planar scene同步`DeveloperError`；`convert`不改变Cartesian destination语义；non-identity
  `endTransform`只在能保持world pose/公共Cesium契约时支持，否则明确fail-fast并写入JSDoc/ADR，不能静默忽略。

### Look-at and bounding sphere

- Planar target frame为`Matrix4` identity rotation加target translation，不调用ellipsoid ENU。
- `lookAt`支持Cartesian offset与`HeadingPitchRange`，并保持fixed axes；`lookAtTransform`本身是generic transform API，
  除必要non-regression外不改其普通算法。
- `viewBoundingSphere`/`flyToBoundingSphere`必须使用有效frustum bounds计算range。Perspective/OffCenter与
  Orthographic/OffCenter四类均要覆盖；不得只读取`fovy/aspectRatio`。
- Default/zero range需要完整包围sphere并尊重near/far可表示性；invalid/overflow在Camera mutation前报错。

### Cartesian flight

- Planar flight position直接在world Cartesian坐标插值；orientation采用shortest heading/roll与pitch插值，或经过审核的
  quaternion/axes方案，但必须在大坐标、nadir和crossing情况下finite、连续、最终精确。
- `maximumHeight`/`pitchAdjustHeight`如保留，含义改为planar `Z` flight arc并在ADR/JSDoc精确定义；若不能无歧义复用，
  I1可明确拒绝而不是静默误解。
- `flyOverLongitude`/`flyOverLongitudeWeight`在planar scene始终同步拒绝。
- `duration<=0`、default duration、custom easing、complete/cancel、`cancelFlight`、`completeFlight`、second-flight replacement、
  requestRender与preload culling volume保持公共行为。

### Input authority

- Planar flight必须找到与`scene.world`绑定且当前注册的唯一`SceneGISPlanarCameraController`。不得按类名鸭子判断，也不得
  修改ControllerHost私有集合而不封装contract。
- 优先为`SceneGISPlanarCameraController`增加soft-private flight suspension token/ref-count contract，使Camera helper只调用
  narrow methods；不要直接把public `enabled=false/true`当作唯一恢复策略，因为必须保留caller原值并安全处理nested replacement/cancel。
- Flight开始清除held input并暂停；complete/cancel/zero-duration/candidate failure/destroy路径exactly once恢复开始前状态。
  没有planar controller的低层World Camera仍可执行flight，但不存在可暂停的输入owner；不得因此伪造controller。
- Surface mode现有terrain clearance仍由controller update拥有；flight每帧与controller不能争抢Camera。暂停期间不得执行
  clearance/input update；flight结束恢复后下一controller frame按既有policy纠正。

### Public documentation

- Camera现有JSDoc应增加planar branch的精确Cartesian/fixed-axis语义与unsupported options，不宣称Rectangle/longitude flight受支持。
- 创建ADR记录frame、option profile、flight interpolation、input suspension、ownership与upgrade seam。
- Architecture/PlanarWorldGuide/UpgradeChecklist只记录长期边界和升级检查，不提前写I2 Viewer行为。

## Affected paths

### Allowed product paths

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
- 必要时新增一个唯一basename的`packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCameraFlight.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`（仅input suspension narrow contract）
- `packages/engine/Source/Scene/Camera.js`（upstream-owned，new Camera SGP paired hook）
- `packages/engine/Source/Scene/CameraFlightPath.js`（仅若dispatch确有必要；同一new SGP）

### Allowed Specs

- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js`
- 必要时对应新增private flight Spec
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`
- 新建或扩展一个focused real-Context Widget Camera qualification Spec，路径保持`packages/engine/Specs/SceneGIS/Widget/**`
- 只在SGP manifest test inventory需要时更新对应`.scenegis/upstream-patches.json`

### Allowed formal docs and delivery

- 新ADR、`Documentation/SceneGIS/Architecture.md`、`PlanarWorldGuide.md`、`PlanarWorldUpgradeChecklist.md`
- `scripts/scenegis/verify-planar-packages.mjs`仅在public JSDoc/types/API或installed runtime资格确有变化时
- `Test/平面环境.html`增加中文Camera direct API控制；不得读取/修改`Test/地形.html`
- 本extension AgentDocs index/plan/review/handoff

### Forbidden in I1

- `packages/widgets/Source/Viewer/Viewer.js`
- `packages/engine/Source/Widget/CesiumWidget.js`
- DataSource/visualizer、World/Surface/Terrain/Environment renderer、Shader、Worker、build generator、package manifest和生成文件
- 任何现有Globe Camera算法的无关格式化、重构或复制

## Steps

1. Execution重新索引/发现Camera/CameraFlightPath/ControllerHost/planar helper调用关系，并把必要源码偏差写入phase plan。
2. 在修改upstream前创建new SGP manifest entry，登记精确files/tests/ADR/removal condition；SGP编号按当前清单顺序分配。
3. 先扩展SceneGIS-owned fixed-axis pose/framing/flight math和deterministic Specs，再增加最小upstream dispatch。
4. 增加planar controller flight suspension与lifecycle Specs；证明candidate failure/zero-duration/cancel/complete/replacement恢复。
5. 加真实Context representative：Perspective与Orthographic public Camera调用、实际frame/tween、input隔离、terrain clearance恢复、
   warm render resource identity与Globe non-regression。
6. 扩展`Test/平面环境.html`中文lil-gui：setView、flyTo、lookAt/bounds、cancel/Home；保持现有公开provider/environment/BFCache。
7. 创建ADR并更新formal docs/upgrade checklist；如公共声明变化，更新installed verifier。
8. 运行最小充分验证，写review request并停在I1；不得进入I2或解除Viewer guard。

## Validation

### Deterministic / focused

- `_SceneGISPlanarCamera`：HPR round-trip、direction/up、non-identity Camera transform、large finite coordinates、nadir heading、roll、
  four-frustum sphere range/pose、invalid atomicity。
- Flight：Cartesian start/mid/end、Z arc/option profile、duration 0/default/custom、easing、complete/cancel/completeFlight、replacement、
  requestRender、preload final culling、zero per-update allocation evidence。
- Input：registered enabled/disabled controller、held drag cancellation、no-controller low-level scene、candidate failure、destroy/replacement恢复。
- Globe representative：现有Camera/CameraFlightPath focused tests或最小upstream aggregate，证明dispatch未改变Globe path。

### Real Context

- 一个Perspective与一个Orthographic representative通过public `camera.setView/flyTo/lookAt/viewBoundingSphere/
flyToBoundingSphere/flyHome`产生预期planar pose/pixels。
- flight期间真实mouse/wheel不改变Camera；cancel/complete后恢复原controller authority；surface clearance在恢复后的下一frame工作。
- Terrain/imagery/Environment已发布资源的tile/command/shader/VA/mesh/texture identities在纯Camera flight中保持；无额外World request/GPU resource。

### Public delivery / static

- 受影响focused Specs；若public JSDoc/API改变则`build`、`build-release`、`build-ts`、`build-docs`、`tsc`和installed verifier。
- Direct root dev server manual gate只在Architecture/code review批准后请求项目负责人；panel文字中文。
- changed-scope ESLint/Prettier/Markdownlint、AgentDocs显式checks、`git diff --check`、official audit、exact status/generated audit。
- 不运行full suite、E2E、Sandcastle、公网自动化或I2 Viewer tests，除非源码事实证明受影响并先回报Architecture。

## Risks and dependencies

- Upstream Camera内部可能假设`_currentFlight`与legacy input controller成对；若无法以窄dispatch保持回调/恢复，Execution必须停止并报告，
  不得复制完整Camera.js/CameraFlightPath.js。
- `completeFlight`使用module-level `newOptions`最终态；planar candidate必须保持同一单flight invariant，不能引入并行flight。
- Orthographic range/frustum mutation与sphere framing可能需要专门逻辑；不得用Perspective公式近似。
- Programmatic flight到underground/extent外是合法Cartesian行为；controller恢复后surface policy可能纠正，这应作为明确时序而非flight bug。
- Camera constructor/preload clone仍经过Earth default initial pose；I1只保证planar World初始化后的public调用和preload final view，不能借机重写constructor。

## Completion criteria

- I1全部supported Camera APIs在planar scene使用fixed axes且无Cartographic/ellipsoid path；unsupported globe overloads同步明确失败。
- Flight callbacks、cancel/complete/replacement、input authority、requestRender、preload、four-frustum与resource/lifecycle证据通过。
- Globe non-regression、ADR、new SGP、JSDoc/types/docs/package（如适用）、direct中文示例和official audit闭环。
- Architecture/code review无open finding，项目负责人完成必要manual gate，Architecture创建I1独立checkpoint。
- Viewer/CesiumWidget zoom/fly/tracking guards保持未改；I2未进入。

## Deviations and results

- `CameraFlightPath.js`不需要dispatch；所有Cartesian tween与controller suspension位于新增SceneGIS-owned
  `_SceneGISPlanarCameraFlight.js`，唯一upstream diff为`Camera.js` paired `SGP-0004`。
- Nonidentity transform、large finite HPR、nadir/roll、四frustum center framing、Rectangle/fly-over同步拒绝、
  duration/default/custom easing、Z arc、callbacks、cancel/complete/replacement、preload、requestRender和candidate atomicity已实现。
- Registered controller通过ref-counted token清除/暂停input与clearance，保留caller `enabled`；无controller低层Scene继续支持flight。
  Real Context覆盖actual wheel isolation与flight后next-frame clearance。
- Real Context同时锁定terrain tile/mesh、Surface command/shader/VA、imagery binding/texture和Environment light warm identity。
- Architecture首轮finding I1-R001-R003已addressed：Home分别拟合extent width/height且controller/public flight共享helper；
  zenith/nadir HPR inverse按direction sign一致；zero-duration caller complete移到成功commit/rollback边界外。
- 新增focused closure覆盖tall/wide四frustum Home、zenith/nadir basis/public flight，以及nonidentity `endTransform`下
  throwing complete的终态与input/tween lifecycle。当前CoordinateSystem公共contract仍是square，controller tall fixture只通过
  soft-private owned extent隔离验证未来兼容Home数学，不改变公共API。
- Validation：SceneGIS Camera/controller/flight `68/68`，Camera Widget `2/2`，Environment Widget `10/10`，
  upstream Globe Camera/CameraFlightPath aggregate `241/241`；`build`、`build-release`、`build-ts`、`build-docs`、
  `tsc`与installed verifier均通过。
- Direct `Test/平面环境.html`已增加中文public Camera controls；Architecture/code review批准后，项目负责人已完成
  public Camera setView/lookAt/bounds/fly/cancel/complete/Home人工验收并明确通过。
- Viewer/CesiumWidget source与`CameraFlightPath.js`相对base byte-for-byte不变；未运行full suite、E2E、Sandcastle、
  public-network automation或I2 tests。
- I1-R001-I1-R003均已closed，自动化、Architecture review与owner manual gate全部关闭；Architecture已创建
  I1独立本地checkpoint（`实现平面相机视图与飞行接口`）已创建。I1 completed；checkpoint未push，I2尚未进入。
