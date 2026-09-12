# Phase Plan：A2 Bruneton Atmosphere and Aerial Perspective

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Previous phase:
  [2026-08-14-phase-a1-render-foundation.md](2026-08-14-phase-a1-render-foundation.md)（`completed`）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-14`
- Updated: `2026-08-15`
- Architecture review: `confirmed`
- Implementation status: `completed`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A1=`a62aaf16ae3a22ae0a27d6bd21358d65b50b55e1`
- Implementation base: `9462cd963fe3a682dc7140d6cabb980405061c47`
- Related discussion:
  [2026-08-14-a2-lut-and-planar-model.md](../discussions/2026-08-14-a2-lut-and-planar-model.md)
- Related decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md)
- Upstream patch: active `SGP-0008`（consume only）
- Manual visual gate: `passed` on 2026-08-15 after three prior failed gates

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

### Source-fact correction recorded during implementation

- The first implementation pass used a simplified combined-LUT coordinate
  mapping. That does not satisfy the frozen Bruneton runtime contract. The
  review target therefore vendors the fixed authority's `definitions.glsl`,
  `common.glsl`, and low-level `runtime.glsl` functions verbatim with their full
  BSD notice, disables only its Three.js convenience wrappers, and keeps the
  SceneGIS globe/planar adapter separate. This stays inside the frozen shader
  and source scope; it does not change the A1 hooks, public contract, assets, or
  upstream footprint.

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

## Implementation record

- Public caller-owned `SceneGISEnvironmentEffects` implements the frozen
  globe/planar constructor, readonly state, capability preflight, disabled-zero,
  explicit retry, error event, warm toggle, disconnect/re-register, and native
  authority contracts without adding a public destroy method or Scene/Viewer
  option.
- The private renderer owns one fullscreen VA, two programs, optional three
  Globe LUT textures, and one lazy color-only RGBA16F aerial framebuffer. It
  uses A1's two soft-private slots unchanged, performs candidate publication and
  resize swap, and preserves last-good/identity on late or invalid work.
- Globe uses the fixed authority's exact `definitions.glsl`, `common.glsl`, and
  low-level `runtime.glsl` coordinate/runtime functions, with the full BSD
  notice and fixed commit/path retained. Only the authority's Three.js
  convenience wrappers are disabled. SceneGIS supplies the immutable Earth
  preset and ellipsoid-radial A1 frame.
- Planar compiles without spherical LUT declarations or sampling and evaluates
  bounded fixed-`+Z` flat-slab Rayleigh/Mie/ozone single scattering. It consumes
  only the planar environment's effective Sun/light authority.
- The importer requires an explicit source directory, validates exact
  bytes/SHA-256/license/combined-binary16 format, writes and verifies a candidate
  before atomic publication, and never downloads or records a machine path.
- The local Chinese dual-world page uses only package-local build assets. Its
  automated browser smoke reached `ready` in both worlds with zero external
  requests.

## Implementation deviations and tool limits

- A first local implementation pass used a simplified combined-LUT UV mapping.
  Source review found that it did not meet the frozen Bruneton runtime contract;
  it was replaced before review by the exact fixed-source low-level runtime as
  recorded above. No architecture, asset, public, or upstream scope changed.
- The existing installed-package verifier was extended within the approved
  `scripts/scenegis/**` scope because its exact public inventory correctly
  rejected the new class until A2 runtime/types/docs and asset assertions were
  added.
- The codebase-memory graph did not contain A1's recent private environment
  files, the recent planar Viewer guard, or several environment private members.
  Discovery used the graph first, then exact file/string fallback only for these
  index gaps.

## Validation record

- Focused A2/A1 controller/pipeline real-Context Specs: `26/26` passed. Coverage
  includes default-zero, capability/native conflicts, warm lifecycle,
  disconnect/re-register, fetch failure, stale resolve/reject and
  conflict-during-fetch isolation, clear-depth identity under log/non-log depth,
  ground/air/outside frame states, Perspective/Orthographic shader and command
  contracts, input-sized aerial viewport, candidate one-time destruction,
  underground suppression, lazy aerial FBO, resize swap/destruction, and exact
  LUT texture bytes. These are deterministic state/resource assertions, not a
  claim of automated visual quality.
- A1 regressions: advanced render slot `5/5`; reference frame `4/4`;
  pipeline cases are included in the focused `18/18` run.
- Minimal Scene aggregate: `418/418` passed. No full `16039`-Spec suite was run.
- Importer tests: `5/5` passed, including canonical provenance tamper rejection;
  destination `--verify-only` passed.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, and `tsc`: passed.
  `build-ts` emitted the repository's pre-existing TSD-JSDoc warnings; the A2
  static preflight is documented as a function.
- Installed-package verifier: passed with `19/19` GLSL, `19/19` generated shader
  modules, exact engine/root LUT/license/provenance, ESM/CJS public runtime,
  declarations/API docs, and private hiding.
- Changed-scope ESLint/Prettier and Markdownlint passed; `git diff --check`
  passed. The official upstream audit reports current-delivery upstream-owned
  `0` and generated status `0`.

## Resource and delivery evidence

- LUT persistent bytes: `8,527,872` (`8.1328125 MiB`); CPU buffers are released
  after direct `Uint16Array`/`HALF_FLOAT` upload.
- Globe persistent budget: `23.953125 MiB` at 1920×1080 and `71.4140625 MiB` at
  3840×2160. Planar removes exactly the `8.1328125 MiB` LUT allocation.
- Runtime asset hashes/bytes match the phase's frozen values; the license is
  `4,239` bytes with SHA-256
  `32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B`.
- A2 changes no upstream-owned file and consumes active `SGP-0008` without
  changing `Scene.js`, either A1 range, or `.scenegis/upstream-patches.json`.
- Generated shader modules/build outputs were produced only for validation and
  remain untracked/ignored; official generated status is `0`.

## Architecture review correction record

- The changes-requested pass added orthographic per-pixel ray origins to both
  render stages and changed both world adapters to consume a local ray origin.
- Planar single scattering now uses exact slab entry/exit, analytic
  Rayleigh/Mie density integrals, the frozen triangular ozone absorption
  profile, and analytic Sun optical depth instead of clamped local extinction.
- Aerial execution now supplies an input-sized `PassState` viewport. Candidate
  vertex-buffer and shader-program ownership closes the two pre-publication leak
  boundaries.
- Async success/failure publication is guarded by generation, enabled/live Scene,
  and error generation. Native planar Scene output is part of both deterministic
  and late conflict validation.
- The direct page and Specs no longer overstate finite byte reads as visual
  coverage. The page exposes the complete owner gate controls; automated tests
  assert identity, resource/command state, and optical branch contracts while
  leaving actual appearance to the pending owner manual gate.

## Remaining gate

- Initial Architecture/code review passed against the uncommitted working tree,
  but the project-owner manual visual gate failed. A3 is not activated.
- A2R below must return to Architecture review and a new owner visual gate before
  any A2 checkpoint.

## A2R owner-gate rework amendment

This amendment supersedes the earlier planar zero-LUT/single-scattering and
resource-budget bullets in this plan. ADR-0042 is the controlling decision.

### Blocking owner finding

- Both worlds did not yet form an acceptable visible physical-environment
  baseline. The missing later cloud/fog/god-ray/post effects are acknowledged,
  but A2 itself must still make atmosphere and aerial perspective clearly
  observable.
- The planar 120 km preset reaches the 60 km slab top only after 300 km. The
  current shader clamps the complete ray to 300 km before intersection, producing
  an empty segment. Many visible geometry rays enter even later and also return
  identity.
- Planar uses an 8-sample analytic single-scattering loop, zero LUT, zero multiple
  scattering, and zero diffuse ground irradiance. That quality boundary is no
  longer accepted.

### Required delivery

1. Separate camera-to-endpoint geometry distance from the 300 km in-medium
   integration budget. Intersect the untruncated ray with the exact flat slab,
   then cap only medium segment length.
2. Add the ADR-0042 `PlanarEarth` fixed precomputed asset set: 256×64 RGBA16F
   transmittance, 256×128×32 RGBA16F combined scattering `Texture3D`, and 64×16
   RGBA16F irradiance, including orders 2–4 multiple scattering.
3. Add a deterministic SceneGIS-owned generator/verifier, provenance, applicable
   license/attribution, exact hashing, atomic publication, and installed-package
   verification. Runtime remains local/no-network and uploads binary16 directly.
4. Replace planar per-pixel 8-sample transport with flat-LUT lookup and segment
   differencing while preserving fixed `+Z`, flat horizon, Sun authority,
   Perspective/Orthographic rays, and opaque-depth-only scope.
5. Preserve Globe LUT/runtime, public Controller, A1 slots, Scene.js, SGP-0008,
   native authority, disabled-zero, retry, lifecycle, and failure-atomic behavior.
6. Keep the high preset at 120 km, improve scene depth/horizon cues, and add
   explicit enabled-vs-identity diagnostics. Do not hide the defect by moving the
   camera inside the slab.

### Required verification and exit

- Add deterministic generator/reference tests and exact asset/provenance/package
  assertions.
- Add Real Context resource/lifecycle coverage for the planar `Texture3D` and
  pixel assertions for slab-inside, high-above-slab intersecting/nonintersecting,
  day/sunset/night, near/far, Perspective/Orthographic, and clear-depth identity.
- Rerun A2/A1 focused Specs, A1 slot/reference regressions, minimal Scene
  aggregate, importer/generator tests, build/release/types/docs, installed-package
  verifier, changed-scope lint/format, diff check, and official upstream audit.
- Return the retained uncommitted working tree for Architecture/code review. Only
  after approval may the project owner repeat the manual visual gate. No commit,
  push, A3 planning, or A3 implementation before that gate passes.

### A2R implementation record

- Planar background and aerial paths intersect the untruncated ray with the
  exact `[0, 60 km]` slab and only then cap the in-medium segment to `300 km`.
  Nonintersecting background fragments discard to preserve the existing color;
  high-altitude intersecting rays remain non-identity in both Perspective and
  Orthographic projections.
- Runtime now loads package-local `PlanarEarth` binary16 transmittance,
  combined-scattering `Texture3D`, and irradiance LUTs. Flat-LUT start/end
  differencing replaces the former eight-sample per-pixel transport while
  retaining fixed `+Z`, flat-horizon, effective-Sun, opaque-depth, retry, and
  failure-atomic lifecycle contracts. Globe assets and shader authority remain
  byte-identical.
- `scripts/scenegis/generate-planar-earth-luts.mjs` is the deterministic
  SceneGIS-owned generation authority. It uses the immutable Earth coefficients,
  12-point view quadrature, 12 zenith by 8 azimuth source quadrature, 32 by 32
  source transport samples, and scattering orders 2–4. Candidate generation,
  canonical-provenance verification, atomic swap/restore, and tamper tests are
  explicit; runtime uploads `Uint16Array`/`HALF_FLOAT` without Float32 expansion
  or network access.
- Exact PlanarEarth delivery is: `transmittance.bin` 131,072 bytes SHA-256
  `5CD60C76237A4C6DC20CEB54BE1726C325A6898CD1B114E69FC3496A1A9FF851`;
  `scattering.bin` 8,388,608 bytes
  `873162E5730406EF0183E0B16E7F6E79537268AC1F6BC38B2F0AADED5C9D7FB9`;
  `irradiance.bin` 8,192 bytes
  `0265335BDFAB584639965B920A5F668C4906D77C290D6D6805D6F3F199CCE278`;
  and the 4,239-byte full license SHA-256
  `32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B`.
- The direct page keeps the planar high preset at `120 km`, adds longer
  near/far and horizon cues, and reports full-framebuffer enabled-versus-identity
  RGB delta, maximum delta, and changed-pixel counts.

### A2R validation record

- Focused A2R controller/pipeline real-Context Specs: `29/29`; A1 advanced
  render slot: `5/5`; A1 reference frame: `4/4`; exact `Scene/Scene` aggregate
  filter: `421/421`.
- Planar generator tests: `9/9`, including full-size separate-target regeneration
  and byte comparison; PlanarEarth destination `--verify-only`:
  passed. Existing Globe importer tests: `5/5`; Globe destination
  `--verify-only`: passed.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, and `tsc`: passed.
  `build-ts` emitted only the repository's existing TSD-JSDoc warnings.
- Installed-package verification passed with exact PlanarEarth and Bruneton
  assets/license/provenance in engine and root delivery, `19/19` GLSL plus
  generated modules, ESM/CJS, public runtime/types/docs, and private hiding.
- Local browser smoke proved default-disabled identity, both worlds reaching
  `ready · HDR`, the retained 120-km preset, zero console warning/error, and a
  Planar full-framebuffer delta `1920` across `1920` pixels. This is not the owner visual gate;
  Globe color quality and all interactive appearance remain for owner judgment.
- Changed-scope ESLint/Prettier, Markdownlint, `git diff --check`, exact A1
  upstream-file/manifest unchanged check, and official upstream/generated audit
  passed; the audit reports A2R upstream-owned `0` and generated `0`.
- A broad accidental `--includeName SceneSpec` filter matched 5,978 unrelated
  tests, surfaced existing cross-module failures, and disconnected Chrome; it is
  excluded from the qualification result. The subsequent intended
  `--includeName Scene/Scene` filter passed `421/421`.

### A2R resource and boundary record

- Both worlds now own the same `8,527,872`-byte (`8.1328125 MiB`) LUT set after
  successful publication; persistent CPU LUT bytes after upload are `0`.
  With the optional RGBA16F aerial FBO, each world budgets `23.953125 MiB` at
  1920×1080 and `71.4140625 MiB` at 3840×2160.
- A2R changes no upstream-owned file, consumes active `SGP-0008` only, and keeps
  `packages/engine/Source/Scene/Scene.js` plus
  `.scenegis/upstream-patches.json` unchanged. Generated validation outputs
  remain ignored/untracked.
- Codebase-memory discovery was used first. Its graph still lacks the recent A1
  and A2 private environment files, so exact file/string fallback was used only
  for that index gap.

### A2R Architecture re-review findings — 2026-08-15

The first A2R review target remains blocked and uncommitted:

1. The generator clamps every alleged boundary transmittance/radiance integration
   to 300 km. Runtime then divides two capped-boundary transmittances and subtracts
   two capped-boundary radiances. For an exact horizontal ray both endpoints have
   identical height/coordinates, so this deterministically returns
   `transmittance=1` and `radiance=0`; shallow segments whose physical boundary is
   farther than 300 km also use non-composable windows. The medium cap must remain
   a runtime segment cap, while LUT generation uses the true boundary/infinite
   optical limit and runtime computes actual segment transmittance analytically.
2. `createMultipleSourceGrid` calls `integrateRay` with the previous source for
   orders 3 and 4, but `integrateRay` always adds single scattering again. The
   stored accumulation therefore weights lower orders repeatedly rather than
   storing each of orders 2–4 exactly once.
3. The irradiance generator samples the accumulated local scattering source,
   multiplies it by π, and adds an albedo-scaled copy. That value is not a
   cosine-weighted hemisphere radiance integral and is dimensionally not the
   diffuse irradiance claimed by ADR-0042/provenance.
4. Existing `28/28` Specs cover high-altitude background only. They do not cover
   high-altitude resolved-depth aerial, exact-horizontal visible media, or the
   shallow capped-window case. Generator tests assert deterministic positive
   bytes but do not detect repeated orders, incorrect irradiance, or boundary
   composition. Full-resolution generator output is only manifest-verified, not
   regenerated and compared in the recorded validation.

Execution must correct ADR-0042 transport, regenerate PlanarEarth with a new
generator version/hashes, add the missing reference/pixel cases, and return the
retained working tree for another Architecture review. Owner visual gate remains
blocked; A3 remains inactive.

### A2R correction Architecture acceptance — 2026-08-15

Architecture independently re-reviewed the corrected retained working tree and
accepts all four findings as resolved. The review confirmed true-boundary and
semi-infinite horizontal transport, analytic capped-segment transmittance, strict
orders 2–4 recurrence, cosine-weighted irradiance, high-above-slab resolved-depth
coverage, and full-size separate-target byte regeneration.

Architecture independently replayed the focused real-Context Specs (`29/29`),
Planar generator tests (`9/9`, including full-resolution regeneration), Planar
destination `--verify-only`, `git diff --check`, the unchanged A1/SGP manifest
boundary, and Globe asset hashes. These checks passed at exact HEAD/base
`9462cd963fe3a682dc7140d6cabb980405061c47`.

No correctness, lifecycle, package, asset-authority, generated-file, or upstream
blocker remains. Two non-blocking owner-gate risks remain explicit: the recorded
Planar 8-bit diagnostic has maximum channel-sum delta `1`, so visible strength may
still be rejected by the project owner; and the frozen 128-KiB Planar
transmittance LUT remains uploaded but is not sampled after analytic segment
transmittance replaced boundary-ratio evaluation. The latter is a bounded resource
inefficiency, not a transport defect, and any later removal must revise ADR-0042's
three-LUT contract rather than silently changing this phase.

A2 remains active and uncommitted. The corrected project-owner visual gate is now
authorized; checkpoint and A3 activation remain prohibited until that gate passes.

### A2R2 amendment — log-depth and scene-linear radiance — 2026-08-15

The second project-owner gate rejected the corrected target because the visible
effect remains too weak. Architecture reproduced the actual page and isolated two
blocking implementation gaps governed by ADR-0043:

1. The direct page uses logarithmic depth, but the aerial program has neither
   `LOG_DEPTH` nor `LOG_DEPTH_READ_ONLY`. Cesium's
   `czm_windowToEyeCoordinates` therefore interprets the raw log value as ordinary
   depth. The planar 120-km geometry ray is reconstructed before the 300-km slab
   entry and returns identity. The earlier pixel Spec disabled log depth and did
   not cover this integrated path.
2. Physical LUT radiance is written directly into Cesium scene-linear HDR without
   the exposure/white-point mapping present in the Bruneton reference display
   path. Ground Planar aerial is measurable only at `max=2`, while representative
   LUT values are nonzero. The existing hidden Sun `20.0` multiplier is not a
   valid shared mapping.

A2R2 must add linear and `LOG_DEPTH_READ_ONLY` aerial variants, select them from
the live Scene flag without runtime compilation, and extend the public Controller
with ADR-0043 `radianceScale` default `10.0`. The scale applies only to physical
radiance before Cesium's existing exposure/tone mapping; it never scales input
scene color or transmittance. The arbitrary Sun multiplier is replaced by the
physical solar-radiance formula.

Direct Test must report background-only and aerial-only deltas separately and
retain the real 120-km high case. A normal integrated Scene render with a real
opaque primitive must prove the log-depth path; direct private pipeline calls with
hand-authored depth are insufficient. Default required nonidentity cases must meet
ADR-0043's minimum `max >= 8` Chromium observability floor before returning for
Architecture review. LUT assets/hashes remain unchanged unless Execution stops
and supplies a new source-backed reason.

A2 remains active, uncommitted, and unpushed. Owner gate, checkpoint, and A3 are
blocked until the A2R2 implementation returns and passes independent review.

### A2R2 implementation and validation record — 2026-08-15

- Each published world candidate now owns one background program plus linear and
  `LOG_DEPTH_READ_ONLY` aerial programs. Both aerial programs compile before
  candidate publication, share the existing command/VA/textures/FBO, release
  their cache references exactly once, and add no runtime fetch, compile,
  texture, FBO, render loop, raw GL access, or upstream file.
- `executeHdr` selects from `scene.frameState.useLogDepth`, the live encoding of
  the resolved depth for the current frame. Source inspection found that
  `Scene.updateFrameState` forces this value false for Orthographic frusta even
  when `scene.logarithmicDepthBuffer` remains true; selecting only from the
  public preference would incorrectly decode Orthographic linear depth as log
  depth. Perspective runtime toggles select the two precompiled variants.
- Public `radianceScale` is finite `[0,64]`, defaults to `10.0`, and is exposed
  as a constructor option plus writable runtime/types/docs property. Its setter
  changes only the uniform value and requests render. Background and aerial
  scale only physical atmosphere radiance; input color and transmittance remain
  unscaled. The hidden Sun `20.0` factor is replaced by
  `solar_irradiance / (pi * sunAngularRadius^2)` before the shared scale.
- Focused controller/pipeline real-Context Specs pass `26/26`. A normal
  `scene.render()` with a real opaque box and resolved depth proves nonidentity
  for Planar 120-km Perspective log depth; linear/log variant selection,
  Orthographic fallback, clear depth, Globe, runtime switching, candidate
  failure, cache-reference destruction, and no fetch/recompile are covered.
  RGBA16F pre-tone-map pixels prove scale `0/1/2` linear composition,
  transmittance invariance, and alpha preservation.
- A1 pipeline and reference-frame regressions pass `7/7` and `4/4`; exact
  `Scene/Scene` aggregate passes `425/425`.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, `tsc`, and the
  installed-package verifier pass. The verifier asserts `radianceScale` in
  engine/root runtime, constructor types, writable property types, and API HTML,
  plus byte-identical Globe/Planar LUT/license/provenance and `19/19` shader
  source/generated modules. `build-ts` emits only existing repository warnings.
- Local/no-network Chromium smoke at scale `10` reports both worlds
  `ready · HDR`, console warning/error `0`, and external page requests `0`.
  Ground/day background, aerial, and combined all report required `max >= 8`;
  Planar values are respectively `608`, `350`, and `608`. At retained Planar
  `120 km`, slab entry/exit remains `300/600 km`, geometry `659/1255 km`, and
  aerial/combined report `max=247` with `432602/435802` changed pixels instead
  of the previous exact identity.
- The high-altitude Planar background sky strip remains observable but below the
  designated floor (`L1=14743`, `max=5`, `3200` changed pixels); the page labels
  it observational rather than a required pass. Visual quality remains for a
  later owner gate after Architecture approval. The existing 128-KiB Planar
  transmittance LUT redundancy remains unchanged under ADR-0042.
- LUT bytes/hashes are unchanged. `Scene.js`, both SGP-0008 ranges, and
  `.scenegis/upstream-patches.json` remain unchanged. No full suite was run; the
  focused/A1/exact Scene aggregate boundary is the claimed automated coverage.

### A2R2 Architecture re-review amendment — 2026-08-15

Architecture independently accepted the live `frameState.useLogDepth` program
selection, candidate lifecycle, public warm scale, real-depth integrated render,
and separate diagnostics after replaying controller `26/26` plus A1 pipeline
`7/7`. One blocker remains: physical Sun radiance multiplied by the default
scale is approximately `214676–278465`, while the required RGBA16F target's
maximum finite value is `65504`; scale `64` reaches approximately
`1.37–1.78 million`. The current off-Sun scale fixtures and postprocessed page
cannot detect this storage overflow.

Execution must implement ADR-0043's final scene-linear RGBA16F storage guard for
background and aerial output, then add raw-half finite coverage for Sun-aligned
Globe/Planar background at scale `10` and `64` and aerial composition at scale
`64`. The fix must not add a display curve, hidden Sun intensity, LUT change,
public API, framebuffer, upstream file, or runtime resource churn. A2 remains
active and uncommitted; owner gate, checkpoint, push, and A3 remain blocked until
the corrected retained tree passes independent Architecture re-review.

### A2R2 RGBA16F storage correction record — 2026-08-15

- `SceneGISBrunetonAtmosphere.glsl` now defines the shared
  `SCENEGIS_HDR_MAX=65504.0` binary16 representation ceiling and a final
  scene-linear RGB storage guard compiled by both Globe and Planar programs.
  Background first composes physical sky/Sun/ground radiance and applies
  `radianceScale`; aerial first composes
  `inputColor * transmittance + radiance * radianceScale`. Only the resulting
  RGB is guarded before RGBA16F storage, so input color, transmittance, and the
  physical terms retain their accepted linear semantics below the ceiling.
- New raw RGBA16F fixtures aim the center background ray exactly at the live Sun
  in Globe and Planar. At both scale `10` and `64`, every decoded RGB channel is
  finite and within the signed binary16 range, and the maximum channel equals
  `65504`, proving the overflowing Sun path actually exercises the guard. The
  existing aerial raw-half fixture now also validates final scale-`64`
  composition while retaining scale `0/1/2` linearity and transmittance evidence.
- Focused controller/pipeline Specs pass `28/28`; A1 pipeline and reference frame
  pass `7/7` and `4/4`; exact `Scene/Scene` aggregate passes `427/427`. `build`,
  `build-release`, `build-ts`, `build-docs`,
  `tsc`, and the installed-package verifier pass; the verifier continues to
  prove `19/19` source/generated GLSL delivery and exact assets. The initial
  pre-regeneration test attempt is not qualification evidence: it used a stale
  generated shared shader module, exposed the build-entry dependency, and was
  superseded by the official build plus passing reruns.
- No LUT, public API, texture, FBO, program, render-loop, dependency, or upstream
  path changed. Globe/Planar `--verify-only`, changed-scope lint/format,
  `git diff --check`, exact upstream-file checks, and the official audit are the
  final review-ready boundary. Owner gate, checkpoint, push, and A3 remain
  blocked pending independent Architecture approval.

### A2R2 RGBA16F correction Architecture acceptance — 2026-08-15

Architecture independently confirmed that the shared storage guard executes only
after the accepted background and aerial compositions, is compiled for both
worlds, and preserves low-value linearity, alpha, clear-depth identity, and the
existing resource contract. The two live-Sun raw-half fixtures align the camera
ray with the actual world Sun and hit exactly `65504` at scale `10` and `64`, so
the evidence exercises the formerly overflowing physical path.

Independent focused replay passed controller `28/28` plus A1 pipeline `7/7`.
`git diff --check`, exact empty `Scene.js` / upstream-manifest diff, and the
official audit also passed with current-delivery upstream-owned `0` and generated
`0`. Execution's final reference-frame, Scene aggregate, build/type/docs,
installed-package, LUT, lint, and local Chromium evidence remains accepted for
the unchanged boundaries.

No Architecture blocker remains. A2R2 is `approved-for-owner-gate`; A2 stays
active, uncommitted, and unpushed at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47`. The third project-owner visual gate
is now authorized, while checkpoint, push, and A3 remain blocked until that gate
passes.

### A2R3 amendment — separate background/aerial calibration — 2026-08-15

The third project-owner visual gate failed because the default aerial pass covers
the surface with atmosphere color. Architecture reproduced the actual page and
isolated the failure to aerial composition: background-only preserves the
dark-green surfaces and yellow box, while aerial-only at scale `10` turns both
worlds nearly uniform blue and bleaches the box. Ground/day aerial mean RGB delta
per changed pixel is approximately `135.4` for Globe and `199.0` for Planar. At
scale `1` those values fall to approximately `3.7/24.7` and surface color returns,
but the sky becomes the previously rejected weak target.

ADR-0044 therefore replaces the uncheckpointed public `radianceScale` with
independent warm `backgroundRadianceScale=10` and `aerialRadianceScale=1`.
Background and aerial retain their accepted composition, transport, log-depth,
Sun, and RGBA16F guard semantics and consume only their own calibration. No alias,
hidden mix, LUT change, resource, framebuffer, upstream file, commit, or A3 work
is authorized.

The direct page must expose both controls and add a two-sided ground/day quality
gate: nonidentity remains required, while full-frame mean changed-pixel RGB delta
and a lower-center ground ROI must both remain nonzero and at most `32` for both
worlds. Air/high retain distance-haze freedom. Public/package removal of the old
name, cross-pass independence, raw-half fixtures, final screenshots, and the
existing regression matrix are required before A2R3 returns for review.

A2 remains active, uncommitted, and unpushed at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47`. The previous
`approved-for-owner-gate` result is superseded; owner gate, checkpoint, push, and
A3 remain blocked.

### A2R3 implementation and validation record — 2026-08-15

- The uncheckpointed public `radianceScale` is removed without an alias.
  `backgroundRadianceScale` is a constructor option and writable property with
  default `10.0`; `aerialRadianceScale` has the same warm contract with default
  `1.0`. Both validate finite `[0,64]`, update only their uniform source, and
  request render without fetch, compile, generation, resource, or lifecycle
  churn. Engine/root runtime, declarations, and API docs prove both names and
  explicitly reject the old public spelling.
- Background composes physical sky/Sun/ground radiance, multiplies only by
  `backgroundRadianceScale`, then applies the accepted RGBA16F guard. Aerial
  composes `inputColor * transmittance + radiance * aerialRadianceScale`, then
  applies the same guard. Shader-contract and raw-half pixels prove each pass is
  exactly invariant to the other scale. Sun scale `10/64` storage evidence uses
  the background scale; aerial scale `0/1/2` linearity, transmittance invariance,
  alpha, and scale-`64` finite evidence use the aerial scale.
- `Test/高级环境.html` exposes two independent controls and reports L1, maximum
  RGB delta, changed pixels, `meanChangedDelta`, and a lower-center framebuffer
  ground ROI that excludes sky and corner branding. Default ground/day aerial
  results are Globe `L1=7,083,736`, `max=122`, changed `415,930`, mean `17.03`,
  ground ROI mean `8.51`; Planar `L1=9,655,013`, `max=327`, changed `448,502`,
  mean `21.53`, ground ROI mean `5.39`. Both satisfy nonidentity and
  `0 < mean <= 32`. Background/combined remain visible with maxima `680/680`
  and `608/608` respectively.
- Final local screenshots were captured separately for background-only,
  aerial-only, and combined as untracked agent evidence
  (`a2r3-background-only.png`, `a2r3-aerial-only.png`, and
  `a2r3-combined.png`). They show retained dark-green ground and the Planar
  comparison box at default calibration. Page warning/error output is empty.
- Focused controller Specs pass `28/28`; A1 pipeline and reference frame pass
  `7/7` and `4/4`; exact `Scene/Scene` aggregate passes `427/427`. `build`,
  `build-release`, `build-ts`, `build-docs`, `tsc`, and the installed-package
  verifier pass. The verifier preserves `19/19` shader source/generated modules,
  exact dual LUT delivery, ESM/CJS, types/docs, and private hiding.
- LUT transport/assets/hashes, program/resource/FBO/texture/render-loop budgets,
  log-depth, Sun formula, storage guard, `Scene.js`, SGP-0008, and the upstream
  manifest remain unchanged. No full suite was run. Owner gate, checkpoint,
  commit, push, and A3 remain blocked pending independent Architecture review.

### A2R3 Architecture re-review — changes requested — 2026-08-15

Architecture independently inspected the public controller, renderer uniform
sources, both final fragment shaders, cross-pass raw-half fixtures, direct-page
framebuffer diagnostic and lower-center ROI coordinates, package verifier, and
all three final screenshots. The separate `10/1` calibration is accepted: the
background remains visible, aerial perspective remains nonidentity, and the
ground plus Planar comparison box are no longer covered by a uniform atmosphere
color. No code, calibration, shader, pixel, resource, package, upstream, or
visual blocker remains.

Independent replay passed the focused real-Context filter `35/35` (controller
`28` plus A1 pipeline `7`), installed-package delivery verification,
`git diff --check`, exact empty `Scene.js` / upstream-manifest diff, and the
official audit with current-delivery upstream-owned `0` and generated `0`.

One delivery blocker remains: changed-scope ESLint reports
`Test/高级环境.html:628:13 error Unexpected string concatenation
prefer-template`. This contradicts the execution handoff's ESLint-passed claim.
Execution must replace that diagnostic concatenation with one template literal,
rerun exact changed-scope ESLint plus `git diff --check`, update the review
evidence, and return the retained tree. No product, shader, diagnostic metric,
asset, API, or scope change is authorized. A2 stays `changes-requested`; owner
gate, checkpoint, push, and A3 remain blocked.

### A2R3 lint correction formatting re-review — changes requested — 2026-08-15

Execution's template-literal correction clears the exact changed-scope ESLint
and `git diff --check`, and the behavioral expression is accepted. Architecture's
final `npx prettier --check --ignore-path .gitignore Test/高级环境.html ...`
nevertheless reports `Test/高级环境.html` as unformatted. The changed line is
visibly under-indented relative to the surrounding function body. Execution must
run Prettier on that exact HTML, then rerun HTML Prettier check, exact
changed-scope ESLint, and `git diff --check`. No other file or behavior change is
authorized. A2R3 remains `changes-requested`; owner gate and A3 remain blocked.

### A2R3 delivery lint correction — execution-fixed — 2026-08-15

Execution replaced only the diagnostic output's string concatenation at
`Test/高级环境.html:628` with one equivalent template literal. Exact
changed-scope ESLint, including the direct Test page, and `git diff --check`
both pass. No product code, shader, calibration, metric, asset, API, resource,
or scope changed. The retained uncommitted tree is returned `review-ready` at
exact HEAD `9462cd963fe3a682dc7140d6cabb980405061c47`; owner gate, checkpoint,
commit, push, and A3 remain blocked.

### A2R3 final delivery formatting correction — execution-fixed — 2026-08-15

Execution ran Prettier with the Architecture-specified `.gitignore` ignore path
on `Test/高级环境.html` only, correcting the diagnostic assignment's formatting
without changing behavior. The exact HTML Prettier check, the prior exact
changed-scope ESLint, and `git diff --check` all pass. No other implementation
or scope changed. The retained tree is again `review-ready`; owner gate,
checkpoint, commit, push, and A3 remain blocked.

### A2R3 final Architecture conclusion — approved for owner gate — 2026-08-15

Architecture independently reran the exact HTML Prettier check, the same
changed-scope ESLint that originally found the delivery defect,
`git diff --check`, and the exact empty `Scene.js` / upstream-manifest diff. All
pass after the formatting-only correction. The corrected assignment remains one
behavior-equivalent template literal inside `diagnoseController`; no accepted
runtime, shader, calibration, diagnostic metric, asset, API, package, resource,
or upstream behavior changed.

Together with the already accepted controller/shader review, focused real-Context
`35/35`, installed-package verifier, official upstream/generated audit, exact
framebuffer statistics, and direct inspection of all three final screenshots,
no Architecture blocker remains. A2R3 is `approved-for-owner-gate`. A2 stays
active, uncommitted, and unpushed at exact HEAD
`9462cd963fe3a682dc7140d6cabb980405061c47`; checkpoint, push, and A3 remain
blocked until the project owner explicitly accepts the fourth visual gate.

### Fourth project-owner visual gate and A2 completion — 2026-08-15

The project owner explicitly accepted the corrected default ground/day result
after inspecting the live direct Test. The fourth visual gate therefore passes.
This closes the repeated weak-effect and surface-cover findings without changing
the accepted `backgroundRadianceScale=10` / `aerialRadianceScale=1` contract.

A2 has completed implementation, independent Architecture/code review,
automated/package/upstream qualification, and the required project-owner gate.
The complete retained change set in this commit forms the independent local A2
checkpoint. It is not pushed. A3 remains inactive until Architecture creates an
A3 phase plan from current source facts and records a separate planning
checkpoint.
