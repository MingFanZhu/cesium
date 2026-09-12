# Phase Plan: E4 Planar Atmosphere and SkyBox

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [planar-environment extension](2026-08-13-planar-environment-extension.md)
- Phase: `E4`
- Owner role: `execution`
- Architecture review: `confirmed`
- Architecture reviewer: Architecture Agent
- Created: `2026-08-13`
- Updated: `2026-08-13`
- Predecessor checkpoint: E3=`8ff8b48ebf`
- Related review: implementation时新建
  `../reviews/2026-08-13-e4-planar-atmosphere-skybox.md`
- ADR: 新建
  `Documentation/SceneGIS/Decisions/ADR-0036-planar-atmosphere-skybox.md`
- SGP: None；只消费既有`SGP-0003` primary-world environment hook，不修改upstream-owned file

## Objective

在E3可见日月之后，为真正平面的`SceneGISPlanarWorld`增加默认关闭的独立大气和固定planar-axis SkyBox。
大气必须由SceneGIS-owned fullscreen renderer绘制，只消费固定`+X East/+Y North/+Z Up` camera pose、
resident terrain相对高度与E2发布的`effectiveSunDirection`；不得复用native `SkyAtmosphere`的ellipsoid geometry、
Earth radii、Earth automatic celestial uniforms或ground-atmosphere路径。

E4同时新增caller-owned `SceneGISPlanarSkyBox`：调用方提供已经加载的六面图像，固定以planar world axes解释；
Environment只持有引用，World只在既有environment hook中取得draw command，任何clear、remove、World/Scene destroy均不得
替调用方销毁它。合成顺序固定为background/native generic SkyBox、planar SkyBox、planar atmosphere、E3 Sun/Moon，最后由
ordinary terrain/model自然覆盖。相机低于resident terrain（无resident时Z=0）时，planar visual environment全部隐藏，
并以opaque background mask遮蔽已经执行的generic native sky background。

## Non-goals

- 不复用、继承、包装成或修改native `SkyAtmosphere`；不使用ellipsoid radii、Earth horizon、Cartographic或ECEF height。
- 不实现physically based multiple scattering、volumetric fog、cloud、weather、aerial perspective、ground fog、shadow或
  atmosphere对terrain/model的后处理。
- 不实现星表、银河方向、project-origin local sidereal sky orientation或把Earth TEME SkyBox解释成planar astronomy。
- 不隐式下载SkyBox图片，不提供内置网络URL/asset preset，不接受尚未加载的URL sources。
- 不把`SceneGISPlanarSkyBox`安装到`scene.skyBox`或`frameState.panoramaCommandList`，不转移其destroy ownership。
- 不改变E1/E2 light/astronomy contract、E3 body尺寸/投影或Surface/terrain/imagery/Material shader。
- 不增加第二个Scene hook、Pass、framebuffer、post-process stage、texture lookup table、Worker、timer、listener或Promise。
- 不修改legacy Sandcastle；只扩展`Test/平面环境.html`中文lil-gui示例。

## Entry conditions

- Branch=`feature/planar-environment`。
- E3 implementation、Architecture review、项目负责人manual gate和独立checkpoint `8ff8b48ebf`已完成。
- 正式implementation base是包含本plan的Architecture planning checkpoint；Execution只以assignment给出的精确commit开始。
- Working tree除项目负责人自有未跟踪`Test/地形.html`外必须干净；该文件不得读取、修改、暂存或提交。
- Architecture已重新审计Cesium 1.144 `SkyAtmosphere`、`SkyBox`/`CubeMapPanorama`、Scene environment update/render/destroy、
  four-frustum camera、resident terrain query、E3 renderer与ADR-0030 shader delivery。

## Current source facts

- Native `SkyAtmosphere`构造ellipsoid shell geometry，并以ellipsoid maximum radius、Rayleigh/Mie scale height和Earth
  atmosphere automatic state区分space/atmosphere shader。它不能表示无限平面或project-origin ENU frame。
- `Scene.renderEnvironment`当前顺序为native SkyBox、native SkyAtmosphere、native Sun/Moon、panorama command，然后通过
  `SGP-0003`调用optional `world.renderEnvironment(frameState,passState)`；ordinary terrain/model passes随后执行。
  E4可以完全复用该hook，在World内先画planar SkyBox/atmosphere再调用E3 celestial renderer，无需新upstream hunk。
- custom world默认不创建Earth environment；但显式`CesiumWidget({world, skyBox})`仍沿用upstream关联路径并创建native Sun。
  因此E4 direct Test和推荐用法不得通过widget `skyBox` option安装planar SkyBox。
