# 总体计划：平面 Cesium Public API 融合

## Metadata

- Plan type: `extension`
- Status: `completed`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Parent checkpoint: `b6377c5e6e865c8c04041359f99d952c15be17e3`
- Related discussions:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- Related reviews:
  [I1 review](../reviews/2026-08-14-i1-planar-camera-view-flight.md)
- ADR: I1新建；后续按phase决定
- SGP: I1新建Camera integration SGP；`SGP-0001`/`SGP-0002`作为既有依赖

## Objective

让已完成的真正平面World不只能够“显示和交互”，还能够在语义明确的范围内使用Cesium既有公共Camera、Viewer、
Entity/DataSource与Scene API。适配必须沿固定米制Cartesian3、`+X East / +Y North / +Z Up`传播；不能通过
伪造Cartographic/ECEF或复制完整Globe算法换取表面兼容。

## Non-goals

- 不支持3D Tiles/ECEF、GeoJSON/CZML/KML自动坐标转换、runtime CRS推断或重投影。
- 不改变Cartographic、Rectangle、Ellipsoid或Geographic/WebMercator projection的公共语义。
- 不在本扩展实现平面阴影、天气、split/cutout、day/night imagery、clustering或runtime World切换。
- 不保证所有Cesium target/options自动可用；每个公共入口公开精确supported profile，对其余组合fail-fast。
- 不修改生成文件，不通过prototype monkey patch、全局状态或加载顺序接入。

## Stable architecture boundaries

1. 平面Camera local frame是固定world axes，不随target变化；target frame只使用translation，不能调用ellipsoid ENU。
2. Camera position/destination继续使用world `Cartesian3`。平面`setView/flyTo`不接受`Rectangle`，不接受
   `flyOverLongitude`/`flyOverLongitudeWeight`，不产生或公开伪`Cartographic`。
3. Heading从`+Y`向`+X`顺时针，pitch从XY plane计，roll围绕view direction；必须与既有
   `_SceneGISPlanarCamera.getAxes/getHeadingPitch`、Controller和`HeadingPitchRange`约定一致。
4. 平面flight按Cartesian position与orientation插值，保留Cesium tween、duration/easing、complete/cancel、
   `cancelFlight/completeFlight`及requestRender行为。不得调用`CameraFlightPath.createUpdate3D`的Cartographic路径。
5. flight input authority必须覆盖注册的planar camera controller；不能只切换legacy
   `screenSpaceCameraController.enableInputs`。暂停/恢复必须保留caller原始enabled状态并在complete/cancel/error中exactly once恢复。
6. Camera的主体算法位于SceneGIS-owned private模块；upstream `Camera.js`/必要`CameraFlightPath.js`仅做world-aware窄hook。
7. I1不解除Viewer `zoomTo/flyTo/trackedEntity` guard。I2仅开放SceneGIS Entity/DataSource bounds profile；native
   ImageryLayer、3D Tiles、Voxel、TimeDynamicPointCloud等target在planar Viewer中仍明确拒绝。
8. I3 tracking使用SceneGIS-owned planar tracker/Controller；不修改或复制`EntityView`的Earth inertial/ellipsoid算法。
   第一版tracking只接受FIXED planar Cartesian positions与已批准`viewFrom` profile。
9. 通用Scene Cartesian screen/pick API优先复用；ellipsoid-only API保持原类型并在planar scene明确guard。现有
   `world.getTerrainHeight/pickTerrain`与`SceneGISPlanarTerrainSampler`继续是平面height接口。
10. Native Fog/Shadow等读取`Camera.positionCartographic`的能力在没有独立planar implementation前不得静默生效。
11. Globe、`globe:false`、live World与declarative `planarWorld`全部保持兼容。任何upstream修改登记paired SGP并审计。
12. Direct示例按大扩展拆分；本扩展使用`Test/平面API集成.html`与中文lil-gui。项目负责人自有
    `Test/地形.html`不读取、不修改、不暂存。
13. Phases串行；每phase经过Architecture review、必要人工gate与独立本地checkpoint后才细化下一phase。

## Source and baseline facts

