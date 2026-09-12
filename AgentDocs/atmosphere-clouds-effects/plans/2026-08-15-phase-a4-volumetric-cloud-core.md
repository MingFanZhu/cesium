# Phase Plan：A4 Volumetric Cloud Core

## Metadata

- Plan type: `phase`
- Status: `superseded by A4-G globe-first plan`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Previous phase:
  [2026-08-15-phase-a3-exponential-height-fog.md](2026-08-15-phase-a3-exponential-height-fog.md)（`completed`）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-15`
- Updated: `2026-08-27`
- Architecture review: `owner visual No-Go; A4-AR-028 open`
- Implementation status: `frozen retained dual-world candidate`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A3=`43ed40117104e0450bf23dc094b2ab2e602bbfa2`
- Execution base: Architecture A4 planning checkpoint（exact hash in formal assignment）
- Related decision:
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md)
- Upstream patch: active `SGP-0008`（consume only）
- Manual visual gate: `rejected by project owner`
- Successor phase:
  [2026-08-27-phase-a4g-globe-integrated-cloud-core.md](2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Open review:
  [2026-08-15-a4-volumetric-cloud-core.md](../reviews/2026-08-15-a4-volumetric-cloud-core.md)

## Goal

在A1-A3已接受的dual-world linear-HDR pipeline内增加成熟、可穿行、可从高空和近空间观察的volumetric cloud core。Globe使用spherical
shell，`SceneGISPlanarWorld`使用fixed-Z slab；二者共享public quality、coverage、density、height、motion、radiance与typed morphology preset，
并把各自A2 atmosphere LUT转换为同一cloud radiometric contract后执行Sun/sky lighting与cloud-to-camera optical composition。

A4R交付reference-quality shape/detail/weather/turbulence/STBN-driven density、内部最多四层的四种public preset、bounded primary/Sun raymarch、
depth/front-aware spatial resolve、最小cloud-only temporal upscaling/history、三档quality和caller-owned motion。Cloud ground shadow、Beer
Shadow Map、crepuscular rays/god rays仍属于A5；A6只负责后续stack-wide temporal/performance stabilization；bloom/lens flare属于A7。

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

## Superseded pre-A4R public and behavior contract

> Historical snapshot only. The following pre-A4R contract sections through `Stop conditions and handoff` are superseded by ADR-0046's accepted A4R revision and
> the current A4R audit/closure sections below. They are retained for review history and are not current delivery authority.

严格实现ADR-0046的十个public option/property：`showClouds`、`cloudQuality`、`cloudCoverage`、`cloudDensity`、
`cloudBaseHeight`、`cloudThickness`、`cloudWindDirection`、`cloudWindSpeed`、`cloudTime`与`cloudRadianceScale`。Names、defaults、
单位、ranges、quality values、time authority和warm request semantics不得由Execution自行改变。

Global `enabled=false`仍是zero path；`showClouds=true`只是controller启用后的default feature flag。所有atmosphere/aerial/fog/cloud flag均false时不得
attach/fetch/allocate/execute。Cloud candidate一旦warm成功，`showClouds=false`只跳过command并保留资源；重新启用不得fetch/compile。只有quality
change可以在下一次cloud execution按新scale lazy resize FBO，且失败时保留last-good target。

Runtime只消费caller写入的`cloudTime`，不监听Clock、不读取system time、不注册timer或permanent render loop。Test可以用Test-owned RAF或显式
time seek驱动，但不得把这类机制放入engine。Wind direction在每个world的explicit tangent frame中解释；Globe极区fallback和large-time wrapping
必须deterministic。

## Superseded pre-A4R asset and package contract

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

## Superseded pre-A4R render design and resource ceiling

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

## Superseded pre-A4R implementation steps

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

## Superseded pre-A4R automated validation

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

## Superseded pre-A4R manual visual gate

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

## Superseded pre-A4R exit criteria

- ADR-0046 public、asset、dual-world geometry、raymarch、composition、resource与time contract都有source/Specs/package evidence。
- Three quality tiers的exact steps、FBO dimensions、persistent/static bytes和command ceiling已记录且无隐藏variant/history。
- Architecture/code review无blocking finding，所有finding在同一A4 review中关闭。
- Project owner manual visual gate明确通过。
- Architecture Agent把A4 code、Specs、assets、ADR与AgentDocs形成独立本地checkpoint；不push。
- 只有上述全部完成后才能source-discover并规划A5 cloud shadows and crepuscular rays。

## Superseded pre-A4R stop conditions and handoff

触发ADR-0046任一停止条件时立即停止，建立discussion并发送`blocker`；不得扩大到A5/A6。正常完成时创建同一稳定A4 review，回写实际偏差和全部验证，
保持working tree uncommitted/unpushed，不请求owner gate、不激活A5，仅发送`review_ready`给Architecture Agent。

## Implementation writeback

- A4 private runtime、CloudCore assets/generator、focused Specs、installed verifier与dual-world Test均已实现；`A4-AR-002`已由Architecture关闭，
  product visual correction已被Architecture接受。`A4-AR-006`的structure evidence现通过geometry-free capture、clouds-off exact identity与
  target/ground visibility invariance关闭。该版本随后在project-owner live visual gate因低质量、缺少多云型及dual-world color/opacity差异而失败；
  `approved-for-owner-gate`已撤销，Status保持`active/blocked`等待ADR-0046 re-scope。
- Exact implementation base/retained HEAD是`ad9898261831e1314fe98307b7b0303fce3ba08f`。完整实现、hash、resource bytes、validation、
  deviations和risks记录在[A4 review](../reviews/2026-08-15-a4-volumetric-cloud-core.md)。
- Final private density使用Perlin-Worley low-frequency FBM、以`1 - cloudCoverage²`为中心的bounded macro threshold、weather
  type/density、type-shaped vertical profile与detail erosion；shape/detail/weather scales为`12/2/60 km`。Tracked fixed-Z slice的default
  active occupancy为`70/1024 = 6.8359375%`，`cloudCoverage=0`保持exact identity。Resolved-depth upsample使用`250 m`conservative
  front margin。上述修正不改变frozen public/asset/resource contract。
- 当前delivery upstream-owned=`0`、generated=`0`；`Scene.js`、active `SGP-0008` ranges与upstream manifest均未修改。
- 去污染structure metrics为Globe active/gap/bodies/largest=`0.143351/0.856649/8/0.075033`、Planar=
  `0.061590/0.938410/5/0.031020`；clouds-off为zero active/body/radiance与全像素identity transmittance，反转ordinary geometry/ground
  visibility不改变histogram或component counts。
- Full Spec suite未运行。首轮已通过的exact `Scene/Scene` `127/127`与release/types/docs边界未因本轮private GLSL/Test/Spec/generator
  correction扩大而重复；本轮最小充分边界为focused controller `44/44`、A1 pipeline `7/7`（总计`51/51`）、generator `9/9`、
  `npm run build`、installed package、asset verifier、strict `24/24` local no-network Chromium、六张day/sunset/night cloud-only/combined
  artifacts与changed-scope lint/format/diff/audit。

## Project-owner gate failure and re-scope — 2026-08-26

Project owner拒绝live画面：云层不达到reference质量、缺少多种形态且Globe/Planar颜色差异过大。Architecture复现cloud-only
medium/high后撤销`approved-for-owner-gate`：Planar高亮云墙和Globe暗灰团块均在A2/A3关闭时保留，high也没有消除grain/block。

Root cause与repair authority记录在
[A4 cloud structure discussion](../discussions/2026-08-15-a4-cloud-structure-calibration.md)的`A4-AR-007..009`：

- 现有3D textures存在，但shape/weather/dither content与nearest spatial resolve低于reference asset + turbulence + STBN + temporal path；
- single-deck frozen contract不能表达multiple cloud morphologies；
- Planar long slab path与两个world各自LUT直接lighting没有matched optical/radiometric calibration。

该gate-failure时点的临时block已由下述formal assignment取代；A5 shadow/god rays、checkpoint、commit/push与A5 activation仍未获授权。

## A4R formal assignment — 2026-08-26

Project owner已批准重新定界，ADR-0046的`A4R accepted revision`现为implementation authority。上述临时block解除，Execution可在retained
uncommitted A4 tree上继续，但必须依次关闭以下三个finding，不能先请求visual gate：

1. `A4-AR-007`：先完成逐文件license/provenance与asset/format/resource预算，随后替换或重生成reference-quality
   shape/detail/weather/turbulence/STBN；实现depth/front-aware bilateral resolve与最小cloud-only temporal history/reset。若reference binary
   authority不清晰，必须停止该asset import并改用SceneGIS-owned generator，不得推断许可。
2. `A4-AR-008`：新增warm `cloudPreset` public contract，固定`cumulus/stratus/cirrus/mixed`，内部最多四个immutable layer；现有controls只作为
   global modifiers。Direct Test必须一键切换四个preset并在两世界保持同一morphology family。
3. `A4-AR-009`：先建立matched local-frame raw probe，再修正Planar far cloud domain/horizon transition和两个A2 LUT到shared cloud radiometric
   units的转换。禁止world-specific opacity/RGB multiplier；修正后以ADR-0046的`2%/10%/0.02`parity bounds关闭。

Execution在首次product edit前先把source/asset audit、exact texture formats/dimensions、history attachment bytes、new program/command ceiling与Planar
bounded formula回写本plan。允许的A4R resource ceiling是cloud static textures总数`<=6`，相对当前A4最多`+2`resolve programs、`+1`resolve
command与two ping-pong history framebuffer managers（每个最多two RGBA16F attachments）；其余A4 lifecycle和A2/A3 composition contract不变。

A4R不得实现ground shadow、Beer Shadow Map、god rays、bloom/lens flare，不得增加upstream seam、raw GL/PBO、listener/timer/permanent loop，也不得
checkpoint、commit/push或激活A5。完成implementation与最小充分qualification后更新同一A4 review并发送`review_ready`；Architecture独立复审通过后
才重新请求project-owner live visual gate。

## A4R pre-implementation asset, resource and optical audit — 2026-08-26

本节在A4R首次product edit前冻结。Codebase-memory再次查询recent EnvironmentEffects/A4 symbols仍为空，以下事实由exact source/build path核对；
该index gap继续作为tool limitation记录。

### Per-file authority and license audit

A4R不导入任何reference binary、GLSL、JavaScript或generator source。所有payload由
`scripts/scenegis/generate-cloud-core-assets.mjs`的SceneGIS-owned deterministic algorithms从fixed seeds生成，适用repository
Apache-2.0 license；installed engine/root package继续携带repository完整license。`PROVENANCE.json`记录算法、seed、format、channel、bytes、hash和
文献，不把论文思想误记为copied source，也不需要第三方binary license。逐文件authority冻结如下：

| File              | Format / dimensions           |       Bytes | Channel semantics                                                                        | Authority / attribution                                                                                  |
| ----------------- | ----------------------------- | ----------: | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `shape.bin`       | RGBA8 `128x128x128` Texture3D | `8,388,608` | R periodic gradient-Worley base；G/B/A progressively coarser periodic Worley FBM         | SceneGIS generator；Perlin/Worley procedural-noise literature，copied source/binary=`0`                  |
| `detail.bin`      | RGBA8 `64x64x64` Texture3D    | `1,048,576` | RGB high-frequency periodic erosion octaves；A ridge/edge modulation                     | SceneGIS generator；Guerrilla volumetric-cloud detail-erosion model仅作算法依据                          |
| `weather.bin`     | RGBA8 `256x256` Texture2D     |   `262,144` | RGBA分别为四个independent periodic macro weather fields，供preset layer channel选择      | SceneGIS generator；无authored/reference binary                                                          |
| `turbulence.bin`  | RGBA8 `64x64x64` Texture3D    | `1,048,576` | RGB为periodic signed curl vector映射到`[0,255]`；A为curl magnitude                       | SceneGIS generator；procedural curl-noise literature，copied source/binary=`0`                           |
| `stbn.bin`        | R8 `128x128x64` Texture3D     | `1,048,576` | 每个XY slice为空间blue-noise rank，Z为同pixel temporal blue-noise sequence               | SceneGIS generator；Wolfe et al. 2021 scalar STBN energy/spectrum criteria，未复制NVIDIA SDK code/assets |
| `PROVENANCE.json` | UTF-8 canonical JSON          |    variable | generator/version/seeds、per-file fields、spectral metrics、SHA-256与reference citations | SceneGIS metadata；不含本机路径                                                                          |

Static cloud texture总数=`5`，payload总计`11,796,480 bytes`（`11.25 MiB`）。Runtime全部以`Uint8Array`直接上传，不作Float32 expansion；上传后
persistent CPU payload=`0`。Generator必须保留explicit target、candidate/backup atomic publish、rollback injection、deep verify、separate-target full
regeneration byte identity，并新增slice/histogram、periodicity、spatial/temporal spectrum和medium/high band-separation tests。

### Program, command and framebuffer ceiling

- Current A4 programs=`5`（background one、aerial linear/log、cloud linear/log）；A4R新增cloud resolve linear/log=`2`，active total=`7`。
- Current commands=`3`（background/aerial/cloud）；A4R新增one resolve command，active total=`4`。Fullscreen VA仍=`1`。
- Existing cloud MRT仍是one low-resolution manager/two RGBA16F attachments。A4R新增two ping-pong full-resolution history managers，每个exactly
  two RGBA16F attachments：attachment 0为resolved premultiplied radiance/transmittance，attachment 1为mean/front/scene-distance/validity。
- 每个history manager占`16 * width * height` bytes；ping-pong合计`32 * width * height`。1920×1080=`66,355,200 bytes`
  （`63.28125 MiB`），3840×2160=`265,420,800 bytes`（`253.125 MiB`）。Medium 1080p cloud MRT=`8,294,400 bytes`；
  static + MRT + history=`86,446,080 bytes`（`82.4414 MiB`）。Medium 4K对应`310,394,880 bytes`（`296.0156 MiB`）。
- History与cloud MRT均lazy；default disabled/all effects false保持zero fetch/allocation/command。Candidate allocation失败保留last-good current/history，
  partial manager/program/texture必须exactly once销毁。

History只在successful cloud resolve后推进。Invalidation key包含camera position/direction/up的任何变化、projection/world/reference-frame identity、
viewport、quality、preset、global support（base/thickness）、asset generation publication、enable/showClouds transition、connect/disconnect、retry/context
replacement/destroy，以及不连续`cloudTime` seek。连续时间定义为与上一successful frame差值finite且`abs(delta) <= 1.0 seconds`；其他seek invalid。
Invalid first frame设置history weight=`0`，输出必须与同帧bilateral spatial-only byte-equivalent；第二个valid frame才允许EMA。A4R不建立永久render loop。

### Preset descriptor contract

Public `cloudPreset`只映射到以下private immutable descriptors；descriptor units与values在Globe/Planar完全相同。Global base/thickness/coverage/density/
wind/time在descriptor之后统一作用：

| Preset / layer       | Base offset | Thickness scale | Density scale | Coverage offset | Profile                      | Weather channel | Shape/detail scale | Motion          |
| -------------------- | ----------: | --------------: | ------------: | --------------: | ---------------------------- | --------------: | ------------------ | --------------- |
| `cumulus` convective |       `0 m` |           `1.0` |         `1.0` |           `0.0` | rising `0.02/0.16/0.62/0.98` |               R | `18/2 km`          | `1.0x`, `0°`    |
| `stratus` stratiform |     `500 m` |          `0.40` |        `0.42` |         `+0.12` | broad `0.02/0.10/0.86/0.98`  |               G | `32/4 km`          | `0.65x`, `+12°` |
| `cirrus` high thin   |    `6500 m` |          `0.32` |        `0.10` |         `-0.08` | thin `0.04/0.20/0.78/0.96`   |               B | `48/1.2 km`        | `1.35x`, `-18°` |
| `mixed` layer 0      |       `0 m` |          `0.85` |        `0.72` |         `-0.03` | cumulus                      |               R | `18/2 km`          | `1.0x`, `0°`    |
| `mixed` layer 1      |    `4200 m` |          `0.34` |        `0.28` |         `+0.04` | stratus                      |               G | `32/4 km`          | `0.72x`, `+12°` |
| `mixed` layer 2      |    `7800 m` |          `0.24` |        `0.08` |         `-0.10` | cirrus                       |               B | `48/1.2 km`        | `1.4x`, `-18°`  |

每个single preset active layers=`1`，`mixed=3`，小于上限`4`；shader以compile-time four-layer loop解释descriptor，不暴露mutable public array。

### Finite meteorological visibility and energy rule

Guerrilla/Frostbite-style finite weather domain与far-cloud transition在两world采用同一view/Sun distance rule，而不是Planar-only multiplier。对从ray
support entry量起的in-medium distance `d`：

```text
visibilityWeight(d) = 1 - smoothstep(60000 m, 100000 m, d)
effectiveDensity = physicalPresetDensity * visibilityWeight(d)
segmentEnd = min(geometricSupportEnd, supportEntry + 100000 m, hardSafety300000 m)
```

Weather field的horizontal period=`240 km`，因此默认visible domain内不会完整重复同一macro tile。相同weight同时乘view-ray extinction/scattering
density；Sun optical-depth ray也从其sample origin使用同一`60–100 km`rule。这样single-scattering albedo与source color不变，Beer-Lambert analytic
step仍使用同一个effective extinction，fade只把远域matter连续降到zero，不凭空添加radiance/opacity；`300 km`仅保留异常输入hard safety cap。

### Shared cloud radiometric unit

World adapter只负责取得A2 solar transmittance与sky irradiance。进入cloud core前统一转换为dimensionless scene-linear incident unit：

```text
sunIncident = max(atmosphereSunRadiance, 0) / SCENEGIS_SOLAR_IRRADIANCE
skyIncident = max(atmosphereSkyIrradiance, 0) / SCENEGIS_SOLAR_IRRADIANCE
```

division逐channel使用fixed positive solar irradiance与epsilon guard；随后shared phase、Sun optical depth、multiple scattering、cloud albedo和
`cloudRadianceScale`只执行一次。禁止world-specific RGB/opacity/radiance multiplier。Matched local-frame probes以caller-fixed normalized Sun/sky
incident绕过world adapter来验证material core；adapter probes再单独报告A2 conversion。目标bounds为density integral/T相对差`<=2%`、intrinsic
luminance差`<=10%`、CIE xy distance`<=0.02`。

Planar A2 `irradiance.bin`包含direct与diffuse total irradiance，而Globe Bruneton `GetIrradiance`只返回indirect sky irradiance。A4R adapter因此必须先以
`solarIrradiance * max(sunZenithCosine, 0) * sunTransmittance`从Planar total中扣除direct分量，再执行上述solar normalization；否则Planar direct
会同时进入phase Sun term与ambient term，形成可测的double counting。该转换不添加world-specific multiplier，也不修改A2 LUT bytes。

## A4R execution blocker — 2026-08-26

Execution完成asset generator v2、five-texture runtime、bilateral + two-history resolve、四种public preset、history reset与Planar direct-irradiance
subtraction，并把试验期间偏离的`10–40 km/80 km`参数恢复为本plan冻结的`60–100 km/240 km`。同时修正density shaping顺序：detail erosion先作用于
normalized morphology，preset density scale最后只缩放physical density，避免低密度preset被erosion阈值直接抹零。

恢复exact descriptor/default后，strict local Chromium `cloudGround/day/Perspective/cloud-only`仍触发ADR visual/dual-world stop condition：Globe
`changedPixels=7115`、`skyFraction=0.000`、`groundROImean=0.00`；Planar `changedPixels=404837`、`skyFraction=0.745`、
`groundROImean=186.64`。两world `cloud gates FAIL`，前者无可辨sky cloud，后者覆盖ground并形成full-height wall。四preset的numeric signature虽distinct，
但不能替代visual lower bound。临时把public `cloudDensity`从frozen default `0.001`降至`0.0002`只作为诊断，原始support/opacity分布显著回落；这证明
默认descriptor scale × public density × geometric support的optical depth是剩余主因，而非asset fetch、MRT、bilateral/history publication或A2/A3
composition。

继续修复需要改变本plan已冻结的descriptor density scales、default density或finite visibility distance之一。Execution不获授权自行改动这些exact
contracts，亦不得以world-specific multiplier/Test-only calibration规避，因此在此停止并请求Architecture给出source-backed最小修订。Working tree保持
uncommitted/unpushed；A5、owner gate与checkpoint继续blocked。

## Architecture A4-AR-010 direction — 2026-08-26

Architecture不接受上述三选一前提，也不修改任何scalar。`cloudGround`中心ray约在`2.9 km`进入、`16.1 km`退出support，全部位于`60 km`
visibility fade之前；global density reduction又会同时削弱两个world。当前live pair的Globe/Planar absolute weather phase未对齐，且focused Specs缺少
actual compiled raw matched matrix，因此diagnostic不能把dual-world divergence归因于extinction default。

Execution恢复工作，但仅限A4 review `A4-AR-010`的measurement/core/weather correction：

1. 先用controlled constant/ramp assets、zero turbulence、fixed STBN、history weight `0`与identical synthetic Sun/sky textures，在真实Globe/Planar
   shader variants中逐texel比较entry/exit、density integral、`tau/T`、Sun optical depth、source RGB、front/mean depth。
2. 再对真实assets提供material-domain phase-matched pair和至少`16`个deterministic phase/origin的windowed occupancy/optical/color distribution。
3. Raw core不匹配时修geometry/coordinate/adapter；raw core匹配而weather windows分叉时，可在现有asset authority内修订generator/coverage shaping为
   deterministic CDF/rank-normalized channels及private preset `weatherExponent`/`coverageFilterWidth`。`cloudCoverage`只控制macro occupancy，不能
   乘material extinction。
4. `cloudDensity=0.001`、descriptor density scales与`60–100 km`visibility保持冻结。只有phase-matched raw证明both-world共同过密后，才再次请求
   shared scalar revision。

本direction不增加public property、resource/pass/upstream surface，也不允许Test-only opacity、world multiplier、A5/A6 scope、checkpoint、commit/push
或A5 activation。完成focused raw/generator/live closure后更新同一review并发送`review_ready`。

### Execution controlled-core result and frozen weather repair

Actual compiled dual-world cloud-pass matrix现使用constant与analytic-ramp shape/detail/weather、zero turbulence/STBN、synthetic matched Sun/sky
incident，覆盖Perspective/Orthographic与linear/log；同材质相位下density/T、intrinsic luminance、CIE xy、front/mean均通过冻结容差。Planar cloud
Sun adapter同时从A2 transmittance LUT取得normalized incident，并从A2 total irradiance扣除direct后才形成indirect sky，消除旧A3 analytic path与
double-counting。由此core parity通过，修复范围进入Architecture授权的real weather phase authority。

Generator v3对weather R/G/B/A四通道分别在periodic unique `255×255`core执行deterministic empirical-CDF mid-rank normalization，ties共享rank，
随后复制首row/column到末边维持S/T periodic。Runtime按layer使用：

```text
coverageQuantile = clamp(1 - (globalCoverage + descriptorCoverageOffset), 0, 1)
weatherShaped = pow(weatherChannel, weatherExponent)
threshold = pow(coverageQuantile, weatherExponent)
macroSupport = smoothstep(threshold - filterWidth, threshold + filterWidth, weatherShaped)
```

`globalCoverage=0`仍以显式branch产生identity；exponent只改变过渡形态，threshold使用同一变换，因此macro occupancy由coverage quantile而非
material extinction决定。Private parameters最终冻结为cumulus=`2.2/0.04`、stratus=`0.75/0.12`、cirrus=`2.0/0.035`；mixed layers分别为
`1.7/0.04`、`0.8/0.10`、`2.2/0.03`。Closure报告四通道CDF/periodicity、至少16个deterministic sliding windows、phase-matched compiled
real-asset T/tau/color/front/mean，以及coverage=0 identity、monotonic coverage与extinction isolation。

### A4-AR-010 execution closure

Controlled compiled Globe/Planar raw fixtures、phase-matched real assets与16-phase statistics全部通过冻结parity bounds；public density、descriptor
density scales与`60–100 km`visibility保持不变。Weather authority现为deterministic per-channel CDF/rank semantics加private preset
`weatherExponent`/`coverageFilterWidth`，coverage与extinction互相隔离。

Live integrated closure另修复两项由新证据暴露的实现缺陷：bilateral resolve把clear log depth错误重建为有限scene distance，以及primary/Sun march
仍使用global support而非active preset-layer union。修复后Globe/Planar都保留bounded bodies与sky gaps，四preset在两world可见，near geometry max
delta为`0`。Focused controller `51/51`、A1 pipeline `7/7`、generator `10/10`、exact asset verify、build/release/types/docs/tsc、installed package及
local no-network `24/24`状态矩阵均通过；完整证据与unrun boundary记录于A4 review。

Final handoff checks亦通过：exact Scene aggregate `450/450`、changed-scope ESLint/Prettier/Markdownlint、`git diff --check`、exact
`Scene.js`/upstream-manifest empty diff及official audit。Audit报告current-delivery upstream-owned=`0`、generated=`0`；完整repository Spec suite按phase
boundary保持unrun。

## Superseded A4-AR-011..013 execution result — 2026-08-26

本节是第四次Architecture No-Go前的历史记录，不是current delivery authority；current closure见文末2026-08-27章节。

History owner现在以full camera/frustum/A1 reference-frame identity及`cloudRadianceScale`建立key；discontinuous state exact invalidate，invalid first frame
等价spatial-only，moving-time valid frame以`0.82`累积，stationary compatible frame复用exact RGBA16F attachment以消除half-float recursive drift。
Direct Test读取raw resolved color/distance并隔离foreign FXAA/geometry authority；两次clean reload均得到fixed delta=`0`及both-world
`geometryInvariant=true`。

Initial lighting由单一`applyLightingPreset`同时驱动label、Globe clock与Planar Sun，并在startup调用。Preset private descriptors冻结各自
shape/detail scale、erosion/profile、weather response和lighting contrast；quality-aware bilateral reconstruction用high narrow kernel与medium/low broad
kernel实现可测细节分离，未改变public defaults、assets、program/pass/resource ceiling或world calibration。最终五张无遮挡four-preset artifacts及exact
metrics记录于open review。

Final minimum boundary：focused `60/60`、exact Scene aggregate `452/452`、generator `10/10`、三组asset verify、build/release/types/docs/tsc、installed
package、local no-network `24/24`、lint/format/diff及official audit全部通过；full repository Spec suite仍按phase boundary unrun。Current-delivery
upstream-owned=`0`、generated=`0`，`Scene.js`与upstream manifest exact unchanged。Implementation状态转为`review-ready`，等待Architecture独立复审；
owner gate、checkpoint、push与A5仍blocked。

## Architecture independent re-review result — 2026-08-26

Decision：`No-Go`。`A4-AR-012` startup day authority接受；`A4-AR-011`与`A4-AR-013`重新打开，新增review-record一致性finding
`A4-AR-016`。Exact symptom、root cause、required repair和closure写入open review。

关键独立证据：clean reload的`high/cloudGround/Perspective/combined`diagnostic得到Globe `bodies=1`并`cloud gates FAIL`，Planar raw
`fixed=4854`并`cloud gates FAIL`；合法`four-preset grid -> combined -> diagnostic`序列还会得到Globe
`geometryInvariant=false/fixed=16,382,341`。Live four-preset grid继续表现为cumulus地平线块团、stratus模糊暗顶、cirrus近乎不可见与mixed低层
veil，未达到owner/reference visual target。

Architecture限定下一轮修复优先级：

1. 先修stationary history的真实byte-stability/compatibility与transition-order gate；
2. 再用volume mip/explicit LOD、occupied-volume adaptive march以及与material time解耦的bounded sampling sequence提升实际信息带宽；
3. 最后统一review中旧A4与A4R互相矛盾的资源/验证摘要。

不得请求owner gate、checkpoint、commit/push或A5 activation；完成后在同一review按root cause -> repair -> closure结构交回Architecture。

## Superseded A4-AR-011/013/016 execution closure — 2026-08-27

- Stationary history不再filter/re-quantizeprevious RGBA16F；直接发布current spatial attachments。Moving `0.82` EMA只在validity、front、mean、
  scene-depth、transmittance与radiance全部compatible时启用。完整camera/frustum/A1 frame key保留真实变化，并以direction `1e-12`、position/scale
  `1e-4`canonicalization过滤同一frame的floating roundoff。
- Shape/detail/turbulence使用full mip chain、S/T/R repeat与trilinear mip sampler；shader按ray footprint/distance explicit LOD。Outer primary loop固定
  64 ceiling并执行coarse empty-space skip，occupied interval才执行最多四个fine samples；没有unbounded loop或permanent render request。
- Current resources：tracked cloud payload=`11,796,480` bytes，mipped GPU static=`13,294,444` bytes；active programs/commands=`7/4`，A4R
  over-A3=`+4/+2`；one low-resolution two-attachment MRT和two full-resolution two-attachment history managers。1080p low/medium/high persistent
  increment约`80.41/83.87/93.76 MiB`；4K medium/high公式上界约`297.45/337.00 MiB`。
- Direct Test冻结camera/time/request-render authority、await preset-grid恢复帧并同时比较raw low MRT与resolved history。Two clean loads及
  `grid -> close -> combined -> diagnostic`均为both-world `fixed=0`、`mrtFixed=0/0`、`geometryInvariant=true`、cloud gates PASS。
- Final validation：focused real-Context+A1 `61/61`、exact `Scene/Scene` `127/127`、generator `10/10`、CloudCore/PlanarEarth/BrunetonEarth
  verify、build/release/types/docs/tsc、installed-package `23/23`全部通过。Final matched/unmatched grids覆盖medium/high、day/sunset、
  below/inside/above、cloud-only/combined；local artifacts保持untracked。Full repository Spec suite及live dual-world 4K timing未运行；4K使用精确资源公式
  boundary，不作未测性能claim。
- `Scene.js`、SGP-0008 ranges与`.scenegis/upstream-patches.json`exact unchanged；current-delivery upstream-owned=`0`、generated=`0`。
  Implementation回到`review-ready`；owner gate、checkpoint、push与A5仍blocked。

## Architecture independent re-review — No-Go — 2026-08-27

Architecture接受`A4-AR-011`的product修复：stationary frame直接发布current spatial attachments，合法`grid -> close -> combined -> diagnostic`序列也独立
复现both-world `fixed=0`、`mrtFixed=0`与`geometryInvariant=true`。其余三项仍阻断A4：

1. `A4-AR-013`：final source在clean fixed viewport下不能复现记录的matched edge metrics，实际四preset仍表现为低信息量云层；旧artifact早于最终renderer/Test
   修改。Root cause是coarse occupancy以单个cell-center density作为empty-space authority，可能跳过thin/sub-cell occupied content，且positive interval最多
   four fine samples；mip/LOD只能抑制alias，不能恢复被跳过的形态。Execution需改为conservative occupancy/min-max hierarchy或等价保守bound，按最小保留
   feature给出fine-step budget和sample/skip histogram，并从final source重生成可复现grids。
2. `A4-AR-016`：current record仍宣称focused+A1 `61/61`，但Architecture exact focused rerun为controller `53/54`；本plan早期十properties、四assets、
   无history等内容此前仍像current contract。Early sections已由Architecture明确标记为superseded，但验证计数必须在修复后按实更新。
3. `A4-AR-017`：`destroys candidate 3D textures when cloud mip generation fails`没有抛出预期异常、destroy spy为`0`、last-good resources被替换且旧shape
   texture被销毁。Spec spy的是deep-source `Texture3D.prototype`，public index runtime使用另一bundled class identity，因此failure从未注入。Execution需从已发布
   texture取得actual runtime prototype或让subject与spy使用同一class identity，注入第一次mip generation failure并断言last-good exact保留、旧texture未销毁、
   所有candidate资源exactly-once释放且无泄漏。Controller必须达到`54/54`，加A1后才可重新报告`61/61`。

Owner visual gate、checkpoint、commit/push与A5 activation继续blocked。Exact symptom、root cause、required repair与closure以open A4 review为authority。

## A4-AR-013/016/017 execution repair — 2026-08-27

- `A4-AR-017`：mip failure fixture改从published shape texture取得actual runtime prototype；wrong-module spy必须保持zero calls。Injected first
  `generateMipmap` throw后last-good resources exact保留，旧textures全部live；candidate Texture3D/Texture2D/program/VA/buffer按`2/2/7/1/1`
  exactly once cleanup。Final controller=`56/56`，A1=`7/7`，focused+A1=`63/63`。
- `A4-AR-013`：runtime从tracked shape candidate派生one periodic R8 conservative max hierarchy。Ceil-quantized max mip在每级使用one-cell halo并以
  nearest lookup比较preset morphology threshold，避免thin/sub-cell positive density被center-point false-negative跳过。Derived texture exact
  `2,396,745 bytes`；tracked five-asset payload仍为`11,796,480 bytes`且hash不变，active static GPU合计`15,691,189 bytes`。
- High/medium/low quality保持`.75/64/4/4`、`.5/64/4/3`、`.375/32/1/2`。Fine budget由interval length和minimum retained
  feature推导并clamp到quality上限；actual compiled scheduler fixture读取cloud MRT counters，证明cumulus/cirrus/mixed均发生empty-space skip，stratus
  连续sheet按descriptor语义全区积分，所有world/preset均满足`fine <= (coarse-skip)*4`。Exact per-world totals记录于open review。
- Runtime static + 1080p MRT + two history的low/medium/high persistent increment为`82.69/86.16/96.04 MiB`；4K medium/high为
  `299.73/339.28 MiB`。Program/command仍`7/4`，A4R over-A3仍`+4/+2`，无新增tracked asset、fetch、pass、VA、upstream seam或permanent loop。
- Final product/Test/asset fingerprint=`9173f323eb66fe622f0f71709e8b76f61fca1b13`。Cache-disabled Chromium `1600x900` / DPR `1`
  在two clean loads执行matched high/day/below grid及合法`grid -> close -> combined -> diagnostic`，edge metrics两次逐项一致：Globe/Planar
  cumulus `2.039/1.944`、stratus `.971/.950`、cirrus `.644/.670`、mixed `1.842/1.730`；both-world `fixed=0`、
  `captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`、cloud gates PASS、errors=`0`。
- Current contract唯一authority为eleven public properties、five tracked assets、six runtime cloud textures、one MRT、two full-resolution ping-pong
  history managers及program/command `7/4`。前述pre-A4R十properties/four assets/no-history章节已明确标为superseded history；current README、extension
  plan与review同步上述资源和验证事实。

Implementation status=`review-ready`。Owner visual gate、checkpoint、commit/push与A5 activation继续blocked，等待Architecture独立复审。

## Architecture sixth independent re-review — No-Go — 2026-08-27

- `A4-AR-013`关闭：candidate-owned conservative max hierarchy、periodic halo、thin/sub-cell fixture与actual compiled scheduler counters修复旧
  center-point false-negative。Architecture two-clean-load matched high grids稳定到`.001`并显示可辨的cumulus、stratus、cirrus与mixed；owner live visual
  gate仍需在全部delivery blocker关闭后单独执行。
- `A4-AR-017`关闭：actual runtime prototype injection确定命中，last-good exact保留、旧resources保持live，candidate Texture3D/Texture2D/
  program/VA/buffer exact `2/2/7/1/1` cleanup。Architecture复跑controller/A1=`63/63`，exact Scene aggregate=`127/127`。
- `A4-AR-011`重新打开：合法`grid -> close -> combined -> diagnostic`后Planar出现`fixed=6208`、`captureTemporal=0/6208`、
  `mrtFixed=3187/197`；立即重复diagnostic又使Globe出现`fixed=624256`、`geometryInvariant=false`。Root cause是Test以第一个
  `postRender`作为capture authority，matched cross-scene Sun同步与pending render没有在generation token边界内drain/freeze，导致paired read可能来自不同
  generation。Execution需按open review建立quiescent transaction、完整authority snapshot和连续两次exact-zero gate；若相同authority下raw MRT仍变化，再修
  product determinism。
- `A4-AR-016`继续blocking：current record曾同时包含旧`2.595/2.503`等artifact metrics与fingerprint `2.039/1.944`等metrics；Architecture
  同一final tree/query/viewport两次得到`2.089/2.071`与`2.090/2.072`等。云体质量可以接受，但“exact reproducibility”及唯一current evidence
  不成立。`A4-AR-011`关闭后必须从同一transaction统一README、extension/phase plan、discussion与review，不得继续append矛盾数字。

Exact symptom、root cause、required repair和closure以open review的sixth independent re-review为authority。Owner gate、checkpoint、commit/push与A5
activation继续blocked。

## Architecture A4-AR-011 runtime-determinism decision — 2026-08-27

Execution已证明generation-token transaction内相邻frame有序且当前captured authority相等，但第二次consecutive diagnostic在both worlds产生nonzero low
MRT/resolved delta。Architecture接受wrong-generation race已被移除为首要解释，同时指出current snapshot仍遗漏depth contents、history
valid/stationary/weight/readIndex、MRT/program/static texture/sampler identities；root cause只能暂时定位到unfrozen GPU input/content、FBO/readback state或
cloud Shader子阶段的undefined/stateful behavior。

下一步冻结为open review定义的real-Context deterministic replay：复用现有off-center raw fixture，先对identical clear-depth/controlled textures执行two
consecutive complete low-MRT raw reads，再按constant sentinel -> ray/STBN/segment -> density/occupancy -> full lighting的first-failing-stage顺序定位；每级同时
比较same owner FBO与independent A/B MRT targets。Instrumentation只存在于Specs，所有command/program/FBO mutation以`try/finally`恢复，不增加runtime resource/
public API/pass/asset/upstream surface。

只有low MRT在both worlds × two frusta × linear/log × four presets及one real-asset phase下same-context exact，resolve invalid/stationary exact，且two clean
loads各连续两次integrated diagnostic全零/true后，才能关闭`A4-AR-011`并统一`A4-AR-016`。Latest product fixes暂时保留但必须获得behavioral replay，不以
source-string assertions作为closure。Owner gate、checkpoint、commit/push与A5继续blocked。

## Execution closure — A4-AR-011/016 — 2026-08-27

- `A4-AR-011`的first-failing-stage replay已完成。Specs以controlled constant shape/detail/weather/turbulence/STBN、zero dither、fixed camera/A1
  frame/Sun/preset/quality/time和clear depth，依序运行constant sentinel、ray/STBN/segment、density-only与full lighting；每级比较same owner MRT连续draw及
  independent A/B MRT。Both worlds × Perspective/Orthographic × linear/log × four presets以及fixed real-asset phase的完整color/distance half bits全部exact。
- Direct Test authority现记录full depth texture GPU copy/hash、全部cloud CPU uniforms、active/linear/log program与defines、command/VA/render state/pass viewport、
  low/history FBO与attachment identity、six cloud textures和three atmosphere LUT identities/dimensions/sampler，以及history valid/stationary/weight/readIndex/key/
  reset reason。每个raw read还确认successful-frame generation未变化；paired frame必须exact `+1`且comparable authority deep-equal。
- Low MRT与full depth exact后，remaining one-half-ULP resolved delta只在spatial resolve出现。Root cause是bilateral weights的`exp2`属于GLSL implementation-dependent
  transcendental approximation，相同inputs的重复draw可在RGBA16F storage边界产生末位差。Resolve现用固定
  `(1 + ln(2) * x / 16)^-16`有理近似计算spatial/front weights，并把stationary映射为与invalid首帧相同的shader-facing `valid=false/weight=0`；JS
  history仍保持valid/stationary，moving `0.82` EMA、compatibility与resource/pass contract不变，不读取或复用旧history作为stationary输出。
- Final product/Test/assets/scripts content fingerprint为`4ca82559fd900f67608a2c6340320a71dd2aca51`。Final browser authority为`1280x720` DPR `1`，query
  `phase=matched&globePhaseX=90000&globePhaseY=30000&final=ar011f{1|2}`，序列为
  `enabled -> high -> cloudGround -> Perspective -> cloud-only -> preset grid -> close -> combined -> diagnostic -> diagnostic`。Two cache-busting clean loads的
  四次both-world结果全部`fixed=0`、`captureTemporal=0/0`、`mrtFixed=0/0`、`geometryInvariant=true`、cloud gates PASS、errors=`0`；每次10组
  paired reads的authority/generation均exact。
- 同一final source的matched high edge Globe/Planar为cumulus `2.349/2.175`、stratus `.812/.774`、cirrus `.601/.533`、mixed
  `2.089/1.881`。这些是唯一current grid metrics；之前所有数字只属于明确标记的historical Architecture/Execution段落。
- Final minimum boundary：controller `56/56`、A1 pipeline `7/7`、exact `Scene/Scene` trailing-space filter aggregate `127/127`、CloudCore generator `10/10`、tracked
  `--verify-only`=`11,796,480 bytes`、`build`、`build-release`与installed verifier `23/23`通过。Public/type/doc source未改变，先前已接受的`build-ts`、
  `build-docs`与`tsc`不重复；full Spec suite与dual-world 4K live timing仍未运行。

Current authority仍为eleven public properties、five tracked assets、six runtime cloud textures、program/command `7/4`、one low MRT与two full-resolution
ping-pong history managers。`Scene.js`、SGP-0008 ranges与`.scenegis/upstream-patches.json`保持exact unchanged；current-delivery upstream-owned=`0`、
generated=`0`。Implementation status=`review-ready`；owner gate、checkpoint、commit/push与A5继续blocked，等待Architecture独立复审。

## Architecture seventh re-review — owner visual gate authorized — 2026-08-27

- `A4-AR-011`关闭：Architecture复跑controller/A1=`63/63`、exact Scene aggregate=`127/127`；two independent clean loads各连续执行two
  diagnostics，四个transaction共`40`组paired reads全部generation/authority exact，both-world raw/result gates全部zero/true。
- `A4-AR-016`关闭并限定证据精度：两次matched-high grid只有Planar cumulus observational edge从`2.175`变为`2.179`；该8-bit display
  scalar不再作为bit-exact authority，记录为`2.175–2.179`/两位小数`2.18`。Runtime determinism仍以serialized raw attachment transaction为authority。
- Status进入`approved-for-owner-gate`。Owner需live检查four presets、dual-world color/opacity以及below/inside/above、day/sunset；通过前不得创建A4
  checkpoint、commit/push或进入A5。若owner拒绝，新的finding必须记录exact symptom、root cause、repair与closure。

## Owner visual No-Go and bounded rework — 2026-08-27

- Owner截图确认both-world horizon/cloud detach，以及downward aerial与height-fog full-width layering；`approved-for-owner-gate`已撤销。
- `A4-AR-018`根因是A4把Aerial clear-depth判断扩大为raw/decoded near-sentinel epsilon neighborhood，再用同一boolean同时跳过aerial/fog；
  CloudFS/Resolve复制了相同语义。修复只建立exact geometry-presence contract，不增加fallback/clamp/pass/resource/API。
- `A4-AR-019`根因链是错误depth分类把finite geometry distance切为background，再由final composite固定250 m binary cloud reject放大成整行断带。先修
  AR-018，再以front/mean/max/scene-distance capture决定是否移除固定偏置或使用bounded footprint transition。
- 验证边界冻结为affected controller Specs、A1 pipeline smoke、both-world downward/horizon fixed captures及changed-scope lint/diff；不跑full suite、
  unrelated generator/package/type/docs matrix。不得用隐藏倍率、额外guard、宽松阈值或temporal blur作防御性修补。
- Exact symptom、root cause、repair和closure gate以open A4 review的`Project-owner visual gate — No-Go`段为authority。A4保持active；checkpoint、
  commit/push和A5均blocked。

## Execution closure — A4-AR-018/019 — 2026-08-27

- Shared exact clear-depth semantics now require raw and decoded values to both be exact `0/1`; old near-sentinel epsilons are absent from Aerial/Cloud/Resolve. Finite non-sentinel
  depth always reconstructs and receives A2/A3/cloud clipping.
- Fixed 250 m cloud binary rejection is replaced by a bounded front-distance transition tied to `fwidth(frontDelta)` plus a 1 m encoded baseline. No resource,
  pass, public, asset or upstream delta was introduced.
- Focused controller/A1=`64/64`. Local Perspective/day downward scanline steps are aerial Globe/Planar `0.033/0.032`, fog `0.020/0.034`; horizon cloud-only
  geometry step=`0/0` and near-target max delta=`0/0`. Three final artifacts are retained under local temp `a4r-ar018-019-final`.
- Implementation is `review-ready`; full suite and unrelated build/package/generator/type matrices remain intentionally unrun. Owner gate, checkpoint and A5 remain
  blocked pending Architecture re-review.

## Architecture focused re-review — No-Go — 2026-08-27

- `A4-AR-018` accepted：三个depth consumers共享exact `0/1` sentinel contract；near-sentinel finite geometry的both-world、two-frusta、linear/log raw evidence
  与real opaque depth evidence充分。
- `A4-AR-019`仍未关闭并新增`A4-AR-020`：`sceneGISSelectCloudSample`在`distances.a < 0.5`的data-dependent early return之后，且在
  `if (!clearDepth)`的data-dependent branch内调用`fwidth(frontDelta)`。Geometry/cloud silhouette正会使相邻fragment分流，因此该derivative不具备
  defined portable semantics；当前Chromium/GPU截图通过不能证明其它driver不会重现edge detach。
- Required repair仅为把`frontDelta`及`fwidth(frontDelta)`无条件计算移到该函数全部data-dependent branch/return之前，再沿用现有clear/invalid选择与
  premultiplied radiance/transmittance composition。禁止新增fallback、guard、clamp、blur、threshold tuning、pass/resource/API。
- Closure只复跑controller与A1 focused Specs，并从final source重生成既有downward aerial/fog和horizon cloud-only/combined artifacts。Full suite及
  generator/package/type/docs矩阵继续不运行。Owner gate、checkpoint、commit/push与A5继续blocked。

## Execution A4-AR-020 closure — 2026-08-27

Derivative footprint现于所有data-dependent branch/return前无条件计算，原invalid/clear与premultiplied composition保持。Source-order contract、controller/A1
`64/64`以及final `ar020=final` downward/horizon evidence通过；scanline与near-target数值不回退，render errors=`0`。同三张local artifact已重生成。
Implementation回到`review-ready`；full suite与无关矩阵保持未运行，等待Architecture独立复审。

## Architecture A4-AR-020 re-review — No-Go — 2026-08-27

- `A4-AR-020`源码修复accepted：`frontDelta`及`fwidth`位于invalid-distance branch、clear-depth branch和first early return之前；source-order regression
  assertion覆盖三者，原visibility与premultiplied composition不变。
- 三张final artifact中未再观察到owner原始downward full-width layer或horizon row-wide detach，记录的scanline与near-target指标保持通过。
- Architecture独立controller aggregate运行得到`56/57`：`renders the planar day-night, height, orthographic, and underground matrix`在
  `logarithmicDepth=true` clear-depth identity比较中，aerial-enabled实际像素`[57,111,170,255]`不等于disabled authority
  `[55,113,184,255]`。同一Spec随后isolated运行`1/1`，证明结果依赖同文件先前状态/order，而不是稳定的single-test数学输出。
- 新增`A4-AR-021`。Execution只需在controller文件内做最小ordered bisection，并在失败的two-frame pair捕获raw/resolved depth、
  `frameState.useLogDepth`、selected aerial program、show flags及input/output pixel，定位首个state owner后修复。不得增加settling render、epsilon、fallback、
  宽松pixel threshold或重复运行到通过。
- 本轮在controller失败处停止；未运行full suite、Scene aggregate、无关矩阵或额外A1复跑。Owner re-gate、checkpoint、commit/push与A5继续blocked。

## Execution A4-AR-021 closure — 2026-08-27

Ordered isolation得到subject `1/1`、相邻六个failure-injection predecessors加subject `7/7`，未发现prototype/program/resource leak。Shared classifier的真实多authority
缺陷是把raw resolved-depth sentinel与`czm_readDepth`浮点解码结果同时作为clear必要条件；现收敛为raw texture exact `0/1`唯一authority，decoded depth只参与finite
geometry reconstruction。Three consumers保持同一helper，near-sentinel epsilon未恢复。失败context记录raw/decoded、live log program/show flags、input/output pixels。

Final exact controller aggregate=`57/57 SUCCESS`，A4-AR-020 source-order assertion包含在内。Spec ESLint/Prettier与`git diff --check`通过；full suite、Scene aggregate、
A1及无关矩阵未运行。Implementation=`review-ready`；owner re-gate、checkpoint、commit/push与A5继续blocked。

## Architecture A4-AR-021 re-review — No-Go — 2026-08-27

- Proposed root cause不成立。Environment log programs只定义`LOG_DEPTH_READ_ONLY`；Cesium `czm_reverseLogDepth`只在`LOG_DEPTH`下执行decode，而
  `DerivedCommand.getLogDepthShaderProgram`检测到`LOG_DEPTH_READ_ONLY`后直接返回原program。因此linear/log-read-only两条路径的
  `czm_readDepth(depthTexture, uv)`都与同一次texture sample的raw depth相同；旧`rawClear && resolvedClear`与新`rawClear`在当前delivery中runtime等价。
- 三个fragment shader仍声明但不消费`resolvedDepth`，也直接证明所谓“decoded depth仅用于finite reconstruction”不属于current source；finite reconstruction
  实际由`czm_windowToEyeCoordinates(..., rawDepth)`完成。
- Architecture单次exact controller aggregate=`57/57`，但修复前同一aggregate也曾`57/57`，而Execution的ordered candidate+subject也是`7/7`，没有交付
  pre-fix deterministic failure。Green run不能证明该等价改写关闭了先前aggregate-only failure。
- 新增`A4-AR-022`。只需用one immutable captured color/depth input直接执行linear/log aerial command，分别记录raw/readDepth、selected program、input/output
  half-float与display pixel，确认identity是否由input变化、classifier/program或composite造成；不得重复controller直到绿色或扩大到full suite。
- Owner re-gate、checkpoint、commit/push与A5继续blocked。

## Owner decision — fresh diagnostic thread — 2026-08-27

Project owner确认连续review未解决实际画面问题，准备以新对话重新诊断。Current A4/A4R tree冻结；新对话先复现owner画面并建立same-frame depth/input/output authority，
不继承既有finding为最终根因。Execution停止继续修改，直到Architecture从新对话给出新的bounded assignment。

## Execution A4-AR-022 repair closure — 2026-08-27

- Fresh GPU diagnosis确认主断带来自explicit occupancy mip upload，而不是clear-depth classifier：`Texture3D.loadBufferSource`按base width `128`设置一次
  `UNPACK_ALIGNMENT=4`，SceneGIS tight `R8` LOD6 `2³`没有row padding，GPU结果为8/8 zero；coarse occupancy选择该LOD后binary skip整个interval。
- SceneGIS renderer继续用tight arrays构建ceil-quantized halo max hierarchy，只为每个explicit mip建立与base alignment兼容的upload view。Row stride按
  `ceil(width / alignment) * alignment`，image stride自然为padded row stride × height；LOD6 upload buffer由tight `8 bytes`变为`16 bytes`
  （`+8`），LOD7由`1 byte`变为`4 bytes`（`+3`），总temporary CPU padding delta=`+11 bytes`。GPU texture dimensions/format/bytes、
  static texture count、program/command/pass/API/asset budgets均不变。
- Real-Context regression从published occupancy texture直接读取LOD5 `4³`、LOD6 `2³`、LOD7 `1³`，both worlds全部texel nonzero，且每个coarser
  parent均不小于对应child。Controlled thin-support fixture把product occupancy path与只在Spec program中禁用coarse skip的exhaustive-density
  reference进行MRT half-bit比较；both worlds color/distance exact，所有reference front/transmittance support均无false negative。
- 并行log-depth correctness同步关闭：aerial/cloud/resolve log programs现在同时定义`LOG_DEPTH`与`LOG_DEPTH_READ_ONLY`；raw exact `0/1`仍单独决定
  clear，finite sample先由`czm_readDepth`解码，再以`czm_windowToEyeCoordinates(vec4(xy, resolvedDepth, 1.0))`走conventional-depth reconstruction，
  避免把resolved depth二次解释为log depth。
- One immutable `4×1` RGBA16F color/depth direct fixture在both worlds按linear → log → linear → log交错执行，无额外settling frame。Exact clear
  half bits保持identity；两个finite samples的distance有限、正值、有序；actual selected log program同时包含两个defines，重复结果逐bit一致。
- Final exact controller=`59/59 SUCCESS`，A1 private pipeline=`7/7 SUCCESS`。Changed-file ESLint、Prettier及`git diff --check`通过。Full repository
  Specs、Scene aggregate、generator/package/type/build矩阵按assignment未运行。
- Current repair touched upstream-owned=`0`、generated=`0`、new SGP=`0`；`Scene.js`、`.scenegis/upstream-patches.json`及active `SGP-0008`
  ranges未改变，SGP-0008仍consume-only。Implementation=`review-ready`，tree保持uncommitted/unpushed；owner gate、checkpoint与A5继续blocked，等待
  Architecture独立复审。

## Architecture A4-AR-022 independent re-review — Go for owner visual re-gate — 2026-08-27

- Source review确认tight max hierarchy与padded upload view分离；3D source offset、row stride与image stride正确。三个log-depth variants同时定义
  `LOG_DEPTH`与`LOG_DEPTH_READ_ONLY`，finite path先经`czm_readDepth`，再通过conventional-depth `vec4` overload重建，未发生二次log decode。
- Architecture独立运行两个新增real-Context regressions，occupancy GPU mip/exhaustive与immutable dual-world linear/log各为`1/1 SUCCESS`；Execution的
  exact controller=`59/59`、A1 pipeline=`7/7`及changed-scope静态门禁接受。
- Fresh local Chromium reload后，both worlds均`ready · HDR`且`frameState.useLogDepth=true`。Actual GPU readback为LOD5 `64/64` nonzero
  (`min=223, max=232`)、LOD6 `8/8` nonzero (`232`)、LOD7 `1/1` nonzero (`232`)；三个selected log programs在both worlds均包含两个defines。
- Ground combined/cloud-only固定画面不再出现owner原截图的整片水平空带。`向下深度连续性`固定画面排除UI与canvas边界后，相邻scanline mean channel
  delta最大为Globe `3.0/255`、Planar `0.513/255`，没有full-width discontinuity。
- `A4-AR-022`由Architecture关闭；A4仍active，状态转为`Go for project-owner visual re-gate`。Owner通过前不得checkpoint、commit/push或进入A5。
  Current repair upstream-owned=`0`、generated=`0`、new SGP=`0`，existing `SGP-0008`仍consume-only。

## Execution A4-AR-023 repair closure — 2026-08-27

- Added a Spec-only real-Context component program around the actual shared `sceneGISCloudLightingComponents` core. It reads controlled atmosphere textures on the
  GPU, reports direct Sun, bounded multiple scattering and sky ambient for matched high-Sun top/underside samples, checks component sum and exact replay, then restores
  the product programs and executes the integrated Cloud MRT.
- Pre-repair top direct/multiple/ambient luminance was approximately `0.036/0.111/0.125`; the directional term was the first underpowered component and blue sky ambient
  controlled chroma. Product repair adds a bounded backward-diffusion lobe to the directional phase only. The existing strong forward lobe, optical-depth shadowing,
  sunset/night atmosphere inputs and all final RGB/public scales remain unchanged.
- Post-repair top components are direct `[0.239,0.209,0.180]`, multiple `[0.126,0.111,0.095]`, ambient `[0.104,0.125,0.166]`, integrated
  `[0.469,0.445,0.440]`; underside remains `[0.206,0.234,0.293]`. The fixture enforces top direct authority, near-neutral integrated top, underside contrast,
  chromatic sky response, exact replay and the retained dual-world density/T, luminance and CIE xy bounds.
- Same-final-source raw Cloud MRT evidence covers cloud-only and combined below/inside/above, all four presets and day/sunset/night in both worlds. Day cumulus median
  luminance is Globe/Planar `0.257/0.244` below, `0.306/0.244` inside and `0.298/0.277` above. Above-cloud CIE xy is
  `(0.3036,0.3164)/(0.3049,0.3171)`; sunset source becomes warm (`R>G>B`) and night returns zero Sun radiance in the current no-moon model.
- Isolated component=`1/1 SUCCESS`; exact controller=`60/60 SUCCESS`; A1 pipeline=`7/7 SUCCESS`. No pass/program/texture/FBO/history/API/asset or persistent resource
  delta was introduced. Upstream-owned=`0`, generated=`0`, new SGP=`0`; `SGP-0008` remains consume-only. Tree remains uncommitted/unpushed and A5/owner gate remain
  blocked pending Architecture review.

## Execution A4-AR-024 normalized redistribution closure — 2026-08-27

- Architecture correctly rejected the additive backward lobe. The new actual-GPU angular fixture additionally exposed that the retained forward HG literal was not
  `(1-g²)/(4π)` normalized. Both HG coefficients now use that analytic form, and directional phase is the convex combination
  `0.25 * HG mixture + 0.75 * 3/(4π) * ((1-mu)/2)^2`.
- Each HG lobe integrates to `1`; the backward polynomial integrates as
  `2π * 3/(4π) * integral[-1,1]((1-mu)/2)^2 dmu = 1`; nonnegative convex weights sum to `1`, so the directional phase integral is exactly `1`.
  Actual compiled 256-sample GPU midpoint quadrature is `0.997459`; backward/side/forward=`0.19019/0.04990/1.30957`. A Spec-only compiled mutation restoring
  additive composition integrates to `1.990521` and deterministically violates the `abs(integral-1)<=0.01` gate.
- The component matrix now covers backward/side/forward at top optical depth `0.15` and underside depth `4.0`. Backward top direct/multiple/ambient is
  `[0.1581,0.1384,0.1187]` / `[0.1263,0.1106,0.0948]` / `[0.1038,0.1246,0.1660]`; integrated top/underside is
  `[0.3882,0.3735,0.3794]` / `[0.2037,0.2313,0.2913]`. Every direction retains direct optical-depth attenuation and finite/nonnegative component sums.
- Final live fixed orthographic Sun-relative cosine `-1/0/1` evidence, cloud-only/combined, reports median Y Globe/Planar
  `0.354/0.342`, `0.239/0.214`, `1.357/1.320`. Standard day below/inside/above, four presets and sunset/night were recaptured from the same source.
- Isolated angular/component=`1/1`, controller=`60/60`, A1=`7/7`. Persistent resource/API/assets remain unchanged; upstream-owned=`0`, generated=`0`, new SGP=`0`.
  Tree stays uncommitted/unpushed; owner gate and A5 remain blocked pending Architecture review.

## Execution A4-AR-025 diffuse partition closure — 2026-08-27

- Actual-GPU side-view matrix separates controlled Sun-only, sky-only and combined incidents at optical depths `0.15/1.2/4.0`. Both A2 adapters return requested
  Sun `[0.8,0.7,0.6]` and sky `[0.1,0.12,0.16]` within `0.002`; combined direct/multiple/ambient separates to the incident-only programs within `0.001`.
  Therefore no A2 normalized-unit or public radiometric-contract change is required.
- Before repair, side top/middle/underside combined RGB was `[0.2717,0.2715,0.2920]`, `[0.2471,0.2615,0.3040]`, and
  `[0.2003,0.2281,0.2886]`; at middle/underside chromatic sky ambient dominated neutral solar multiple scattering. The frozen normalized phase is unchanged.
  The shared core now applies explicit `solarDiffuseRebalance=1.48` and `skyDiffuseRebalance=0.8` before component integration, never to final RGB.
- Final Globe side top direct/multiple/ambient is `[0.04144,0.03629,0.03111]` / `[0.18701,0.16370,0.14026]` /
  `[0.08307,0.09967,0.13293]`, integrated `[0.31152,0.29956,0.30420]`. Middle is `[0.26050,0.26440,0.29028]`; underside remains
  darker and sky-chromatic at `[0.18494,0.20422,0.24951]`.
- Same-final-source standard day below/inside/above median Y Globe/Planar is `0.2798/0.2646`, `0.3275/0.2678`, and `0.3147/0.2955`.
  Above `B/G=1.078/1.069`, and D65 distance=`0.0096/0.0081`. Fixed backward/side/forward median Y is `0.4155/0.4029`,
  `0.3030/0.2748`, `1.4186/1.3811`; forward p90=`1.4575/1.4276`, all below the accepted phase baseline `+5%` cap.
- One-render four-preset below medians Globe/Planar are cumulus `0.2798/0.2646`, stratus `0.1893/0.1898`, cirrus `0.3452/0.3204`, mixed
  `0.2468/0.2393`. Sunset remains `R>G>B`; no-moon night remains exact zero.
- Isolated diffuse=`1/1`, controller=`60/60`, A1=`7/7`. Persistent resource/API/assets delta=`0`; upstream-owned=`0`, generated=`0`, new SGP=`0`, and
  `SGP-0008` remains consume-only. Tree stays uncommitted/unpushed; Architecture review, owner gate, checkpoint and A5 remain blocked.

## Execution A4-AR-026 radiometric stop — 2026-08-27

- Reference-audited candidate replaces the rejected phase/diffuse split with normalized equal dual-HG `g=(0.7,-0.2)` in every one of eight fixed octaves.
  Contribution, extinction attenuation and phase attenuation begin at `1` and halve per octave. Sky is exactly `skyIrradiance/(4π)` times the density-weighted
  active-layer height gradient `[0.5,1]` produced in the existing density loop. Local powder is dimensionally explicit
  `1-0.8 exp(-localExtinction[m^-1]*150 m)` and multiplies combined solar+sky before unchanged Beer-Lambert segment integration.
- Actual-GPU phase integrals for attenuation `1/0.5/0.25/0.125` are `0.999369/0.999592/0.999601/0.999625`. Controlled side-middle solar/sky/powder/total is
  `[0.05145,0.04504,0.03860]` / `[0.00597,0.00716,0.00954]` / `0.31128` /
  `[0.01788,0.01627,0.01500]`. Powder for extinction `1e-5/1e-4/1e-3/1e-2 m^-1` is
  `0.20117/0.21179/0.31128/0.82129`. GPU matches independently written CPU equations within half-float tolerance; overfilled-sky, isotropic-higher-order and
  Sun-path-brightening mutations produce respectively sky G `0.03818`, forward solar G `0.51855` versus product `0.54883`, and powder `1.69824`, so all reject.
- Live radiometry triggers the assignment stop condition. Canonical medium/cumulus p10/median/p90/contrast Globe/Planar: ground
  `0.02246/0.02868/0.03351/0.385` and `0.02533/0.03207/0.03614/0.337`; inside
  `0.03075/0.03430/0.03557/0.141` and `0.02481/0.03093/0.03462/0.317`; above
  `0.02424/0.02976/0.03441/0.342` and `0.02528/0.03048/0.03394/0.284`.
- Owner exact high/mixed ground is `0.02072/0.02102/0.02146/0.035` and `0.02213/0.02913/0.04441/0.765`; inside
  `0.02627/0.03774/0.04073/0.383` and `0.02095/0.02729/0.04033/0.710`; above
  `0.02245/0.02755/0.03848/0.582` and `0.02020/0.02463/0.03440/0.576`. Backward/side remain similarly dark; forward p90 is only
  `0.29898/0.28926` and does not clip. Sunset remains `R>G>B`; no-moon night remains zero.
- Public `cloudRadianceScale`, defaults, ADR and API remain frozen. No hidden scale/tint/tone/gamma/exposure was added. Isolated fixture passed before and after
  diagnostic readback; controller/A1 final boundary is intentionally not claimed pending Architecture radiometric-unit decision. Resources and ownership remain frozen.

## Architecture A4-AR-023/025 independent re-review — owner visual re-gate authorized — 2026-08-27

- Source review accepts the unchanged normalized directional phase and the explicit pre-sum shared diffuse calibration `solar multiple × 1.48` / `sky ambient × 0.8`.
  No final RGB/public/world-specific factor was introduced; A2 incidents, density, coverage and all persistent resource/API budgets remain unchanged.
- Architecture independently reran the actual-GPU component/diffuse fixture=`1/1 SUCCESS`. Sun-only/sky-only/combined separation establishes A2 adapter units as
  correct and the shared diffuse partition as the repaired owner. Execution controller=`60/60` and A1=`7/7` are accepted; `git diff --check` independently exits `0`.
- Fresh local Chromium standard ground median Y Globe/Planar=`0.2877/0.2689`; standard above=`0.3123/0.3009`, above source `B/G=1.080/1.065`.
  Fixed forward median=`1.4199/1.3807`, p90=`1.4572/1.4285`, remaining within the accepted normalized-phase `+5%` ceiling. Both worlds are `ready · HDR` with
  render errors=`0`.
- `A4-AR-023/025` close technically. A4 moves to `Go for project-owner visual re-gate`; owner approval remains mandatory before checkpoint, commit/push or A5.
  The conditional reference download was not triggered, and no reference checkout/source/asset was introduced.

## Architecture A4-AR-026 reference-audit assignment — 2026-08-27

### Trigger and reference boundary

Project owner明确拒绝`A4-AR-025`画面，previous Architecture owner-gate authorization撤销。Architecture已在repository外下载并校验ADR固定commit：

- `yuwoniu03/cesium-clouds-atmosphere@1f38602b84ab5c3f2bc289f9e4464df3db917155`，repository `LICENSE`为MIT；
- `takram-design-engineering/three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`，`packages/clouds/LICENSE`为MIT，
  `@takram/three-clouds` author为Shota Matsuda。

Relevant reference paths are `three-geospatial/packages/clouds/src/shaders/clouds.frag`,
`three-geospatial/packages/clouds/src/CloudsMaterial.ts`, `three-geospatial/packages/clouds/src/qualityPresets.ts`, and
`cesium-clouds-atmosphere/src/ThreeGeospatialPipeline.js`. Audit只消费equations、component ownership与visual evidence；不得复制reference source、shader或binary。

The Cesium fork mirrors the original scattering core but later performs cloud-only `ACESFilmic`, exposure, gamma and magenta correction. Those operations are
port-specific display calibration, are not present in the original `three-geospatial` cloud composite, and violate SceneGIS shared linear-HDR composition. They are
explicitly outside this repair.

### Confirmed structural divergence

Reference core uses an analytically normalized dual-HG phase with `g=(0.7,-0.2)`, equal weights, and evaluates an attenuated normalized phase in every fixed
multiple-scattering octave. Its sky term is `skyIrradiance * 1/(4*pi) * skyGradient`, where density-weighted layer height gives `skyGradient` in `[0.5,1]`. A local
powder factor `1 - 0.8*exp(-localExtinction*150 m)` multiplies the complete scattered source before analytic segment integration.

Current SceneGIS instead:

- mixes the dual-HG phase down to `25%` and replaces `75%` with a backward polynomial;
- makes all three higher orders isotropic, then multiplies them by preset scale and `solarDiffuseRebalance=1.48`;
- computes sky as `skyIrradiance/pi * sunOpticalDepthGain * presetScale * 0.8` with no density-weighted height gradient;
- uses Sun-path optical depth to increase direct radiance by up to the preset boost, rather than suppressing locally thin media.

For controlled `tauSun=0.15`, current default sky factor is `0.830949`; reference top/middle/bottom factors are `0.079577/0.059683/0.039789`. Current sky fill is
therefore approximately `10.4x/13.9x/20.9x` the reference partition before incident RGB. At the same side angle and optical depth, current isotropic higher-order
factor is `0.233858`, while the reference eight-octave phase-preserving solar factor is `0.109531`. This explains why `A4-AR-025` reached higher median Y and near-D65
chromaticity while still producing owner-rejected flat gray volumes.

Current Beer-Lambert accumulation is not the failing owner: with zero absorption/scattering albedo one it is algebraically equivalent to the reference analytic
segment integral. A2 incident-unit probes also remain accepted. Do not rewrite either owner.

### Required product correction

Execution must make the smallest shared-core correction in
`packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`:

1. Replace the backward-polynomial phase and separate direct/isotropic higher-order split with one analytically normalized dual-HG function and a compile-time bounded
   eight-octave Kulla-style approximation. Every octave must evaluate `HG(g*phaseAttenuation, mu)`; attenuation, contribution and extinction coefficients start at one
   and halve per octave. The first octave is the single-scattering term. Every attenuated phase must retain solid-angle integral one.
2. Remove `solarDiffuseRebalance`, `skyDiffuseRebalance`, Sun-optical-depth ambient gain and the preset-wide sky factors that produced the measured overfill. Sky source
   must use `1/(4*pi)` and a density-weighted active-layer height gradient in `[0.5,1]`. Compute that gradient from values already produced for the current density sample;
   do not add texture reads or a second density march.
3. Replace Sun-path direct brightening with a bounded local-extinction powder factor applied once to the complete solar+sky source before existing segment integration.
   Use dimensionally explicit meter units and the reference baseline `scale=0.8`, `exponent=150 m`; if any private preset variation is retained, it must be justified by
   component evidence and cannot change component ownership.
4. Keep A2 Globe/Planar incident adapters, `cloudRadianceScale`, density/morphology/assets, occupancy hierarchy and upload padding, log-depth reconstruction,
   spatial/temporal resolve, pass/resource/API budgets and A5 scope unchanged. Do not add final RGB scaling, tint, white clamp, tone mapping, gamma, exposure,
   world-specific factors, Test-only product branches, new texture reads or settling renders.

If preserving current mean brightness requires a new radiometric unit conversion or public/default change, stop and return the measured unit mismatch before editing
ADR/public API. Do not recreate the rejected component rebalance under another constant name.

### Focused closure evidence

- Replace the existing component fixture with actual-compiled Globe/Planar probes of solar scattering, sky source, local powder and total source for
  `mu=-1/0/1`, `tauSun=0.15/1.2/4.0`, layer gradient `0.5/0.75/1.0`, and local extinction `1e-5/1e-4/1e-3/1e-2 m^-1`.
- Compare GPU values with an independently written CPU equation. Prove each attenuated phase is normalized, sky scales exactly with the gradient and `1/(4*pi)`, powder
  is finite/monotone from approximately `0.2` toward `1`, and combined equals separated incident-only components within the existing half-float tolerance.
- Add deterministic mutations for the old overfilled sky formula, isotropic higher orders and Sun-path brightening powder; each must fail its corresponding structural
  assertion. Retain dual-world density/transmittance/luminance/CIE parity, exact replay, A4-AR-022 occupancy/log-depth and lifecycle gates.
- Final-source Test evidence must capture the same fixed day cloud-only and combined ground/inside/above plus backward/side/forward views in both worlds, using
  `cloudTime=0`, public `cloudRadianceScale=1` and unchanged camera/Sun/density/coverage. Report active-pixel p10/median/p90 and normalized interdecile contrast
  `(p90-p10)/median`, not only median Y or D65 distance. Current standard-above contrast baseline is approximately `0.159/0.235` Globe/Planar; both worlds must show a
  material contrast increase without clipping forward peaks or losing darker sky-chromatic undersides. Numerical evidence supports but never replaces owner judgment.
- In addition to the canonical `medium/cumulus` matrix, retain one exact owner-reproduction state from the rejected live page: `high/mixed`, coverage `0.45`, density
  `0.0022 m^-1`, base `1000 m`, thickness `5700 m`, time `0` and radiance scale `1`. Do not turn these values into product defaults or hidden Test-only calibration.
- Run only the isolated lighting fixture, exact `SceneGISEnvironmentEffects` controller, A1 private pipeline smoke, changed-scope lint/format/Markdownlint and
  `git diff --check`. Full suite, Scene aggregate and unrelated build/package/generator/type matrices remain outside this finding unless the correction crosses their
  boundary.

Status remains `changes-requested`. Architecture independent re-review and a new project-owner visual gate are mandatory before checkpoint, commit/push or A5.

## Architecture A4-AR-026 radiometric contract decision — 2026-08-27

Execution正确触发stop rule。Architecture接受candidate reference-shaped lighting equations及其actual-GPU/CPU authority；后续不得再修改phase、solar
octaves、sky gradient、powder或Beer-Lambert source composition来恢复亮度。A2 cloud adapters的Sun transmittance与
`skyIrradiance / SCENEGIS_SOLAR_IRRADIANCE`共同定义solar-normalized transport domain，不授权重新引入physical solar RGB或任何hidden source term。

唯一授权的product correction是把现有public `cloudRadianceScale` default从`1.0`改为`10.0`，range保持finite `[0,64]`。该property独立把
solar-normalized intrinsic cloud RGB映射到Cesium scene-linear HDR；不得耦合`backgroundRadianceScale`、`aerialRadianceScale`，也不得改变
transmittance/distance/history ownership、density/morphology、pass/resource/API count或A5 scope。Scale `1`继续作为reference-equation diagnostic；默认
Test与owner reproduction使用`10`。

Execution需同步constructor/JSDoc/Specs/Test default并证明scale `0/1/10` RGB线性、scale `0` radiance identity、transmittance/distance half-bit不变及三种
calibration相互隔离。保留scale `1` component/contrast gate，在default `10`重跑canonical与owner-exact fixed views，报告raw p10/median/p90、contrast、
finite/max、sunset/night与forward HDR；不能把HDR `>1`误判为clipping，也不能允许RGBA16F ceiling、uniform white slab或阴影层次丢失。完成focused
controller/A1及changed-scope quality/audit后返回Architecture复审；owner gate、checkpoint、commit/push和A5继续blocked。

## Architecture A4-AR-026 re-review and A4-AR-027 assignment — 2026-08-27

Architecture接受默认`cloudRadianceScale=10`的product boundary、frozen reference-shaped shader与calibration isolation。Independent rerun为isolated
scale fixture=`1/1`、reference-lighting fixture=`1/1`、controller=`61/61`、A1 pipeline=`7/7`；ESLint、Markdownlint和`git diff --check`通过。Fresh final-source
browser复核确认both worlds ready/HDR，default与owner-exact视图没有RGBA16F white slab，cloud-only保留self-shadow；高质量mixed极端光向仍显露块状结构，
保留给project-owner visual gate判断。

`A4-AR-027`阻塞technical approval：`summarizeCloudMrtLighting`在decoded alpha/opacity非finite时直接`continue`，没有增加`nonfinitePixels`，且完全不扫描
distance attachment；新增GPU fixture只对RGB执行finite assertion，alpha和distance仅比较bits equality。因此一个跨scale保持相同的NaN会满足现有fixture，
live evidence也会把NaN alpha丢弃后报告`nonfinite=0`。Execution只可在focused Spec、Test diagnostic与current docs修复：逐half decode并fail closed覆盖完整
color RGBA和distance RGBA，保留active-pixel统计语义，storage guard对所有raw RGB有限值取absolute magnitude；新增actual-output assertions证明alpha/distance
finite且bounded。不得修改product/Shader/default/API/resource。最新review Markdown还必须重新Prettier并以post-writeback check为准。只复跑isolated calibration、
controller/A1、focused lint/format/Markdownlint和diff-check；通过后返回Architecture。Owner gate、checkpoint、commit/push和A5继续blocked。

## Execution A4-AR-026 calibration closure candidate — 2026-08-27

- Constructor、JSDoc与`Test/高级环境.html`的public/startup default现为`10.0`；finite range继续是`[0,64]`。Shared cloud shader保持Architecture接受的
  reference-shaped source逐字符不变，没有physical-solar reinjection、hidden scale、tone mapping或world factor。
- 新actual RGBA16F fixture在Globe/Planar与linear/log variants逐像素覆盖scale `0/1/10`。Scale `0`的intrinsic RGB exact zero，scale `10`相对
  scale `1`在half-float tolerance内为`10x`；color alpha与完整distance/front/validity attachment half bits exact不变。Background/aerial scale变化时raw
  Cloud MRT逐bit不变，cloud scale变化也不改变A2 LUT inputs或其他public calibration values。
- Same-final-source scale `1` owner-exact ground/inside/above/backward/side/forward median Y仍为Globe
  `0.03233/0.02633/0.02688/0.02983/0.02388/0.26569`、Planar
  `0.02536/0.02828/0.02470/0.03028/0.02691/0.16865`，保留reference-equation diagnostic authority。
- Default `10`的canonical medium/cumulus与owner high/mixed fixed matrices均使用单个成功render frame采集；所有样本`nonfinite=0`且storage guard=false。
  全矩阵最大premultiplied RGB为`3.1328125`，远低于`65504`。Owner sunset source RGB为Globe
  `[0.27777,0.15203,0.06360]`、Planar `[0.18549,0.10376,0.06156]`，均满足`R>G>B`；no-moon night两世界RGB与
  p10/median/p90 exact zero。Cloud-only与combined raw source distributions一致到single-frame sample selection范围，forward raw distributions相同；
  cloud-only forward仍有深暗部与内部结构，combined Globe forward的display white来自太阳/天空background，不是Cloud MRT ceiling或uniform cloud source。
- Exact focused command `npm run test -- --includeName "SceneGISEnvironmentEffects"`执行controller与A1 private pipeline合计`68/68 SUCCESS`；isolated
  radiometric fixture与冻结的reference-audited fixture各`1/1 SUCCESS`。Implementation现为`review-ready`，只等待Architecture独立复审；owner gate、
  checkpoint、commit/push与A5仍blocked。

## Execution A4-AR-027 finite-output evidence repair — 2026-08-27

- Live summary在active filtering之前逐pixel解码raw color RGBA与distance RGBA。任一attachment nonfinite都会增加separate与union counts并使
  `finiteOutput=false`；opacity-weighted distribution仅继续消费finite active pixels。Storage guard改为覆盖每个finite pixel的absolute raw premultiplied
  RGB，不再依赖alpha/active filter。Alpha、distance和binary validity bounds另有显式计数。
- Actual compiled scale `0/1/10` fixture对Globe/Planar、linear/log所有color channels与distance/front/max/validity channels执行finite assertion；alpha与
  distance编码范围为`[0,1]`，validity exact `0|1`。既有RGB linearity、scale-zero、attachment half-bit invariance与calibration isolation保持通过。
- Fresh final-source startup state保持default scale/camera/light/density不变。Globe/Planar分别得到full-color nonfinite=`0/0`、full-distance
  nonfinite=`0/0`、alpha/distance/validity bounds failures全部`0/0`；maximum absolute raw RGB分别为`0.354248046875/0.379638671875`，storage guard均false。
- Required commands结果：isolated calibration=`1/1 SUCCESS`、exact controller=`61/61 SUCCESS`、A1 private pipeline=`7/7 SUCCESS`。Implementation为
  `review-ready`，等待Architecture独立复审；owner gate、checkpoint、commit/push与A5仍blocked。

## Architecture A4-AR-027 independent re-review — approved for owner gate — 2026-08-27

Architecture source review确认repair在active-pixel filter之前解码完整color/distance RGBA half values，nonfinite union使`finiteOutput=false`，alpha、所有distance
channels与binary validity各自fail closed；storage guard覆盖每个finite pixel的absolute raw RGB。Actual-GPU fixture逐scale、world与depth variant验证完整
attachments finite/bounded，同时保留exact bits、zero/10x与calibration isolation。没有product JS/GLSL、default/API/resource或owner control delta。

Independent rerun：isolated calibration=`1/1`、controller=`61/61`、A1 pipeline=`7/7`；focused ESLint、Prettier、Markdownlint及`git diff --check`均通过，
只有既有LF/CRLF warnings。`A4-AR-027`关闭；A4 technical status=`approved-for-owner-gate`。Project-owner必须重新检查default canonical与owner-exact
high/mixed、cloud-only/combined、fixed lighting及motion/structure；Architecture先前观察到的extreme high/mixed block structure仍属于manual judgment。
Owner明确通过前不得checkpoint、commit/push或进入A5。

## Project-owner No-Go and supersession — A4-AR-028 — 2026-08-27

The project owner rejected this dual-world candidate after Planar exponential
height fog and volumetric clouds produced a large white background region and
incorrectly layered cloud/fog output. The image is a valid owner-gate failure but
does not establish a technical root cause.

The owner then changed the extension delivery order to Globe-first. This plan is
therefore superseded by
[A4-G Globe reference-first integrated cloud core](2026-08-27-phase-a4g-globe-integrated-cloud-core.md).
The retained product/Spec/Test tree remains uncommitted and unpushed. Planar code
and the reported defect are frozen for the later Planar adaptation track; no
Planar workaround is authorized during A4-G.