- `Scene.destroy()`会销毁`scene.skyBox`和`scene.skyAtmosphere`。真正caller-owned planar SkyBox必须保持在Environment引用中，
  不能写入这两个Scene-owned slots。
- Public `CubeMapPanorama`支持显式3x3 transform；其现有`returnCommand`路径已被native `SkyBox` wrapper使用，但仍是soft-private
  constructor seam。E4可以在SceneGIS public wrapper内部以`Matrix3.IDENTITY`和`returnCommand:true`复用它，必须在ADR和
  UpgradeChecklist记录并以focused lifecycle/installed测试锁定；不得向调用方暴露该soft-private option。
- `SceneGISPlanarCamera.getWorldPose/getFrustumInfo`已覆盖Perspective、PerspectiveOffCenter、Orthographic和
  OrthographicOffCenter，且支持caller-provided scratch。Atmosphere可从camera basis和frustum bounds重建每fragment world ray，
  不需要Earth inverse view或celestial automatic uniforms。
- `world.getTerrainHeight(position)`只读最近normal render的resident direct/upsampled mesh，无请求、promotion、LRU或GPU mutation；
  无resident terrain时返回undefined。E4与E3使用相同height→Z=0 fallback。
- ADR-0030的recursive shader source/delivery glob可直接容纳两份新的planar atmosphere GLSL，generated adjacent JS继续ignored。

## Public contract

### `SceneGISPlanarEnvironment` properties

在现有constructor/properties上增加：

<!-- markdownlint-disable MD060 -->

| API                                                         | Contract                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `options.showAtmosphere` / `showAtmosphere`                 | Optional `false`；严格boolean。控制planar fullscreen atmosphere，不改变native `scene.skyAtmosphere`。             |
| `options.atmosphereZenithColor` / `atmosphereZenithColor`   | Optional finite RGBA `Color`；assignment/access defensive clone，定义day zenith基础色和最大alpha。                |
| `options.atmosphereHorizonColor` / `atmosphereHorizonColor` | Optional finite RGBA `Color`；assignment/access defensive clone，定义horizon/twilight基础色和最大alpha。          |
| `options.atmosphereIntensity` / `atmosphereIntensity`       | Optional `1.0`；finite non-negative visual strength。`0`保留show state但产生透明atmosphere。                      |
| `options.atmosphereFadeHeight` / `atmosphereFadeHeight`     | Optional `1000000.0` meters；finite positive visual fade scale，不宣称Earth physical scale height。               |
| `options.skyBox` / `skyBox`                                 | Optional live caller-owned `SceneGISPlanarSkyBox` reference；`undefined`无planar SkyBox；Environment从不destroy。 |

<!-- markdownlint-enable MD060 -->

- 默认`showAtmosphere=false`且`skyBox=undefined`，保证E1-E3应用升级后画面、request与GPU allocation不变。
- Invalid boolean/number/Color/SkyBox抛`DeveloperError`并failure atomic；same scalar/reference和相等Color是no-op。
- 已first-update且active时，visual property mutation请求一帧；inactive/未first-update只改state。Uniform-only mutation保持
  atmosphere command/VA/SP、celestial resources、Surface commands与terrain/imagery identities。
- `enabled=false`或`world.show=false`隐藏planar SkyBox、atmosphere和bodies，但不destroy warm resources或caller SkyBox。
- `effectiveSunDirection`驱动固定visual-grade day/twilight/night response，即使`showSun=false`也可照亮atmosphere；不创建第二光源。

### `SceneGISPlanarSkyBox`

- 新增public class `SceneGISPlanarSkyBox`。Constructor接收六个已经加载、同类型、非URL的image/canvas-like sources和可选
  `Credit|string`；face方向固定为`positiveX=East`、`positiveY=North`、`positiveZ=Up`及对应负轴。
- Class内部用`Matrix3.IDENTITY`构造一个return-command `CubeMapPanorama`，不使用TEME-to-pseudo-fixed rotation；不暴露或允许
  caller修改transform。URL、missing face、混合类型和destroyed reuse fail-fast。
- Class不注册Controller、不持有World/Scene、不请求网络或自动requestRender。Environment的`skyBox` assignment负责当前帧请求；
  sources在constructor后固定。需要替换内容时创建另一个SkyBox、赋给Environment，再由caller销毁旧实例。