- Branch=`feature/planar-api-integration`，base/checkpoint=`b6377c5e6e865c8c04041359f99d952c15be17e3`。
- V1已允许`Viewer({planarWorld})`直接创建resolved World/controller/Home；当前planar
  `trackedEntity`、`zoomTo/flyTo`及InfoBox camera仍由`SGP-0002`明确禁用。
- `Camera.setView`、heading/pitch/roll getters、direction/up转换、`lookAt`与bounding-sphere方法使用ellipsoid ENU。
- `CameraFlightPath.createTween`的SCENE3D path把起终点转换为Cartographic、插值经纬高并禁用legacy inputs，不能用于planar。
- `_SceneGISPlanarCamera`已有四frustum、world/local pose、fixed-axis HPR、ray、Home和robust finite validation；I1应扩展而非复制。
- `DataSourceDisplay.getBoundingSphere`已能从八个SceneGIS child visualizer联合world-space bounds；I2无需另建bounds系统。
- `EntityView`依赖ellipsoid/inertial transforms；I3必须隔离实现。
- `SceneTransforms`在SCENE3D原样使用world Cartesian；pick/depth与screen transforms具备复用基础。
- completed前序扩展无open discussion/unresolved review。明确deferred项均为独立候选，不阻塞本扩展。

## Phase roadmap

<!-- markdownlint-disable MD060 -->

| Phase | Objective                                                                                 | Dependencies                      | Entry gate                                                                  | Exit gate                                                                                                              | Status             | Phase plan                                                    |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| I1    | 适配Camera fixed-axis HPR、setView/lookAt/bounds、Cartesian flight与Home。                | V1 checkpoint、ADR-0004/0024-0026 | 审计Camera/CameraFlightPath、ControllerHost与四frustum helper。             | Focused/unit/real-Context证明Camera public APIs、flight生命周期与Globe non-regression；ADR/SGP闭环。                   | `completed`        | [I1](2026-08-14-phase-i1-planar-camera-view-flight.md)        |
| I2    | 开放Viewer/CesiumWidget对supported planar Entity/DataSource的zoomTo/flyTo与InfoBox zoom。 | I1 checkpoint                     | 重审zoom target resolution、bounds、Promise与SGP-0001/0002。                | live/declarative Viewer对单/多Entity、Collection、CustomDataSource framing/flight闭环；unsupported targets fail-fast。 | `completed`        | [I2](2026-08-14-phase-i2-planar-entity-datasource-framing.md) |
| I3    | 为Viewer/CesiumWidget提供time-dynamic planar trackedEntity与交互入口。                    | I2 checkpoint                     | 重审EntityView、Clock tick、ControllerHost priority、viewFrom/orientation。 | Public tracking、double-click/InfoBox、stop/remove/destroy与input ownership闭环；Earth EntityView不变。                | `completed`        | [I3](2026-08-14-phase-i3-planar-entity-tracking.md)           |
| I4    | 资格确认通用Cartesian Scene API并为globe-only API/native effects建立明确安全边界。        | I3 checkpoint                     | 重审SceneTransforms、Picking、Fog、Shadow、format/widget guards。           | screen/pick APIs有证据；ellipsoid-only/unsupported paths不再静默错误；文档矩阵完成。                                   | `completed`        | [I4](2026-08-14-phase-i4-planar-scene-api-safety.md)          |
| I5    | 统一dev/release/npm/types/docs/E2E与升级交付。                                            | I4 checkpoint                     | 重审installed packages、E2E fixed ports与最小联合场景。                     | Camera→Viewer→tracking→Scene safety在dev/release/npm和direct Test统一闭环，无open finding。                            | `review-requested` | [I5](2026-08-14-phase-i5-unified-qualification-delivery.md)   |

<!-- markdownlint-enable MD060 -->

## Cross-phase validation

- 每phase覆盖Globe、`globe:false`、live planar World与declarative planarWorld non-regression。
- Camera/Controller热路径验证no per-frame unbounded allocation、callbacks、requestRender、cancel/complete、destroy与input恢复。
- 公共API变化运行focused Specs、build-ts/build-docs/tsc与installed verifier；生成文件不得进入Git。
- 真实Context至少覆盖Perspective与Orthographic representative；private math覆盖四frustum及large finite coordinates。
- Direct `Test/平面API集成.html`用中文GUI提供manual Camera/Viewer/track入口；自动化不依赖公网。
- 每phase运行changed-scope lint/format、`git diff --check`、official upstream audit与exact status/generated audit。

