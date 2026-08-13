# Phase Plan: E1 Manual Celestial Direction and Lighting Contract

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent plan: [planar-environment extension](2026-08-13-planar-environment-extension.md)
- Phase: `E1`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-13`
- Related discussions: 项目负责人要求先进入大气和日月扩展；Architecture 选择先固定 manual environment contract
- Related reviews: E1 implementation 时新建
- ADR: 新建 `Documentation/SceneGIS/Decisions/ADR-0033-planar-environment-manual-celestial-light.md`
- SGP: None expected；upstream-owned diff 出现前必须停止并升级计划

## Objective

新增 caller-created、caller-registered 的 `SceneGISPlanarEnvironment` Controller。它为一个 live
`SceneGISPlanarWorld` 保存显式 manual `sunDirection` 与 `moonDirection`，按固定
`+X East / +Y North / +Z Up` 语义把 observer-to-sun direction 转为一个稳定 Cesium
`DirectionalLight`，并在 ControllerHost 帧时序中显式管理 `scene.light` authority。E1 还要冻结同 world 独占、
enabled/registration、conditional restore、failure atomicity、non-ownership、requestRender 和 warm-resource
边界，提供中文 tool panel 的本地 deterministic Sandcastle，为 E2 天文模式和 E3/E4 视觉环境提供不返工的状态基础。

## Non-goals

- 不计算任何天文方向，不接受 reference longitude/latitude、时区、日期或 CRS 推断。
- 不创建或显示太阳/月亮 primitive、billboard、texture、occlusion 或 horizon。
- 不实现 atmosphere shader、SkyBox preset、underground sky rule、day/night alpha、shadow map 或第二个月光源。
- 不使用 native Earth `Sun`、`Moon`、`SunLight` direction、`SkyAtmosphere` 或 Earth automatic celestial uniforms
  作为 planar manual direction 的实现。
- 不自动注册 Controller，不增加 `SceneGISPlanarWorld` constructor option，不让 World 拥有/销毁 Environment。
- 不自动改变 `world.enableLighting`、`world.material`、imagery filter、terrain provider、camera controller 或 scene
  render mode。
- 不修改 Surface shader/command、terrain Worker/mesh、ControllerHost、Scene、CesiumWidget、Viewer 或 package/build
  pipeline。

## Entry conditions

- Branch=`feature/planar-environment`。predecessor checkpoint=
  `f4f4bd6e9f946fb6945bdce795183b14afdbd7cf`；正式 implementation base 由 Architecture planning checkpoint 与
  assignment 精确给出，Execution 开始时 working tree 必须 clean。
- `planar-surface-styling` S4 implementation、Architecture review、headed dev/release E2E、final visual gate 与独立本地
  checkpoint 均已完成。
- Architecture 已审计 `Scene.render`、`ControllerHost`、`CesiumWidget.addController/removeController`、
  `SceneGISPlanarCameraController`、`Scene.light`、`DirectionalLight`、`SunLight`、`UniformState` 和 World destroy seam。

## Current source facts

- `Scene.render(time)` 先调用 `controllerHost.update(scene,time)`，随后判定 request-render；实际 render 再调用
  `scene.updateFrameState()`，其中 `frameState.light = scene.light`。因此 Environment Controller 可在当前 frame light
  捕获之前更新 `scene.light`，且 property mutation 必须主动 `scene.requestRender()` 才能在 request-render mode 出帧。
- `ControllerHost.registerController` 先加入 controller/first-update set，再调用 `connectedCallback(element)`；
  `update` 跳过 `enabled=false` 的 controller，第一次 enabled update 依次调用 `firstUpdate` 和 `update`；
  `unregisterController` 才调用 `disconnectedCallback`。E1 的 callback 失败与 enabled 状态必须考虑该既有顺序。
- `CesiumWidget.addController/removeController` 已是公开注册 seam；Viewer 委托同一 API。现有
  `SceneGISPlanarCameraController` 明确要求 caller 在 widget destroy 前 remove，Environment 沿用该约定。
- `Scene.light` 默认是 caller-visible `SunLight`。`UniformState` 对 `SunLight` 走 Earth ICRF/Earth-fixed direction；当
  light 是 `DirectionalLight` 时直接消费其显式 direction。Environment 不得修改 automatic uniform 逻辑。
- `DirectionalLight.direction` 定义为光的传播/发射方向，构造时 clone direction/color；E1 public direction 定义为
  observer-to-body，因此内部 light.direction=`-sunDirection`。
- `SceneGISPlanarSurface` 仅在 `world.enableLighting=true` 时消费 `frameState.light`。当前例子和 real-Context Specs 已使用
  explicit `DirectionalLight`，证明无需改 shader；E1 只集中和管理该 state contract。
- `SceneGISPlanarWorld.destroy()` 当前销毁 Surface/imagery-owned resources，永不销毁 caller Material/provider；E1
  registry/reference 必须延续 caller ownership，不把 Environment 变成 World-owned resource。
- ControllerHost 不会在任意 caller controller 上自动执行 remove/disconnect。正常 contract 必须要求调用方先
  `removeController(environment)` 再 destroy widget；World destroy 仍需安全 sever internal registry，避免 caller-owned
  Environment 保留 destroyed world/scene authority。

## Public contract

新增 `SceneGISPlanarEnvironment`：

```js
const environment = new Cesium.SceneGISPlanarEnvironment({
  world,
  sunDirection: new Cesium.Cartesian3(1.0, 1.0, 1.0),
  moonDirection: new Cesium.Cartesian3(-1.0, -1.0, 0.5),
});
viewer.addController(environment);
world.enableLighting = true;

