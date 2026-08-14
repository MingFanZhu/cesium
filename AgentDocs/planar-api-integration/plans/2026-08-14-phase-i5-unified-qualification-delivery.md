# Phase Plan: I5 Unified Qualification and Delivery

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Planar API integration extension](2026-08-14-planar-api-integration-extension.md)
- Phase: `I5`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Predecessor final checkpoint/base:
  `0c95a54024`（`实现平面 Scene API 安全边界`，not pushed）
- Related discussion:
  [Cesium public API planar compatibility](../discussions/2026-08-14-cesium-public-api-planar-compatibility.md)
- ADR: approve existing `ADR-0037`、`ADR-0038`、`ADR-0039`; no new ADR expected
- SGP: activate existing paired `SGP-0004`、`SGP-0005`、`SGP-0006`、`SGP-0007`; no new SGP expected

## Objective

I5不新增平面API能力，而是把I1 fixed-axis Camera/flight、I2 Entity/DataSource framing、I3 Entity tracking与I4 Scene API
safety作为一个可交付整体收口。阶段只补当前证据中缺失的dev/release公开bundle联合路径和installed-package private helper交付
断言，复跑最小相关real-Context/Viewer/build/types/docs矩阵，正式批准ADR、激活SGP，并完成extension review、升级文档、审计与独立
checkpoint。

## Non-goals

- 不新增或修改Camera、Viewer、CesiumWidget、Scene、Controller、tracker/framing helper或任何public API行为。
- 不扩大I1-I4 approved supported profile，不支持Rectangle/Cartographic overload、3D Tiles、GeoJSON/CZML/KML转换、clustering、
  planar Fog/Shadow、runtime CRS推断或runtime World replacement。
- 不新增第二个E2E文件、第二套public facade、Sandcastle、网络fixture、asset、performance threshold、workflow、tag、publish或push。
- 不重复I1-I4全部private/unit/four-frustum/callback-reentrancy矩阵；只运行可证明联合交付的最小集合。
- 不修改`Test/平面API集成.html`或再要求一轮人工视觉gate；I1-I4 owner manual gates已经通过。
- 不读取、修改、暂存或提交项目负责人文件`Test/地形.html`。

## Entry conditions and current source facts

- Branch=`feature/planar-api-integration`，assignment base=`0c95a54024`。I1-I4均已Architecture approved、finding closed、owner
  manual gate passed并形成独立本地checkpoint；I4 final checkpoint未push。
- 工作树只允许保留Architecture-owned
  `AgentDocs/planar-viewer-bootstrap/README.md`与
  `AgentDocs/planar-viewer-bootstrap/plans/2026-08-14-planar-viewer-bootstrap-extension.md`两处历史diff。Execution不得修改、
  暂存或提交它们。
- `Specs/e2e/scenegis-planar-release.spec.js`的首个blocked-network local Viewer case已联合覆盖Surface styling、Environment、
  pick/depth、wheel/Home、resource identity与caller ownership，但尚未串联declarative `planarWorld`、I1 Camera flight、I2 framing、
  I3 tracking和I4 guarded API。
- I1-I4 focused/public suites均已通过；I5只需一个新的同文件API integration case或对现有case的最小扩展，不创建新的browser
  fixture或第二个spec文件。
- Installed verifier已锁定12/12 GLSL、12/12 generated shader modules、V1 public declarations、I2/I3 public JSDoc与I4 API docs，
  但没有显式要求以下extension private delivery：
  `_SceneGISPlanarCamera.js`、`_SceneGISPlanarCameraFlight.js`、`_SceneGISPlanarEntityFraming.js`、
  `_SceneGISPlanarViewerBootstrap.js`。这些文件当前由generated indexes以underscore soft-private symbol导出，必须在engine/widgets/root
  tar与ESM/CJS边界中被明确验证，不能误列为无underscore public API。
- `ADR-0037`、`ADR-0038`、`ADR-0039`当前为`proposed`；对应`SGP-0004`至`SGP-0007`也为`proposed`且paired markers/official
  audit已通过。I5完整交付通过后将ADR设为`approved`、SGP设为`active`，不改变文件清单、reason、risk或removal condition。
- Playwright config继续固定dev `127.0.0.1:8080`、release mirror `8081`且`reuseExistingServer=false`。Windows literal
  `npm run test-e2e-release`仍有POSIX `release=true`语法限制；允许使用仅当前PowerShell进程设置`release=true`后调用同一config、
  project、spec和grep的等价命令并如实记录。任何端口服务只能在项目负责人明确授权后临时停止，并由Architecture负责恢复。

