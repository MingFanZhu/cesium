# E3 Review：可见日月

## Metadata

- Status：`approved`
- Date：`2026-08-13`
- Phase：[E3 phase plan](../plans/2026-08-13-phase-e3-visible-celestial-bodies.md)
- Reviewer：Architecture Agent
- Commit/push：None；working tree intentionally uncommitted
- ADR：`ADR-0035` proposed
- SGP：`SGP-0003`；upstream-owned files=`1`

## Review request

请复核：

- `showSun/showMoon`、CSS pixel size、`moonColor`的strict validation、clone/no-op、requestRender与native-body conflict。
- SGP-0003是否严格保持`Scene.renderEnvironment`末尾单一optional primary-world hook，且不改变native environment/pass loop。
- procedural renderer的four-frustum projection、planar horizon、resident-terrain underground、foreground ordering与
  one VA/one ShaderProgram/two stable DrawCommands/zero texture lifecycle。
- E2 effective direction与native Clock authority、World ownership/destroy、default hidden零GPU allocation、installed delivery和
  direct Test中文lil-gui行为。

## Exact changed paths

- `.scenegis/upstream-patches.json`
- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyVS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRendererSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `scripts/scenegis/audit-upstream-patches.mjs`
- `scripts/scenegis/audit-upstream-patches.spec.mjs`
- `Test/平面环境.html`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0035-planar-visible-celestial-bodies.md`
- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e3-visible-celestial-bodies.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e3-visible-celestial-bodies.md`

共28个E3 paths。用户自有未跟踪`Test/地形.html`未读取、修改、暂存或纳入delivery。

## Implementation and deviations

- 新renderer只在至少一个天体实际可见时两阶段创建并发布GPU资源；hidden/default、horizon、behind-camera、underground
  路径均保持零首次allocation或复用warm资源。
- Sun/Moon直接在environment slot绘制、无depth写入，ordinary terrain/geometry随后自然覆盖；不进入command list、pick、
  depth、shadow或classification派生命令。
- Real Context Camera仅接受`PerspectiveFrustum`/`OrthographicFrustum`；这两类执行真实compile/link/draw/pixel。
  `PerspectiveOffCenterFrustum`/`OrthographicOffCenterFrustum`由private renderer hard-coded projection测试覆盖，未把Cesium
  Camera不支持的直接frustum安装伪装为real draw。这是测试入口事实，不改变四类投影产品支持。
- 无asset、texture、sampler、FBO、postprocess、第二Clock、timer、network或Moon light。
- Official audit最初因`Scene.js`已登记`SGP-0001`而阻塞。Architecture决定保留独立`SGP-0003`并批准audit-only scope
  amendment；审计器现按path保存registration数组，同path多登记仅允许全部`paired`，active pair必需、proposed pair可选但
  一旦存在必须合法、retired marker拒绝，changed lines按active与已落地proposed ranges并集覆盖，`manifest-only`保持排他。
  未改schema version、未新增upstream path或SGP。

## Validation evidence

| Command / evidence                                                                            | Result                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"`                    | TOTAL 19 SUCCESS                                                                           |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISWorld"`                                | TOTAL 2 SUCCESS                                                                            |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`                          | TOTAL 23 SUCCESS                                                                           |
| `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRenderer"` | TOTAL 6 SUCCESS；projection/viewport/candidate/context/destroy/shared scratch              |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCamera"`                         | TOTAL 56 SUCCESS；9 Camera helper+47同basenameController；optional result身份通过          |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`       | TOTAL 8 SUCCESS；real Context bodies/terrain/Clock/conflict/pick-depth/warm lifecycle      |
| `npm run build`、`npm run build-release`                                                      | passed                                                                                     |
| `npm run build-ts`、`npm run build-docs`、`npm run tsc`                                       | passed；仅既有TSD-JSDoc warnings                                                           |
| `node scripts/scenegis/verify-planar-packages.mjs`                                            | passed；10/10 GLSL、10/10 generated modules、E3 runtime/declarations/API与private hiding   |
| `node --test scripts/scenegis/audit-upstream-patches.spec.mjs`                                | 25/25 passed；含同path active/retired/proposed及既有duplicate/mixed/foreign/unmarked       |
| changed-scope ESLint/Prettier/Markdownlint、`Test/**` Prettier、`git diff --check`            | passed                                                                                     |
| `node scripts/scenegis/audit-upstream-patches.mjs`、SGP/generated/exact status audit          | passed；current delivery upstream-owned=1 (`Scene.js`)、SGP-0001/0003共同覆盖、generated=0 |

未运行full suite、E2E、Sandcastle gallery、公网自动化或无关terrain/content suites，符合phase plan。Direct Test manual
visual gate已在Architecture批准后由项目负责人执行并通过。

## Remaining risks and gate

- Native-body conflict按reference visibility在GPU/light/request mutation前fail-fast；调用方必须关闭native `scene.sun/show`与
  `scene.moon/show`后再启用planar bodies。
- Pseudo-fixed astronomy继续沿用E2 visual-grade精度；E3只消费effective direction，不扩大accuracy承诺。
- 项目负责人已于`2026-08-13`确认`Test/平面环境.html`人工验收通过；E3可完成并创建独立local checkpoint。
- checkpoint前不进入E4实现；不push、不publish。

## Architecture findings