// Before viewer.destroy():
viewer.removeController(environment);
```

Constructor/options and properties:

| API                                       | Contract                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.world` / readonly `world`        | Required live `SceneGISPlanarWorld`; same module identity；Environment 永不销毁它。                                                                                   |
| `options.sunDirection` / `sunDirection`   | Required finite non-zero `Cartesian3`，observer-to-sun world direction；setter归一化后defensive clone，getter返回clone。                                              |
| `options.moonDirection` / `moonDirection` | Required finite non-zero `Cartesian3`，observer-to-moon world direction；同样normalize/clone。E1不显示Moon、不参与scene light。                                       |
| `options.sunColor` / `sunColor`           | Optional `Color.WHITE`；必须是finite `Color`，defensive clone；不限制HDR finite component，alpha随Color保存但lighting只消费RGB。                                      |
| `options.sunIntensity` / `sunIntensity`   | Optional `2.0`，finite non-negative number。                                                                                                                          |
| `enabled`                                 | Boolean，default `true`，遵守ControllerHost skip contract，并在active状态变更时完成light authority切换。                                                              |
| `light`                                   | Readonly stable `DirectionalLight` reference，供诊断/集成；Environment每次active update把它的direction/color/intensity纠正为public state。调用方不得替换该reference。 |

- 所有 constructor/setter validation 必须在写 state 前完成；wrong type、NaN/Infinity、zero direction、negative intensity
  均抛 `DeveloperError`，failure atomic。Direction normalization 必须先按最大绝对分量缩放再归一化，保证任意 finite
  non-zero Cartesian 不因平方和 overflow/underflow 产生非finite结果。归一化后与当前值相等、Color完全相等、数值相同和
  enabled同值均为 no-op。
- `sunDirection`/`moonDirection` getter不得暴露内部 mutable Cartesian。`sunColor` getter同样返回clone；setter不保存caller
  object。`light` identity从constructor至caller释放Environment始终稳定，不在每帧或setter分配新light。
- Direction conventions固定：`+X=east`、`+Y=north`、`+Z=up`；方位角从north顺时针，elevation从XY plane向上。
  E1只接受Cartesian direction，不新增azimuth/elevation public setter；Sandcastle可用以上公式转换UI。
- `moonDirection`是下一阶段的稳定状态，不被写入`scene.light`。E1不添加moon color/intensity，避免暗示双光源或可见Moon。
- `world.environment`新增readonly `SceneGISPlanarEnvironment | undefined`，表示当前成功注册到该world的Environment；不是
  constructor option或所有权入口。它在`connectedCallback`成功后立即返回该reference，包括disabled或尚未first-update的
  状态；只有未注册、removed或world-destroy severed时为undefined。

