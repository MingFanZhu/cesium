# 总体计划：SceneGIS 平面环境

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner role: `architecture`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-13`
- Parent extensions: completed `planar-world`、`planar-terrain-advanced`、
  `planar-surface-styling`
- Related discussions: 项目负责人提出日月方向、太阳光照、平面大气和 SkyBox 适配
- Related reviews: [E1 review request](../reviews/2026-08-13-e1-manual-celestial-light-contract.md)
- ADR: E1=`ADR-0033`；E2=`ADR-0034`；E3=`ADR-0035`；E4 expected `ADR-0036`；后续 phase 按激活时建立 ADR
- SGP: E1/E2/E4=None；E3=`SGP-0003`，E4只消费既有hook

## Objective

在 SceneGIS 真正平面 Cartesian3 world 上建立一套不依赖椭球、不猜测 CRS 地理含义、可渐进扩展的环境系统：先让应用以固定平面轴显式提供太阳和月亮方向，并把太阳方向接入现有 lighting；随后在应用提供平面项目原点对应的 WGS84 经纬度和时间时计算天文方向，再实现可见日月、独立平面大气、caller-owned SkyBox 预设以及地下行为。系统必须保留现有 world、camera、Surface、terrain 和 Cesium scene 生命周期，不让默认 Earth environment 静默进入 planar semantics。

## Non-goals

- 不从 `SceneGISPlanarWorld.crs`、extent、origin 或 provider metadata 推断地理位置。
- 不让 planar world 继承或伪装 `Globe`，不复制 Cesium Globe/SkyAtmosphere 的整套实现。
- 不把 Earth-fixed `Sun`、IAU-oriented `Moon` 或 ellipsoid `SkyAtmosphere` 当作 planar 方向来源。
- 不隐式下载或接管 SkyBox、星空、太阳/月亮纹理等资源。
- 不在环境系统中重新实现 terrain shading；它通过已存在的 `scene.light`/Surface lighting seam 协作。
- 不在总体计划中提前冻结后续 atmosphere shader、celestial billboard 或 astronomical library 的易变实现。
- `ImageryLayer.dayAlpha/nightAlpha`、shadow maps、云层、雾、天气和物理天空散射不是本扩展的默认承诺。

## Stable architecture boundaries

1. Planar local axes 始终为 `+X East / +Y North / +Z Up`。所有公开 celestial direction 都表示从平面观察者指向天体的归一化 world-axis direction；方位角采用从 `+Y` north 顺时针，仰角相对 XY plane。
2. Environment 不从 opaque CRS 或 terrain 数据推断天文位置。Manual mode 只接受应用显式方向；astronomical mode 必须额外接受应用声明的 planar project origin 所对应的 WGS84 `originLongitude`/`originLatitude`，并只消费 ControllerHost 明确传入的 simulation `JulianDate`，不读取系统时钟。该原点定义整个平面固定 `+X East / +Y North / +Z Up` frame 的局部 ENU 天文锚点；整张平面共享一组方向，不随 camera 或 planar XY 变化。
3. `SceneGISPlanarEnvironment` 是 caller-created、caller-registered 的 Cesium `Controller`。它复用 `CesiumWidget.addController/removeController` 或 `Viewer.addController/removeController`，不增加 `Scene.js`、`CesiumWidget.js` 或 `Viewer.js` upstream hook。
4. Environment 只在显式注册且 enabled 后取得 `scene.light` authority；默认 world 行为不变。`world.enableLighting` 仍由应用显式控制，Environment 不替调用方开启 terrain lighting。
5. Manual sun direction 通过稳定 `DirectionalLight` 接入；由于 Cesium `DirectionalLight.direction` 表示光传播方向，内部值必须是公开 observer-to-sun direction 的负向。Moon direction 在 E1 只作为未来可见 Moon/astronomical mode 的稳定状态，不伪装成第二个 scene light。
6. 同一 live world 同时最多注册一个 Environment。`connectedCallback` 在不写 `scene.light` 的前提下保留 world registry；
   `world.environment` 暴露当前 registered controller reference，包括 disabled 或尚未 first-update 的状态。World 不拥有或
   销毁它；Controller disable 只释放 light authority，remove/world destroy 才释放 registry，并执行明确、条件式的
   displaced `scene.light` 恢复。
7. Direction、color、intensity 等数值变化只更新现有 light/state 并请求渲染，不重建 Surface command、shader、terrain mesh、imagery texture 或 Controller registration。
8. Native Cesium `Sun`、`Moon` 与 `SkyAtmosphere` 保持 Earth semantics。Planar 可见日月和 atmosphere 使用 SceneGIS-owned renderer/shader，并由 Environment contract 提供方向和状态；不得改写 Earth automatic uniforms。
9. SkyBox 继续 caller-owned。SceneGIS 可提供纯配置 helper/preset，但不得隐式创建网络资源、替调用方销毁 SkyBox，或把 Earth SkyBox 解释成 CRS-aware environment。
10. 地下行为必须在可见天体/大气阶段显式定义并统一测试；不能依靠双面 Surface、camera controller 或 Earth horizon 的偶然裁剪结果。
11. SceneGIS 固定 environment shader 进入 `packages/engine/Source/Shaders/SceneGIS/**`，复用 ADR-0030 的生成/交付链；动态组合只保留必要 seam，不提交生成 `.js`。
12. 所有 `Test/**` 开发示例与保留 Sandcastle 的 tool panel 用户可见标题、标签、按钮、帮助和状态使用中文；technical API、标识符和 gallery metadata 可保留英文。
13. 默认只修改 SceneGIS-owned 路径。E3源码审计已证明普通command list中的`Pass.ENVIRONMENT`不会执行，批准新增
    `SGP-0003`：`Scene.renderEnvironment`末尾只调用一次optional primary-world environment method；不得扩大到其他
    pass、environmentState或native Sun/Moon算法。其他 upstream-owned diff 仍必须重新证明并经 Architecture 确认。
14. Phase 串行推进；每个 phase 完成实现、最小充分自动化、Architecture/code review、项目负责人要求的视觉 gate 与独立本地 checkpoint 后才能进入下一 phase。

## Source and baseline facts

- Predecessor checkpoint 为 `f4f4bd6e9f946fb6945bdce795183b14afdbd7cf`，分支为
  `feature/planar-environment`。
- `Scene.render(time)` 在 world `prePassesUpdate` 和 `updateFrameState()` 之前调用 public `ControllerHost.update(scene, time)`；因此 Controller 可在当帧 `frameState.light` 捕获前稳定设置 `scene.light`，无需新增 upstream render hook。
- `ControllerHost` 为 registered controller 提供 `connectedCallback`、一次 `firstUpdate(scene,time)` 和每帧 `update(scene,time)`；`CesiumWidget`/`Viewer` 已公开 `addController/removeController`。
- `SceneGISPlanarCameraController` 已采用 caller-created controller 模式；调用方须在 widget destroy 前显式 remove。Environment 沿用该 ownership，而不让 World 隐式注册 Controller。
- Cesium `Scene.light` 默认是 `SunLight`。`UniformState` 对 `SunLight` 使用 Earth ICRF/Earth-fixed 自动太阳方向；对 `DirectionalLight` 则使用其显式 direction。这证明 manual planar light 必须使用后者。
- Cesium `DirectionalLight.direction` 是光传播方向；planar API 采用更适合方位/仰角的 observer-to-body direction，接入时必须取负。
- Native `Sun`、`Moon` 和 `SkyAtmosphere` 分别依赖 Earth celestial automatic uniforms、IAU axes/position 和 ellipsoid radii，不能直接成为任意 planar CRS 的默认环境实现。
- 自定义 world 路径不会自动创建完整 Earth environment；ADR-0001 保留 caller 显式配置 generic SkyBox 的能力，但这不赋予它 planar celestial semantics。
- `SceneGISPlanarSurface` 已在 `world.enableLighting=true` 时消费 `frameState.light`，且
  `planar-surface-styling` 已证明 uniform/state mutation 可以保持 warm command/shader/VA/mesh identity。
- ADR-0030 已建立 `packages/engine/Source/Shaders/SceneGIS/**` 的 source/delivery ownership，可供后续 atmosphere renderer 复用。
- E1 已形成 checkpoint `b343b64bad`；direct `Test/**` development convention、local lil-gui Environment页与已批准平面相机交互形成checkpoint `a8c22d8c35`。E2以后一等开发示例修改`Test/平面环境.html`，不继续扩大legacy Sandcastle。
- 当前Cesium `Simon1994PlanetaryPositions`输出Earth-centered inertial Sun/Moon position；`computeTemeToPseudoFixedMatrix`提供同步UT1≈UTC approximation。E2固定该离线路径，避免ICRF/XYS readiness改变结果，并在应用显式声明的 WGS84 project-origin anchor 处计算 topocentric ENU 方向。
- E2独立checkpoint为`fa40b49dbb4ba6f14db68c5fe94852b9f47367ff`。E3审计确认native Sun/Moon分别绑定Earth
  automatic uniforms/physical radius与IAU Moon primitive；普通`Pass.ENVIRONMENT` command不会被pass loop执行，
  因此E3采用`SGP-0003`的单一primary-world environment hook和World-owned procedural renderer。

## Phase roadmap

| Phase | Objective                                                                               | Dependencies                             | Entry gate                                                                                  | Exit gate                                                                                                   | Status      | Phase plan                                                   |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| E1    | 建立 manual sun/moon direction、scene light authority、ownership/lifecycle 与中文示例。 | surface-styling checkpoint               | 审计 ControllerHost、Scene.light、DirectionalLight、World lifecycle 与 public delivery。    | 公共 contract/ADR、真实 Context 光照、恢复/独占、warm identity、dev/release/npm 和 manual gate 闭环。       | `completed` | [E1](2026-08-13-phase-e1-manual-celestial-light-contract.md) |
| E2    | 以 project-origin WGS84 anchor 和 host time 增加 astronomical Sun/Moon direction。      | E1 checkpoint、Test migration checkpoint | 重新审计当前 Cesium astronomy/transforms、time scale、accuracy 和 package boundary。        | manual/astronomical mode 切换、单原点 topocentric 确定性方向、时区/日期/极端纬度与 ownership 闭环。         | `completed` | [E2](2026-08-13-phase-e2-astronomical-direction-mode.md)     |
| E3    | 实现 SceneGIS-owned 可见太阳/月亮，并冻结尺度、遮挡和地下行为。                         | E2 checkpoint                            | 重新审计 billboard/command/render pass、depth/horizon 与资源 contract。                     | 日月视觉、方向同步、资源 ownership、requestRender、camera/underground 与 lifecycle 闭环。                   | `completed` | [E3](2026-08-13-phase-e3-visible-celestial-bodies.md)        |
| E4    | 实现独立平面大气与 caller-owned SkyBox 适配。                                           | E3 checkpoint、ADR-0030                  | 重新审计 atmosphere shader、fullscreen/sky pass、camera height、precision 和 SkyBox seams。 | 大气/天空合成、地下规则、SkyBox ownership、shader delivery、性能与真实 GPU 画面闭环。                       | `completed` | [E4](2026-08-13-phase-e4-planar-atmosphere-skybox.md)        |
| E5    | 完成环境能力联合资格、发布、文档和升级交付。                                            | E4 checkpoint                            | E1-E4 review/checkpoint 完成；固定最小联合矩阵。                                            | manual/astronomical light、visible bodies、atmosphere/SkyBox 在 dev/release/npm/lifecycle/docs 中统一闭环。 | `planned`   | 激活时建立                                                   |

## Cross-phase validation

- Jasmine 覆盖公共属性、failure atomicity、clone/no-op、Controller registration/exclusivity、scene light authority、restore 与 non-ownership。
- Real Context 覆盖实际 compile/link/draw/pixels、direction/color/intensity mutation、requestRender 和 warm command/shader/VA/terrain/imagery identities。
- 时间与 astronomy 阶段必须使用固定 `JulianDate`/project-origin anchor 的 deterministic vectors，不依赖系统时钟、locale 或公网。
- 可见日月/大气阶段验证 camera above/below terrain、horizon、requestRenderMode、Scene3D-only failure 与 destroy balance。
- Development build、release build、types/docs、installed npm tarball 和 SceneGIS shader delivery 按 phase 公共边界验证。
- `Test/**` direct development example和保留Sandcastle都是视觉gate，不替代Specs；项目负责人负责视觉表现验收，Architecture负责代码/契约质量。
- 每 phase 执行 ownership/generated-file/SGP 审计与 scoped static checks。

## Global risks and dependencies

- `scene.light` 是 scene-wide mutable state，Environment 与应用或其他 Controller 可能竞争。E1 必须冻结单 world 独占、每帧 reassert 与条件式恢复，避免销毁外部 light 或覆盖后来的 caller override。
- ControllerHost 会跳过 disabled controller；enabled setter、first update、remove 和 re-enable 的状态机必须在不泄漏 world registry 的前提下闭合。
- Cesium 天文 helpers 的坐标系和 time scale 以 Earth 为基准。E2 必须明确“项目原点 WGS84 经纬度处局部 ENU 方向”只是整个 planar fixed frame 的天文锚点，不会把 planar coordinates 变成地球坐标，也不会按 camera 或 planar XY 改变方向。该单原点近似适合局部/区域项目；大范围平面项目接受整图平行光近似。
- Native Sun/Moon/SkyAtmosphere 与 Earth automatic uniforms 耦合。E3/E4 若误复用会出现看似可见但方向、遮挡或尺度错误的适配。
- 无限平面没有天然 planet horizon；可见天体、大气和地下隐藏规则必须由 planar contract 定义，不能照搬 ellipsoid horizon。
- 大气可能增加全屏 pass、shader variants 和高分辨率 fill cost；E4 需预算 warm allocations、command count 和 requestRender 行为。
- SkyBox 资源可能跨 scene 共享；caller ownership 与 destroy 顺序必须独立于 Environment controller。

## Overall acceptance criteria

- 任意 planar CRS 可在不提供地理锚点时通过 explicit local directions 获得稳定太阳光照；提供 project-origin WGS84 longitude/latitude 和 host time 后可选 astronomical mode，且从不猜测 CRS。
- 公开 direction/azimuth/elevation 与固定 planar axes 定义一致，内部 `DirectionalLight` 符号转换有自动化和像素证明。
- 可见日月、大气和 SkyBox 在 above-ground/underground、requestRender 和 caller ownership 下行为清晰，不依赖 native Earth environment 偶然行为。
- 默认未注册 Environment 时现有 world、lighting、terrain styling、imagery、camera 与 scene lifecycle 完全不变。
- Uniform/state-only 变化不重建 Surface/terrain/imagery warm resources；新增 renderer 有明确 command/resource budget 和 exactly-once cleanup。
- Dev、release、installed package、focused Specs、真实浏览器/GPU visual gate、Architecture review、ADR/Guide/UpgradeChecklist 全部闭环。

## Progress and handoff

- `planar-surface-styling` S4 已通过 Architecture review、headed dev/release E2E 和项目负责人 final visual/manual gate，并形成 predecessor checkpoint。
- Architecture 已依据当前源码确认 ControllerHost timing seam、DirectionalLight sign、native Earth environment 边界和 E1 ownership design。
- E1实现已完成：新增Environment Controller、World registry/sever、unit与real-Context资格、local中文示例、ADR-0033和
  installed delivery验证。Architecture focused re-review与项目负责人manual gate均已通过，本次独立checkpoint不push。
- Architecture finding `E1-R001`已关闭：首次authority acquisition请求一帧，stable update不请求；unit与late registration
  真实ControllerHost时序证据证明同frame request/publish，且未扩大ControllerHost/Scene/Widget Source边界。
- E2实现、Architecture review、项目负责人manual gate与最小充分自动化均已完成：显式project-origin WGS84 anchor和
  Cesium原生Clock/host JulianDate驱动topocentric ENU Sun/Moon effective directions，同一stable light与E1 ownership保持；
  direct Test中文panel与installed delivery已闭环。E2以本次独立local checkpoint完成，未push。
- E3 implementation、自动化、Architecture/code review与项目负责人人工验收已完成：visible body为explicit opt-in、procedural/no-asset、
  World-owned renderer，消费E2 effective directions与native Clock；planar horizon、resident-terrain地下、four-frustum
  projection、native body conflict和one-VA/one-SP/two-command budget已实现。`SGP-0003`仅包含`Scene.js`中的single
  optional world environment hook；官方audit已扩展为允许同path的`SGP-0001`/`SGP-0003`独立paired registration，并按
  active/proposed/retired status支持独立落地与退役，同时保持manifest-only排他和合法range覆盖。E3-R001..R009均已
  closed；项目负责人已确认visible Sun/Moon、Clock、horizon/underground、foreground occlusion与中文lil-gui表现通过。
  E3独立checkpoint=`8ff8b48ebf`。
- E4源码再发现与confirmed phase plan已完成：独立fullscreen planar atmosphere、caller-owned fixed-axis
  `SceneGISPlanarSkyBox`、SkyBox→atmosphere→bodies顺序、native conflict、underground mask与one-pass resource budget已冻结；
  E4不修改upstream并只消费既有`SGP-0003`。Implementation、focused real-Context、build/types/docs与12/12 installed
  shader delivery、Architecture review和项目负责人manual gate均已完成；E4-R003示例cubemap seam修复也已复验通过，
  当前正在创建E4独立checkpoint，之后激活E5。