## Global risks and dependencies

- Camera.js/CameraFlightPath.js/CesiumWidget.js/Viewer.js均是高频upstream seam；升级风险高，必须将算法主体集中在SceneGIS-owned模块。
- Cesium flight preload camera、tweens、requestRender与controller input恢复存在交叉时序；candidate creation失败必须保持Camera/flight/controller原状态。
- Bounding-sphere framing需要兼容Perspective/OffCenter/Orthographic/OffCenter，不能沿用只认识`fovy`的上游距离函数。
- Terrain clearance controller每帧可能纠正programmatic pose；flight与tracking必须与其协作，避免帧间争夺Camera authority。
- `Camera.positionCartographic`在Cesium内部被Fog、Shadow、3D Tiles等读取；I4必须阻止unsupported capability被误认为已适配。
- Public API“同名兼容”必须以supported input/options profile表述，不得宣传所有Globe overload受支持。

## Overall acceptance criteria

- Planar Viewer中常用`camera.setView/flyTo/lookAt/viewBoundingSphere/flyToBoundingSphere/flyHome`使用平面Cartesian fixed axes，
  duration/cancel/complete/input恢复和四frustum行为可验证。
- `viewer.zoomTo/flyTo`可对SceneGIS Entity/DataSource公共类型工作；`trackedEntity`可按Clock更新且与planar controller协调。
- 通用screen/pick API有明确资格；globe-only输入和native effects不会返回貌似合理但语义错误的结果。
- Globe与无World Viewer完全不变；所有upstream补丁、ADR、Specs、types/docs、dev/release/npm、direct Test与upgrade checklist闭环。
- 3D Tiles、格式转换、阴影等独立候选被明确列出而非伪装完成。

## Progress and handoff

- Public API compatibility discussion已resolved；I1-R001-I1-R003已closed，focused aggregate `68/68`、Camera Widget
  `2/2`通过，Architecture/code review approved，项目负责人manual gate passed。
- I1使用`SGP-0004`只修改`Camera.js`；`CameraFlightPath.js`和Viewer/CesiumWidget guards相对base byte-for-byte不变。
- Architecture已创建I1独立本地checkpoint `ff7c1916d6604400465414305f3f647ef9347d5c`
  （`实现平面相机视图与飞行接口`，not pushed）；I2已根据该checkpoint完成源码审计与confirmed phase plan。
- I2边界为Entity/DataSource framing、Promise/lifecycle和InfoBox zoom-only；tracking/double-click与Globe-specific targets继续留后。
- I2 implementation/evidence已完成：新增private operation helper与proposed SGP-0005，focused Widget `10/10`、planar Viewer
  `22/22`、real-content Viewer `3/3`、upstream CesiumWidget `75/75`、Viewer `59/59`通过；build/types/docs/package/audit通过。
  Architecture initial review的I2-R001/R002已窄修复；补充focused Widget `11/11`、Viewer `23/23`通过；focused
  re-review approved、findings closed。项目负责人direct Test manual gate已通过；Architecture已创建I2本地checkpoint
  最终checkpoint `e755ad95a2`（`实现平面实体与数据源定位`，not pushed）。阶段外Test示例拆分checkpoint=
  `74b41bb999`，本扩展direct page已迁移为`Test/平面API集成.html`。