## Controller, authority, and lifecycle design

1. `connectedCallback(element)`先验证live world、element存在、instance未重复连接且`world.environment`未被另一instance占用；
   全部通过后才原子记录connection并占用world registry。它不监听DOM、不写`scene.light`。若callback失败，Execution须考虑
   ControllerHost已先插入controller的现状，确保instance/world自身无partial state；不修改ControllerHost来补偿。
2. `firstUpdate(scene,time)`先验证已连接、registry仍指向本instance、live Scene、`scene.world === world`和
   `SceneMode.SCENE3D`；所有验证成功后才记录scene、capture displaced light并取得authority。E1忽略time，但保留签名供E2
   使用。
3. Active authority取得时，Environment保存当时`scene.light`为displaced light，更新stable DirectionalLight，并设置
   `scene.light = environment.light`。每次active `update`重新验证scene/world并reassert同一light，因而外部临时改写将在下帧
   被Environment覆盖；这是显式registered controller的authority contract。
4. `enabled=false`时setter立即release authority：仅当`scene.light === environment.light`才恢复captured displaced light；
   若caller已把scene.light改成另一个reference，则保留caller的新值。无论哪种情况都清除captured light并request render，
   但保留scene connection和`world.environment` registry，确保disabled controller仍独占其world并可安全re-enable。
5. `enabled=true`在已完成firstUpdate的connected instance上立即重新验证/attach，capture当时scene.light并取得authority，
   request render；若instance从未firstUpdate，setter只改变flag，首次host update再attach。冲突/invalid scene时setter必须
   failure atomic并保持disabled/无authority。
6. `disconnectedCallback(element)`执行相同conditional restore，清除registry/scene/element/captured light；重复或错误element
   不得破坏另一个registration。正常调用方必须先remove再destroy widget。移除后同一live Environment可以重新注册到仍使用
   同一world的另一个host scene。
7. `SceneGISPlanarWorld.destroy()`若存在active Environment，调用窄的SceneGIS soft-private sever hook：执行conditional light
   restore并清除Environment的scene authority、captured light和world registry，但不destroy
   Environment/light/displaced light，不调用upstream ControllerHost，也不伪造`disconnectedCallback`。Environment必须保留
   host registration/element标记，直到caller实际`removeController`，避免同一instance仍残留在旧ControllerHost时又被注册。
   之后remove只完成idempotent connection cleanup；再次update必须以destroyed world报错而非重取authority。
8. Multiple Environment竞争同一world时，第二个在`connectedCallback` validation阶段fail-fast，即使第一个disabled或尚未
   first-update也不释放独占；不得改变第一Environment、`scene.light`、world registry或request-render状态。不同world可各自
   拥有一个Environment。
9. Property setter在active时同步更新stable light并`scene.requestRender()`；inactive/未firstUpdate时只更新state。Moon direction
   虽E1无visual consumer，active时也request render以冻结未来一致语义。每帧update不得无条件request render，否则破坏
   requestRenderMode。
10. Environment与World都不destroy `scene.light`、captured displaced light或stable DirectionalLight；这些light无GPU destroy
    contract。E1不增加Environment `destroy/isDestroyed`，caller生命周期以Controller registration/remove为边界，与现有
    planar camera controller一致。

## Affected paths

### Allowed

- 新增 `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- 新增 `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- 新增
  `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- 新增 `packages/sandcastle/gallery/scenegis-planar-environment/index.html`
- 新增 `packages/sandcastle/gallery/scenegis-planar-environment/main.js`
- 新增 `packages/sandcastle/gallery/scenegis-planar-environment/sandcastle.yaml`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`（仅需要补Controller/launcher用法时）
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- 新增 `Documentation/SceneGIS/Decisions/ADR-0033-planar-environment-manual-celestial-light.md`
- `AgentDocs/planar-environment/**`

### Forbidden without Architecture re-approval

- upstream-owned `Scene.js`、`CesiumWidget.js`、`Viewer.js` 及其 SGP-0001/0002 hunk
- `ControllerHost.js`、`Controller.js`、`UniformState.js`、`DirectionalLight.js`、`SunLight.js`、`Sun.js`、`Moon.js`、
  `SkyAtmosphere.js`、`SkyBox.js`、`Atmosphere.js` 或 automatic uniforms
