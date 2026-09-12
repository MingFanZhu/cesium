# Review: I5 Unified Qualification and Delivery

## Metadata

- Status: `approved`
- Requested by: Execution Agent
- Reviewer: Architecture Agent
- Date: `2026-08-14`
- Base: `0c95a54024907c411932dfe4a8916b5e88c839a3`
- Phase plan: [I5](../plans/2026-08-14-phase-i5-unified-qualification-delivery.md)
- ADR: `ADR-0037`、`ADR-0038`、`ADR-0039` transitioned to `approved`
- SGP: existing `SGP-0004`、`SGP-0005`、`SGP-0006`、`SGP-0007` transitioned to `active`; no new SGP

## Review request

请Architecture审查I5的single public-bundle E2E design、installed private helper delivery、ADR/SGP final state、Guide/
UpgradeChecklist与非E2E evidence。当前working tree未commit/未push，extension仍active。固定端口E2E因owner root server占用
8080/8081尚未执行，等待Architecture协调授权；不得把该环境gate记录为passed。

## Architecture review findings

### I5-R001 — Medium — Home flight must be settled explicitly before the no-stale-authority assertion

新增E2E在`viewer.homeButton.viewModel.command()`后只渲染一帧并检查tracking已清理，但HomeButton默认以未指定duration调用
`camera.flyHome`，因此会创建一个非零时长planar flight。随后guard/Fog/pick路径没有显式`completeFlight`或`cancelFlight`；末尾
`camera.setView`也不会取消`camera._currentFlight`。用例最后却要求`camera._currentFlight === undefined`和flight suspension count为零，
结果会依赖测试执行耗时：通常直接失败，极慢环境下又可能偶然通过。

在Home命令后先证明tracking同步清理及Home flight已启动，再显式完成或取消该flight，并证明`_currentFlight`、flight token与最终Home
pose均已提交/释放，然后继续I4 guard与warm-resource路径。把相应Home flight start/settlement断言加入最终qualification对象。不得通过
sleep、降低duration、删除`noStaleAuthority`或依赖后续`setView`掩盖残留flight。

## Architecture review disposition

- Result: `changes-requested`；I5-R001关闭前不运行固定端口dev/release gate。
- Installed verifier、SGP status-only diff、ADR设计内容、Guide/UpgradeChecklist边界及既有非E2E证据未发现其他阻断项。
- `ADR-0037`至`ADR-0039`的approved状态、`SGP-0004`至`SGP-0007`的active状态及“dev/release已闭合”措辞，在dirty
  working tree中仍是待最终E2E通过后生效的交付候选；E2E通过前Architecture不批准、不checkpoint，也不得claim phase complete。
- Correction boundary仅限现有E2E spec和I5 AgentDocs结果回写。运行现有spec的scoped ESLint/Prettier、`git diff --check`与official
  audit即可；不要重跑focused suites/build/package/Test smoke，也不要修改product Source/Specs、Test页面、ADR、SGP manifest、Guide或
  UpgradeChecklist。
- 修复后先发送`changes-addressed`供focused code review。Architecture关闭I5-R001并取得项目负责人端口授权后，才运行同一named
  case的dev/release gate。

## Execution response to I5-R001

- 首次显式`camera.flyHome(1.0)`完成后保存Home `positionWC`、`directionWC`与`upWC`作为同一public Camera contract的确定性
  endpoint；不降低HomeButton默认duration。
- HomeButton command后立即证明`trackedEntity`同步清理，且`camera._currentFlight`已发布、planar controller flight suspension
  count为1；随后显式`camera.completeFlight()`并render一帧。
- `homeFlightSettled`同时锁定`_currentFlight === undefined`、flight suspension count归零以及最终Home position/direction/up与
  保存endpoint一致；`homeFlightStarted`和`homeFlightSettled`均进入qualification return与外部exact expect。
- 保留末尾`noStaleAuthority`原断言，后续`setView`不承担flight cleanup。没有sleep、duration缩短或产品改动。
- 只运行spec scoped Prettier/ESLint、I5 AgentDocs Prettier/Markdownlint、`git diff --check`与official audit；未运行E2E、focused
  suites、build/package或Test smoke。I5-R001现为addressed，等待Architecture focused re-review；fixed-port E2E仍禁止。

## Architecture focused re-review

- I5-R001：`closed`。HomeButton command后先独立锁定tracking同步清理与真实non-zero Home flight publication，随后显式
  `camera.completeFlight()`；最终断言同时覆盖flight identity清除、suspension token归零和position/direction/up Home endpoint。
