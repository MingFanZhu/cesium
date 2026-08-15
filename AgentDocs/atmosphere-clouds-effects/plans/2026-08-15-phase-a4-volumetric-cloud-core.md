# Phase Plan：A4 Volumetric Cloud Core

## Metadata

- Plan type: `phase`
- Status: `active`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Previous phase:
  [2026-08-15-phase-a3-exponential-height-fog.md](2026-08-15-phase-a3-exponential-height-fog.md)（`completed`）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-15`
- Updated: `2026-08-15`
- Architecture review: `confirmed`
- Implementation status: `assigned`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A3=`43ed40117104e0450bf23dc094b2ab2e602bbfa2`
- Execution base: Architecture A4 planning checkpoint（exact hash in formal assignment）
- Related decision:
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream patch: active `SGP-0008`（consume only）
- Manual visual gate: required after Architecture/code review

## Goal

在A1-A3已接受的dual-world linear-HDR pipeline内增加一个成熟、可穿行、可从高空和近空间观察的single-deck volumetric cloud core。Globe使用
spherical shell，`SceneGISPlanarWorld`使用fixed-Z slab；二者共享public quality、coverage、density、height、motion和radiance control，并使用
各自A2 atmosphere LUT进行Sun/sky lighting与cloud-to-camera optical composition。

A4只交付shape/detail/weather/noise-driven density、bounded primary/Sun raymarch、low-resolution depth-aware composition、三档quality和caller-owned
基础运动。Cloud ground shadow、Beer Shadow Map、crepuscular rays/god rays属于A5；temporal jitter/history/reprojection属于A6；bloom/lens flare
属于A7。

## Entry evidence and source facts

- A3 implementation、focused/boundary qualification、independent Architecture review与project-owner manual visual gate均已完成；独立本地checkpoint为
  `43ed40117104e0450bf23dc094b2ab2e602bbfa2`，A4 planning前working tree clean。
- A1 `Scene.js`已用active `SGP-0008`提供advanced background与resolved linear-HDR两个slot；A2/A3 private owner在第二个slot内选择linear/
  log-depth program并持有one lazy full-resolution RGBA16F aerial FBO。A4可在同一delegation内部先执行cloud command，再复用现有full-resolution
  command composite，不需要新upstream hook。
- 当前candidate generation是monolithic且failure-atomic：world-local LUT ArrayBuffer加载完成后统一创建VA、三个program、三张LUT texture并发布；
  disconnect/destroy和late generation已有exact ownership guard。A4扩展同一candidate，不建立第二Controller或Scene registry。
- 当前active capability已要求WebGL2、3D texture、half-float texture/linear、depth texture、half-float color buffer与HDR。Cesium
  `FramebufferManager`支持`colorAttachmentsLength`；A4新增exact `maximumDrawBuffers >= 2`与`maximumColorAttachments >= 2`guard。
- 当前aerial shader对resolved geometry执行A2后A3并在最后执行一次RGBA16F guard；clear depth返回已完成的background。A4必须修改clear-depth
  路径以允许cloud over background，但不得重新对background应用A2/A3。
- `three-geospatial`参考在aerial perspective之前渲染cloud radiance/transparency并提供mean/front depth，使用energy-conserving segment
  integration与transmittance-weighted mean depth。其文档明确指出mean depth在稀疏远近云重叠时有artifact，且4K无temporal路径成本显著；A4将此
  作为显式risk/stop condition，而不是宣称参考实现可直接移植。
- `yuwoniu03/cesium-clouds-atmosphere`参考使用Cesium `PostProcessStage`、runtime shader/asset fetch、raw GL BSM与PBO TAA。上述机制均不进入A4。
- 2026-08-15 source discovery先按repository rule执行codebase-memory fast index；recent
  `SceneGISEnvironmentEffects`/environment shader仍未进入图谱。调用关系、build入口和generated boundary因此使用exact-path/string fallback核验，
  该tool index gap必须保留在review中，不得把图谱空结果误报为源码不存在。

## Frozen public and behavior contract

严格实现ADR-0046的十个public option/property：`showClouds`、`cloudQuality`、`cloudCoverage`、`cloudDensity`、
`cloudBaseHeight`、`cloudThickness`、`cloudWindDirection`、`cloudWindSpeed`、`cloudTime`与`cloudRadianceScale`。Names、defaults、
单位、ranges、quality values、time authority和warm request semantics不得由Execution自行改变。

Global `enabled=false`仍是zero path；`showClouds=true`只是controller启用后的default feature flag。所有atmosphere/aerial/fog/cloud flag均false时不得
attach/fetch/allocate/execute。Cloud candidate一旦warm成功，`showClouds=false`只跳过command并保留资源；重新启用不得fetch/compile。只有quality
change可以在下一次cloud execution按新scale lazy resize FBO，且失败时保留last-good target。

Runtime只消费caller写入的`cloudTime`，不监听Clock、不读取system time、不注册timer或permanent render loop。Test可以用Test-owned RAF或显式
time seek驱动，但不得把这类机制放入engine。Wind direction在每个world的explicit tangent frame中解释；Globe极区fallback和large-time wrapping
必须deterministic。

## Asset and package contract

- 新建`packages/engine/Source/Assets/SceneGIS/Environment/CloudCore/`，只包含ADR-0046定义的四个binary与
  `PROVENANCE.json`。Binary exact dimensions/format/bytes为`shape 64^3 RGBA8 / 1,048,576`、`detail 32^3 RGBA8 / 131,072`、
  `weather 32^3 RGBA8 / 131,072`、`blue-noise 128^2 R8 / 16,384`，总计`1,327,104 bytes`。
- 在`scripts/scenegis/`增加deterministic generator/verifier及Node tests。Generator必须使用caller-specified target、atomic publication、固定seed/
  algorithm/packing/byte order，支持`--verify-only`；禁止默认写入任意临时clone或依赖wall clock/random state。
- `PROVENANCE.json`记录reference exact commits `yuwoniu03=1f38602b84ab5c3f2bc289f9e4464df3db917155`、
  `three-geospatial=b012ad06d858fc035d88aacfd73f092f93c994e4`以及Frostbite/Guerrilla公开资料，同时明确`copied binaries=0`、
  `copied source=0`。若事实改变，Execution停止并提交license discussion，不得先复制再补记录。
- Runtime通过`buildModuleUrl("Assets/SceneGIS/Environment/CloudCore/...")`使用现有recursive asset delivery；不得修改build scripts或package
  manifest。Verifier覆盖workspace、build-release、engine npm与root installed package的exact files/hashes，不能依赖ignored Build残留。
- `.glsl`只写入`packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`并由official build生成ignored `.js` modules；generated modules不得
  手工编辑或提交。

## Render design and resource ceiling

### Cloud pass

在`_SceneGISEnvironmentEffectsRenderer`内部新增one low-resolution cloud pass，不新增public renderer或Scene slot：

- 复用现有fullscreen VA；新增linear-depth与`LOG_DEPTH_READ_ONLY`两个cloud ShaderProgram，frame中只选择已发布program，不fetch/compile。
- 新增one lazy `FramebufferManager`，`colorAttachmentsLength=2`、RGBA16F。Attachment 0写premultiplied intrinsic radiance和transmittance；
  attachment 1写mean/front cloud distance、low-resolution scene distance与validity。
- 现有linear/log aerial program depth-aware upsample MRT，执行A2/A3-to-mean并合成到existing scene；仍只写现有full-resolution aerial FBO。
- Cloud ray与scene ray都必须从A2已有Perspective/Orthographic、linear/log reconstruction authority产生，march far端先与resolved geometry distance取
  minimum，再与Globe shell/Planar slab和`300 km`in-medium cap相交。
- A4 active增量上限固定为program `+2`、lazy FBO `+1` with two color textures、static texture `+4`、internal command `+1`；VA、A2 LUT、
  background/aerial command和full-resolution aerial FBO复用。没有raw GL、PBO、history、external request、listener、timer或new upstream hunk。

### Raymarch and lighting

- 实现tileable weather/shape/detail density与height profile；coarse zero-density skip后才采detail。CPU reference与GLSL必须共享参数映射和finite guard。
- Primary loop compile maximum `64`，Sun loop maximum `4`，multiple-scattering octave使用固定小上界；按quality uniform提前终止。Quality exact budget为
  `low=.375/32/2/detail-off`、`medium=.5/48/3/detail-on`、`high=.75/64/4/detail-on`。
- 使用Beer-Lambert与source-backed energy-conserving analytic segment integration，accumulated transmittance `<=0.01`或segment结束时退出。
- Sun/sky lighting使用active world自己的A2 transmittance/irradiance、fixed dual-lobe HG phase、bounded multiple-scattering approximation和sky ambient。
  只在最终intrinsic cloud radiance应用`cloudRadianceScale`；不得消费A2 background/aerial scale或A3 fog scale作为隐藏云强度。
- Static blue-noise只依赖pixel与fixed asset；同camera/time/quality重复输出稳定。A4不使用frame number或jitter sequence。

### Full-resolution composition

现有A2/A3 scene result是behind term。Upsample后用cloud transmittance与mean distance按ADR-0046公式合成：cloud自身先用A2-to-mean，再用
A3-to-mean；behind乘cloud transmittance后加premultiplied cloud optical term。Clear-depth behind已经是background，不得重复A2/A3。

`showClouds=false`必须与checkpointed A3 output raw-half exact equal；`showAerialPerspective=false`与`showHeightFog=false`分别只关闭cloud对应的
to-mean介质，不关闭intrinsic cloud lighting。Input alpha不变，final RGB只执行一次storage guard。Depth-aware upsample必须防止低分辨率cloud越过
full-resolution geometry edge；front/scene distance必须进入选择规则与focused fixture，不能仅写buffer不消费。

## Implementation steps

1. 先增加public defaults/range/quality/time/warm-state Specs与declarations/docs skeleton；锁定disabled-zero、native conflict、A3 identity和package
   public surface。
2. 实现deterministic CloudCore generator、full-size separate-target tests、provenance与四个package-local assets；先通过hash/packing/tileability/
   tamper/verify，再接GPU upload。
3. 扩展capability/candidate owner，创建四个texture、linear/log cloud programs和MRT candidate；完成create/publish/late failure/destroy exact tests。
4. 实现Globe shell、Planar slab、Perspective/Orthographic、linear/log与resolved-depth clipping CPU/shader fixtures。
5. 实现density、bounded raymarch、Sun/sky lighting、energy integration、mean/front depth与三档quality；完成raw MRT finite/resource/loop-budget evidence。
6. 扩展existing aerial shaders执行depth-aware upsample与A2/A3-aware cloud composition；完成clear depth、near/far edge、feature/scale isolation、alpha和
   RGBA16F fixtures。
7. 扩展`Test/高级环境.html`的cloud-only/combined diagnostics、十个controls、quality/time、ground/inside/above/space、near/far与两frustum；执行
   local no-network smoke和manual artifacts。
8. 完成A1-A3 regression、build/types/docs/installed-package、asset verify、lint/format/audit，把实际resource bytes、deviation、known mean-depth risk与
   unrun boundary写入open review后停止交给Architecture。

## Required automated validation

- Focused real-Context Controller/private renderer Specs：public/warm state、MRT/program/texture/FBO exact counts、linear/log selection、resize/quality swap、
  candidate and destroy failure atomicity、late generation/error/retry、disabled/all-flags-zero、A3 raw-half identity。
- Generator Node tests：independent target full regeneration and byte compare、dimensions/channels/tileability/distribution、hash、tamper/rollback、
  `--verify-only`；测试不得只验证file existence或nonzero bytes。
- CPU/shader/raw-half fixtures：dual-world intersection、inside/above/space、Perspective/Orthographic、resolved geometry clip、density/profile、analytic
  integration、mean/front distance、Sun/night、quality loop ceiling、deterministic dither、depth-aware upsample edge与composition formula。
- A1 render-slot/reference-frame、A2 atmosphere/aerial与A3 fog focused regression；使用exact Scene/Scene aggregate filter，禁止broad substring suite冒充
  qualification。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`；installed npm/root verifier检查runtime/types/docs、全部GLSL/generated modules、
  exact cloud assets/provenance、ESM/CJS/private hiding。