- `E3-R001` — Severity: P1；Status: `addressed`。

  Candidate在创建VA前持有vertex buffer；VA成功后立即清空独立buffer reference，把ownership交给VA。Failure cleanup仅在
  VA尚未取得ownership时单独destroy buffer，避免double destroy。Injected VA-construction failure证明buffer exactly-once
  cleanup、Shader/VA未发布且renderer command/resource state保持undefined。

- `E3-R002` — Severity: P1；Status: `addressed`。

  Environment暴露同一soft-private native-conflict validation contract，renderer在任何Context检查、allocation或command
  execution前执行最终render-boundary guard。Real Context覆盖late Sun/Moon activation、native `show=false`允许、warm
  identity与command execute count不变；E1/E2 firstUpdate/update/setter继续复用同一规则。

- `E3-R003` — Severity: P2；Status: `addressed`。

  Renderer从active `passState.viewport` drawing-buffer尺寸按canvas CSS/drawing-buffer比例转换CSS width/height；无viewport
  时回退full canvas。Hard-coded DPR=2、partial viewport验证X/Y scale分别为0.2/0.8。

- `E3-R004` — Severity: P2；Status: `addressed`。

  `_SceneGISPlanarCamera.getFrustumInfo(frustum,result)`新增可选result且旧调用仍返回新对象；renderer持有一个
  `_frustumInfo` scratch，每render只分类一次并供Sun/Moon共享。四frustum exact projection、scratch identity与single-call
  evidence通过；hot path不再分配两个plain objects。

- `E3-R005` — Severity: P1；Status: `addressed`。

  Private suite现覆盖hidden zero state、lazy resources、candidate failure、second-Context cleanup/recreate、exactly-once destroy、
  viewport/four-frustum/horizon/back/screen clipping/shared scratch。Widget real Context新增resident-terrain above/below suppression、
  actual foreground terrain pixel occlusion、pick/depth/command-list non-interference、native Clock same-frame body movement、late
  conflict与world/environment/body visibility lifecycle；VA/SP/commands保持warm identities。

- `E3-R006` — Severity: P1；Status: `addressed`。

  Audit现在把同文件registration按status分为required active、optional proposed与history-only retired。Active必须有pair；
  proposed可尚无pair，但任何已存在pair仍参与合法range并集；retired marker明确拒绝且不覆盖live diff。Report patch IDs只含
  active与实际落地的proposed。25/25 fixtures新增active+retired独立退役、retired marker拒绝、active+unmaterialized/materialized proposed和
  single retired/no-diff，同时保留active stale、duplicate/mixed/foreign/unmarked语义。

- `E3-R007` — Severity: P1；Status: `addressed`。

  Native Clock case只经`widget.render()`执行`clock.tick()`与ControllerHost publication，并锁定same-time update不request、
  不改effective/published time/body center或资源identity。Late Sun/Moon用`preRender`在ControllerHost之后激活Scene-compatible
  native slot，由真实SGP-0003 hook同帧拒绝，warm renderer与execute count不变；native `show=false`经同一路径允许。
  `scene.pick`/`pickPosition`均在command spies生效后执行且零celestial execute。Underground使用downward normal frame建立的
  resident terrain sample，把真实camera置于height上下并经正常`widget.render()`证明suppress/execute，未使用产品test seam。

- `E3-R008` — Severity: P2；Status: `addressed`。

  Private projection suite新增非对称`OrthographicOffCenterFrustum(left=-1,right=3,bottom=-2,top=1)`数值资格，固定
  center `(-0.5, 5/6)`；既有非对称Perspective、四类对称投影与normal render single classification/shared scratch保持。

- `E3-R009` — Severity: P2；Status: `addressed`。

  Phase plan现明确public World/Surface仍是single-Context，private renderer仅在异常Context mismatch时先释放旧资源再
  cleanup/recreate，candidate failure保持empty/retriable而非保留无效旧Context资源。Architecture与Guide把E2限定为
  direction publication本身不创建body/moon light，并交叉链接E3的`showSun`/`showMoon` opt-in visible-body contract。

## Architecture conclusion

- `approved`。R001-R009全部关闭；产品实现、SGP-0003单一hook、status-aware multi-SGP审计、projection/resource lifecycle、
  native Clock/late-conflict/pick-depth/resident-terrain真实路径和durable contract已通过Architecture/code review。
- 自动化证据接受Execution记录的focused/build/release/types/docs/installed/audit结果，本轮Architecture未重复运行测试。
- 项目负责人已于`2026-08-13`确认`Test/平面环境.html`人工视觉/交互验收通过。E3 Architecture、自动化与manual gates全部
  关闭；由Architecture创建独立中文local checkpoint后，才可建立E4 confirmed phase plan并派工。不push、不publish。

## Execution changes-addressed response

- R006-R009均已addressed，未修改已接受的renderer产品行为，也未扩大upstream hunk或新增路径。
- Focused结果：audit fixtures 25/25、private renderer 6/6、Environment Widget real Context 8/8；scoped
  ESLint/Prettier/Markdownlint、`git diff --check`与official audit通过。
- Official audit确认current delivery upstream-owned=1（`Scene.js`），`SGP-0001`/`SGP-0003`共同覆盖该文件，generated=0；
  working tree仍为28个E3 paths加项目负责人自有`Test/地形.html`，未commit、未push。
- 未重跑wide build/package、Environment/World/Camera其他suite、E2E、Sandcastle或manual visual，等待Architecture focused
  re-review。