- 保存的Home endpoint来自同一public planar `camera.flyHome(1.0)` + `completeFlight()`路径；修复不依赖sleep、默认duration缩短、
  后续`setView`或删除`noStaleAuthority`，因此消除了原先的执行耗时依赖。
- Architecture code/non-E2E review：`approved`。Installed verifier、ADR/SGP候选终态、Guide/UpgradeChecklist、ownership和既有
  focused/build/package/Test/static证据保持接受，Architecture未重复Execution验证。
- 唯一剩余gate是项目负责人授权临时停止PID 11948后，在dev/release运行同一个I5 named E2E case。该gate通过前review、phase与
  extension不得标记completed，不得commit/push；ADR/SGP最终状态与“dev/release已闭合”措辞仍不得作为已交付事实发布。

## Dev E2E failure and Architecture diagnosis

- 项目负责人授权后，Architecture核对并停止原PID 11948根服务，确认8080/8081释放。Execution运行dev named case；初次与retry
  分别在30.1s/31.3s超时，均停在整个`page.evaluate`，release按协议未运行。Architecture随后从仓库根入口恢复服务为PID 30060，
  8080/8081重新监听且`Test/平面API集成.html`返回HTTP 200。
- Trace没有inner exception；evaluate内部存在三类frame-driven Promise：Entity `zoomTo`、DataSource `flyTo`和tracking-clear
  `zoomTo`。Case设置`useDefaultRenderLoop: false`，但每个操作最多只执行一次`viewer.render()`后就直接`await`。若真实
  DataSourceDisplay bounds仍为`PENDING`，或flight尚未在该帧发布，await期间不会再产生ControllerHost/postRender frame，Promise
  永远不能settle，最终只能命中Playwright全局timeout。单纯增大test timeout不会改变该状态机。

### I5-R002 — Medium — Frame-driven Viewer operations need a bounded render pump instead of one-frame awaits

在现有case内部增加确定性的bounded frame pump：持续执行`viewer.render()`与microtask drain，直到当前operation Promise settle或达到
固定最大frame数；超界时抛出包含operation名称、framing operation、Camera flight和tracking状态的actionable error。Entity zoom与
tracking-clear zoom均通过该helper结算。DataSource fly先用bounded frames等待当前operation发布真实Camera flight，再显式
`completeFlight()`，随后继续bounded frames直到原Promise结算。

Helper按frame count而非wall-clock/sleep工作；不得提高Playwright timeout、启用default render loop、加入sleep、删除Promise/result/
flight start断言或把timeout当pass。可加入纯测试stage/operation diagnostics，但不得修改product/config。修复后先执行scoped
ESLint/Prettier、`git diff --check`、official audit并发送`changes-addressed`；Architecture关闭I5-R002且再次取得owner端口授权前，不运行
dev/release E2E。

## Execution response to I5-R002

- 新增`observeOperationPromise`，对每个原始framing Promise只建立一个明确的fulfilled/rejected settlement observation；没有替换或
  包装掉原operation identity。
- `pumpOperationPromise`最多执行120个frame。每个iteration调用`viewer.render()`并drain两轮microtask；Entity zoom与
  tracking-clear zoom都只通过该pump读取原Promise结果，不再在单帧后直接await。
- DataSource fly保存创建时的exact framing operation与observed original Promise；`pumpUntilFlightPublished`逐帧要求该operation仍为
  current，并锁定`operation.flight === camera._currentFlight`且flight defined。之后显式`camera.completeFlight()`，再由
  `pumpOperationPromise`结算同一个原Promise；`framingFlightStarted`保持并收紧为operation/flight/currentFlight同identity。
- Pump exhaustion、operation replacement或Promise在flight publication前提前settle都会抛actionable error。诊断包含operation名称、
  current operation是否为expected、settled/isFlight/entity count/flight、Camera current flight、flight suspension、tracked Entity及
  tracker authority/input token状态。
- 固定frame budget不读取wall clock；未加入sleep、未提高Playwright timeout、未启用default render loop，也未削弱boolean、Home、
  `noStaleAuthority`、warm resource或error/network assertions。没有产品/config改动。
- 按assignment只运行spec scoped Prettier/ESLint、affected AgentDocs Prettier/Markdownlint、`git diff --check`与official audit；未重跑
  dev/release E2E、focused suites、build/package或其他browser。I5-R002现为addressed，等待Architecture focused re-review。