- BrunetonEarth/PlanarEarth asset verifier与CloudCore `--verify-only`；local Chromium只请求local target，page errors/external requests均为零。
- Changed-scope ESLint、Prettier、Markdownlint、`git diff --check`；exact `Scene.js`和`.scenegis/upstream-patches.json` diff empty；official audit
  current-delivery upstream-owned=`0`、generated=`0`。

Full Spec suite不是默认要求；focused + A1-A3 + exact Scene aggregate是最小充分边界，review必须明确记录未运行总量。

## Manual visual gate

Architecture review通过后才能请求project owner。Direct Test至少同时显示Globe/Planar并提供：

- day/sunset/night与ground/inside/above/120 km space presets；Perspective/Orthographic切换；
- cloud-only与combined开关、三档quality、全部十个public controls以及explicit `cloudTime` seek；
- sky delta ROI的changed fraction/max/standard deviation，known near/far geometry delta，lower-center near-ground ROI，mean/front depth validity与render error；
- default day/ground cloud delta满足changed fraction `[0.08,0.85]`、max `>=16`、standard deviation `>=2`，同时near geometry max `<=1`、
  far-behind-cloud max `>=8`，避免identity、uniform slab或前景覆盖；
- fixed camera/time repeated output稳定，time变化有运动；sunset暖色shift、night比day暗且finite；space looking-down intersecting cloud可见、miss ray
  identity；
