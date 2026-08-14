# Phase Plan：A2 Bruneton Atmosphere and Aerial Perspective

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Previous phase:
  [2026-08-14-phase-a1-render-foundation.md](2026-08-14-phase-a1-render-foundation.md)（`completed`）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-14`
- Architecture review: `confirmed`
- Implementation status: `not started`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A1=`a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`
- Implementation base: this A2 planning checkpoint；exact hash由Architecture在formal assignment中发送
- Related discussion:
  [2026-08-14-a2-lut-and-planar-model.md](../discussions/2026-08-14-a2-lut-and-planar-model.md)
- Related decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- Upstream patch: active `SGP-0008`（consume only）
- Manual visual gate: `pending`

## Goal

在 A1 的两个 render slot 与 dual-world reference frame 上交付第一个 visible、可发布的 advanced environment slice：

- Globe：fixed Earth Bruneton precomputed atmosphere、Sun disk与 depth-aware aerial perspective；
- `SceneGISPlanarWorld`：同一 physical coefficient preset 的 fixed-axis flat-slab sky、Sun disk与 aerial perspective；
- public caller-owned Controller、明确 capability/native conflict、async asset与 GPU lifecycle；
- audited package-local LUT/license/provenance，以及 dev/release/root/installed package交付证据。

A2结束时必须能在中文 direct Test 中并列观察 Globe/planar 的地面、空中与高空效果，但 planar 不宣称与 Globe pixel-identical或
Bruneton multiple-scattering等价。

## Entry evidence

- A1 checkpoint为`a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`，Architecture/code review无blocker，working tree在A2规划前clean。
- `Scene.js`仅有A1两个paired `SGP-0008`range；background在native environment之后、SGP-0003之前，HDR在resolved
  color/depth/id之后、native postprocess之前。
- A1 private pipeline已验证single-Scene attach/detach、inactive identity、foreign replacement preservation与invalid texture atomicity。
- A1 reference frame已发布 Globe geodetic surface/local ENU/altitude和planar fixed ENU/base Z，支持Perspective/Orthographic snapshot。
- `ControllerHost.update`早于render decision；当帧Globe Sun direction只能在render slot消费`UniformState.sunDirectionWC`，planar消费
  registered `SceneGISPlanarEnvironment.effectiveSunDirection`。
- `Texture3D`为WebGL2-only；`Context.textureHalfFloatLinear`、`depthTexture`、`colorBufferHalfFloat`和
  `maximum3DTextureSize`可以形成read-only support predicate。
- `czm_readDepth`/`czm_windowToEyeCoordinates`提供log/non-log depth与frustum reconstruction；A2不需要修改builtin。
- `copyEngineAssets`、Karma Assets proxy与package `files`已覆盖新`Source/Assets/SceneGIS/**`，ADR-0041/Architecture已批准owned root。

## Frozen public contract

新增 default-export public `SceneGISEnvironmentEffects`：

```js
const effects = new SceneGISEnvironmentEffects({
  mode: "planar",
  world: viewer.planarWorld,
  enabled: false,
  showAtmosphere: true,
  showAerialPerspective: true,
});
viewer.addController(effects);
```

### Constructor and properties

- `mode` required：exact `"globe"|"planar"`。
- `world`：planar required exact `SceneGISPlanarWorld`；Globe must be `undefined`。
- `enabled`：boolean，default `false`；保持ControllerHost语义。
- `showAtmosphere`、`showAerialPerspective`：boolean，default `true`。
- Readonly `mode`、`world`、`ready`、`errorEvent`；Event arguments固定为`(controller, error)`。
- Static `isSupported(scene)`：只读 capability preflight；invalid/non-live Scene抛`DeveloperError`，unsupported返回`false`。
- A2不增加public`destroy`、physical coefficient、LUT URL、quality、temporal、fog/cloud/god-ray/lens参数或Scene/Viewer option。

Constructor validation必须在`viewer.addController`前完成所有确定性option错误。Caller必须在host destroy前
`viewer.removeController(effects)`；disconnect销毁Scene/Context resource并允许同一instance重新注册。

### State and request semantics

- Construct/register while disabled：零pipeline attachment、asset request、GPU resource、extra command、timer/listener与render request。
- First active update：先验证live Scene/world/SCENE3D/native conflict/HDR/capability，再attach A1 pipeline；不允许先fetch/allocate。
- Active且任一show flag为true才启动candidate generation。Globe并发fetch三个package-local binary；planar不fetch LUT。
- `ready=true`只表示当前Scene/Context的完整resource set已经published；disable后可保留warm resource，但pipeline identity返回、请求一帧。
- Show flag mutation仅在observable output改变时请求一帧；same value/inactive/disconnected mutation不request。
- Disable/disconnect/candidate replacement递增generation token；late Promise不得publish、request或destroy新owner资源。Disconnect exactly-once
  destroy current/candidate并`ready=false`。
- Async failure不发布half-state，`ready=false`，同一generation只raise一次`errorEvent`；`enabled=false -> true`是显式retry。
- First active deterministic guard failure必须在mutation前throw。Ready后的late native/capability conflict先让pipeline fail closed并一次
  raise `errorEvent`；caller修复后通过disable/re-enable恢复，不自动改foreign state。

## Capability and conflict contract

`isSupported(scene)`只有以下全部成立才返回true：live Scene、WebGL2、`maximum3DTextureSize >= 256`、half-float texture、
half-float linear filter、depth texture、half-float color-buffer rendering与`scene.highDynamicRangeSupported`。Active update另要求
`scene.highDynamicRange === true`。不得nearest/RGBA8/WebGL1/post-tonemap/错误geometry fallback。

Globe active guard：

- `scene.mode === SceneMode.SCENE3D`、`scene.world === scene.globe`、live Globe；
- native `skyAtmosphere`、SkyBox、Sun/Moon visible body关闭；`scene.sunBloom === false`；
- `scene.fog.enabled === false`、`scene.globe.showGroundAtmosphere === false`；
- 不改变`scene.light`、Globe lighting或caller object identity。

Planar active guard：

- exact `scene.world === world`、no Globe、SCENE3D；
- exact world上存在registered、enabled `SceneGISPlanarEnvironment`；render slot读取其当帧finite readonly
  `effectiveSunDirection`，不调用Earth automatic astronomy；
- ADR-0039 native guard保持，planar lightweight SkyBox/atmosphere/Sun/Moon visible output全部关闭；Environment的direction/light
  authority仍保持enabled；
- 使用与existing planar visual environment一致的resident-terrain underground predicate；地下帧跳过advanced visual execute，不改变
  resource identity。

## Render and optical contract

### Shared frame/ray contract

- 复用A1 current/scratch candidate snapshot，不在hot path新增Cartesian对象。
- Perspective ray origin为camera；Orthographic按pixel eye XY计算parallel-ray origin offset。Ray direction、distance与local
  east/north/vertical在eye/local space计算，避免把large world position降到single-precision GLSL。
- Background只在ordinary render slot提交一个fullscreen command。Aerial只在show flag、ready、valid depth input时执行一个HDR command。
- Aerial读取raw depth；用`czm_readDepth`判clear，用raw value传`czm_windowToEyeCoordinates`重建log/non-log eye point。Clear sky返回input
  color不二次散射；geometry output为`color * transmittance + radiance`并保留alpha。
- A2只对resolved opaque depth geometry精确；translucent/OIT独立depth、MSAA sample-level atmosphere与classification-specific media不在范围。

### Globe Bruneton path

- Fixed immutable`earth-bruneton-2017`：bottom=6360 km、top=6420 km与ADR-0041 manifest coefficients。
- Upload three RGBA16F LUT：256×64 transmittance、256×128×32 combined scattering、64×16 irradiance。
- 使用Bruneton `GetSkyRadiance`/`GetSkyRadianceToPoint`/transmittance/single-Mie reconstruction与Sun angular disk所需最小runtime functions；
  derived GLSL保留完整BSD notice和fixed source path/commit。
- 将A1 geodetic altitude/local vertical映射到virtual sphere；不得用WGS84 radii替换LUT radius。支持ground、inside atmosphere与outside
  atmosphere camera；underground camera frame fail closed/skip，不产生NaN或resource churn。

### Planar flat-slab path

- Base Z=0、top Z=60,000 m、fixed `+Z`；shared Rayleigh/Mie/ozone coefficients与Sun angular radius。
- 使用compile-time bounded view samples与解析/分段 density optical depth，禁止nested unbounded loop；Sun below flat horizon被ground遮挡。
- Downward background ray使用flat plane/World extent语义，不构造sphere intersection或curved horizon；horizontal long path可按transmittance
  收敛阈值截断，但阈值和maximum distance必须固定并测试。
- A2 planar是physical-coefficient single scattering；不采样Globe LUT、不宣称multiple scattering。Globe/planar API、enable/error/lifecycle一致。

## Asset and source contract

Target root：

```text
packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/
```

Required tracked files only：

- `transmittance.bin` — 131,072 bytes，SHA-256
  `A2A0DD1464048D92E7BFDF385A9108E8D9C3E2748684F1F64523587D5894180A`
- `scattering.bin` — 8,388,608 bytes，combined RGBA16F，SHA-256
  `82C505FE6E3B7F1995C650CC8A1478F42BD510029BF63845E9485C078AEF6617`
- `irradiance.bin` — 8,192 bytes，SHA-256
  `126BD4FF0419E04C877639CAF9E3CD64A139AE511CF315A23A0C989FC47B51A5`
- `LICENSE.txt` — exact audited package license，SHA-256
  `32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B`
- `provenance.json` — schema/version/preset/source repo+commit+paths/license/format/dimensions/file hashes/physical constants。

Source authority为 three-geospatial fixed commit`9c6dfd0054f077f3ad4695b802e74d4c6a814440`。新增
`scripts/scenegis/import-bruneton-earth-luts.mjs`：显式`--source-dir`，在candidate temp中验证全部hash/length/license/manifest后原子写入
target；不得download、不包含本机path、不接受unknown hash、不写Build/generated。Importer需有verify-only模式或配套package verifier。

Runtime使用`buildModuleUrl("Assets/SceneGIS/Environment/BrunetonEarth/<file>")`与`Resource.fetchArrayBuffer`；不得暴露public base URL或
运行时公网 fallback。Upload直接使用`Uint16Array`/`PixelDatatype.HALF_FLOAT`，不创建Float32副本；成功后释放CPU buffers。

## Resource and failure-atomic contract

- Private A2 pipeline组合/继承A1 pipeline；public Controller拥有它，Scene仅保留A1 soft-private attachment。
- One stable fullscreen VA；Globe最多background+aerial两个program、三个LUT texture；planar最多两个program、零LUT。
- Aerial使用一个color-only RGBA16F `FramebufferManager`；以input texture dimensions为key。No aerial flag=no FBO。
- Resize创建完整candidate FBO后swap；shader/LUT/FBO candidate全部成功才`ready`/enabled publication。Destroy old only after commit。
- Never destroy/modify input color/depth/id、native sky/light/environment或foreign A1 attachment；invalid input/context保留last-good并返回identity。
- 1920×1080 Globe persistent texture budget <=23.95 MiB；3840×2160 <=71.41 MiB。Planar减去8.13 MiB LUT。CPU LUT buffers上传后为0
  persistent；A2无noise/history/temporal texture。
- Maximum render work为one background + one aerial fullscreen command；disabled/both show flags false为zero command。Planar sample constants与Globe
  LUT sample counts必须在源码/Specs中可观测，不使用单机absolute FPS作为hard gate。

## Expected implementation paths

- Public/controller：`packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- Private pipeline/resource/renderer：`packages/engine/Source/SceneGIS/Scene/_private/**`
- Shader source：`packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/**/*.glsl`
- Runtime assets：`packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/**`
- Specs：`packages/engine/Specs/SceneGIS/Scene/**`及对应`_private/**`
- Import/package verification：`scripts/scenegis/**`
- Direct visual page：`Test/高级环境.html`及`Test/index.html`链接
- Persistent decisions/collaboration：ADR-0041、本phase plan、review与extension index/roadmap。

`packages/engine/Source/Scene/Scene.js`、`.scenegis/upstream-patches.json`与A1 hook应保持unchanged。GLSL生成`.js`、engine/root barrel、types、
SpecList、Source/Cesium、Build与pack/profile temp均是generated/untracked delivery evidence，不得提交。

## Implementation steps

1. 建立asset importer/provenance schema，导入三个fixed binary与license，先验证tracked byte budget和buildModuleUrl route。
2. 实现private capability/native guard与public Controller state machine；完成default-zero、attach/detach、generation/error/request Specs。
3. 实现HALF_FLOAT 2D/3D LUT candidate owner、license/source-annotated Bruneton runtime shader与Globe background。
4. 实现shared Perspective/Orthographic ray reconstruction、Sun disk和Globe HDR aerial candidate FBO。
5. 实现planar fixed-slab background/aerial与resident-terrain underground guard；确认无 spherical LUT allocation/sample。
6. 完成resize/fetch/decode/compile/allocation failure injection、resource identity/count/destroy与clear-depth/native conflict tests。
7. 增加中文双canvas/direct page，固定local/no-network geometry、time与camera presets，展示Globe/planar disabled/enabled、ground/air/high视角。
8. 完成dev/release/build/types/docs/root/engine package与asset byte/license/public/private export qualification；回写phase plan和review-ready handoff。

## Validation matrix

### Focused automated checks

- Public API：constructor options、readonly/mutable fields、default disabled、`isSupported`、root/engine exports、JSDoc/types。
- Controller：Viewer/CesiumWidget add/remove、duplicate pipeline、wrong world/mode/order、inactive mutation、warm toggle、re-register、late Promise、
  errorEvent once、requestRender and destroy balance。
- Capabilities/conflicts：每个WebGL/HDR/native/simple flag独立失败且mutation count=0；repair+explicit retry；SceneMode/non-live/foreign replacement。
- Assets：source/destination exact SHA/length/license、combined format、HALF_FLOAT typed view/no Float32、three requests only、fetch failure atomicity。
- Globe pixels：day/night/Sun disk、zenith/horizon、ground/air/space、geometry distance attenuation、clear-depth identity、Perspective/Orthographic。
- Planar pixels：fixed-Z day/night/Sun、no curved horizon、ground/air/high、near/far geometry attenuation、underground skip、Perspective/Orthographic。
- HDR/order：background before geometry；aerial after resolved color/depth and before native bloom/tone mapping；show flags command/FBO identity。
- Resources：1920×1080/resize candidate swap、3D/2D texture/program/VA/FBO fixed counts、disconnect/reconnect、last-good failure、exactly-once destroy。

### Build and delivery

- Focused/aggregate Jasmine for new public/private Specs and A1 render-slot/reference/pipeline regression。
- `npm run build`、`npm run build-release`、`npm run build-ts`、`npx tsc`；record existing-only warnings separately。
- Engine/root package temp installation：public class import/types/docs，private modules不在public export，三个binary/provenance/license在
  Source/dev/release/tarball保持exact bytes并可通过runtime URL fetch。
- Changed-scope ESLint、Prettier、Markdownlint、`git diff --check`。
- `node scripts/scenegis/audit-upstream-patches.mjs`：current delivery upstream-owned仍只有`Scene.js`/SGP-0008，A2不新增hunk，generated=0。

### Manual visual gate

Architecture review批准实现后，项目负责人在`Test/高级环境.html`检查：

- Globe与planar同屏默认disabled无变化；启用后sky、Sun与近/远geometry aerial同时出现；
- 固定time下day/sunset/night及ground/air/high presets；planar horizon保持flat、不出现earth curvature；
- 分别关闭atmosphere/aerial，native/simple conflict提示明确；resize/toggle/re-enable无黑屏、NaN、闪烁或持续render；
- Globe与planar可以有预期quality差异，但都达到可用的第一版physical environment。

该manual gate必须由项目负责人在实际查看visual结果后明确通过。Gate通过、Architecture review无blocker并创建A2独立checkpoint后，
才能激活A3。

## No-goals and stop conditions

- 不实现exponential height fog、volumetric clouds、cloud shadow、god rays、temporal history、bloom/lens flare或quality tiers。
- 不修改native `SkyAtmosphere`/Fog/SunPostProcess、Globe shader/geometry或公开Scene/Viewer options。
- 不增加single-Mie/higher-order LUT、Float32 decode、runtime external URL、three.js/helper dependency、raw GL/PBO。
- 不解决translucent/OIT独立depth、arbitrary atmosphere parameter authoring、ellipsoid-exact precomputation或WebGL1/mobile fallback。
- 如需第二个upstream file、修改`Scene.js` A1 ranges、build script/package manifest、`PostProcessStageCollection`、Renderer或新增public
  asset URL/physical parameter，立即停止并通知Architecture；不得自行扩大A2/SGP-0008。

## Exit and handoff

Execution完成后必须：

- 保持plan `Status: active`并将`Implementation status`更新为`review-ready`（Architecture gate后再确认`completed`），逐项记录actual
  paths、deviations、validation、asset hashes/bytes、resource budgets、upstream-owned files/SGP、generated status和remaining risks；
- 新建`reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md`，状态`open`，提供exact review target/base/HEAD；
- 更新extension roadmap与README current handoff，但不得激活A3；
- working tree保持未commit、未push，向Architecture发送`review_ready`消息。

Architecture独立review、manual visual gate与A2本地checkpoint之前，A2不算completed。