## Architecture focused re-review of I5-R002

- I5-R002：`closed`。修复观察每个Viewer framing操作创建时的原始Promise，并用固定120-frame预算驱动
  `viewer.render()`与microtask结算；不再依赖default render loop、wall clock、sleep或扩大Playwright timeout。
- Entity zoom与tracking-clear zoom均通过同一bounded pump结算。DataSource fly还锁定current operation、
  `operation.flight`与`camera._currentFlight`三者identity，显式完成真实flight后继续结算同一个原始Promise；replacement、提前settle
  和预算耗尽均产生包含framing、Camera与tracking状态的actionable error。
- 原有I5-R001 Home start/settlement、`noStaleAuthority`、warm resource、public result及zero-error/network断言均保留。修复仅改变E2E
  调度证据，不修改product、config或服务。
- Architecture focused code review：`approved`。唯一剩余gate是在项目负责人重新授权后，临时停止当前PID 30060根服务，并依次运行同一
  named case的dev与release E2E；该gate通过前不得标记phase/extension completed、commit或push。

## Corrected dev E2E failure and Architecture diagnosis

- 项目负责人再次授权后，Architecture只停止已核实的PID 30060根服务并确认8080/8081释放。Execution运行修正后的dev named
  case；initial与retry均在约3秒内由bounded pump确定性失败：Entity zoom operation保持current、unsettled、non-flight，120帧后仍无
  Camera flight或suspension token。release按协议未运行。Architecture随后恢复根服务为PID 33344，并确认8080/8081监听及
  `Test/平面API集成.html`返回HTTP 200。
- `DataSourceDisplay.update`在`ApproximateTerrainHeights.initialized === false`时会在调用任何visualizer前返回false；
  `getBoundingSphere`因`DataSourceDisplay._ready === false`持续返回`PENDING`。Architecture在隔离的首个public dev bundle Viewer上复现：
  Clock正常tick且listener已注册，但紧密的`viewer.render()` + microtask链中visualizer gate始终未激活；允许浏览器任务队列运行后，同一
  Viewer在后续帧进入ready，Point Entity bounds为`DONE`。因此这是测试调度仍未让Cesium首次异步JSON初始化完成，不是I2 framing
  product状态机或frame预算不足。

### I5-R003 — Medium — The bounded pump must yield a browser frame, not only microtasks

把现有bounded pump的单帧步骤改为有界的browser animation-frame yield与显式`viewer.render()`组合，例如每个iteration先等待一次
`requestAnimationFrame`，随后手动render并drain microtasks。这样仍由固定frame count控制，不启用default render loop，也让首次
`ApproximateTerrainHeights`请求的网络完成任务能够被浏览器调度。

不得改成sleep、wall-clock polling、增大Playwright timeout、预热第二个Viewer、直接调用私有初始化器、绕过真实
`DataSourceDisplay.getBoundingSphere`或删除Promise/flight断言。为失败诊断增加`dataSourceDisplay._ready`和default visualizer gate
activation状态；保留I5-R001/R002、Home、`noStaleAuthority`、warm resource及zero-error/network断言。Correction仍只允许E2E spec与
I5 AgentDocs结果回写；先运行scoped static/audit并发送`changes-addressed`，Architecture关闭I5-R003并再次取得owner端口授权前不得运行
dev/release E2E。

## Execution response to I5-R003

- `renderOperationFrame`现在先`await new Promise(resolve => requestAnimationFrame(resolve))`，随后仍由测试显式调用
  `viewer.render()`并drain两轮microtask。Maximum operation frames保持120；没有启用default render loop或改为wall-clock budget。
- `operationDiagnostics`新增`viewer.dataSourceDisplay._ready`，并从default data source的首个planar gate记录
  `exists`、`_activated`与visualizer count。若真实初始化仍未推进，耗尽错误会直接区分display readiness和gate activation。
- I5-R002 exact original Promise observation、current operation/flight/currentFlight identity、replacement/early settlement/exhaustion
  errors保持；I5-R001 Home settlement、`noStaleAuthority`、warm resource和zero-error/network assertions未改。
- 未使用sleep、`setTimeout`、Playwright timeout扩大、第二个Viewer、private initialization、bounds bypass或产品/config改动；临时诊断无残留。
- 按assignment只运行spec scoped Prettier/ESLint、affected AgentDocs Prettier/Markdownlint、`git diff --check`与official audit；未运行
  dev/release E2E、focused suites、build/package、Test smoke或其他browser。I5-R003现为addressed，等待Architecture focused re-review。