## Detailed design

### Unified dev/release browser qualification

- 只修改现有`Specs/e2e/scenegis-planar-release.spec.js`，优先增加一个独立、命名稳定的blocked-network API integration case，
  不复制首个styling/environment大场景。Case使用公开`Viewer({planarWorld})`创建唯一World/controller，关闭默认render loop并使用
  local deterministic flat Surface/Entity；不得访问公网、Ion或token。
- 同一Viewer中串联：
  - I1：public `camera.setView`、`viewBoundingSphere`或`flyToBoundingSphere`、non-zero或zero-duration `flyTo`、
    `completeFlight`/`cancelFlight`与`flyHome`代表路径；
  - I2：single Entity与local `CustomDataSource`的`zoomTo`/`flyTo`，Promise只由当前operation结算；
  - I3：FIXED dynamic Entity按native host Clock移动Camera，tracking stop后input恢复，successful framing/Home清理tracking；
  - I4：`sampleHeightSupported=false`、`clampToHeightSupported=false`，四个height/clamp和三个Camera globe-only入口同步拒绝且
    caller input/result/Camera state不变；Fog late mutation在render边界拒绝，修正后可继续render；
  - generic：screen/window/drawing-buffer transform、terrain/depth或ordinary pick至少一条public Cartesian路径继续可用。
- Case必须设置`scene.rethrowRenderErrors=true`，保存一个settled Surface tile/command/shader/VA identity；Camera/framing/tracking/time/
  guard recovery不能替换这些warm resources。验证一个World、一个planar controller、legacy inputs disabled、无stale flight/tracker token、
  Viewer destroy后World/controller/DOM cleanup。
- `externalAttempts=[]`、bad responses、page errors、unhandled rejections与unexpected console errors必须全部为空。不要加入整屏截图、
  public network、terrain provider或脆弱timing threshold。
- Dev/release只运行该命名case，release timing case保持排除。端口占用先只读报告；未经项目负责人授权不得终止或重配服务。

### Installed-package delivery closure

- 扩展`scripts/scenegis/verify-planar-packages.mjs`的现有清单，不创建第二个verifier：
  - engine tar显式要求`_SceneGISPlanarCamera.js`、`_SceneGISPlanarCameraFlight.js`、
    `_SceneGISPlanarEntityFraming.js`以及既有tracker/SceneApi；
  - widgets tar显式要求`_SceneGISPlanarViewerBootstrap.js`；
  - engine/widgets/root ESM soft-private symbol按实际package index分别验证存在；对应无underscore拼写必须保持public absent；
  - CJS/root、declarations、API HTML与broken-entry fixtures继续通过；不得在no-DOM consumer中伪造Viewer/Context运行。
- Public runtime Camera/Viewer联合行为由dev/release E2E承担；verifier只验证适合no-DOM installed consumer的constructor/property、
  archive/source/JSDoc/declaration/API/private-hiding边界。
- 最终输出须准确表述I1-I4/V1 installed delivery，不把underscore helper宣传为public stable API。

### ADR, SGP, documentation, and extension closure

- 将`ADR-0037`、`ADR-0038`、`ADR-0039`状态从`proposed`改为`approved`；内容只允许必要的最终交付注记，不重写已批准设计。
- 将`.scenegis/upstream-patches.json`中`SGP-0004`、`SGP-0005`、`SGP-0006`、`SGP-0007`状态从`proposed`改为
  `active`；不新增SGP、不改marker/file mapping/reason/risk/removal condition。Official audit必须证明四个active registration均有
  paired markers且没有uncovered upstream diff。
- 更新`PlanarWorldGuide.md`与`PlanarWorldUpgradeChecklist.md`的I1-I4联合dev/release/npm矩阵、private helper tar清单、SGP/ADR
  final state和deferred follow-ups；不得把3D Tiles、format conversion、Fog/Shadow等独立候选写成已支持。
- 新建I5 review并更新extension/phase/review indexes。I1-I5所有finding必须closed或有明确独立后继链接；不得删除历史记录来表示完成。
- I5不新增owner manual gate。Architecture review通过后由Architecture创建I5独立中文checkpoint，并把extension标为
  `completed`；不push、不publish。

## Allowed paths