- I3 implementation/evidence已完成：SceneGIS-owned lazy tracker只接受FIXED Entity与AUTODETECT/ENU fixed axes，按native
  Clock在ControllerHost阶段持有Camera authority；独立tracking suspension token可与I1 flight token嵌套，successful I2 framing、
  Home/remove/destroy均释放tracking。Viewer double-click与InfoBox恢复track/untrack/zoom fallback，Globe/default Earth EntityView
  分支保持。新增ADR-0038与proposed SGP-0006；focused tracker `6/6`、Widget `3/3`、Viewer `23/23`、controller token
  `2/2`、upstream CesiumWidget `75/75`、Viewer `59/59`通过，build/types/docs/package/audit与direct Test短smoke
  通过既定边界。Architecture首轮finding I3-R001-R004已由Execution窄修复；补充focused EntityZoom `11/11`、tracker
  `7/7`、Viewer `23/23`通过。第一次focused re-review关闭R001/R003/R004并发现R002 callback-reentrancy residual；该
  residual已按dynamic validation → authority reconciliation顺序修复，private tracker `8/8`通过，等待第二次focused
  re-review。第二次focused re-review关闭R002并发现R005 caller Property target transaction；现已加入monotonic target
  revision及position/viewFrom/bounds post-callback检查，private tracker `9/9`通过。Architecture/code review现已approved，
  I3-R001-R005全部closed；项目负责人已完成Clock tracking、InfoBox/double-click、tracking input isolation及
  stop/zoom/fly/Home manual gate并明确通过。Architecture已创建I3独立本地checkpoint `63cf8bbe44`
  （`实现平面实体跟踪`，not pushed）；最终amend后I3 checkpoint/base为
  `dfc8be40a92503b01b8ae9938a0e2ae581e3a878`。Architecture已按该base完成I4源码审计并确认
  [I4 phase plan](2026-08-14-phase-i4-planar-scene-api-safety.md)：通用Cartesian screen/pick直接资格确认；native
  height/clamp与三个globe-only Camera方法fail-fast；Fog/Shadow/native Earth environment在构造与frame mutation前双层guard；
  `positionCartographic`/`Scene.ellipsoid`保持Cesium internal-only而不伪造planar语义。
- Owner untracked `Test/地形.html`保持排除。
- I4 implementation/evidence已完成：新增SceneGIS-owned Scene API helper、proposed `SGP-0007`与`ADR-0039`，四个native
  height/clamp入口和三个globe-only Camera入口fail-fast，constructor/frame native-effect boundary闭环；focused aggregates为
  Scene API `3/3`、World `25/25`、Camera Widget `3/3`、private Camera `68/68`、Viewer `23/23`、upstream
  Camera/CesiumWidget/Scene `241/75/392`。Build/types/docs/package/direct Test/static/audit通过，upstream-owned=`4`、
  generated=`0`；现等待Architecture review，不请求manual gate、不进入I5。
- Architecture finding I4-R001已addressed：ADR-0039/I4 supersede E4早期visible native generic background public配置，
  `SceneGISPlanarEnvironment`成为live non-Globe唯一受支持sky/atmosphere/body路径；opaque mask仅保留为private defensive seam。
  本轮只修正式文档/AgentDocs，未修改产品/Specs/Test/SGP。Architecture focused re-review已关闭I4-R001并批准code review；
  项目负责人I4中文manual gate已通过。Architecture已创建I4独立本地checkpoint `22bd7e1c29`
  （`实现平面 Scene API 安全边界`，not pushed），最终amend/base=`0c95a54024`；I4 completed。
- Architecture已审计现有release E2E、installed verifier、ADR/SGP状态与direct Test，确认
  [I5 phase plan](2026-08-14-phase-i5-unified-qualification-delivery.md)：补一个blocked-network public bundle联合case、显式锁定
  V1/I1-I4 private helper tar/soft-private delivery、批准ADR-0037-0039并激活SGP-0004-0007。I5不修改product Source/Test页面，
  不新增manual gate。
- I5实现与非E2E证据已完成：focused Camera/EntityZoom/EntityTracking/Scene API/Viewer合计`3/11/3/3/23` SUCCESS；
  build、release、types、docs、tsc与installed verifier通过，verifier锁定`12/12` GLSL、`12/12` generated modules和V1/I1-I4
  private tar/soft-private/public hiding；existing root server上的blocked-network direct Test smoke通过。`ADR-0037`至`ADR-0039`
  已approved，`SGP-0004`至`SGP-0007`已active。PID 11948占用8080/8081，Architecture确认这是environment-only blocker并禁止
  Execution终止、重配或轮询；dev/release同一I5 E2E case等待owner授权释放端口。
- Architecture finding I5-R001已addressed：HomeButton触发后先证明tracking同步清理与non-zero Home flight已启动，再显式
  `completeFlight()`，锁定最终Home position/direction/up、`_currentFlight`与flight suspension归零；qualification和外部expect均
  包含start/settlement结果。未运行E2E，等待Architecture focused re-review关闭finding及后续端口授权。