## Architecture focused re-review of I5-R003

- I5-R003：`closed`。真实animation-frame yield给Cesium首次异步JSON完成任务提供浏览器调度机会，同时仍由固定frame count和手动
  `viewer.render()`控制，不引入default render loop、wall-clock等待或timeout掩盖。
- 新增diagnostics直接暴露`DataSourceDisplay._ready`与default planar visualizer gate activation，足以区分异步初始化、visualizer
  publication和framing operation残留；没有把这些soft-private状态变成产品契约。
- Architecture focused code review：`approved`。I5-R001至I5-R003均关闭。唯一剩余gate是在项目负责人再次授权后临时停止当前PID
  33344根服务，并依次运行同一named case的dev/release E2E；通过前不得标记phase/extension completed、commit或push。

## Third corrected dev E2E failure and Architecture correction

- 项目负责人再次授权后，Architecture只停止已核实的PID 33344根服务并确认8080/8081释放。Execution运行dev named case；
  `page.evaluate`已正常结算，initial与retry均只在outer exact expect出现两个确定性差异：`dataSourceFlew=false`与
  `homeFlightStarted=false`。其余qualification字段均与期望一致，包括`entityZoomed`、`framingFlightStarted`、
  `framingClearedTracking`、`homeClearedTracking`、`homeFlightSettled`、`noStaleAuthority`、`warmResources`、
  Cartesian/guard recovery及`browserErrors=[]`。release按协议未运行；outer equality在后续network/error arrays断言前失败，故本轮不把
  这些arrays记录为passed。Architecture随后恢复root service为PID 30828，确认8080/8081监听且
  `Test/平面API集成.html`返回HTTP 200。
- `dataSourceFlew=false`是product语义缺陷。`_SceneGISPlanarCameraFlight.completeFlight`先调用`tween.cancelTween()`；
  `TweenCollection.remove`会同步调用tween `cancel` callback，使I2 framing operation先以`false`结算。随后最终pose与tween
  `complete` callback虽仍执行，但operation的settled guard会忽略第二次结算。
- `homeFlightStarted=false`不是product缺陷。Planar Viewer使用`SceneGISPlanarHomeButton`，其ViewModel明确调用
  `SceneGISPlanarCameraController.viewHome(scene)`并公开为immediate Home；它不使用native `HomeButtonViewModel -> camera.flyHome`
  路径。I5-R001混淆了两类Home契约，其“HomeButton必须发布non-zero Camera flight”的结论现正式撤回；此前focused approval的这一部分
  无效，必须修正E2E和I5结果文档。I1 public `camera.flyHome` flight仍由case中独立的显式调用覆盖。

### I5-R004 — High — Explicit planar `completeFlight()` must not publish cancellation first

修正SceneGIS-owned `_SceneGISPlanarCameraFlight`的explicit completion路径，使`tween`从collection移除时只执行内部input/token cleanup，
不得调用caller `cancel` callback；最终pose提交后只调用caller `complete` callback一次。即使final update或caller complete抛错，也必须清理
`planarFlights`、`camera._currentFlight`与flight suspension，不得残留可重入flight。普通`cancelFlight()`、replacement与collection removal仍只
调用cancel，natural tween completion仍只调用complete。

新增focused regression锁定callback计数/顺序、final pose、token/currentFlight/map cleanup和throwing complete清理；并在I2 framing Widget
focused case中证明对真实non-zero DataSource flight调用public `camera.completeFlight()`后，创建时的原始`viewer.flyTo` Promise只结算一次且
值为`true`。不得把E2E的`dataSourceFlew`期望改为`false`。

### I5-R005 — Medium — E2E must qualify the immediate planar HomeButton contract

撤销I5-R001加入的`homeFlightStarted`要求。HomeButton command后应同步证明tracking清理、`camera._currentFlight`保持undefined、flight
suspension保持0，并且Camera position/direction/up立即等于此前由public `camera.flyHome(1.0)`确定的Home endpoint。不要在HomeButton后调用
`camera.completeFlight()`；可把最终qualification字段改为准确表达`homeApplied`/`homeStayedFlightFree`，并保留`homeClearedTracking`、
`noStaleAuthority`及独立public `camera.flyHome`代表路径。

## Architecture disposition after third dev failure