- Environment/World只保留reference并调用soft-private internal update；clear、disable、remove、World destroy和Scene destroy均不
  destroy该实例。调用方必须在移除Environment或清空property后、WebGL Context销毁前调用`skyBox.destroy()`。
- `isDestroyed/destroy`遵循Cesium exactly-once contract。Destroyed SkyBox不得赋值或渲染。

## Composition, conflicts, and underground behavior

1. World hook先完成统一native conflict validation和camera/terrain underground判定，再发生任何planar SkyBox/atmosphere
   allocation或execute。
2. Above-ground执行顺序固定：
   - 既有native generic `scene.skyBox`可作为background（仅当Environment没有planar SkyBox）；
   - caller-owned planar SkyBox command；
   - planar atmosphere alpha composition；
   - E3 Sun/Moon；
   - ordinary terrain/model passes。
3. `environment.skyBox`已定义时，任何visible native `scene.skyBox`、`scene.skyAtmosphere`、`scene.sun`或`scene.moon`均冲突，
   因为它们已经在SGP hook前绘制且会被planar SkyBox覆盖或产生双重语义。
4. `showAtmosphere=true`时，visible native `scene.skyAtmosphere`、`scene.sun`或`scene.moon`冲突；visible native generic
   `scene.skyBox`允许作为不带planar celestial语义的background。E3对应body conflict规则继续适用。
5. Conflict在firstUpdate、stable update、active setter和final render boundary复用同一validator；失败不得改变property、light、
   request count、effective directions、renderer/SkyBox resources或command execution count。
6. Camera Z严格低于resident terrain height时，planar SkyBox/atmosphere/bodies全部隐藏。若native generic SkyBox或native
   SkyAtmosphere已在hook前绘制，则atmosphere renderer输出`scene.backgroundColor.rgb`、alpha=1的fullscreen mask；无native
   background时地下路径不为隐藏默认额外分配GPU资源。等于surface不算地下。
7. Above/underground判断不依赖camera controller `navigationMode`、CRS、extent或Earth horizon；只读实际camera pose和resident
   terrain→Z=0 fallback。

## Atmosphere shader and renderer contract

- 新增World-owned private `_SceneGISPlanarAtmosphereRenderer`，lazy创建一个fullscreen triangle/quad VA、一个fixed ShaderProgram和
  一个stable DrawCommand；零texture/sampler/FBO/post-process。World destroy exactly-once释放，Environment不拥有资源。
- Vertex/fragment shader固定进入
  `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphere{VS,FS}.glsl`；不动态拼接或复制native
  atmosphere shader。E4后installed verifier要求12/12 SceneGIS GLSL与12/12 generated modules。
- CPU每帧复用scratch取得camera world pose、four-frustum bounds、camera above-surface height和effective Sun direction；shader按
  perspective frustum slopes重建world ray，orthographic使用固定camera forward directional sky。Off-center shift必须确定性覆盖。
- Fragment只基于ray world-Z、ray/sun dot、sun elevation、camera above-surface height、两色、intensity和fade height生成
  visual-grade zenith/horizon/twilight alpha；不得调用Earth atmosphere builtin、ellipsoid radius或system time。
- RenderState固定depth test disabled、depth mask false、alpha blend。Underground mask用同一command/shader输出alpha=1；普通
  atmosphere保持straight-alpha source-over。每main frame最多一个atmosphere/mask execute。
- SkyBox/atmosphere不进入`frameState.commandList`、pick、depth、shadow、classification或offscreen pass；不创建derived command。
- Default hidden/no-native-mask路径零atmosphere GPU allocation。Show/color/intensity/fade/time/camera mutation保持warm VA/SP/command。
- Public World/Surface仍只支持single Context。Private renderer的defensive second-Context mismatch必须先释放旧资源再创建candidate；
  candidate compile/allocation failure保持empty/retriable且不发布partial state。

## Allowed paths