- successful-frame计数、finite frusta、`Scene.renderError=0`、visible Cesium error panel=`0`、browser warning/error=`0`和external request=`0`。

数值只构成regression floor。项目负责人的视觉判断优先；若云层显得平、噪、闪烁、出现edge halo/错误层序、吞没地表或inside/space视角不可信，gate
失败且A4保持active rework。

## Exit criteria

- ADR-0046 public、asset、dual-world geometry、raymarch、composition、resource与time contract都有source/Specs/package evidence。
- Three quality tiers的exact steps、FBO dimensions、persistent/static bytes和command ceiling已记录且无隐藏variant/history。
- Architecture/code review无blocking finding，所有finding在同一A4 review中关闭。
- Project owner manual visual gate明确通过。
- Architecture Agent把A4 code、Specs、assets、ADR与AgentDocs形成独立本地checkpoint；不push。
- 只有上述全部完成后才能source-discover并规划A5 cloud shadows and crepuscular rays。

## Stop conditions and handoff

触发ADR-0046任一停止条件时立即停止，建立discussion并发送`blocker`；不得扩大到A5/A6。正常完成时创建同一稳定A4 review，回写实际偏差和全部验证，
保持working tree uncommitted/unpushed，不请求owner gate、不激活A5，仅发送`review_ready`给Architecture Agent。