- Result: `changes-requested`。I5-R004/R005关闭前不得再次申请端口、运行dev/release E2E、标记ADR/SGP终态、commit或push。
- Correction scope允许修改`_SceneGISPlanarCameraFlight.js`、其focused Spec、现有I2 EntityZoom Widget Spec、现有I5 E2E spec及I5
  AgentDocs结果回写。无需修改upstream file、SGP、public API、Test页面或正式Guide/ADR；若源码事实迫使扩大范围，先发blocker。
- 先运行affected flight与EntityZoom focused suites、dev/release bundle build、scoped ESLint/Prettier/Markdownlint、`git diff --check`和official
  audit。修复后发送`changes-addressed`供focused code review；Architecture关闭findings并再次取得项目负责人授权后，才运行同一named
  case的dev/release gate。

## Execution response to I5-R004 and I5-R005

- I5-R004 addressed：`_SceneGISPlanarCameraFlight`现在以explicit-completion state区分内部tween removal与caller cancel。
  Shared release helper先恢复input token，再清除`planarFlights`与匹配的`camera._currentFlight`；explicit completion移除tween时不调用
  caller cancel，提交final pose并`requestRender`后只调用一次caller complete。Final update或complete callback抛错时，`finally`仍清理
  map/current flight/suspension并保留原异常；ordinary cancel/replacement/removal仍只发布cancel，natural completion仍只发布complete。
- CameraFlight focused regression锁定callback顺序与计数、final pose、重复complete/cancel无效、token/currentFlight/map cleanup，以及final
  update和caller complete抛错后的清理。真实EntityZoom Widget case注册planar controller并使用non-zero `CustomDataSource` flight，证明public
  `camera.completeFlight()`后原始`flyTo` Promise只结算一次且为`true`。
- I5-R005 addressed：E2E保留独立public `camera.flyHome(1.0)`代表路径；`SceneGISPlanarHomeButton` command后不再期待flight或调用
  `completeFlight()`，而是同步证明tracking清理、`camera._currentFlight`仍undefined、flight suspension仍0，以及
  position/direction/up与保存的Home endpoint一致。资格字段改为`homeApplied`与`homeStayedFlightFree`。
- Focused validation：CameraFlight `TOTAL: 9 SUCCESS`；EntityZoom Widget `TOTAL: 12 SUCCESS`；`npm run build`和
  `npm run build-release`均exit 0。首次CameraFlight运行因Jasmine matcher参数写法产生`1 FAILED/8 SUCCESS`，仅修正test assertion后复跑通过，
  不涉及产品行为。
- 按finding边界未运行dev/release E2E、package verifier、其他suite、browser/Test smoke或full suite。Root service PID 30828未操作；
  Architecture关闭R004/R005并取得新的owner端口授权前，E2E仍禁止。当前未commit、未push、phase保持active。

## Architecture focused re-review of I5-R004 and I5-R005

- I5-R004：`closed`。Explicit completion在内部tween removal期间抑制caller cancel；shared release先恢复flight token并删除
  `planarFlights`，且只在旧tween仍是current时清除`camera._currentFlight`。最终pose提交后只发布caller complete。Final update或
  caller complete抛错时，`finally`再次执行幂等release并保留原异常，不会遗留map、token或current flight；ordinary cancel与natural
  completion仍分别只发布cancel与complete。
- Focused private Spec锁定callback顺序/计数、最终pose、重复complete/cancel no-op、final-update失败及throwing-complete清理；真实
  EntityZoom Widget还以registered planar controller和non-zero `CustomDataSource` flight证明public `camera.completeFlight()`使创建时的
  原始`viewer.flyTo` Promise只结算一次且为`true`。Architecture接受Execution报告的CameraFlight `9/9`、EntityZoom Widget `12/12`
  与dev/release bundle build证据，不重复运行。
- I5-R005：`closed`，并正式维持对I5-R001 flight-publication部分的撤回。E2E保留独立public `camera.flyHome(1.0)` flight代表路径；
  `SceneGISPlanarHomeButton`只验证同步tracking清理、即时Home pose、无current flight与flight suspension为0，字段改为`homeApplied`和
  `homeStayedFlightFree`，不再调用无意义的post-HomeButton `completeFlight()`。
- Architecture focused code review：`approved`。当前唯一剩余gate是项目负责人再次授权后，临时停止已核实的PID 30828根服务，并依次
  运行同一named case的dev与Windows process-local `release=true` release E2E。Dev失败则停止且不运行release；两者通过前不得标记
  phase/extension completed、commit或push。

## Fourth dev E2E failure and Architecture diagnosis