- `SceneGISPlanarCameraController.js`、widgets Viewer integration或legacy camera state
- `_SceneGISPlanarSurface*`、`Source/Shaders/**`、Ground/Primitive、Material/Fabric或render commands
- terrain provider/data/mesh/Worker/quadtree/upsampling、imagery layer/filter/request/cache/texture runtime
- package manifests、root/sandcastle Vite/server/gulp/build/index generator、`.gitignore`、`.scenegis/**`
- `Specs/e2e/**`、现有Sandcastle目录、网络fixture/download、SkyBox/solar/lunar assets
- generated index/declaration/API docs/SpecList/Shader JS或`Build/**`

任何必须扩大产品路径的发现都先回报Architecture，更新plan/assignment后再实现；不得为自动注册或方便测试修改upstream。

## Implementation steps

1. Execution复核branch/base/status、本plan与predecessor checkpoint；完整复读相关`AGENTS.md`、DevelopmentGuide、
   Architecture、ADR-0001、ADR-0012、ADR-0030、ADR-0032与upstream manifests。任何源码事实偏差先回报。
2. 先实现Environment的pure validation/normalization/clone/no-op/stable-light state，再用focused unit Specs冻结constructor和
   property contract；不要先接scene lifecycle。
3. 为World增加readonly registry和最小SceneGIS soft-private attach/detach/sever seam；World保持reference-only、
   no-constructor-option、non-owner。用World/Environment Specs锁住one-per-world与destroy behavior。
4. 实现Controller callbacks、first-update validation、authority capture/reassert、enabled transition、conditional restore、
   requestRender和failure atomicity。不得修改ControllerHost来处理Environment特例。
5. 新增real-Context Widget spec，用本地deterministic斜坡/terrain证明方向符号、color/intensity pixels、warm identities、
   request-render、disable/remove/re-enable/external override与World destroy；可复用SceneGIS-owned fixture helper，不复制大段
   upstream测试实现。
6. 新增`scenegis-planar-environment` Sandcastle。tool panel用户可见文案全中文，至少提供太阳方位角/仰角、强度、
   lighting enable、manual reset和当前方向状态；Moon direction可展示为contract状态但明确“本阶段不显示月球”。采用本地
   deterministic terrain/imagery，不以公网作为可用性gate；overlay显式position/z-index/scroll/credit-safe。
7. 新建ADR-0033并更新Architecture/Guide/UpgradeChecklist；记录ControllerHost timing、observer-to-body sign、one-per-world、
   scene-wide authority/restore、requestRender、caller ownership、native Earth environment排除与E2升级条件。
8. 扩展installed package verifier，证明新class ESM/CJS/public declarations/API、constructor/property/default/ownership基础契约；
   不把DOM/WebGL-only Controller update强塞进bare no-DOM consumer。
9. 运行本plan最小充分验证，回写精确case count、偏差、未运行项、ownership/SGP/generated状态；新建E1 review request并
   通知Architecture。review approved前不请求manual gate。

## Automated validation

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"`
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"`
- `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"`
- 如共享fixture或existing lighting regression实际受影响，才追加最窄的
  `SceneGIS/Widget/SceneGISPlanarTerrainStylingCesiumWidget` case；不得默认重跑无关full suite。
- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`
- 在`packages/sandcastle`运行`npm run build-gallery-no-embedding`。
- changed-scope ESLint、Prettier、Markdownlint；AgentDocs另运行
  `npx prettier --check --ignore-path .gitignore "AgentDocs/planar-environment/**/*.md"`与
  `npx markdownlint "AgentDocs/planar-environment/**/*.md"`。
- `git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`
- `git status --short`与generated-file audit；generated declarations/API/build只读验证，不进入diff。

Real-Context evidence至少覆盖：

- registration前`scene.light`与world行为不变；first normal frame前Environment通过ControllerHost取得authority，
  `scene.light === environment.light`，light direction精确等于normalized `-sunDirection`；
- fixed non-flat terrain上east/north/up和低仰角manual sun方向至少两组产生deterministic lighting pixels；color/intensity
  mutation同样改变pixels且不更换tile、DrawCommand、ShaderProgram、VA、terrain mesh、imagery texture/binding；
- active property setter在requestRenderMode下产生一个有效render request；stable帧update不持续request；inactive mutation
  不触碰scene light，但disabled registered Environment继续保留registry；
- enabled false恢复原SunLight；re-enable capture当前light并重取authority；remove同样恢复。若caller在Environment active期间
  替换scene.light，disable/remove保留caller override而不恢复stale light；
- 同world第二Environment冲突在第二instance或light mutation前失败，并保持第一registry；wrong scene/world/mode、destroyed
  world和duplicate connection failure atomic；
- world destroy sever registry、conditional restore且不destroyEnvironment/任何light；正常remove-before-widget-destroy无
  callback/reference泄漏，reconnect live world行为闭环；
- `moonDirection` normalize/clone/request语义成立，但不改变scene light direction/intensity或宣称Moon pixels。

## Manual gate

Architecture/code review approved后，由项目负责人使用 SceneGIS Sandcastle dev launcher 打开
`scenegis-planar-environment`：

- 中文tool panel标题、标签、按钮、帮助、状态可读，紧凑视口可滚动且不遮挡credit；
- 太阳方位/仰角/强度控制能连续改变真实terrain明暗，reset恢复确定预设；
- lighting开关语义清楚，禁用Environment或移除时不留下错误scene light；
- panel明确Moon在E1仅保存方向、不显示可见月球，避免把未来能力误当已实现；
- Cesium画面与本地bucket正常加载，无console startup error。

项目负责人已明确视觉表现由其把关；Architecture review不重复视觉用例，仅审代码、contract和证据。manual gate确认前不得
创建E1 completion checkpoint或进入E2。

## Risks and dependencies

- ControllerHost在`connectedCallback`前已插入controller；duplicate/invalid connection抛错后host可能仍保留条目。这是
  upstream public API行为，E1不得patch host。Sandcastle/Guide必须只注册已正确构造的instance，Specs应记录而不是假装
  callback失败会自动rollback host。
- ControllerHost跳过disabled controller，因此enabled setter必须自行release/restore；若只在update里处理，会永久保留
  Environment light和world registry。
- `scene.light`是全scene而非只供Surface使用。Environment显式authority也会影响Models/3D Tiles等其他light consumer；
  Guide/ADR必须说明，不能宣称仅影响planar terrain。
- External caller可在active期间写`scene.light`。每帧reassert与conditional restore的组合容易覆盖新caller intent或恢复stale
  light，必须用reference identity cases冻结。
- Public getter clone与per-frame stable identity要求相冲突时，应把clone限制在public value properties，内部scratch/stable
  light无热路径分配。
- E1不显示Moon。示例和docs必须清晰区分“方向contract可用”与“天体visual已适配”，避免过度声明。

## Completion criteria

- `SceneGISPlanarEnvironment` public Controller contract、World registry、fixed-axis direction、stable light sign、
  one-per-world authority和conditional restore由ADR-0033、Guide与Specs一致冻结。
- 未注册默认路径零行为变化；注册后manual light在真实Context实际compile/link/draw/pixels成立，且setter保持warm
  Surface/terrain/imagery identity、requestRender和lifecycle正确。
- Moon direction作为明确的non-visual future state交付，不伪装成Earth Moon、second light或已完成视觉适配。
- 中文environment Sandcastle通过项目负责人manual gate；types/docs、dev/release/installed package、ownership、SGP和
  generated-file检查全部通过。
- upstream-owned files=0、SGP=None；Architecture review approved后才由Architecture创建独立中文本地checkpoint，
  未push，再讨论E2。

## Execution constraints

- 正式assignment前不实现；assignment后仅按本phase和精确base工作。
- Implementation/review期间不得commit、不得push、不得publish、不得进入E2。
- Execution必须回写本phase plan、extension roadmap/README、plans/reviews indexes、review request和current handoff，保留
  implementation deviations、exact changed paths、验证结果、未运行项和风险。