Product and Shader:

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js`（仅泛化environment hook JSDoc，如必要）
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarSkyBox.js`（new）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarAtmosphereRenderer.js`（new）
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js`（仅统一pose/underground/conflict seam，如必要）
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereVS.glsl`（new）
- `packages/engine/Source/Shaders/SceneGIS/PlanarEnvironment/SceneGISPlanarAtmosphereFS.glsl`（new）

Focused Specs and direct Test:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarEnvironmentSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISWorldSpec.js`（仅接口JSDoc/behavior确有变化时）
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarSkyBoxSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarAtmosphereRendererSpec.js`（new）
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRendererSpec.js`（仅共享seam回归，如必要）
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidgetSpec.js`
- `Test/平面环境.html`
- `scripts/scenegis/verify-planar-packages.mjs`

Formal docs and AgentDocs:

- `Documentation/SceneGIS/Architecture.md`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `Documentation/SceneGIS/Decisions/ADR-0036-planar-atmosphere-skybox.md`（new）
- `AgentDocs/planar-environment/**`

## Forbidden paths and scope escalation

- 禁止修改`packages/engine/Source/Scene/Scene.js`、`CesiumWidget.js`、native `SkyAtmosphere.js`、`SkyBox.js`、
  `CubeMapPanorama.js`、`Atmosphere.js`、render loop/pass、automatic uniforms或`.scenegis/upstream-patches.json`。
- 禁止修改Surface/terrain/imagery/Material/Camera Controller产品源码、legacy Sandcastle、package manifests、build generator、
  generated JS/declarations/docs/Build output或`Test/地形.html`。
- E4 upstream-owned files=`0`、SGP=None。既有`SGP-0003`只是依赖，不在E4产生新upstream diff。
- 若`CubeMapPanorama` return-command seam、existing hook或fixed shader无法满足顺序/ownership，Execution必须停止并回报源码事实；
  不得自行增加SGP、monkey patch、Scene slot mutation、post-process或复制native renderer。

## Implementation sequence

1. 先锁定Environment defaults/validation/request/conflict与`SceneGISPlanarSkyBox` caller ownership unit Specs。
2. 实现SkyBox wrapper并以private/focused real Context证明identity transform、face方向、return command、sync preloaded sources和destroy。
3. 实现private atmosphere shader/renderer及candidate lifecycle、four-frustum ray、day/twilight/night、height fade和underground mask。
4. 扩展World environment orchestration，固定SkyBox→atmosphere→celestial顺序并统一conflict/underground publication边界。
5. 扩展real-Context Widget资格，覆盖local cubemap、真实terrain above/below、foreground、native conflict、Clock/time与warm identity。
6. 扩展`Test/平面环境.html`中文lil-gui；使用generated local canvas cubemap，不新增asset/network dependency，并保留公开3857
   terrain/imagery best-effort、平面相机、native Clock和BFCache cleanup。
7. 新建ADR-0036并更新Architecture/Guide/UpgradeChecklist；扩展installed verifier到12 shader pairs和E4 public API。
8. 运行最小充分build/package/static/audit，写review-ready handoff；不commit、不push、不请求manual gate。

## Validation boundary

Required focused automation:

- Environment unit：defaults、validation、clone/reference no-op、failure atomicity、requestRender、native conflict、caller ownership。
- SkyBox unit/real Context：六面与fixed axes、non-URL restriction、command/link/pixels、replacement、destroyed reject、caller destroy。
- Atmosphere private：hidden zero allocation、candidate failure、four frusta/off-center ray、day/twilight/night、height fade、underground mask、
  viewport/DPR、Context mismatch、exactly-once destroy。
- Environment Widget real Context：local SkyBox→atmosphere→Sun/Moon→terrain composition，native Clock方向变化，above/underground、
  native background mask、foreground occlusion、pick/depth non-interference、requestRender和warm identities。
- Existing E3 celestial/private behavior only where orchestration seam changed；不重复无关terrain/styling suites。

Required delivery/static:

- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run build-docs`
- `npm run tsc`
- `node scripts/scenegis/verify-planar-packages.mjs`
- changed-scope ESLint/Prettier/Markdownlint、`git diff --check`
- `node scripts/scenegis/audit-upstream-patches.mjs`，expected current E4 upstream-owned diff=`0`、generated status=`0`

Not required:

- Full test suite、E2E、Sandcastle gallery、公网成功、unrelated terrain/content/performance suites。
- Architecture重复执行视觉或focused用例；Architecture只review code/contract/evidence，项目负责人在批准后把关表现。

## Manual gate

Architecture/code review批准后，项目负责人通过根Cesium开发服务器打开`Test/平面环境.html`，确认：

- 中文lil-gui可开关planar SkyBox和atmosphere，并调整zenith/horizon color、intensity、fade height。
- manual/astronomical、native Clock、Sun/Moon与day/twilight/night atmosphere方向一致。
- 公开EPSG:3857 terrain/imagery和平面相机保持可用；above/underground与foreground遮挡符合预期。
- SkyBox资源不发生重复、Earth TEME旋转或销毁错误；compact panel仍credit-safe。

视觉表现由项目负责人把关；manual gate通过前不完成E4、不创建checkpoint、不进入E5。

## ADR, ownership, generated files, and commit rules

- ADR-0036必须冻结：独立planar atmosphere数学、fixed planar-axis caller-owned SkyBox、soft-private CubeMapPanorama seam、
  composition/native conflict/underground、resource budget、requestRender与upgrade/removal boundary。
- E4 expected upstream-owned files=`0`、SGP=None；只读依赖`SGP-0003`。出现任一upstream diff立即停止。
- Generated adjacent Shader JS、indexes、declarations、API docs与Build output只做read-only验证，不得进入status/commit。
- Execution不得commit、push、publish、请求manual gate或进入E5；保持working tree供Architecture独立review。
- Architecture findings、项目负责人manual gate与ownership/generated审计均通过后，由Architecture创建独立中文E4 checkpoint。

## Completion criteria

- Hidden defaults保持E1-E3行为和zero new GPU allocation；显式show后atmosphere只消费planar camera/terrain/effective Sun state。
- Caller-owned fixed-axis SkyBox不进入Scene-owned slots、不使用TEME、不发网络请求且exactly-once由caller销毁。
- SkyBox→atmosphere→bodies→geometry、native conflict和underground mask在real Context确定；pick/depth不受影响。
- One atmosphere VA/one SP/one command/zero texture budget成立；uniform/time/camera mutation保持warm identities。
- Focused Specs、real Context、build/release/types/docs/installed package、ADR/Guide/UpgradeChecklist、direct Test manual gate闭环。
- Review approved、manual gate passed、phase/roadmap/handoff完成并形成独立E4 local checkpoint；未push。

## Current handoff

- E3 checkpoint=`8ff8b48ebf`，项目负责人人工验收已通过；用户自有`Test/地形.html`继续严格在phase外。
- E4 implementation已完成：新增caller-owned fixed-axis `SceneGISPlanarSkyBox`、World-owned fullscreen atmosphere renderer与
  两个fixed shaders；World通过既有`SGP-0003`固定执行SkyBox→atmosphere→bodies，地下统一隐藏并按需执行opaque mask。
- Focused suites为Environment 23、SkyBox 4、atmosphere renderer 4、celestial renderer 6、World 23、real-Context Widget 10，
  全部`TOTAL SUCCESS`。build/release/types/docs/tsc与installed verifier通过，后者确认12/12 GLSL和12/12 generated modules。
- Exact delivery为24个E4 paths；current E4 upstream-owned diff=`0`、SGP=None、generated status=`0`。用户自有
  `Test/地形.html`未读取、修改、暂存或纳入delivery。
- Architecture/code review已批准，E4-R001/R002已关闭；首次manual gate发现的E4-R003 local cubemap edge seam已窄修复，
  deterministic Canvas assertion证明六面所有border pixels（含corners）完全一致。项目负责人刷新后已确认接缝消失，
  并于`2026-08-13`通过E4最终manual gate；E4所有gate已关闭，正在创建独立checkpoint，提交前不进入E5。

## Execution results and deviations

- `SceneGISPlanarSkyBox`仅接受六个同步preloaded、same-constructor、square/same-size、non-URL faces，严格限制credit为
  `Credit|string|undefined`，冻结face-reference snapshot并以
  `Matrix3.IDENTITY`和`CubeMapPanorama({returnCommand:true})`输出caller-owned fixed-axis command；不会写入或销毁Scene slots。
- Atmosphere renderer以两阶段candidate publication维持default-hidden zero GPU allocation；首次有效显示发布一个VA、一个固定
  ShaderProgram和一个stable fullscreen command，Context切换或构造失败会清理candidate且不留下半发布状态。
- World一次计算planar pose/resident-terrain underground state并共享给atmosphere与E3 bodies；地下时不执行planar visuals，若native
  generic background已经执行则复用同一atmosphere command输出opaque `backgroundColor` mask。
- 未扩大upstream、render pass、Surface/terrain/imagery/camera controller或native atmosphere/SkyBox边界；未新增asset、network、
  texture、sampler、FBO、postprocess或第二Clock。实现与confirmed plan无行为偏差。
- 未运行full suite、E2E、Sandcastle gallery、公网成功或无关terrain suites，符合本phase validation boundary。
- Manual finding E4-R003只修改direct Test generated cubemap：统一edge color、低对比内部radial tint与显式1px border覆盖；
  现有root server短headless smoke实测六面全部border pixels为同一RGBA `27,45,74,255`且page errors=0；未修改产品SkyBox、
  atmosphere、Environment/World或网络/asset契约。