- 项目负责人授权后，Architecture核实并只停止PID 30828根服务，确认8080/8081释放。Execution运行dev named case；initial与retry
  均完整结算`page.evaluate`并通过outer qualification、`externalAttempts=[]`、`badResponses=[]`、`pageErrors=[]`、qualification/destroy
  `browserErrors=[]`，只在最终`consoleErrors=[]`失败。每次唯一日志都是case故意触发late Fog guard时Cesium输出的
  `An error occurred while rendering. Rendering has stopped. DeveloperError: scene.fog.enabled must be false with a non-Globe world.`。
  Release按协议未运行。Architecture随后恢复owner root service为PID 33124，确认8080/8081监听且Test页面HTTP 200。
- Source fact：`CesiumWidget._onRenderError`在`_showRenderLoopErrors`为true时同步调用`showErrorPanel`；`showErrorPanel`对error固定执行
  `console.error`。因此case一边故意用`viewer.render()`触发并捕获Fog `DeveloperError`，一边要求全程`consoleErrors=[]`，在默认配置下
  必然矛盾。这不是product guard或恢复失败。

### I5-R006 — Medium — Expected Fog render rejection must suppress only its own Cesium error panel/log

仅在故意触发Fog guard的单次`viewer.render()`周围保存并临时设置`viewer.cesiumWidget._showRenderLoopErrors=false`，在`finally`中恢复
原值并证明恢复成功。保留`scene.rethrowRenderErrors=true`、原Fog `DeveloperError`类型断言、恢复render、全局console/page/browser/network
collectors及最终`consoleErrors=[]`。

不得全局设置constructor `showRenderLoopErrors:false`、过滤或删除特定console字符串、清空collector、移除Fog guard、放宽最终数组断言，
也不得修改product/config。Correction只限现有I5 E2E spec与I5 AgentDocs结果回写；运行scoped ESLint/Prettier/Markdownlint、
`git diff --check`与official audit即可，不重跑focused suites/build/package/browser/E2E。先发`changes-addressed`供focused review；
Architecture关闭I5-R006且取得新的owner授权前不得再次停止PID 33124或运行dev/release E2E。

## Execution response to I5-R006

- 仅在intentional late-Fog `viewer.render()`周围保存`viewer.cesiumWidget._showRenderLoopErrors`并临时设为`false`；嵌套
  `try/catch`继续证明抛出`Cesium.DeveloperError`，外层`finally`恢复精确保存值。
- 新增`fogErrorPanelRestored`并纳入page-side qualification与outer exact expect。恢复后仍将`scene.fog.enabled=false`并执行下一次正常
  recovery render；`scene.rethrowRenderErrors=true`从未关闭。
- 未过滤或清空console collector，未全局关闭constructor error panel，未删除Fog guard，也未放宽console/page/browser/network arrays。
- 按finding边界只运行E2E spec scoped ESLint/Prettier、六个I5 AgentDocs Prettier/Markdownlint、`git diff --check`与official audit；未运行
  dev/release E2E、focused suite、build/package、Test/browser smoke或full suite。PID 33124未操作，working tree未commit/未push。
- I5-R006现为addressed，等待Architecture focused re-review及新的owner端口授权；phase保持active。

## Architecture focused re-review of I5-R006

- I5-R006：`closed`。`_showRenderLoopErrors`只在intentional Fog guard的单次`viewer.render()`期间为false，nested catch继续锁定
  `Cesium.DeveloperError`，外层`finally`无条件恢复精确保存值；恢复后的正常render与`fogErrorPanelRestored=true`共同锁定该隔离没有泄漏。
- `scene.rethrowRenderErrors=true`、全局console/page/browser/network collectors及最终exact arrays均保持；没有constructor-wide suppression、
  字符串过滤、collector清空或产品/config改动。因此其他时段的unexpected render failure仍会使evaluate或最终错误断言失败。
- Architecture focused code review：`approved`。I5-R001的错误flight假设已撤回，I5-R002至I5-R006均关闭。当前唯一剩余gate是
  项目负责人再次授权后，临时停止PID 33124并依次运行同一named case的dev/release E2E；两者通过前不得标记phase/extension
  completed、commit或push。

## Implementation summary

- 在既有`scenegis-planar-release.spec.js`增加一个稳定命名的blocked-network API integration case，不新增fixture/spec；同一public
  Viewer串联declarative World、Camera view/flight、Entity/DataSource framing、FIXED Entity native Clock tracking与Scene API
  safety/recovery，并验证warm Surface与controller/token/destroy状态。
