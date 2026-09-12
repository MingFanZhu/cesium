# Phase Plan: E3 Visible Celestial Bodies

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-environment extension](2026-08-13-planar-environment-extension.md)
- Phase: `E3`
- Owner role: `execution`
- Architecture review: `approved`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-13`
- Predecessor checkpoint: E2=`fa40b49dbb4ba6f14db68c5fe94852b9f47367ff`
- Related review: implementation时新建
  `../reviews/2026-08-13-e3-visible-celestial-bodies.md`
- ADR: 新建
  `Documentation/SceneGIS/Decisions/ADR-0035-planar-visible-celestial-bodies.md`
- SGP: 新建 `SGP-0003`，只允许一个 `Scene.js` primary-world environment render hook

## Objective

在 E2 已发布的 `effectiveSunDirection` / `effectiveMoonDirection` 基础上，为真正平面的
`SceneGISPlanarWorld` 增加可选、可见的太阳和月亮。天体必须由 SceneGIS-owned procedural
renderer绘制，不复用native Earth `Sun`/`Moon`的位置、尺度、纹理、IAU orientation或automatic
celestial uniforms；manual与astronomical mode必须使用同一组effective directions，Cesium原生
`Clock`经既有ControllerHost time链驱动天文动画，不增加第二套clock、timer或系统时间。

E3同时冻结screen-space尺度、camera projection、地平线、terrain地下隐藏、native environment冲突、
request-render、GPU资源所有权和environment-pass顺序。实现需要在Cesium现有
`renderEnvironment`内增加一个窄小、可测试的primary-world hook；实际renderer、Shader、状态和资源
仍全部位于SceneGIS-owned路径。

## Non-goals

- 不复用或修改native `Sun`、`Moon`、`SunPostProcess`、Earth automatic uniforms、IAU axes、
  `moonSmall.jpg`或Earth physical distance/radius。
- 不实现lunar phase、eclipse、Moon surface orientation、solar bloom post-process、lens flare、
  shadow map、moon light或physically based radiometry。
- 不实现planar atmosphere、twilight、fog、cloud、SkyBox preset或SkyBox ownership；这是E4。
- 不从CRS、extent、camera XY或terrain推断经纬度；方向authority继续完全属于E1/E2。
- 不把天体加入`frameState.commandList`、`Pass.GLOBE`、`Pass.OPAQUE`、pick、depth、shadow或
  classification pass；不依赖multi-frustum排序偶然获得正确遮挡。
- 不引入图片、网络、静态celestial asset、第三方库、Worker、Promise、listener或per-frame对象分配。
- 不改变Surface、terrain、imagery、Material、lighting Shader或`tilesLoaded`。
- 不修改legacy Sandcastle；E3开发和人工验收只扩展`Test/平面环境.html`。

## Entry conditions

- Branch=`feature/planar-environment`。
- E2 implementation、Architecture review、项目负责人manual gate和独立checkpoint
  `fa40b49dbb4ba6f14db68c5fe94852b9f47367ff`已完成。
- 正式implementation base是包含本plan的Architecture planning checkpoint；Execution只以assignment
  给出的精确commit开始。
- Working tree除用户自有未跟踪`Test/地形.html`外必须干净；该文件不得读取、修改、暂存或提交。
- Architecture已重新审计Cesium 1.144 native Sun/Moon、`renderEnvironment`、Pass执行、World
  lifecycle、four-frustum planar camera、terrain resident query、Shader delivery与Clock链路。

## Current source facts

- `CesiumWidget.render()`调用`clock.tick()`并把返回的`JulianDate`传给`Scene.render(time)`；
  `Scene.render`随后调用`ControllerHost.update(scene,time)`。E2 astronomical directions因此已经由
  Cesium原生Clock驱动，E3只消费effective state，不创建第二个时间authority。
- Native `Sun.update`依赖`UniformState.sunPositionWC/sunPositionColumbusView`、Earth physical
  `SOLAR_RADIUS`、compute texture与`SunPostProcess`。Native `Moon.update`依赖Earth-centered
  Simon1994 position、IAU lunar orientation、ellipsoid primitive和`moonSmall.jpg`。二者都不能表达
  project-origin topocentric planar ENU directions。
- `Scene.renderEnvironment`直接执行SkyBox、SkyAtmosphere、Sun、Moon和panorama command；普通
  command list中的`Pass.ENVIRONMENT`虽可被frustum bin收集，却没有对应`performPass`，不会执行。
  把天体伪装成`Pass.GLOBE`或后置opaque/translucent会产生multi-frustum重复、terrain/model遮挡和
  pick/depth语义错误。
- `Scene`已通过`SGP-0001`持有mutually exclusive primary `world`并调用其
  `update/beginFrame/render/endFrame`，但当前没有environment render slot。新增一个optional
  `world.renderEnvironment(frameState,passState)`调用是现有不足下的最小上游缝隙。
- `renderEnvironment`只在非pick command execution中运行，且已把uniform pass设为
  `Pass.ENVIRONMENT`。E3 hook放在现有native/panorama environment之后、ordinary terrain/primitive
  passes之前；因此无depth写入的procedural bodies先形成背景，随后terrain与scene geometry自然覆盖。
- `SceneGISPlanarCamera`已经统一分类Perspective、PerspectiveOffCenter、Orthographic与
  OrthographicOffCenter frustum，并能取得固定planar world pose。E3可复用该private helper，不重复
  猜测camera transform。
- `world.getTerrainHeight(position)`是同步、无请求、无LRU mutation的resident direct/upsampled
  terrain query；无resident terrain时返回`undefined`。E3地下判定可以使用相同的resident-height→Z=0
  fallback，不触发terrain加载。
- ADR-0030已批准`packages/engine/Source/Shaders/SceneGIS/**/*.glsl`及相邻ignored generated JS
  delivery。E3无需修改build/package glob。
- `SceneGISPlanarWorld`拥有Surface/GPU资源，registered Environment仍是caller-owned且无
  `destroy()`。因此celestial renderer及其Context资源必须由World拥有并在World destroy时释放，不能
  转移给Environment。

## Public contract

### Environment properties

在既有`SceneGISPlanarEnvironment` constructor/properties上增加：

| API                                       | Contract                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `options.showSun` / `showSun`             | Optional `false`；严格boolean。控制SceneGIS procedural Sun，不改变native `scene.sun`。                   |
| `options.showMoon` / `showMoon`           | Optional `false`；严格boolean。控制SceneGIS procedural Moon，不改变native `scene.moon`。                 |
| `options.sunPixelSize` / `sunPixelSize`   | Optional `48.0`；finite positive CSS-pixel bright-disc diameter，固定soft halo可在其外延伸。             |
| `options.moonPixelSize` / `moonPixelSize` | Optional `36.0`；finite positive CSS-pixel disc diameter。                                               |
| `options.moonColor` / `moonColor`         | Optional stable light-gray `Color`；finite Color，assignment/access defensive clone，只影响Moon visual。 |

- 默认两项`show*`均为`false`，保证E1/E2应用升级后不新增画面或GPU资源；E3 direct Test显式开启。
- `sunColor`继续同时表示stable directional-light color与visible Sun RGB/alpha；`sunIntensity`只影响
  `DirectionalLight`，不缩放disc或halo，避免lighting强度和display exposure形成隐式耦合。
- `moonColor`不产生第二光源。E3 Moon是固定stylized full disc；不宣称phase、albedo、surface map或
  orientation accuracy。
- pixel size表示CSS pixel。Renderer按drawing-buffer/client或viewport pixel ratio换算clip-space size，
  因此devicePixelRatio/resolutionScale变化不改变预期逻辑尺寸。Setter不改变Shader/VA/command identity。
- invalid boolean/size/color抛`DeveloperError`并failure atomic；same value或Color RGB/A相等是no-op。
- 已取得authority且可见状态/appearance发生变化时setter请求一帧；inactive或尚未first-update只更新state。
  E2 time/origin/mode publication已请求的当前帧直接呈现新位置，不再额外请求下一帧。
- `enabled=false`隐藏两者并释放E1 light authority；重新enable在既有一次requested frame内恢复light与body。
  `world.show=false`同样隐藏且不销毁warm renderer。

### Native environment conflict

- SceneGIS renderer不得接管、隐藏、替换或销毁caller/native `scene.sun`或`scene.moon`。
- 当对应`showSun/showMoon=true`且同一Scene存在`show !== false`的native body时，constructor后的
  `firstUpdate`、active setter或后续external mutation必须在celestial GPU allocation/draw之前
  `DeveloperError` fail-fast，防止同一画面出现两套不同天文语义。
- 对应native body显式`show=false`时允许SceneGIS body；切换回native visible且SceneGIS仍visible时下一
  normal render明确失败。该规则不把generic caller-owned SkyBox本身视为冲突。
- Conflict validation不得部分改变show property、effective directions、stable light authority、request count或
  renderer resource identity。

## Projection, horizon, and underground contract

1. `effectiveSunDirection/effectiveMoonDirection`继续表示observer-to-body normalized world direction，
   固定planar axes为`+X East/+Y North/+Z Up`。Renderer不重新计算astronomy或normalize另一个来源。
2. body center仅在direction `z > 0`时处于planar horizon上方；`z <= 0`整枚隐藏，不绘制半枚跨越
   horizon的disc。无限平面没有ellipsoid occluder，不能调用Earth horizon/occlusion helper。
3. direction相对camera forward不为正时隐藏；在camera前方时按camera basis映射到screen。Perspective与
   off-center perspective使用当前frustum slopes的gnomonic projection。Orthographic与off-center
   orthographic使用zoom-independent virtual 90-degree gnomonic celestial field，并保留off-center viewport
   shift；这是directional sky projection，不把body放到任意world distance。
4. screen边缘由clip自然裁剪；pixel-size disc不写depth、不测试depth。因为hook先于ordinary geometry执行，
   terrain/model等后续depth/color自然覆盖body，body不会浮在前景对象上。
5. 相机world pose通过`SceneGISPlanarCamera.getWorldPose`取得。若`camera.position.z`严格小于
   `world.getTerrainHeight(camera.position)`，两者隐藏；resident terrain不可得时使用Z=0 fallback。
   等于surface不算地下。该查询只读上一成功normal-render resident cache，不发请求、不改变LOD/readiness。
6. 地下规则与Camera Controller的`navigationMode`解耦；实际camera-surface relationship是authority，不能因
   mode字符串或双面terrain偶然状态显示天体。
7. 非main render、pick、pickVoxel、depth、offscreen、shadow和classification passes不绘制celestial bodies。

## Renderer and resource contract

- 新增一个SceneGIS-owned private renderer，由`SceneGISPlanarWorld`构造或lazy持有；Environment只提供
  state reference。World destroy负责exactly-once销毁，Environment remove/destroy-sever不得销毁World资源。
- Default hidden path零celestial GPU allocation。第一次至少一个有效visible body进入main environment frame时
  lazy创建：一个shared quad VA、一个fixed ShaderProgram、两个stable DrawCommand，零texture/sampler/FBO/
  post-process。之后show/direction/color/size/camera/time mutation只更新uniform/execute decision，保持warm identity。
- Vertex shader只把unit quad扩为clip-space procedural body；fragment shader生成Sun bright disc+fixed soft halo和
  Moon stylized limb-darkened disc。所有fixed shader source进入
  `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/**`，basename全局唯一；不动态拼接Shader。
- RenderState固定alpha blending、depth test disabled、depth mask false、culling disabled。每个main frame最多执行
  两个body command；不进入`frameState.commandList`，不创建derived/pick/depth/shadow command。
- Public World/Surface继续只支持其既有single Context，正常产品路径不迁移renderer Context。Private renderer只做防御性
  mismatch处理：先exactly-once释放旧Context资源，再为新Context创建candidate；创建/compile失败不得发布partial state，
  并保持empty/retriable，不保留已失效的旧Context资源。
- Hot path使用renderer/world-owned scratch Cartesian/clip/uniform objects；不逐帧new Cartesian、Color、array、
  command、RenderState或ShaderProgram。
- Context loss/restore只遵循当前Cesium resource contract，不新增promise或global registry；E3锁定normal destroy balance，
  并以private second-Context cleanup/recreate测试防御性资源协议，而不是扩大public multi-Context支持。

## Primary-world environment hook and SGP

新增`SGP-0003`：

- Upstream-owned file仅`packages/engine/Source/Scene/Scene.js`。
- 在`renderEnvironment(scene,passState)`现有native body和panorama处理完成后，以成对
  `SCENEGIS_PATCH_BEGIN/END SGP-0003`调用optional
  `scene._world.renderEnvironment(scene.frameState,passState)`。
- Hook不import SceneGIS concrete class，不改变Globe/default scene，不创建command，不改变native
  `environmentState`，且只在method存在时调用，以保持既有structural custom world兼容。
- `SceneGISWorld` public interface新增`renderEnvironment(frameState,passState)`说明；
  `SceneGISPlanarWorld`实现main-render guard和private renderer调用。普通`render(frameState)`继续只提交
  terrain/imagery command。
- `.scenegis/upstream-patches.json`登记reason/risk/file/tests/ADR/removalCondition；ADR-0035反向引用。
- 若实现发现单一hook不足，Execution必须停止并请求Architecture升级计划；不得增加第二个Scene hunk、
  修改`Pass.js`、environmentState、Sun/Moon或render loop其他位置。

## Allowed paths

Product and Shader:

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js`（new）
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyVS.glsl`（new）
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarCelestialBodyFS.glsl`（new）
- `packages/engine/Source/Scene/Scene.js`（唯一upstream-owned path；仅SGP-0003 paired hook）
- `.scenegis/upstream-patches.json`（新增SGP-0003 entry）

Focused Specs and direct Test:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRendererSpec.js`（new，可按实现需要）
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarCelestialBodiesCesiumWidgetSpec.js`（new，可按实现需要）
- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`

Formal documentation:

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/DevelopmentGuide.md`（只在Clock/Test使用说明确有必要时）
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0035-planar-visible-celestial-bodies.md`（new）

Durable phase writeback:

- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e3-visible-celestial-bodies.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e3-visible-celestial-bodies.md`（new）

新增其他SceneGIS-owned focused Spec前，Execution须在本plan记录源码事实与理由并取得Architecture确认。

## Forbidden paths and changes

- 禁止修改`packages/engine/Source/Renderer/Pass.js`、View/FrustumCommands、UniformState、native
  Sun/Moon/SkyAtmosphere/SunPostProcess、ControllerHost、CesiumWidget、Viewer、Surface/terrain/imagery/
  Material/camera controller或其他upstream-owned file。
- 禁止扩大`Scene.js`到environmentState字段、updateEnvironment、native visibility、framebuffer、post-process、
  pass loop或destroy逻辑；唯一允许的是上述optional world hook。
- 禁止修改`packages/sandcastle/**`、`Test/地形.html`、`Test/lib/**`或新增celestial asset/library。
- 禁止修改package manifest、gulp/build/server/Playwright/workflow或生成文件：engine/root indexes、
  declarations、`Build/**`、generated shader `.js`、`Source/Cesium*`、SpecList。
- 禁止默认开启visible body、隐式创建SkyBox/native body、接管native resource、Moon light、phase/eclipses、
  atmosphere、shadow、day/night imagery或CRS inference。
- 禁止commit、push、publish或进入E4。

## Implementation sequence

1. 先扩展Environment/World unit Specs，锁定defaults、validation/clone/no-op/request、native conflict、
   interface hook与ownership；新增private renderer/Widget focused Specs锁定projection/pixels/resources。
2. 扩展Environment public state，不改变E1/E2 direction/light pipeline；把native conflict validation放在任何
   authority/GPU mutation前，并保留failure atomicity。
3. 实现fixed GLSL和private procedural renderer，先证明四frustum projection、horizon/behind-camera、CSS
   pixel size、blend/depth与lazy/warm/destroy contract，再接入World。
4. 为`SceneGISWorld`/`SceneGISPlanarWorld`增加environment lifecycle；最后才添加`Scene.js`单一
   SGP-0003 hook并用真实Context证明调用顺序与default Globe isolation。
5. 扩展`Test/平面环境.html`中文lil-gui：visible Sun/Moon、pixel size、Moon color，以及原生
   `widget.clock.shouldAnimate`/`multiplier`/UTC reset。保留公开EPSG:3857 providers、planar camera、fallback、
   BFCache和cleanup，不增加第二个Clock。
6. 新建ADR-0035、登记SGP-0003，更新Architecture/Guide/UpgradeChecklist；扩展package verifier验证新增
   public API、private hiding、两份GLSL与generated module的dev/release/npm delivery。
7. 完成focused/build/delivery/static/ownership审计，回写plan、roadmap、review request/handoff并发送
   review-ready。Architecture批准前不请求manual gate。

## Automated acceptance

Focused Specs至少运行：

```powershell
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarEnvironment"
npm run test -- --includeName "SceneGIS/Scene/SceneGISWorld"
npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarWorld"
npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRenderer"
npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironment"
```

若新Widget suite使用独立basename，再运行其精确`includeName`。测试输出必须以TOTAL SUCCESS/FAILED
判定，不只看gulp exit code。

Unit/private evidence至少覆盖：

- `showSun/showMoon=false` defaults、strict boolean、positive finite sizes、finite cloned Moon Color、same-value
  no-op与failure atomicity；
- active/inactive/first-update/reenable request counts，以及E2 astronomical publication无冗余下一帧；
- native visible Sun/Moon conflict在light/request/GPU mutation前失败，native `show=false`允许；external
  conflict mutation下一render失败且warm state保持；
- four-frustum center projection、off-center shift、behind camera、`z<=0` horizon、screen clipping与CSS pixel
  conversion的hard-coded结果；
- default hidden零allocation，first visible lazy allocation，show/direction/color/size mutation保持VA/SP/command，
  candidate failure cleanup、second Context旧资源cleanup/recreate和World destroy exactly-once；
- SceneGISWorld optional environment method、generic world without method不受Scene hook影响、World show/Environment
  enabled/sever/remove ownership闭环。

Real Context evidence至少覆盖：

- manual与astronomical fixed directions的Sun/Moon实际compile/link/draw/pixels和deterministic screen locations；
- Perspective、PerspectiveOffCenter、Orthographic、OrthographicOffCenter真实render，camera move/rotate只改变位置，
  pixel size稳定；
- horizon above/below、camera front/back、world hidden、Environment disabled、resident terrain above/below camera；
- terrain/opaque geometry覆盖environment body，body不覆盖前景；pick/depth结果、terrain command count和readiness不变；
- native Clock time step在同一frame更新E2 effective directions与body pixels，stable time/no-op不额外request；
- warm Surface tile/DrawCommand/ShaderProgram/VA/mesh/imagery binding/texture identities保持，同时celestial
  renderer自身VA/SP/two commands稳定；destroy resource balance。

Public delivery：

```powershell
npm run build
npm run build-release
npm run build-ts
npm run build-docs
npm run tsc
node scripts/scenegis/verify-planar-packages.mjs
```

- Verifier必须证明现有8份Surface/Ground GLSL+generated JS和新增2份E3 GLSL+generated JS均进入installed
  tarball；public Environment/World declarations/API anchors存在，private renderer不进入public declarations/docs。
- `build-ts`既有baseline warning可保留，但必须exit 0，E3 declaration由verifier精确锁定。
- E3不修改Sandcastle，不运行gallery build；不运行full suite、E2E、公网自动化或无关terrain/content suites。
- Changed-scope ESLint/Prettier/Markdownlint、`Test/**`显式Prettier、`git diff --check`、official upstream
  audit、SGP marker/manifest审计、exact status/generated audit必须通过。

## Manual gate

Architecture/code review批准后，项目负责人使用根Cesium development server打开：

```text
/Test/平面环境.html
```

人工确认：

- lil-gui用户可见说明均为中文；太阳/月亮显示、尺寸、月亮颜色、Clock播放/暂停/倍率/UTC reset可理解；
- manual方向和astronomical origin/time都能移动对应visible bodies，Clock播放会连续推进而不是第二套timer；
- 上/下地平线、转动相机、terrain上方/地下、world/environment显隐符合contract；前景terrain不被日月覆盖；
- 公开EPSG:3857 terrain/imagery或明确fallback、平面相机wheel/pan/rotate、compact/credit-safe与BFCache
  lifecycle保持，无console/page startup error。

项目负责人负责视觉和交互表现；Architecture负责hook、projection、资源、failure atomicity和delivery正确性。

## ADR, ownership, generated files, and commit rules

- ADR-0035必须冻结：opt-in public API、procedural/no-asset renderer、screen-space scale、four-frustum projection、
  planar horizon/underground、native conflict、Clock authority、environment ordering、World GPU ownership、warm budget和
  SGP-0003 upgrade/removal boundary。
- Expected upstream-owned files=`1`：仅`packages/engine/Source/Scene/Scene.js`；SGP=`SGP-0003`。
  任何第二个upstream file或第二类Scene hunk出现时立即停止。
- Generated shader JS、indexes、declarations、docs与Build output只可read-only验证，不得进入status/commit。
- Execution不得commit、push、publish或进入E4；保持working tree供Architecture独立review。
- Architecture review、findings、项目负责人manual gate和ownership/generated审计均通过后，由Architecture创建
  独立中文E3 checkpoint，之后才能细化E4 atmosphere/SkyBox。

## Completion criteria

- Hidden defaults保持E1/E2画面和zero GPU allocation；显式show后Sun/Moon严格消费effective directions与native
  Clock time，不使用Earth automatic celestial state。
- Procedural bodies在四frustum、horizon、camera front、terrain地下与foreground occlusion下行为确定；不进入
  pick/depth/shadow或ordinary command list。
- One VA/one SP/two commands/zero texture预算和World-owned exactly-once lifecycle成立；uniform/state mutation保持
  Surface与celestial warm identities。
- Native body conflict fail-fast且不接管caller资源；default Globe/generic World无行为变化。
- Focused Specs、real Context、dev/release/types/docs/installed package、ADR/SGP、direct Test manual gate与审计闭环。
- Review approved、manual gate passed、phase/roadmap/handoff完成，并形成独立E3 local checkpoint；未push。

## Current handoff

- Execution已完成E3 implementation与最小充分自动化；
  `../reviews/2026-08-13-e3-visible-celestial-bodies.md`已通过Architecture/code review，未commit、未push、未进入E4。
- 实际实现保持`SGP-0003`单一optional primary-world environment hook；SceneGIS-owned renderer为one VA/one SP/two
  stable commands/zero texture，hidden default不分配GPU资源。
- 初次official audit发现`Scene.js`既有`SGP-0001`导致单registration审计模型无法表达独立`SGP-0003`。Architecture明确
  保留两个SGP及各自移除条件，并批准审计器按path保存registration数组：同path仅允许全部`paired`；active pair必需，
  proposed可尚未落地但已存在时必须合法，retired只保留历史且不得继续保留marker或覆盖diff；changed lines由active与已落地
  proposed ranges并集覆盖，manifest-only保持排他。Audit focused fixtures 25/25通过。
- Architecture findings E3-R001..R009已addressed：candidate buffer ownership、render-boundary native conflict、active viewport
  CSS conversion、single frustum scratch、status-aware multi-SGP retirement、real host/Clock/hook/pick-depth/resident-terrain证据、
  asymmetric OrthographicOffCenter数值资格与durable Context/Moon contract均已补齐。
- Focused suites为Environment 19/19、SceneGISWorld 2/2、PlanarWorld 23/23、private renderer 6/6、Camera basename
  aggregate 56/56（含9个helper/47个controller）、Widget 8/8；
  build/release/types/docs/tsc与installed verifier通过，10份GLSL+10份generated module交付闭环。
- Perspective与Orthographic由real Context实际compile/link/draw；PerspectiveOffCenter与OrthographicOffCenter因Cesium
  Scene3D Camera不接受直接安装该frustum类型，采用private projection hard-coded证据，不虚构Camera draw。
- 项目负责人已于`2026-08-13`确认`Test/平面环境.html`manual gate通过；E3所有gate已关闭，正在创建独立checkpoint。
- 用户自有未跟踪`Test/地形.html`继续在phase外，禁止读取、修改、暂存或提交。