- `.scenegis/upstream-patches.json`，仅`SGP-0004`至`SGP-0007` status transition
- `Specs/e2e/scenegis-planar-release.spec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Decisions/ADR-0037-planar-camera-view-and-flight.md`，status/final delivery note only
- `Documentation/SceneGIS/Decisions/ADR-0038-planar-entity-tracking.md`，status/final delivery note only
- `Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md`，status/final delivery note only
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-api-integration/**`现有index/extension/phase/review/handoff与新I5 plan/review

Read-only validation targets:

- `Test/平面API集成.html`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarCameraCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEntityZoomCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEntityTrackingCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarSceneApiCesiumWidgetSpec.js`
- `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`

Conditional only after Architecture amendment:

- 若E2E或installed verifier暴露确定性产品缺陷，Execution停止并发送源码/运行证据；Architecture更新plan后才允许修改相关
  product/Spec。不得在I5直接顺手修Camera/Viewer/Scene/Controller/tracker。

## Forbidden paths

- `packages/engine/Source/**`、`packages/widgets/Source/**`、public API、Camera/Viewer/Scene/Widget、Controller、tracker/framing、
  World/Surface/Environment、Shader、Worker与generated indexes。
- `Test/平面API集成.html`、`Test/地形.html`、其他Test页面、Sandcastle/gallery、package manifests、Playwright/server config、
  build/gulp/Vite core、workflow。
- `AgentDocs/planar-viewer-bootstrap/**`两处Architecture-owned baseline。
- Generated declarations/API/Build/Source/SpecList、tarball、node_modules或发布产物。

## Validation boundary

Required:

1. Focused existing suites：Camera Widget、EntityZoom Widget、EntityTracking Widget、Scene API Widget、planar Viewer。只检查
   `TOTAL SUCCESS/FAILED`，不因gulp exit code 0掩盖Jasmine failure。
2. Dev/release运行同一I5 E2E命名case；Windows release使用process-local `release=true`等价命令。必须记录fixed-port处理、exact
   command/result及`externalAttempts=[]`，timing case排除。
3. `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`。
4. `node scripts/scenegis/verify-planar-packages.mjs`；记录12/12 GLSL、12/12 generated modules、I1-I4 private helper tar/
   soft-private/public-hiding与ESM/CJS/declarations/API结果。
5. 复用当前root dev server对`Test/平面API集成.html`做一次blocked-network short smoke，确认中文页面加载、核心public actions和
   BFCache/cleanup无page/unexpected console error；不新增视觉gate，不依赖公网tile成功。
6. Changed-scope ESLint/Prettier/Markdownlint、AgentDocs checks、`git diff --check`、official upstream audit、exact status/generated audit。

Not required:

- Full Jasmine suite、I1-I4全部private/unit矩阵、Environment/terrain/content/styling suites、Sandcastle、public-network success、
  release timing threshold、3D Tiles MostDetailed或新的人工视觉验收。
- Architecture重复执行Execution已完成的browser/build/test矩阵；Architecture只review code/evidence/ownership和extension状态。

## Completion criteria

- 同一blocked-network public Viewer场景在dev/release bundle中闭合declarative World→Camera flight→Entity/DataSource framing→
  Clock tracking→Scene safety/recovery，并保持Cartesian pick/transform、warm resource、controller/token、destroy与零公网请求。
- Installed engine/widgets/root tar明确包含V1/I1-I4 private helpers；underscore soft-private存在、无underscore public spelling缺失，
  ESM/CJS/declarations/API/broken-entry与12+12 shader delivery保持。
- `ADR-0037`至`ADR-0039`为`approved`；`SGP-0004`至`SGP-0007`为`active`且official audit无缺口。
- Guide、UpgradeChecklist、phase/extension/review indexes与实际结果一致；I1-I5无open finding/discussion或未归档owner gate。
- I5 product upstream-owned=`0`、new SGP=None、generated=`0`；两处planar-viewer-bootstrap baseline保持未改未暂存。
- Architecture review通过后创建I5独立local checkpoint并把`planar-api-integration`标为`completed`；未push、未publish。

## Stop conditions

- 若需要修改任何product Source、public API、Spec、Test页面、Playwright/server config、package manifest或新增upstream patch，停止并
  提交证据给Architecture。
- 若E2E只能通过公网、Ion、sleep/timing threshold、prototype patch或访问private generated output工作，不实施 workaround；缩窄并报告。
- 若8080/8081被现有服务占用，只报告PID/command line与exact error；没有项目负责人明确授权不得终止、重配或代理。
- 若active SGP audit暴露marker/manifest语义问题，不修改audit script；先报告具体SGP/path/range证据。
- Architecture review和I5独立checkpoint完成前不commit、不push、不publish，不开始后续3D Tiles/format/Fog/Shadow扩展。

## Execution results

- 新增同文件named blocked-network public Viewer联合case，覆盖V1 declarative World、I1 Camera view/flight、I2
  Entity/DataSource framing、I3 native Clock tracking/input restore、I4 capability/guard recovery与Cartesian pick/transform；
  `scene.rethrowRenderErrors=true`，并锁定Surface/controller/token/destroy identity。该case尚未执行：PID 11948
  `node.exe "server.js"`占用127.0.0.1:8080和8081，`reuseExistingServer=false`无法启动；Architecture已确认为environment-only
  blocker并要求等待owner授权，不终止、不重配、不代理、不轮询。
- Installed verifier显式要求engine private Camera/flight/framing/tracker/SceneApi与widgets Viewer bootstrap文件，验证
  engine/widgets/root ESM及root CJS soft-private存在、无underscore public spelling缺失，并保持declarations/API/broken-entry与
  `12/12` GLSL、`12/12` generated shader modules；命令通过。
- Focused suites通过：Camera Widget `3/3`、EntityZoom Widget `11/11`、EntityTracking Widget `3/3`、Scene API Widget `3/3`、
  planar Viewer `23/23`。`npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`均退出码0；docs只产生既有
  upstream JSDoc warnings。
- 复用现有root server的blocked-network direct Test smoke通过：World identity、legacy input isolation、Camera、framing、tracking/
  native Clock、Scene API actions、compact/Credit、BFCache与destroy成立；public OSM/Esri请求被拦截，page errors与unexpected
  console errors为空。
- `ADR-0037`至`ADR-0039`已转为`approved`并只增加final delivery note；`SGP-0004`至`SGP-0007`只转为`active`，未改变
  mapping/reason/risk/removal condition。I5未修改product Source或product Specs，product upstream-owned=`0`，new SGP=None。
- Changed-scope ESLint、Prettier、Markdownlint、`git diff --check`与official upstream audit通过；审计报告current delivery
  upstream-owned entries=`0`、generated status=`0`。I5-R004 scope amendment后精确status为17个I5路径及两处保留的
  planar-viewer-bootstrap baseline。
- Deviations：dev/release E2E因固定端口环境gate pending；其余confirmed validation已执行。未运行full suite、release timing、
  Sandcastle、public-network success、3D Tiles MostDetailed及新的manual gate。
- Architecture finding I5-R001曾要求HomeButton发布并显式结算non-zero flight；第三次dev证据和源码复核确认该判断错误：
  `SceneGISPlanarHomeButton`同步调用`SceneGISPlanarCameraController.viewHome(scene)`，不走native HomeButton的`camera.flyHome`。
  Architecture已正式撤回R001的flight-publication部分；历史失败保留，但最终资格改为同步`homeApplied`、`homeStayedFlightFree`及
  `homeClearedTracking`，并继续由前面的独立public `camera.flyHome(1.0)`路径证明flight语义。
- I5-R001 focused re-review已关闭。首次owner-authorized dev named case初次/retry分别在30.1s/31.3s命中整个`page.evaluate`
  30秒timeout，release未运行；Architecture已恢复root service PID 30060。I5-R002 diagnosis确认frame-driven Entity zoom、DataSource
  fly、tracking-clear zoom在`useDefaultRenderLoop=false`下只render一帧即await会deadlock。
- I5-R002已addressed：case内部使用maximum 120 frames的deterministic pump，每帧执行`viewer.render()`与两次microtask drain并观察
  exact operation Promise。Entity与tracking-clear zoom由pump结算；DataSource fly先确认current operation的`flight`与
  `camera._currentFlight`同identity，再显式complete并继续pump原Promise。Promise未结算、operation被替换或flight未发布时抛出带
  operation名称、current operation、Camera flight、suspension与tracker状态的错误。未使用sleep、wall-clock、timeout扩大或default
  render loop；等待Architecture focused re-review前不重跑E2E。
- I5-R002 focused re-review已关闭。第二次owner-authorized dev named case初次/retry均在约3秒由pump报告Entity zoom operation保持
  current/unsettled/non-flight且120帧无Camera flight；release未运行，Architecture已恢复root service PID 33344。源码/隔离诊断确认
  `DataSourceDisplay.update`在`ApproximateTerrainHeights.initialized=false`时不运行visualizers，tight render+microtask chain又不释放
  browser task queue，因此`_ready=false`与bounds PENDING并非frame budget或I2 product defect。
- I5-R003已addressed：`renderOperationFrame`在每个固定budget iteration先等待一次`requestAnimationFrame`，再explicit
  `viewer.render()`与两轮microtask drain，让真实browser completion task进展而不启用default loop。Operation exhaustion diagnostics新增
  `dataSourceDisplay._ready`与default planar visualizer gate的exists/activated/visualizer count。未加入sleep、setTimeout、wall-clock、
  timeout扩大、第二Viewer、private initializer或bounds bypass；等待Architecture focused re-review前不重跑E2E。
- I5-R003关闭后的第三次owner-authorized dev named case已正常结算；outer exact expect仅报告`dataSourceFlew=false`与
  `homeFlightStarted=false`，其余qualification字段匹配。release未运行，后续network/error arrays因outer expect提前失败而未形成pass证据；
  Architecture已恢复root service PID 30828。
- I5-R004已addressed：explicit `completeFlight()`使用内部completion标记移除tween，清理input token、`planarFlights`与
  `camera._currentFlight`而不发布caller cancel，final pose后只发布一次complete；final update或complete callback抛错也保持清理并透传错误。
  CameraFlight focused suite `9/9 SUCCESS`，EntityZoom Widget `12/12 SUCCESS`，后者以真实non-zero DataSource证明public
  `camera.completeFlight()`使原始`flyTo` Promise只结算一次且为`true`。
- I5-R005已addressed：E2E移除`homeFlightStarted`和HomeButton后的`completeFlight()`，同步锁定tracking已清、无current flight、
  flight suspension为0及position/direction/up等于独立public `flyHome`保存的Home endpoint；字段改为`homeApplied`与
  `homeStayedFlightFree`。`npm run build`与`npm run build-release`均通过；等待Architecture focused re-review，未经新授权不运行E2E。
- Architecture关闭R004/R005后的dev named case initial/retry分别在3.6s/4.7s仅因`consoleErrors`包含intentional Fog guard rejection的
  Cesium error-panel日志而失败；outer qualification、`externalAttempts=[]`、`badResponses=[]`、`pageErrors=[]`及qualification/destroy
  `browserErrors=[]`均通过。Release未运行，Architecture已恢复root service PID 33124。
- I5-R006已addressed：只在故意触发late Fog guard的单次`viewer.render()`周围保存
  `viewer.cesiumWidget._showRenderLoopErrors`，临时设为`false`并在`finally`恢复精确旧值；`fogErrorPanelRestored=true`进入内外exact
  qualification。全程`scene.rethrowRenderErrors=true`，Fog `DeveloperError`类型、后续recovery render及全局console/page/browser/network
  collectors保持不变。只运行scoped static/audit，等待Architecture focused re-review，未经新授权不运行E2E。
- Architecture关闭I5-R006且owner再次授权后，最终dev exact named case为`1 passed`（test 4.0s / command 7.5s）；Windows
  process-local `release=true`的同一config/project/spec/grep/headed case为`1 passed`（test 2.9s / command 6.5s）。Release timing case
  由exact grep排除。两种bundle均通过全部qualification、destroy cleanup、`externalAttempts=[]`、`badResponses=[]`、
  `pageErrors=[]`、qualification/destroy `browserErrors=[]`及`consoleErrors=[]`。
- Architecture已恢复owner root service PID 30388并确认8080/8081与Test页面。E2E结果后未修改代码/config/service/AgentDocs；本次仅做
  final result writeback。`ADR-0037`至`ADR-0039`最终为`approved`，`SGP-0004`至`SGP-0007`最终为`active`；I5现为
  `checkpoint-ready`，等待Architecture创建独立本地checkpoint。建议中文提交信息：`完成平面 API 融合统一交付`；未push。
- Architecture已创建I5独立本地checkpoint `a81bbecebdda3362decc8505dc31a96b14a82aa3`（short `a81bbecebd`，
  `完成平面 API 融合统一交付`，not pushed）。Architecture review approved/final；I5-R001错误的HomeButton flight-publication部分
  withdrawn，I5-R002-R006 closed；I5 completed。当前无follow-up phase，等待未来Architecture audit或新extension assignment。