- Installed verifier显式锁定V1/I1-I4 private runtime文件、engine/widgets/root ESM与root CJS soft-private export，以及相应
  public spelling hiding；原有CJS/declarations/API/broken-entry和12+12 Shader delivery保持。
- ADR仅从`proposed`转为`approved`并增加final delivery note；SGP仅从`proposed`转为`active`，未改变任何patch事实。
- Guide与UpgradeChecklist增加联合delivery矩阵、private tar/soft-private边界和deferred能力；没有新增产品能力。

## Exact changed paths

1. `.scenegis/upstream-patches.json`
2. `Specs/e2e/scenegis-planar-release.spec.js`
3. `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCameraFlight.js`
4. `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraFlightSpec.js`
5. `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidgetSpec.js`
6. `scripts/scenegis/verify-planar-packages.mjs`
7. `Documentation/SceneGIS/Decisions/ADR-0037-planar-camera-view-and-flight.md`
8. `Documentation/SceneGIS/Decisions/ADR-0038-planar-entity-tracking.md`
9. `Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md`
10. `Documentation/SceneGIS/PlanarWorldGuide.md`
11. `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
12. `AgentDocs/planar-api-integration/README.md`
13. `AgentDocs/planar-api-integration/plans/README.md`
14. `AgentDocs/planar-api-integration/plans/2026-08-14-planar-api-integration-extension.md`
15. `AgentDocs/planar-api-integration/plans/2026-08-14-phase-i5-unified-qualification-delivery.md`
16. `AgentDocs/planar-api-integration/reviews/README.md`
17. `AgentDocs/planar-api-integration/reviews/2026-08-14-i5-unified-qualification-delivery.md`

## Validation evidence

| Check                                               | Result                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Camera Widget                                       | `TOTAL: 3 SUCCESS`                                                                                               |
| CameraFlight private                                | `TOTAL: 9 SUCCESS` after one test-only matcher correction                                                        |
| EntityZoom Widget                                   | `TOTAL: 12 SUCCESS`                                                                                              |
| EntityTracking Widget                               | `TOTAL: 3 SUCCESS`                                                                                               |
| Scene API Widget                                    | `TOTAL: 3 SUCCESS`                                                                                               |
| planar Viewer                                       | `TOTAL: 23 SUCCESS`                                                                                              |
| build / build-release / build-ts / build-docs / tsc | passed; exit code 0                                                                                              |
| installed package verifier                          | passed; `12/12` GLSL, `12/12` generated modules, V1/I1-I4 private delivery/public hiding                         |
| direct Test blocked-network Chromium                | passed; Camera/framing/tracking/Scene actions, compact/Credit, BFCache/destroy, no page/unexpected console error |
| scoped ESLint / Prettier / Markdownlint / diff      | passed; only CRLF conversion notices                                                                             |
| official upstream / generated / exact status audit  | passed; current delivery upstream-owned=`0`, generated=`0`, 17 I5 paths + 2 preserved baselines                  |
| dev/release I5 named E2E                            | dev `1 passed` (4.0s / 7.5s); release `1 passed` (2.9s / 6.5s); timing excluded                                  |

Exact focused suite commands:

- `npm run test -- --includeName SceneGIS/Widget/SceneGISPlanarCameraCesiumWidget`
- `npm run test -- --includeName SceneGIS/Scene/SceneGISPlanarCameraFlight`
- `npm run test -- --includeName SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidget`
- `npm run test -- --includeName SceneGIS/Widget/SceneGISPlanarEntityTrackingCesiumWidget`
- `npm run test -- --includeName SceneGIS/Widget/SceneGISPlanarSceneApiCesiumWidget`
- widgets cwd: `npm run test -- --includeName "SceneGIS/SceneGISPlanarViewer"`

Build/package commands：`npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、
`npm run tsc`、`node scripts/scenegis/verify-planar-packages.mjs`。`build-docs`只有既有upstream JSDoc warnings。

## E2E environment gate

- Read-only evidence：PID 11948为`node.exe "server.js"`，同时监听127.0.0.1:8080和8081；Playwright配置
  `reuseExistingServer=false`，因此dev/release启动会冲突。
- Architecture disposition：这是environment-only blocker；Execution不得终止、重配、代理或持续轮询该服务，也不得在owner授权前运行
  E2E或claim pass。其余证据完成后提交正常review-ready，由Architecture协调临时端口释放。
