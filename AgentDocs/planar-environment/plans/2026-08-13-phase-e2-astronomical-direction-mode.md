# Phase Plan: E2 Astronomical Celestial Direction Mode

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-environment extension](2026-08-13-planar-environment-extension.md)
- Phase: `E2`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-13`
- Predecessor checkpoints: E1=`b343b64bad`；direct `Test/**` development migration=`a8c22d8c35`
- Related reviews: E2 implementation时新建
  `../reviews/2026-08-13-e2-astronomical-direction-mode.md`
- ADR: 新建
  `Documentation/SceneGIS/Decisions/ADR-0034-planar-environment-astronomical-directions.md`
- SGP: None expected；任何 upstream-owned diff 出现前必须停止并升级计划

## Objective

在不改变 E1 manual contract、Controller ownership、scene-light authority 或 Surface
rendering 的前提下，为 `SceneGISPlanarEnvironment` 增加显式
`"manual" | "astronomical"` direction mode。Astronomical mode 只使用调用方声明的 planar project
origin 所对应的 WGS84 longitude/latitude 和 ControllerHost 当前 simulation `JulianDate`，通过当前 Cesium
`Simon1994PlanetaryPositions` 与同步 pseudo-fixed transform 计算该项目原点 observer-to-sun、
observer-to-moon 的局部 ENU 方向，并映射到固定 planar
`+X East / +Y North / +Z Up` axes。整张平面共享这组 scene-wide 方向，不随 camera 或 planar XY
变化。计算结果驱动同一 stable `DirectionalLight`，同时作为
E3 可见 Sun/Moon 的有效方向来源。

E2 还要冻结 manual/effective direction 的兼容关系、project-origin/time validation、离线确定性、
月亮视差、mode/origin/time mutation 的 requestRender 与 failure-atomic publication，并把经项目负责人
验收的 `Test/平面环境.html` 扩展为中文 lil-gui 天文时间/项目原点示例。

## Non-goals

- 不创建、显示或遮挡 Sun/Moon primitive、billboard、texture、disc 或 glow；这是 E3。
- 不实现 atmosphere、SkyBox preset、horizon、underground sky rule、shadow map、moon light、
  imagery `dayAlpha/nightAlpha` 或 twilight model。
- 不提供 survey/navigation-grade、JPL ephemeris、EOP/XYS preload 或可配置 astronomy provider。
- 不从 `world.crs`、extent、terrain、imagery provider 或 EPSG:3857 坐标推断 project-origin geodetic
  anchor；该 anchor 必须由应用显式声明。
- 不把 planar position 转成 ECEF。WGS84 observer 只存在于独立 astronomy calculation 中，输出再映射回
  固定 planar axes。
- 不按 camera position、terrain sample、planar XY 或 project extent 计算逐点变化的 celestial direction；
  E2 明确采用一处项目原点、整张平面共享的 tangent-frame approximation。
- 不调用 `JulianDate.now()`、JavaScript `Date`、locale 或系统时区作为运行时方向来源。
- 不复用 native Earth `SunLight`、`Sun`、`Moon`、automatic celestial uniforms、
  `SkyAtmosphere` 或 mutable `Transforms.computeIcrfToCentralBodyFixedMatrix`。
- 不修改 World、Surface、Shader、terrain/imagery、ControllerHost、Scene、CesiumWidget、Viewer、
  Sandcastle、build/package manifest 或 generated files。

## Entry conditions

- Branch=`feature/planar-environment`。
- E1 implementation、Architecture review、项目负责人 manual gate 与独立 checkpoint
  `b343b64bad` 已完成。
- Direct `Test/**` development migration 与平面 Environment 示例 checkpoint
  `a8c22d8c35` 已完成；用户自有未跟踪 `Test/地形.html` 不属于本阶段。
- 正式 implementation base 是包含本 plan 的 Architecture planning checkpoint；Execution 只以 assignment
  中给出的精确 commit 开始，且除用户 `Test/地形.html` 外不得混入其他 working-tree 修改。
- Architecture 已重新审计当前 Cesium astronomy/transforms、ControllerHost time、time scale、
  package boundary 与 direct Test development convention。

## Current source facts

- `ControllerHost.update(scene,time)` 的 `time` 是当前 simulation `JulianDate`；第一次依次调用
  `firstUpdate(scene,time)` 与 `update(scene,time)`。E1 已保留这两个 time 参数，且 Controller update
  发生在 Scene request-render 决策与 `frameState.light` capture 之前。
- `CesiumWidget.render()` 把其 Clock 产生的 `currentTime` 传给 `scene.render(currentTime)`；应用可以通过
  Widget/Viewer Clock 或显式 Scene render time 控制天文时刻，无需 Environment 创建第二个 clock。
- `Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame` 与
  `computeMoonPositionInEarthInertialFrame` 接受 `JulianDate`，内部从 TAI 转 TT/TDB，并输出
  Earth-centered inertial meter position。仅在省略时间时它们才调用系统时钟；E2 必须始终显式传 time。
- Cesium native `UniformState` 使用 `Transforms.computeIcrfToCentralBodyFixedMatrix`；该入口先尝试
  ICRF/ITRF 数据，再在数据未加载时 fallback 到 `computeTemeToPseudoFixedMatrix`。因此同一时刻可能随
  global XYS/EOP readiness 走不同路径，而且 central-body hook 可被调用方替换为 Moon-fixed transform。
- `computeTemeToPseudoFixedMatrix` 是同步、无网络的 public transform，明确使用 UT1≈UTC 近似。当前 Cesium
  Moon、Path 和 Sandcastle lighting 也在 ICRF transform unavailable 时采用该 fallback。E2 为保证独立于
  async/global readiness 的确定性，固定只使用该 pseudo-fixed approximation，并明确为 visual-grade。
- `Transforms.eastNorthUpToFixedFrame` 的 columns 定义 local east、north、up。E2 可以在应用声明的 WGS84
  project-origin height=0 建立 observer ECEF 与 ENU basis，再用 inverse rotation 把 fixed
  observer-to-body vector 映射到
  planar axes；不得把 translation 当 vector 重复应用。
- Sun/Moon helper 和 Transform 均为当前 engine public Core modules，但 Environment 源码必须使用相对 source
  imports，不从 generated barrel 或 package 自引用。无需新增 Core wrapper、export 或 build seam。
- E1 `sunDirection`/`moonDirection` 是 writable manual state；stable light、registry、enabled、conditional
  restore、requestRender 与 non-ownership 已被 Specs/real Context/package 验证。E2 必须保留这些行为。

## Public contract

### Constructor and properties

在既有 constructor options 上增加：

| API                                           | Contract                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options.directionMode` / `directionMode`     | Optional `"manual"`，只接受 `"manual"` 或 `"astronomical"`。                                                                                                                   |
| `options.originLongitude` / `originLongitude` | Project-origin WGS84 longitude radians；optional、finite、inclusive `[-PI, PI]`，astronomical mode 必须 defined。                                                              |
| `options.originLatitude` / `originLatitude`   | Project-origin WGS84 geodetic latitude radians；optional、finite、inclusive `[-PI/2, PI/2]`，astronomical mode 必须 defined。                                                  |
| `sunDirection` / `moonDirection`              | 保持 E1 writable manual fallback/input contract，始终 normalize/clone。Astronomical mode 下修改它们只更新 manual fallback，不改变当前 effective direction 或请求无意义的一帧。 |
| readonly `effectiveSunDirection`              | 当前实际 observer-to-sun planar direction clone。Manual mode 等于 `sunDirection`；astronomical mode 在成功 host update 后等于 computed direction。                             |
| readonly `effectiveMoonDirection`             | 当前实际 observer-to-moon planar direction clone，语义同上；E2 仍不显示 Moon、不创建 moon light。                                                                              |
| readonly `light`                              | 保持同一 stable `DirectionalLight`；其 direction 恒为 normalized `-effectiveSunDirection`。                                                                                    |

- `options.sunDirection` 与 `options.moonDirection` 继续 required，作为 manual mode 和 astronomical mode
  未首次发布/回退时的显式 fallback；E2 不以 arbitrary default 破坏 E1 constructor validation。
- Constructor 使用 `directionMode="astronomical"` 时必须同时提供合法 `originLongitude`/`originLatitude`；但天文 direction
  只在第一次 ControllerHost update 收到显式 time 后原子发布。在此之前 effective directions 等于 manual fallback，
  Environment 也尚未取得 light authority。
- Origin height 固定为 WGS84 ellipsoid surface `0m`，E2 不增加高度、timezone 或 CRS property。
  Longitude/latitude 是应用声明的 project-origin geodetic anchor；它定义整个 planar frame 的 ENU 朝向，
  不表示 E2 会把每个 planar coordinate 重投影到地球。
- Manual mode 可令 origin longitude/latitude 为 `undefined`。Origin setter 在 manual mode 可设置或清除；切换到
  astronomical 前完整验证二者。Astronomical mode 下清除任一 origin property 必须 fail-fast，保持 mode/origin/
  effective direction/light/request state 不变。
- 所有 getter 不暴露 mutable internal Cartesian/Julian state。Direction setter、mode/origin setter 的 wrong
  type/range/NaN/Infinity 与 invalid mode 均抛 `DeveloperError` 并 failure atomic；same mode/origin/manual
  normalized value 是 no-op。

### Mode and effective-direction publication

1. Manual mode 完全保留 E1：manual setter 同时更新 effective direction；active authority 下同步 stable light 并
   request 一帧。Host time 变化不计算 astronomy、不 request render。
2. 切换到 astronomical 先验证 project-origin anchor；成功后标记 astronomy dirty，并在 active authority 下 request 一帧。
   下一次 host update 使用该帧 time 同时计算 Sun/Moon candidates，全部成功后才原子发布 effective directions、
   stable light 与 cached time。不得在 setter 中读取系统时间。
3. Astronomical mode 下 manual direction setter只更新未来 manual fallback；不会改 effective/light，也不会
   request render。切回 manual 时原子把两份 manual fallback 发布为 effective directions、同步 light并请求一帧。
4. Astronomical origin 变化在 active mode 标记 dirty/request；下一 host update 才发布一组同时刻的 Sun/Moon。
   Manual mode 中 origin 变化不影响当前画面，不 request。
5. Astronomical host time 与最后成功 published `JulianDate` exact-equal 且 origin/mode不dirty时不重复计算、
   不 request。time 不同则在 Controller update 内先计算再 publication，并 request 当前 frame；连续 running Clock
   因方向持续变化而连续出帧是显式 astronomical animation，不是 hidden timer。
6. Setter 已为下一 host frame请求渲染时，该 frame 的 astronomy publication不得再产生冗余下一帧 request。
   First update同样只保留E1首次authority acquisition的一次request；其紧随的`update`不得重复计算/request。
7. Disabled ControllerHost不会调用update。Re-enable继续遵守E1立即light authority/request contract；下一次host
   update必须在该已请求frame内以current time刷新effective direction，不能显示stale astronomical light或再请求
   一个无必要frame。

## Astronomy calculation

每次 candidate calculation 使用 controller-owned scratch objects，步骤固定：

1. 验证 `time instanceof JulianDate`，且 day/seconds components represent finite data；绝不省略 time 参数。
2. 以 `Cartographic(originLongitude, originLatitude, 0.0)` 和 `Ellipsoid.WGS84` 得到项目原点 observer fixed
   position；建立 `eastNorthUpToFixedFrame` 与其 rigid inverse rotation。
3. 用 `Transforms.computeTemeToPseudoFixedMatrix(time)` 得到唯一同步 inertial-to-pseudo-fixed rotation。
4. 分别调用 Simon1994 Sun/Moon Earth-centered inertial position并旋转到 pseudo-fixed。
5. 对每个 body 执行 `bodyFixed - observerFixed`，因此 Moon 保留 project-origin-dependent topocentric parallax；
   不允许仅 normalize Earth-center body position冒充 observer direction。
6. 只把 line-of-sight 当 vector 映射到 local ENU，不应用 inverse translation；ENU x/y/z 直接成为 planar
   east/north/up。
7. 对两份 candidate 采用 E1 scaled normalization，检查 finite/non-zero。只有 Sun/Moon、time/origin candidates
   全部成功后才 clone 到 effective state、sync light与cached time。

该 pipeline 是当前 Cesium Simon1994 + pseudo-fixed visual approximation。ADR 必须记录 UT1≈UTC、ICRF/TEME
fallback frame approximation与非高精度定位边界；不得给出 arcsecond、survey、navigation 或 eclipse accuracy 承诺。

## Failure atomicity and lifecycle

- Astronomical constructor/mode/origin/time validation failure不得改变 manual/effective directions、stable light、
  Scene light、world registry、request count或cached time。
- `firstUpdate` 必须在记录 scene、capture displaced light、取得 authority 前完成 astronomical time/origin/body
  calculation；失败保持 E1 zero scene/light/request mutation。
- Active `update` calculation failure保留最后成功 effective directions/light/cached time 与当前 conditional-restore
  state；不得部分发布 Sun 或 Moon。错误可上抛，不得 fallback 到系统时间、Earth automatic uniform或静默 manual mode。
- Connection、one-per-world、enabled、external override、remove、reconnect、World sever与 caller ownership完全沿用
  ADR-0033。E2 不新增 observer、listener、timer、Promise、network request、GPU resource或 destroy method。
- Direction/origin/time mutation不得重建 Surface tile/DrawCommand/ShaderProgram/VA/terrain mesh/imagery
  binding/texture，也不得修改 imagery request、selection、cache或 `tilesLoaded`。

## Allowed paths

Product and focused Specs:

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`

Direct development example and delivery verifier:

- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`

Formal documentation:

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0034-planar-environment-astronomical-directions.md`（new）

Durable phase writeback:

- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e2-astronomical-direction-mode.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e2-astronomical-direction-mode.md`（new）

如确需新增另一个 SceneGIS-owned focused Spec path，Execution 必须先在 phase plan 写明事实与理由并取得
Architecture 确认；不得自行扩大 product path。

## Forbidden paths and changes

- 禁止修改 `packages/engine/Source/Core/**`，包括 `Simon1994PlanetaryPositions.js`、`Transforms.js`、
  `JulianDate.js`、`Ellipsoid.js`；E2只能组合现有 public helpers。
- 禁止修改 `SceneGISPlanarWorld.js`、Surface/Shader、terrain/imagery、camera controller、ControllerHost、Scene、
  CesiumWidget、Viewer、Renderer automatic uniforms或任何 upstream-owned file。
- 禁止修改 `packages/sandcastle/**`；E1 Sandcastle只作为legacy checkpoint保留，E2开发示例使用`Test/**`。
- 禁止修改 `Test/地形.html`、`Test/lib/**`、`Test/AGENTS.md` 或新增第三方库；现有 lil-gui 足够。
- 禁止修改 package manifest、gulp/build/server/Playwright/workflow、SGP manifest或生成文件：
  `packages/engine/index.js`、`index.d.ts`、`Build/**`、`Source/Cesium*`、`Specs/SpecList.js`。
- 禁止 visible body、atmosphere、SkyBox、second light、shadow、day/night imagery、CRS inference、async EOP preload、
  network astronomy或高精度历算。

## Implementation sequence

1. 先扩展 Environment unit Specs，锁定 mode/project-origin validation、manual/effective semantics、constructor/first-update
   failure atomicity、fixed vectors、timezone-equivalent JulianDate、date changes、extreme latitudes、Moon parallax、
   requestRender/no-op与E1 lifecycle regression。
2. 在单一 `SceneGISPlanarEnvironment.js` 内以 file-scope helpers/scratch实现 astronomy；当前没有跨模块复用需求，
   不为未来E3提前创建private astronomy subsystem。
3. 扩展 real-Context Widget Spec：以local deterministic terrain/imagery和fixed clock/project-origin证明实际
   compile/link/draw/pixels、manual↔astronomical、time/origin mutation、stable light与warm resource identities。
4. 更新 `Test/平面环境.html` 的 lil-gui 中文 panel，保留公开 EPSG:3857 terrain/imagery、planar camera与fallback；
   增加模式、经纬度（UI用degrees转换）、UTC ISO time、时间步进/重置和有效太阳/月亮方位仰角状态。
5. 新建 ADR-0034，并更新 Architecture/Guide/UpgradeChecklist。ADR-0033保持E1历史事实，不回写新行为冒充原决定。
6. 扩展 installed package verifier，验证 E2 ESM/CJS public runtime shape、manual/effective clone/mode/origin contract、
   engine/root declarations与API anchors；不得把generated output加入status。
7. 完成 focused/build/delivery/static/ownership 审计，回写 phase plan、extension roadmap、review request与handoff，
   发送 review-ready；Architecture批准前不请求项目负责人manual gate。

## Automated acceptance

Focused Specs:

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"
```

Unit evidence至少覆盖：

- default manual、合法/非法 mode，origin undefined/range边界、setter clear rules、same-value no-op与failure atomicity；
- manual/effective clone与fallback，astronomical publication后切回manual，astronomical下manual mutation不影响effective；
- fixed `JulianDate`/project-origin 的 hard-coded Sun/Moon normalized vectors与`light.direction=-effectiveSunDirection`；
- 两个不同时区ISO字符串表示同一instant时结果相同；跨UTC日期/季节改变结果；不得读取系统time/locale；
- equator、mid-latitude、`+/-PI/2` finite normalized结果，explicit longitude对pole convention可重复；
- distant project origins下Moon方向具有topocentric difference，Sun/Moon同时原子publish；
- first update、time/origin/mode mutation、stable time与reenable request count，无重复frame request；
- wrong scene/world/mode、disconnect/reconnect、World sever与external override E1 regression。

Real Context evidence至少覆盖：

- local deterministic non-flat terrain + imagery，fixed project-origin/time astronomical light实际link/draw/pixel；
- fixed time/origin变化产生预期signed lighting差异，manual↔astronomical切换与`effective*Direction`一致；
- requestRenderMode下same time稳定，time/origin mutation在当前requested frame生效；
- warm tile/DrawCommand/ShaderProgram/VA/terrain mesh/imagery binding/texture identities保持；
- no visible Sun/Moon、no second command/light、Moon仍只保存effective direction。

Public delivery：

```powershell
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
node scripts/scenegis/verify-planar-packages.mjs
```

- `build-ts`已知baseline TSD-JSDoc warning可以保留，但命令必须exit 0，且E2 declarations由verifier显式检查。
- 因E2不修改Sandcastle gallery，不运行gallery build；不运行full suite、E2E、public-network automation或无关
  terrain-styling suites。
- Changed-scope ESLint/Prettier/Markdownlint、`Test/**`显式Prettier、`git diff --check`、
  `node scripts/scenegis/audit-upstream-patches.mjs`、exact status/generated audit必须通过。

## Manual gate

Architecture/code review批准后，才由项目负责人使用根 Cesium development server 打开：

```text
/Test/平面环境.html
```

人工确认：

- lil-gui用户可见说明为中文，manual/天文模式、项目原点经纬度、UTC时间与重置可理解；
- 在公开 EPSG:3857 terrain/imagery（或明确fallback）上，修改项目原点经纬度/time会改变真实地形光照；
- 切回manual恢复手动太阳方向；状态显示有效太阳/月亮方位仰角；E2不出现可见Sun/Moon；
- 平面相机wheel/pan/rotate继续工作，panel compact/credit-safe，无console/page startup error。

项目负责人只负责视觉和交互表现；Architecture负责代码、坐标、时间、ownership与delivery正确性。

## ADR, ownership, generated files, and commit rules

- ADR-0034必须冻结：public mode/project-origin/effective-direction API、ControllerHost time authority、单项目原点
  topocentric ENU pipeline、整张平面共享方向、pseudo-fixed visual accuracy、failure atomic publication、
  requestRender与E1 ownership兼容。
- Expected upstream-owned files=`0`，SGP=None。出现任何 upstream-owned diff 时立即停止，不得自行登记或实现。
- Generated files只可生成后read-only验证，不得进入`git status`或commit。
- Execution不得commit、push、publish或进入E3；保持working tree供Architecture独立review。
- Architecture review、所有findings、项目负责人manual gate与ownership/generated审计均通过后，由Architecture创建
  独立中文E2 checkpoint，之后才能细化E3 visible celestial bodies。

## Completion criteria

- Manual contract完全兼容，astronomical mode只在显式project-origin WGS84 anchor和host time下运行，绝不推断CRS或系统时间。
- Effective Sun/Moon方向为observer topocentric local ENU→planar axes，finite/normalized/确定，Moon包含视差。
- Mode/origin/time publication原子；requestRender/no-op/reenable不产生冗余frame或stale visible light。
- Stable light与E1 authority/restore/ownership保持；Surface/terrain/imagery warm resources不变。
- Unit、real Context、dev/release/types/docs/installed package、formal docs/ADR、direct Test manual gate与审计闭环。
- Review approved、manual gate passed、phase/roadmap/handoff完成，并形成独立E2 local checkpoint；未push。

## Current handoff

- Execution已实现manual/astronomical public contract、controller-owned scratch天文pipeline、原子publication与requestRender
  去重；未修改Core helper、ControllerHost、World、Surface或其他forbidden path。
- Unit focused suite为16/16；real-Context Widget为5/5，覆盖fixed vectors、time/origin/mode pixels与warm
  tile/command/shader/VA/mesh/imagery identities。Build/release/types/docs/tsc与installed package verifier通过。
- `Test/平面环境.html`保留公开EPSG:3857 provider、local lil-gui与平面相机，新增中文mode/project-origin/time/effective
  direction controls；自动化只拦截公网请求验证best-effort fallback，不宣称公开瓦片成功。
- Architecture review已approved，`E2-R001..R002`均关闭；项目负责人已通过direct Test manual gate。E2以本次独立本地
  checkpoint完成，未push；E3仅在checkpoint后进入Architecture planning。

## Execution results

- Actual changed paths=`15`：5个product/spec/Test/verifier，4个formal docs/ADR，6个AgentDocs writeback；全部位于allowlist。
- 无实现偏差；astronomy hot path使用Environment instance-owned scratch，不分配per-frame Cartesian/matrix。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`均exit 0；`build-ts`仅既有baseline
  TSD-JSDoc warnings。Verifier最初暴露class matcher不接受generated `implements Controller`，已把既有通用matcher窄扩为
  可选implements并通过installed ESM/CJS/runtime/declaration/API qualification。
- 未运行Sandcastle gallery、full suite、E2E、public-network automation与无关terrain suites，符合phase边界。
- Expected upstream-owned=`0`、actual=`0`；SGP=None；generated status=`0`；未commit、未push、未publish。

## Completion record

- Architecture focused re-review确认public JSDoc/installed delivery证据与active astronomical同值no-op闭环完整，review=`approved`。
- 项目负责人于`2026-08-13`通过`Test/平面环境.html`人工验收，确认manual/天文模式、project-origin经纬度、UTC时间、
  terrain lighting、中文lil-gui和平面相机表现，并允许进入E3。
- 原生时间authority保持单一：`CesiumWidget.clock.tick()`产生的`currentTime`经`Scene.render`和`ControllerHost`传入
  Environment；示例UTC输入和时间步进直接修改`widget.clock.currentTime`，未创建第二套Clock。
- Phase现为`completed`；本次独立E2 local checkpoint不push，E3 phase plan须以该checkpoint重新审计后建立。
