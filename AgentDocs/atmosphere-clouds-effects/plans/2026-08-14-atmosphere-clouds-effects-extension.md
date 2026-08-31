# Extension Plan: Atmosphere, Clouds, and Environment Effects

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner roles: Architecture Agent, Execution Agent
- Created: `2026-08-14`
- Updated: `2026-08-31`
- Branch: `feature/atmosphere-clouds-effects`
- Current phase: `A8-G active; implementation pending`
- Active phase plan:
  [2026-08-31-phase-a8g-globe-qualification-delivery.md](2026-08-31-phase-a8g-globe-qualification-delivery.md)
- Latest completed phase plan:
  [2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md](2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md)
- Architecture decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0041](../../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md),
  [ADR-0042](../../../Documentation/SceneGIS/Decisions/ADR-0042-planar-precomputed-atmosphere.md),
  [ADR-0043](../../../Documentation/SceneGIS/Decisions/ADR-0043-atmosphere-log-depth-and-radiance-mapping.md),
  [ADR-0044](../../../Documentation/SceneGIS/Decisions/ADR-0044-separate-background-aerial-radiance-calibration.md),
  [ADR-0045](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md),
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md),
  [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md),
  [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md),
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Upstream patches: active `SGP-0008`（consume only）、active `SGP-0009`（A5-G surface seam）
- A1 implementation: `completed`
- A2 implementation: `completed`
- A3 implementation: `completed`
- A4 implementation: `A4-G completed; Architecture approved; owner visual gate passed; local checkpoint`
- A5-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A6-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A7-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`

## Goal

在 Cesium 1.144 上建立 SceneGIS-owned、可升级、可测试的现代 outdoor environment rendering stack，同时覆盖 native Globe 与
`SceneGISPlanarWorld`：

- physically based Rayleigh/Mie/ozone atmosphere 与 Sun disk；
- geometry-aware aerial perspective；
- artistic exponential height fog，并能与 physical atmosphere一致合成；
- volumetric cloud density、lighting、weather/noise、ground shadow；
- crepuscular rays / god rays；
- HDR bloom、ghost/halo lens flare；
- temporal stabilization、quality tiers、性能/资源预算与完整 build/package delivery。

“同样支持”定义为两种 World 提供同一 feature family、quality/profile 与 lifecycle semantics；几何模型分别正确，不要求球面与
平面输出相同像素。

Delivery order is Globe-first. The extension completes and qualifies the entire
Globe advanced-rendering stack before reopening Planar adaptation. This changes
phase sequencing, not the final dual-world product goal.

## Stable boundaries

### In scope

- SceneGIS-owned shader、renderer、resource owner、quality profile、temporal state 与 public Controller。
- Globe ellipsoid-radial atmosphere shell/cloud shell 与 planar fixed-axis layered slab/cloud layer。
- shared optical coefficients、Sun/light authority adapter、LUT/noise interfaces、HDR compositor 与 debug/qualification modes。
- depth-aware geometry attenuation、request-render integration、resize/context loss/destroy、WebGL capability guards。
- license/provenance manifest、offline asset generation、dev/release/installed npm/root delivery、中文 direct Test 与 focused E2E。
- 为正确 HDR 时序所必需的最小 upstream `Scene.js` hook，登记为独立 `SGP-0008`。

### Out of scope

- weather simulation、precipitation、fluid dynamics、local cloud authoring editor与 arbitrary local volumetric-light framework。
- 修改 Cesium native `SkyAtmosphere`、`Fog`、`SunPostProcess` 或用 prototype/global/load-order 技巧替换它们。
- raw `Context._gl`、浏览器私有 PBO、外部 `three`/GUI runtime dependency、运行时公网 shader/texture fetch。
- WebGPU renderer、mobile/WebGL1 parity、XR-specific reprojection、full spectral path tracing。
- 复制参考仓库的二进制资源、shader 或代码而不进行独立 provenance/license/format 审计。

## Architecture invariants

1. **Pass graph**：advanced background在 ordinary geometry 前；aerial/cloud/fog/lens optical composite在 resolved scene color/depth
   之后、Cesium built-in bloom/tone mapping之前。Pick/shadow/classification/offscreen pass不得误执行。
2. **Reference frames**：Globe只使用 ellipsoid center/radii/radial altitude；planar只使用 fixed ENU axes、显式 base height 与
   resident planar terrain。不得从数值范围、CRS或 `Camera.positionCartographic` 推断模式。
3. **Ownership**：每个 GPU resource 属于一个 Cesium `Context`与一个 SceneGIS owner；candidate 完整成功后才发布，destroy exactly
   once。不得让 SceneGIS-owned resource 泄漏到 native Scene slots，也不得销毁 caller-owned environment/skybox。
4. **Disabled fast path**：默认关闭时零 LUT/noise/FBO/temporal allocation、零额外 command、零常驻 listener/timer/network，且不改变
   existing Globe/planar pixels。
5. **Time**：只消费 Cesium Clock/ControllerHost明确传入的 simulation time。Cloud animation停止、seek与 request-render语义必须可测，
   不读取 system time 建立第二 authority。
6. **Assets**：runtime asset必须随 dev/release/installed packages可寻址；生成器与 source/provenance可重现，生成物边界明确，禁止依赖
   本机残留或临时 clone。
7. **Failure atomicity**：unsupported capability、shader compile、asset decode、resize或 framebuffer allocation失败不得发布半成品、
   覆盖上一帧稳定资源或静默降为错误坐标模型。

## Phase roadmap

### A1 — Render foundation and dual-world frame contract (`completed`)

实现 approved ADR-0040 的 background + linear-HDR slots、private pipeline lifecycle、Globe/planar reference-frame publication 与
order/pick/resource identity Specs；不增加可见效果或 public API。Implementation、Architecture review与本地checkpoint均已完成；
A2已在独立planning checkpoint中激活。

### A2 — Bruneton atmosphere and aerial perspective (`completed`)

依据
[A2 phase plan](2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)、ADR-0041、ADR-0042与ADR-0043冻结public Controller、
capability/fallback、resource与package contract。Globe交付combined Bruneton LUT physical sky/Sun/aerial；planar交付独立flat-slab
precomputed LUT、multiple scattering与high-altitude-correct aerial。首次Architecture review通过，但项目负责人manual visual gate失败；
首个A2R review target又发现capped-boundary differencing、multiple-order重复累计与irradiance定义blocker。修正版已通过第二次
Architecture review，但第二次owner gate再次因效果弱失败；现场诊断确认log-depth aerial reconstruction与scene-linear radiance mapping
缺失。ADR-0043 A2R2及后续RGBA16F storage-safety修正通过Architecture独立复审后，第三次owner gate又因single scale导致地表被aerial
颜色覆盖而失败；ADR-0044 A2R3的代码、像素和视觉修正及其direct Test lint/format corrections现已通过Architecture独立复核，
第四次project-owner visual gate也已明确通过。本change set形成A2独立本地checkpoint；A3仍需独立planning checkpoint后才能激活。

### A3 — Exponential height fog (`completed`)

依据
[A3 phase plan](2026-08-15-phase-a3-exponential-height-fog.md)与ADR-0045增加single-layer exponential height density、
directional inscattering与atmosphere-aware composition；Globe使用radial height，planar使用fixed Z。复用A2 programs/FBO且保持与native
Fog的明确互斥边界，不新增upstream hook或GPU resource family。

首轮Architecture review发现的Planar float32 analytic-integral cancellation与stale error-bearing artifacts均已execution-fixed并通过独立
Architecture复审。Architecture复跑focused boundary为`41/41`、独立float32最大相对误差为`6.4503e-8`，并检查六张重生成artifact均无error
overlay或stopped/black viewer。A3已`approved-for-owner-gate`；checkpoint与A4仍未激活。

项目负责人已在live dual-world Test上明确报告`通过`。A3 manual visual gate通过，本change set形成A3独立本地checkpoint；A4仍需独立
source-based phase plan与planning checkpoint后才能激活。

### A4-G — Globe volumetric cloud and integrated-media core (`completed`)

The 2026-08-27 project-owner sequencing decision supersedes the dual-world gate
described in the historical A4 record below. The retained uncommitted candidate is
frozen; the active work is the
[A4-G phase plan](2026-08-27-phase-a4g-globe-integrated-cloud-core.md). A4-G judges
only the Globe atmosphere, aerial, radial height fog, atmosphere-derived cloud
skylight, volumetric cloud, depth, and HDR composition. Planar behavior is neither
an acceptance target nor an authorized repair scope.

依据[A4 phase plan](2026-08-15-phase-a4-volumetric-cloud-core.md)与ADR-0046增加single-deck Globe shell / planar slab raymarch、SceneGIS-owned
shape/detail/weather/turbulence/STBN assets、A2 Sun/sky lighting、three fixed quality tiers、caller-owned基础运动与A2/A3-aware cloud composition。
使用one low-resolution two-attachment RGBA16F cloud MRT、depth/front bilateral resolve与two ping-pong full-resolution cloud-only history managers，
复用现有HDR composite；不增加`Scene.js`hook，不提前实现shadow/god rays或A6 stack-wide temporal policy。`A4-AR-002`与product visual已通过第二次Architecture re-review；`A4-AR-006`现以geometry-free structure
capture、clouds-off exact identity和target/ground visibility invariance关闭。Architecture第三次独立复审已批准A4进入owner visual gate；
project owner随后因低质量噪声团块、缺少多云型与Globe/Planar opacity/color不一致拒绝该gate。ADR-0046停止条件触发后已完成A4R修订并获得
project-owner明确授权：新增四种typed morphology preset（内部最多四层）、reference-quality asset/turbulence/STBN authority、bilateral + minimum
cloud-only temporal resolve，以及dual-world matched optical/radiometric contract。A4R执行已激活但仍未checkpoint；A5未激活。

`A4-AR-010/012/013/017`已经关闭。Actual runtime mip failure injection、candidate exact cleanup、conservative max hierarchy、thin/sub-cell
false-negative与compiled scheduler counters通过Architecture独立复核；current tracked/runtime texture count=`5/6`，static GPU=`15,691,189 bytes`，
controller/A1=`63/63`，exact Scene aggregate=`127/127`。Execution已完成Specs-only constant -> ray -> density -> lighting replay、same owner/
independent A/B MRT comparison及完整depth/uniform/program/FBO/texture/sampler/history authority。Low MRT在全部冻结矩阵和fixed real-asset phase逐bit
exact；remaining resolve delta定位为`exp2`实现相关舍入，现由固定有理bilateral weight与统一spatial-only shader-facing state修复。Two clean loads ×
two consecutive diagnostics均both-world exact zero/true。`A4-AR-011/016`已execution-fixed并回到review-ready；owner gate、checkpoint、push与A5
activation继续blocked，等待Architecture独立复审。

Final A4-G source, direct Test evidence and focused automated authority passed
Architecture review. The project owner then reported `通过` on the live Globe
result. A4-G is closed by local unpublished checkpoint
`241de41fc36835114a4e9312ad53ca2ac64407b8`; A5-G is active and Planar adaptation
remains deferred.

### A5-G — Globe cloud shadows, skylight, and crepuscular rays

Completed plan:
[2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md](2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md).

Source discovery已冻结为SceneGIS-owned current-frame Beer shadow atlas、`SGP-0009`最小Globe surface seam、A2 Sun/sky地表lighting，
以及通过既有Cloud distance alpha传递的Bruneton/fog shadow length。不得使用native geometry `ShadowMap`、resolved-scene relighting、radial blur、
独立shadow history或任何Planar实现。

### A6-G — Globe temporal stabilization and performance tiers

在A4R最小cloud-only history之上统一dynamic performance policy、跨effect temporal stabilization与长期quality/resource budgets；不得建立第二套
不兼容的cloud history authority，也不直接采用raw WebGL PBO readback。

### A7-G — Globe HDR bloom and lens flare

增加 bright-source threshold、bloom、ghost/halo/lens artifact与遮挡，保持在 linear-HDR compositor内并与 native `sunBloom`、
`SunPostProcess`明确互斥。

### A8-G — Globe qualification and delivery

完成 Globe visual matrix、performance/resource evidence、build/types/docs/npm/root package、中文 direct Test、focused E2E、upgrade
checklist与manual gate。A8-G不宣称dual-world扩展收口，也不补做前序Globe phase遗留的核心正确性。

### P1+ — Planar advanced-effects adaptation (`deferred`)

Only after A8-G approval does Architecture source-discover the Planar track. It
will begin by reproducing the retained exponential-height-fog plus volumetric-cloud
composition failure, then adapt the accepted Globe optical contracts to fixed-Z
slab geometry without pretending Planar is spherical. Detailed Planar phases are
intentionally not guessed before that entry gate.

## Global acceptance criteria

- Globe 与 planar representative scenes均可独立启用同一 capability family，并以正确 geometry adapter完成地面、空中和近空间视角。
- Atmosphere/cloud/fog/god rays/lens flare在 HDR、depth、Sun/time、native-effect conflict 与 transparency边界上组成一条确定管线。
- Disabled/fallback/warm paths有像素、command、request、allocation与destroy证据；没有 raw GL state leak或永久render loop。
- 每个 quality tier报告确定的 texture/FBO/step/history预算；性能以相对基线和命令/样本预算评估，不建立跨机器绝对 FPS gate。
- 所有 shader、asset、source/license、generated boundary、dev/release/installed packages 与 direct Test均可从干净 checkout复现。
- 所有 upstream-owned hunk有 paired SGP、focused Specs、ADR与独立 removal condition；generated status=`0`。

## Cross-phase risks

- Bruneton高维 LUT 和 cloud 3D/noise asset可能带来数十 MB download/VRAM；必须先测 format、half-float、packing和压缩再定默认质量。
- Cesium depth/OIT/MSAA/HDR framebuffer路径组合复杂；A1必须锁定 resolved input与resize/context lifecycle，不能等到cloud phase补救。
- Planar atmosphere并非 spherical Bruneton公式的参数替换；若 slab approximation缺少物理依据，必须明确标为独立模型与视觉误差，不能宣称
  与 Globe完全物理等价。
- Temporal history与request-render、Clock seek、camera teleport、dynamic resolution互相耦合；A4R只允许ADR-0046冻结的最小cloud-only
  authority，A6必须复用或演进该authority，不得并存第二套history。
- Native Globe sky/fog/sun bloom与 advanced effects双重执行会产生错误能量；public phase必须 fail-fast或提供显式、可恢复的authority切换。

## Phase gate

所有 phase 严格串行。Execution完成实现与最小充分验证后写 review-ready handoff并停止；Architecture review批准、项目负责人要求的
manual gate通过且 Architecture建立独立本地 checkpoint后，才可创建/激活下一 phase。不得合并多个 phase提交。

2026-08-27起串行顺序为A4-G → A5-G → A6-G → A7-G → A8-G → Planar
adaptation。A8-G批准前不得以dual-world parity、Planar owner gate或Planar视觉修复阻塞Globe阶段，也不得提前修改Planar实现。

### A5-G completion — 2026-08-28

All Architecture findings through A5-AR-016 are closed. The project owner
manually rechecked the final Globe result and reported that the effect is
correct. The phase-closing commit then exposed A5-AR-017: the existing SGP-0009
FrameState extension read lacks a local JSDoc type boundary. A5-G remains in its
closing state until that type-only correction passes `tsc` and Architecture
creates the checkpoint. A6-G and Planar remain inactive.

The local structural cast passed independent Architecture `tsc` review and
A5-AR-017 is closed. The phase-closing commit containing this record is the
isolated A5-G checkpoint. A6-G and Planar remain inactive until a separate
Architecture activation.

### A6-G activation — 2026-08-28

Project owner explicitly authorized the next Globe-first phase after the frozen
A5-G checkpoint `3ead681e7854082b6b9d016fdcd9cd8619087102`. Architecture source
discovery found that current A4R history already carries every cloud and A5
shadow-length value but remains same-UV and resets on camera motion. ADR-0048
therefore activates an in-place Globe reprojection of that same history, with no
new GPU resource category, second Beer history, velocity MRT, automatic FPS
controller, A7-G work or Planar change. The active phase plan is
[A6-G Globe temporal stabilization and performance](2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md).

### A6-G completion — 2026-08-28

All Architecture findings are closed and the project owner explicitly passed
the prepared interactive motion gate. The accepted result has no rejected
camera-motion cloud/shadow trail, no settling-frame snap after motion stops,
and one clean `medium -> low` history reset. The phase-closing local commit
containing this record is the isolated A6-G checkpoint. A7-G requires a
separate Architecture source-discovery and activation; A8-G and Planar remain
inactive.

### A7-G activation — 2026-08-28

The project owner explicitly authorized the next phase after passing A6-G.
Checkpoint `201f6edada8fe2738bf9eb3277a30ea3b519e7d7` is frozen. Architecture
re-audited the fixed reference threshold/blur/ghost/halo topology and the live
Cesium 1.144 HDR/postprocess order, then accepted ADR-0049. A7-G uses the
existing `SGP-0008` slot, three SceneGIS-owned color-only framebuffer managers
and explicit resolved-depth/final-HDR Sun visibility. No upstream edit, new SGP,
asset/history, A8-G or Planar work is active. The phase plan is
[A7-G Globe HDR bloom and lens flare](2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md).

### A7-G completion — 2026-08-31

Architecture closed `A7-AR-001` through `A7-AR-006`, and the project owner
explicitly reported `通过` for the final default-5 Bloom/lens image. The accepted
result retains screen-space Bloom across the terrain silhouette and the stronger
reference-balanced halo/ghost field. The phase-closing local commit containing
this record is the isolated A7-G checkpoint and is not pushed. A8-G and Planar
remain inactive until a separate Architecture activation.

### A8-G activation — 2026-08-31

The project owner explicitly requested the next phase and additionally asked
that the release-facing advanced-environment Test be split into multiple pages
with a unified `lil-gui` interface. A7-G checkpoint
`6f70b54c80ce174bf7befe49fe37262230288e61` is frozen. A8-G qualifies the
accepted Globe A2-A7 stack through bounded visual/resource evidence,
development and release builds, types, API docs, installed package, focused
local E2E, upstream audit and an upgrade checklist. It also replaces the
monolithic direct Test with a hub plus separate Globe and retained Planar
pages using the already vendored local `lil-gui`.

No predecessor product path, resource/API contract, upstream seam, generated
file or Planar product behavior is authorized to change. A reproduced product
defect returns to Architecture as a focused finding. The active plan is
[A8-G Globe qualification and delivery](2026-08-31-phase-a8g-globe-qualification-delivery.md).

### A4-AR-018/019 focused closure — 2026-08-27

Execution removed the shared near-sentinel depth epsilon and fixed 250 m cloud binary cutoff. Exact sentinel semantics and bounded footprint occlusion passed focused
controller/A1 `64/64` plus dual-world downward/horizon live continuity evidence. A4 remains active and `review-ready`; Architecture re-review, owner gate and isolated
checkpoint remain mandatory before A5.

### Architecture focused re-review — No-Go — 2026-08-27

Architecture接受shared exact-sentinel classifier及focused controller/A1 `64/64`结果；三张final artifact也未再显示owner原始横向断层。但
`sceneGISSelectCloudSample`在data-dependent invalid-distance early return和`clearDepth`分支之后/之内调用`fwidth(frontDelta)`，使geometry/cloud
silhouette处的derivative落入non-uniform control flow，current GPU通过不能构成portable closure。`A4-AR-020`要求只把derivative computation提升到所有
data-dependent branch之前，保持现有visibility/composition、public/resource/asset contract不变，并复跑既有focused与fixed-view evidence。

Execution已完成该hoist，并以source-order contract、focused controller/A1 `64/64`及final downward/horizon artifacts关闭实现侧证据。Architecture独立复审与
owner re-gate仍为必需；checkpoint、commit/push和A5保持blocked。

### Architecture AR-020 re-review — No-Go — 2026-08-27

Derivative ordering本身已接受，final artifacts也未再显示owner原始横向断层。但Architecture独立controller run为`56/57`：Planar
`logarithmicDepth=true` clear-depth identity在aggregate中发生像素变化，而同一Spec isolated为`1/1`。新增`A4-AR-021`，要求在本controller文件内做
最小ordered bisection并捕获raw/resolved depth、selected program与before/after pixels，定位真实state owner；禁止追加settling frames、放宽equality或重复跑到
绿色。Owner re-gate、checkpoint与A5继续blocked。

### Execution A4-AR-021 closure — 2026-08-27

Ordered isolation排除了相邻六个failure-injection fixtures的owner泄漏。Shared clear classifier现以resolved depth texture raw exact `0/1`作为唯一sentinel
authority，不再要求`czm_readDepth`浮点解码也exact命中；finite non-sentinel仍必定进入geometry path。Failure context覆盖raw/decoded、live program/show flags及
input/output pixels。Exact controller=`57/57`，A4-AR-020 assertion保持通过；A4回到`review-ready`等待Architecture复审，owner re-gate、checkpoint与A5仍blocked。

### Architecture A4-AR-021 re-review — No-Go — 2026-08-27

Current program facts否定“raw与decoded是两个不稳定authority”的根因：linear program无`LOG_DEPTH`，log variant只有`LOG_DEPTH_READ_ONLY`；
`czm_reverseLogDepth`只在`LOG_DEPTH`分支解码，且`DerivedCommand`看到read-only define会返回原program。因此两者的`czm_readDepth`都等于raw，raw-only改写
不改变classifier。Architecture本轮controller虽为`57/57`，但这与修复前已有绿色run同样不能解释先前`56/57`。新增`A4-AR-022`，要求fixed immutable
color/depth input的direct aerial identity fixture定位实际owner；不扩大测试边界。