- 待授权后只运行同一个I5 named case：dev focused command与Windows process-local `release=true`等价release command；排除release
  timing case，记录exact commands/results与`externalAttempts=[]`。
- 经过三轮owner-authorized dev执行，最新case已经完整结算并暴露I5-R004/R005；release仍未运行，后续network/error arrays在outer exact
  expect前停止，不能claim pass。Architecture已恢复owner root service为PID 30828；R004/R005 focused re-review和新的owner授权前禁止
  停止服务或运行E2E。

## Final dev and release E2E evidence

- Dev exact command：
  `npm run test-e2e -- Specs/e2e/scenegis-planar-release.spec.js --grep "planar API integration qualifies unified public delivery" --headed`。
  Result：exit 0，`1 passed`，named test 4.0s，command total 7.5s。
- Windows release使用仅当前PowerShell process的`$env:release='true'`，随后运行
  `npx playwright test -c Specs/e2e/playwright.config.js --project=chromium Specs/e2e/scenegis-planar-release.spec.js --grep "planar API integration qualifies unified public delivery" --headed`。
  Result：exit 0，`1 passed`，named test 2.9s，command total 6.5s。Exact grep排除release timing case。
- 两种bundle的exact qualification相同：`worldIdentity`、`declarativeWorldIdentity`、`globeUndefined`、`tilesLoaded`、
  `directFlightStarted`、`directFlightCompleted`、`directFlightCancelled`、`entityZoomed`、`framingFlightStarted`、
  `dataSourceFlew`、`trackingMoved`、`trackingSuppressedInput`、`trackingRestoredInput`、`framingClearedTracking`、
  `homeClearedTracking`、`homeApplied`、`homeStayedFlightFree`、`guardInputsUnchanged`、`fogRejected`、
  `fogErrorPanelRestored`、`fogRecovered`、`cartesianQualification`、`warmResources`与`noStaleAuthority`均为`true`；
  `initialControllerCount=1`、`initialPlanarControllerMatches=1`、`planarControllerMatches=1`、
  `controllerCountBeforeDestroy=2`、`legacyInputs=false`、`capabilityFlags=[false,false]`、
  `heightGuards=[true,true,true,true]`、`cameraGuards=[true,true,true]`。
- Destroy qualification：Viewer和World均destroyed，container children=`0`，controller count=`0`，controller aggregator reference清除且
  aggregator destroyed。两种bundle的qualification/destroy `browserErrors=[]`，并且`externalAttempts=[]`、`badResponses=[]`、
  `pageErrors=[]`、`consoleErrors=[]`。
- I5-R001的HomeButton flight-publication部分保持正式撤回；I5-R002-R006全部closed。`ADR-0037`至`ADR-0039`的`approved`与
  `SGP-0004`至`SGP-0007`的`active`现为最终delivery事实。
- E2E结果后未修改代码/config/service/AgentDocs；Architecture随后恢复owner root service为PID 30388。Final results writeback只修改
  既有六个I5 AgentDocs。Review现为`final-delivery-ready`，等待Architecture创建独立本地checkpoint；建议中文提交信息：
  `完成平面 API 融合统一交付`。未commit、未push。
- Architecture已创建I5独立本地checkpoint `2eaa13ad2946f7d50bb54f5f77c3b616b461667b`（short `2eaa13ad29`，
  commit message `完成平面 API 融合统一交付`，not pushed）。Review approved/final；I5-R001错误的HomeButton flight-publication部分
  withdrawn，I5-R002-R006 closed；I5与extension completed。当前无follow-up phase，等待未来Architecture audit或新extension。

## Ownership, deviations, and remaining risk

- I5 product upstream-owned changed files=`0`；manifest仅改变现有SGP status。New SGP=None；generated status目标=`0`。
- 两处Architecture-owned`AgentDocs/planar-viewer-bootstrap/**` baseline保持未改未暂存；owner `Test/地形.html`未读取、未修改、未暂存。
- Scope deviations：I5-R004经Architecture amendment窄改一个SceneGIS-owned private flight实现及两个focused Specs；未修改public API、
  upstream product、Test页面、config、package manifest或audit script。最终dev/release同一named case均通过。
- Unrun by design：full suite、I1-I4全部private矩阵、release timing、E2E以外的browser suite、Sandcastle、public-network success、
  3D Tiles MostDetailed和新manual gate。
- Remaining boundary：checkpoint仅为本地状态且not pushed；当前无active phase。任何未来工作等待Architecture audit或新extension
  assignment，Execution不得自行commit/push。