- Architecture focused re-review已关闭I5-R001并批准code/non-E2E evidence。首次owner-authorized dev E2E初次/retry均在整个
  `page.evaluate`达到30秒timeout；release按协议未运行，Architecture已恢复root service PID 30060。根因是关闭default render loop后
  Entity zoom、DataSource fly与tracking-clear zoom只render一帧即await frame-driven Promise。I5-R002现已addressed：每个Promise使用
  fixed maximum frame pump；DataSource fly先锁定同一operation发布actual Camera flight、显式complete，再泵原Promise；耗尽错误包含
  operation/framing/flight/tracker状态。未提高timeout、未sleep、未修改产品/config；等待focused re-review，禁止重跑E2E。
- Architecture关闭I5-R002后，第二次owner-authorized dev E2E由pump在约3秒内确定性报告Entity zoom连续120帧仍PENDING；release
  未运行，root service已恢复为PID 33344。Architecture诊断`DataSourceDisplay._ready`仍false，因为tight render+microtask chain没有
  让首次`ApproximateTerrainHeights` JSON completion browser task运行。I5-R003现已addressed：每个fixed-budget iteration先等待
  `requestAnimationFrame`，再显式`viewer.render()`与两轮microtask drain；diagnostics增加DataSourceDisplay ready与default planar
  visualizer gate exists/activated/count。未使用sleep、wall clock、default loop、第二Viewer或private initialization，等待focused
  re-review且禁止重跑E2E。
- Architecture关闭I5-R003后，第三次owner-authorized dev E2E已完成`page.evaluate`，仅返回`dataSourceFlew=false`与
  `homeFlightStarted=false`；release未运行，root service已恢复为PID 30828。I5-R004修复explicit planar
  `completeFlight()`的cancel-before-complete语义，focused CameraFlight `9/9`与EntityZoom Widget `12/12`通过；I5-R005按
  `SceneGISPlanarHomeButton`真实同步Home契约撤销错误的flight-start要求，改为`homeApplied`与`homeStayedFlightFree`。
  `npm run build`与`npm run build-release`通过。R004/R005现为addressed，等待Architecture focused re-review和新的owner端口授权；
  不运行E2E、不commit、不push。
- Architecture关闭R004/R005后的owner-authorized dev case中，全部qualification、network/page/browser error arrays均通过，仅intentional
  Fog guard rejection被CesiumWidget error panel写入`consoleErrors`；release未运行，root service已恢复为PID 33124。I5-R006只在
  该单次`viewer.render()`周围保存并临时关闭`_showRenderLoopErrors`，在`finally`恢复精确旧值并由`fogErrorPanelRestored`锁定；
  `scene.rethrowRenderErrors=true`与全局collectors保持。R006现为addressed，等待focused re-review及新端口授权。
- Architecture关闭I5-R006并取得owner授权后，最终dev命令
  `npm run test-e2e -- Specs/e2e/scenegis-planar-release.spec.js --grep "planar API integration qualifies unified public delivery" --headed`
  为`1 passed`（test 4.0s / total 7.5s）；Windows process-local `release=true`配合同一config/project/spec/grep/headed为`1 passed`
  （test 2.9s / total 6.5s）。Timing case排除；qualification、destroy、`externalAttempts`、`badResponses`、`pageErrors`、
  `browserErrors`与`consoleErrors`全部通过/为空。Architecture已恢复root service PID 30388。
- `ADR-0037`至`ADR-0039`的`approved`和`SGP-0004`至`SGP-0007`的`active`现为最终delivery事实。Extension为
  `checkpoint-ready`，等待Architecture final review与独立本地checkpoint；建议提交信息`完成平面 API 融合统一交付`，未push。
- Architecture已创建I5/final extension本地checkpoint `a81bbecebdda3362decc8505dc31a96b14a82aa3`（short
  `a81bbecebd`，`完成平面 API 融合统一交付`，not pushed）。I1-I5全部completed，extension completed；当前无follow-up phase，
  handoff等待未来Architecture audit或新extension assignment。
