# Extension Plan: Atmosphere, Clouds, and Environment Effects

## Metadata

- Plan type: `extension`
- Status: `active`
- Owner roles: Architecture Agent, Execution Agent
- Created: `2026-08-14`
- Updated: `2026-09-12`
- Branch: `feature/atmosphere-clouds-effects`
- Current phase: `P8 completed — Planar cloud material`
- Current gate: P8 source/GPU/visual/performance and full build/types accepted;
  independent local checkpoint. Ground bounce, rays and Moon remain successors.
- Current phase plan:
  [P8 cloud material](2026-09-12-phase-p8-planar-cloud-material.md)
- Latest completed phase plan:
  [P8 cloud material](2026-09-12-phase-p8-planar-cloud-material.md)
- A15 diagnosis:
  [Globe cloud edge temporal stability](../discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
- Previous completed phase plan:
  [P6 cloud sampling](2026-09-12-phase-p6-planar-cloud-sampling.md)
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
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md),
  [ADR-0050](../../../Documentation/SceneGIS/Decisions/ADR-0050-globe-readable-night-skylight.md),
  [ADR-0051](../../../Documentation/SceneGIS/Decisions/ADR-0051-globe-native-moon-composition.md),
  [ADR-0052](../../../Documentation/SceneGIS/Decisions/ADR-0052-planar-integrated-medium-restoration.md),
  [ADR-0053](../../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md),
  [ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)
- Upstream patches: active `SGP-0008` / `SGP-0009`（consume only in A16）、active `SGP-0010`（model source seam）
- A1 implementation: `completed`
- A2 implementation: `completed`
- A3 implementation: `completed`
- A4 implementation: `A4-G completed; Architecture approved; owner visual gate passed; local checkpoint`
- A5-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A6-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A7-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A8-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A9-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A10-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A11-G implementation: `completed; Architecture approved; owner visual gate passed; local checkpoint`
- A12-G implementation: `completed; Architecture approved; owner visual gate passed`
- A13-G implementation: `completed; Architecture approved; owner quality/performance gate passed`
- A14-G implementation: `completed; Architecture approved; owner gate passed`
- A15-G implementation: `completed; bounded quality accepted; local checkpoint`
- A16-G implementation: `completed; Architecture approved; owner gate passed`
- P1 implementation: `completed; delegated visual review; checkpoint 4c847d6def`
- P2 implementation: `completed; source/GPU/visual/build/types accepted; local checkpoint`
- P3 implementation: `completed; source/GPU/visual/performance accepted; local checkpoint`
- P4 implementation: `completed; source/GPU/resource/visual accepted; local checkpoint`
- P5 implementation: `completed; causal GPU/visual/performance/build/types accepted; local checkpoint`
- P6 implementation: `completed; primary sampling GPU/visual/performance accepted; coarse material remains open`
- P7 implementation: `completed; local solar sampling/Beer remainder accepted; coarse material remains open`
- P8 implementation: `completed; authored material, metric phases, physical radiometry and cloud shadows accepted`

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
2. **Reference frames**：Globe只使用 ellipsoid center/radii/radial altitude；planar使用 fixed ENU axes、米制 `height = world Z` 与
   resident planar terrain，环境零高度固定为 Z=0，不增加 base-height offset。不得从数值范围、CRS或
   `Camera.positionCartographic` 推断模式。高度说明见 ADR-0040 的 2026-09-11 clarification。
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

### A9-G — Globe readable night skylight (`completed`)

在A2 physical irradiance domain加入一种固定blue-gray hemispherical night source，并按每个Globe receiver/sample的local solar elevation
从`-6 degrees`到`-12 degrees`平滑接管。Terrain、cloud body/ground bounce/haze与height-fog ambient共享同一source；不增加第二风格、
public mode/property、directional moon、background stars、exposure、Model/3D Tiles relight、resource、upstream seam或Planar执行。Active plan为
[A9-G Globe readable night skylight](2026-09-02-phase-a9g-globe-readable-night-skylight.md)。

### A10-G — Globe native Moon composition (`completed`)

复用Cesium caller-owned native `scene.moon`的texture、physical ellipsoid、Simon1994 position、IAU orientation、Sun-only lighting与Globe
occlusion。既有`SGP-0008` advanced background必须移到native Moon command之前，使Moon在advanced atmosphere之后、ordinary geometry与
pre-tone-mapping HDR effects之前exact-once合成。不得复制Moon实现、增加moonlight、public controller option、asset、SceneGIS GPU resource、
新SGP或Planar执行。Active plan为
[A10-G Globe native Moon composition](2026-09-02-phase-a10g-globe-native-moon-composition.md)。

### A11-G — Globe Moonlight, directional shadows, and lunar surface (`completed`)

A11-G starts from frozen A10-G product checkpoint
`6afba87af181f3cdb7a20aff09b81af11eb302f4`. It adds one shared ECEF
primary-light authority, a stable controller-owned native `DirectionalLight`,
reuse of the Scene-owned native ShadowMap for terrain/3D Tiles/models, existing
SGP-0009 surface publication, and one exact pinned `2048 x 1024` NASA CGI Moon
Kit color asset on the caller-owned native Moon. It adds no second
light/shadow/body, eclipse, displacement shader, new SGP or Planar execution.
Active plan:
[A11-G Globe Moonlight, directional shadows, and lunar surface](2026-09-02-phase-a11g-globe-moonlight-shadow-surface.md).

### A12-G — Globe cloud noise reduction (`completed`)

After accepting A11-G, the project owner requested less fine grain without
rejecting the accepted cloud shapes or world-shadow registration. A12-G starts
from `53465cf9bc8f3af1e935b3225c81364e380ea528` and first adapts the pinned
reference's neighborhood variance clipping in the existing Globe cloud resolve.
It preserves current sampling, geometry/history rejection, public/resource
budgets, A11 lighting/shadows and Planar. Completed plan:
[A12-G Globe cloud noise reduction](2026-09-04-phase-a12g-globe-cloud-noise-reduction.md).

The owner accepts the remaining close-range fine grain. The isolated local
checkpoint is `fd868387d4c38d6faf67a9395434cc9fccc6384c`; no push occurred.

### A13-G — Globe performance investigation and bounded optimization (`completed`)

Preserve the accepted A12 appearance while Architecture investigates the cost
of the current Globe environment stack. First distinguish measured frame/main-thread
behavior from inferred GPU work and produce a source-backed ranking. Only
after Architecture establishes that evidence may this phase plan assign one
concrete bounded optimization to Execution, with correctness, lifecycle and same-workload cost
comparison. No automatic tier reduction, parameter recalibration, renewed
zero-grain target or Planar activation is implied. Active plan:
[A13-G Globe performance](2026-09-04-phase-a13g-globe-performance.md).

Architecture completed bounded effect isolation and two source-backed
proposals. The owner selected exact-zero weather early return as the first
bounded implementation; occupancy-query optimization followed separately.
The helper/Spec change is now code-approved, but medium's cloud-heavier 60 FPS
target remains open. Architecture compared the pinned reference and primary
industry sources and recorded medium 2x2 phased tracing/reconstruction as a
larger candidate. The owner approved both follow-up steps. Equivalent
occupancy-query removal now has independent code approval under ADR-0046; its
35.86/36.24 FPS comparison is inconclusive. Medium 2x2 reconstruction is now
the current Execution assignment under ADR-0048's explicit A13 temporal/depth/
resource amendment, with candidates 1/2 preserved. No existing feature removal,
automatic quality adaptation or accepted 60 FPS result is implied. Architecture
retains diagnosis/design, performance measurement, independent review and
visual gate.

The owner accepts the final corrected result on 2026-09-04. All seven findings
are fixed/code-approved; the independent local checkpoint contains candidates
1/2/3, bounded GPU/visual/cost evidence and their records. Residual fine grain
and workload-dependent cost are accepted limitations, not universal performance
claims. A newly reported clock-linkage issue is outside this phase.

The isolated local checkpoint is
`ccd5affdc426016215bb443664dc653bba945d94`; no push occurred.

### A14-G — Globe sample Cesium-clock linkage (`completed`)

Connect the existing caller-owned cloud simulation time to the Globe sample's
Cesium Clock, including playback, pause, multiplier, reverse and paused seeks.
Preserve a deterministic epoch and manual time offset without modifying
product shaders, wind/material parameters, render-frame sampling, history
policy, API or Planar. Native Clock remains the only progressing time source;
the page owns and releases its listener. Details and the bounded E2E gate:
[A14-G Globe clock linkage](2026-09-04-phase-a14g-globe-clock-linkage.md).

Architecture independently approves the sample/E2E implementation and confirms
native playback and paused scrubbing on the current owner page. Its original
camera, parameters and 1x paused time are restored. The owner explicitly accepts
the linkage on 2026-09-11. The commit containing this acceptance record is the
isolated A14 checkpoint; no next phase is active and no push accompanies closure.

### A15-G — Globe cloud edge temporal stability (`completed`)

The owner reports visible cloud-edge jitter after A14. The
[source/GPU diagnosis](../discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
finds frequent history rejection at stochastic cloud-hit/transparent transitions
in the paused medium view. The proposed goal is continuous fringe RGB and
transmittance reconstruction while preserving opaque occlusion, motion
correctness and the existing time authority.

Entry requires a source-based phase plan and ADR-0048 amendment defining
transparent-sample validity, reprojection anchors and temporal confidence.
Exit requires discriminating GPU regressions, resource checks, bounded cost,
and owner acceptance of stationary and moving edges without unacceptable
trails. The owner authorizes implementation on 2026-09-11 through the
[active phase](2026-09-11-phase-a15g-cloud-edge-stability.md). High/low,
material/lighting, A14 and Planar remain outside the correction.

### A16-G — Model physical lighting and native shadow ownership (`completed`)

Extend the existing physical source and Beer atlas to native Model PBR direct
and diffuse sky lighting through SGP-0010. Retain native material/specular IBL
ownership. Remove A11's automatic Moon-only shadow policy and extra control;
the owner requires Cesium's existing switches exclusively. Enter from A15
`4d1d122b1c`; exit on focused GPU/lifecycle/native regression, bounded cost and
owner model-view acceptance. See the [A16 phase](2026-09-11-phase-a16g-model-environment-lighting.md)
and [ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md).

The owner explicitly accepts the corrected model result on 2026-09-11. Focused
GPU/native/lifecycle checks, full build and types pass. Architecture closes the
phase with the recorded +0.281 ms isolated median model-draw cost and retained
native specular-IBL limit. The commit containing this record is the independent
local checkpoint; P1 stays deferred and no next phase is activated.

### A17-G — Far cloud depth continuity (`completed`)

Use precise native raw-depth interfaces in all three Globe cloud consumers
to remove reproduced false-occlusion bands at large far/near ratios. Preserve
Planar, temporal policy, sample/resource budgets and A16. The
[A17 phase](2026-09-11-phase-a17g-far-cloud-depth.md) requires discriminating
GPU output, foreground behavior, bounded cost and owner judgment.

Implementation and Architecture code review are complete. Two focused GPU
selections and the corrected high/medium reproduction pass. The owner confirms
“通过” on 2026-09-11. Architecture closes A17 with the recorded bounded
final-composite cost and verification limits. The commit containing its
acceptance record is the independent local checkpoint; no push or next-phase
activation accompanies closure.

### P1 — Planar integrated-medium restoration (`completed`)

P1 was initially activated from frozen A10-G checkpoint
`6afba87af181f3cdb7a20aff09b81af11eb302f4` and requalifies the retained
fixed-Z atmosphere/aerial/height-fog/cloud composition. The historical white-fill
owner rejection remains regression motivation but not an assumed current root
cause. Execution must first add one actual-GPU final-composition authority over
identical baseline/aerial/fog/cloud/combined inputs and then correct only the
first proven Planar product divergence. Before review, the project owner
corrected the route to A11-G. The P1 design and unaccepted candidate are
preserved but deferred outside committed delivery. Deferred plan:
[P1 Planar integrated-medium restoration](2026-09-02-phase-p1-planar-integrated-medium-restoration.md).

The owner resumes Planar work on 2026-09-11 after A17 `3cdd2958d1`. Current
source, preserved candidate and direct visual behavior are rechecked under the
same fixed-Z/no-new-resource contract. The old deferral is historical; current
composition and cloud-deck quality evidence determine P1 closure.

Three Planar depth expressions are now corrected against actual-GPU evidence;
composition, native opaque depth and MRT/lifecycle regressions pass. Owner
judgment remains pending on the basic-medium candidate with disclosed coarse
material. The authorized September 11 amendment removes the old 60–100 km fade,
uses direct metric Z and pixel footprint filtering, and adds Planar camera/wind
reprojection with history clipping. Architecture accepts this foundation under
the owner's delegated visual-review authority; the commit containing this
record is its independent checkpoint.

### P2 — Planar physical lighting and cloud shadows (`completed`)

P1 checkpoint `4c847d6def` closes the foundation. Current-source discovery
activates [P2](2026-09-11-phase-p2-planar-lighting-cloud-shadows.md) under
ADR-0055: shared Beer resources with fixed-Z producer/receiver geometry,
Planar surface and native PBR lighting, precision and lifecycle qualification.
The owner delegates visual acceptance and continuation after verified stages.
All planned P2 work and Architecture review are complete. The independent
commit containing this closure is the P2 checkpoint; review retains remaining
cloud morphology, rays, HDR and night/celestial scope for successor phases.

### P3 — Planar HDR bloom and lens artifacts (`completed`)

P2 checkpoint `b09a3d5ce2` precedes activation. P3 reuses the existing screen-space
HDR chain with explicit Planar Sun/depth gates and unchanged resource contracts;
see the [phase plan](2026-09-11-phase-p3-planar-hdr-bloom-lens.md).
GPU, lifecycle, delegated visual and performance review pass, including the
reproduced Planar Sun-footprint correction. This closure forms the P3 checkpoint.

### P8 — Planar authored cloud material (`completed`)

P8 follows the completed P4–P7 corrections and P7 checkpoint `3a93585efd`,
reusing reference assets and density with metric XY/absolute Z, coherent shadow
support and physical cloud radiometry. Both experimental density and brightness
defaults become 1. Seventeen focused cases, visual review, bounded cost and full
build/types pass. See [P8 plan](2026-09-12-phase-p8-planar-cloud-material.md) and
[review](../reviews/2026-09-12-p8-planar-cloud-material.md).

### P9+ — Remaining Planar advanced-effects adaptation (`deferred`)

Ground-bounce parity, crepuscular rays and directional Moon remain successors.
Finite-resolution cloud grain is a retained quality limit. Select the next
bounded phase from current-source evidence after the P8 checkpoint. Preserve
fixed-Z geometry, manual Planar celestial directions and native shadow controls.
Each phase retains separate validation, review and local checkpoint; no owner
visual gate is pending and no successor is activated by this record.

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

2026-09-02项目负责人完成A10-G后明确把A11-G作为下一Globe阶段。当前串行顺序为
A4-G → A5-G → A6-G → A7-G → A8-G → A9-G → A10-G → A11-G。
2026-09-04负责人验收A11-G后选择先处理Globe云颗粒，顺序追加A12-G。
P1及任何Planar A5+能力继续延期，不能由Globe阶段完成自动激活。

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

### A8-G completion — 2026-09-02

Architecture closed all A8 findings through `A8-AR-034`, including reference
Globe cloud material, physical cloud transport, fixed-ECEF Beer shadow
production/reception, temporal Beer resolve, package delivery and direct Test
qualification. The project owner explicitly passed the final fixed-time
camera-pitch cloud-shadow gate. The phase-closing local commit containing this
record is the isolated A8-G checkpoint and is not pushed. A successor Globe or
Planar phase requires a separate Architecture activation.

### A9-G activation — 2026-09-02

The project owner explicitly chose to continue the Globe-first track after the
accepted A8 result and requested only one `readable` night style. A8-G checkpoint
`eee8a8bbb241c2e71dc68397a6b324faa670862c` is frozen. Architecture source
discovery found that terrain, cloud, cloud haze and height-fog ambient all lose
their physical irradiance at night, while the existing `SGP-0009` seam already
provides every input needed for one fixed shader-domain source.

ADR-0050 therefore activates a local-radial blue-gray hemispherical irradiance
transition from `-6 degrees` to `-12 degrees`, shared by the accepted Globe
ambient consumers. No public API, mode, uniform, resource, upstream hunk, SGP,
Model/3D Tiles, moon/stars/exposure or Planar behavior is active. The phase plan
is
[A9-G Globe readable night skylight](2026-09-02-phase-a9g-globe-readable-night-skylight.md).

### A9-G completion and A10-G activation — 2026-09-02

The project owner explicitly accepted the corrected A9 readable-night
brightness. Architecture closed A9-G in local unpushed checkpoint
`f8d655ab75baf95b1421eddb35489a6a9d9dd62e`. The owner then requested the
native Moon as the next Globe feature.

Architecture source discovery found that CesiumWidget already creates a native
`Moon` for the WGS84/default-skybox path, but the advanced sample hides it and
the current `SGP-0008` background executes after the native Moon command. ADR-0051
therefore activates A10-G to move that existing background slot before the
caller-owned Moon, permit the native Moon in Globe conflict validation, and add
one direct fixed Moon observation. Moonlight, new assets/resources, public API,
new SGP and Planar behavior remain out of scope.

### A10-G completion — 2026-09-02

Architecture independently approved the exact-once native Moon composition,
Moon-only Globe conflict exception, unchanged Planar rejection, existing
`SGP-0008` ownership and zero SceneGIS resource/API delta. The project owner
then explicitly passed the fixed native Moon visual gate. A10-G is complete;
the phase-closing local commit containing this record is its isolated unpushed
checkpoint. No successor phase, moonlight, Moon shadow, alternate Moon asset or
Planar work is activated by this closure.

### P1 activation — 2026-09-02

After the project owner explicitly requested the next phase, Architecture froze
A10-G checkpoint `6afba87af181f3cdb7a20aff09b81af11eb302f4` and reopened the
deferred Planar track. Current source and direct-page isolation do not reproduce
the historical full-screen white fill exactly; the page also contains intentional
plane/box geometry that must be separated from effects deltas. ADR-0052 therefore
activates an evidence-first P1 final-composition qualification before any product
repair. Globe A1–A10, public API/defaults, resources, upstream paths, SGP-0008/
0009 and all Planar A5+ behavior remain frozen.

### A11-G route correction and activation — 2026-09-02

Before P1 entered review or owner acceptance, the project owner clarified that
the next product phase must implement Globe Moon light, directional Moon
shadows on terrain/3D Tiles/models and a higher-quality Moon surface. P1 is
deferred with its unaccepted candidate outside committed delivery; frozen A10-G
checkpoint `6afba87af181f3cdb7a20aff09b81af11eb302f4` remains the product base.

Cesium source discovery confirms a single native scene light and ShadowMap
already cover Globe, 3D Tiles and Models, while native `Moon.textureUrl` permits
a color-resource replacement without copying the body. ADR-0053 activates one
shared ECEF primary-light publication, stable snapshot/restore ownership,
existing SGP-0009 surface uniforms and exact pinned NASA CGI Moon Kit color
asset. A second light/shadow/body, eclipse, displacement/normal shader, new
SGP, Planar execution and unrelated A1-A10 recalibration remain forbidden.

## A11-G project-owner acceptance — 2026-09-04

The project owner explicitly passed the prepared A11-G visual gate, including
the low-angle cloud-shadow and crepuscular-ray correction. Architecture closes
A11-AR-001 through A11-AR-007 with no open finding. The exact final Beer-atlas
GPU filter was independently verified as `1/1 SUCCESS`; the isolated lifecycle
filter also passed `1/1`. Earlier accepted build, type, asset/package and native
shadow evidence is retained without repeating unrelated validation.

The phase-closing local commit containing this record is the isolated A11-G
checkpoint. Current-phase upstream changes are confined to
`packages/engine/Source/Scene/GlobeSurfaceTileProvider.js` under existing
`SGP-0009`; generated changes and new SGP count are zero. No push, successor
implementation or Planar activation is included. The owner's newly reported
cloud grain is a separate follow-up, not a reopening of the accepted light and
shadow result.

## A12-G execution candidate — 2026-09-04

The bounded Globe variance-clipping candidate is implemented within the
existing resolve and existing history fixture. No predecessor light/shadow,
material, sample, resource, API or Planar boundary changed. A12 remains active;
Architecture review remains pending. The preserved owner-view observation
still shows fine grain, so the bounded candidate is not claimed visually
successful. See the A12 phase plan and review for exact evidence.

## A12 correction execution — 2026-09-04

A12-AR-001 now uses RGB alone for the coherent clipping fraction and clamps
transmittance independently. The existing actual-GPU history fixture retains
the outlier/uniform/edge/motion checks and proves the recorded alpha-only ULP
case returns RGB `0.3125` and alpha `0.75`, not RGB `0.25`.

A12-AR-002 setup/oracle corrections stay in the existing Spec. The Beer
fixture now passes the same fixed time to controller update and Scene render.
The Moon oracle uses rotation-invariant inertial-frame phase instead of
ICRF-readiness-dependent epoch goldens, retaining the mixed-frame mutation
and existing tolerances. The readable-night probe now distinguishes local
`+Z` from its virtual Globe point's `+X` zenith; its controlled surface atlas
uses density `0.0001` so the 6 km zenith path has OD about `0.6`, rather than
OD `60` erasing both direction witnesses in half-float output. Product
lighting/shadow code is unchanged.

All four corrected isolated fixtures passed sequentially on Chrome 152.
A12-AR-003 remains unproven: this correction turn's browser discovery returns
no accessible tab. No replacement page was opened and no refresh, camera,
parameter or live-state mutation was performed. The earlier grain observation
is not superseded by a new visual claim. Resource, lookup, API, upstream,
generated and SGP deltas remain zero; the candidate stays uncommitted/unpushed.

Final controller qualification is `78 SUCCESS, 1 FAILED` (79 executed), not a
pass despite shell exit 0. The remaining unchanged
`loads exact Globe assets and publishes the height/time/projection render matrix`
fixture supplies its selected times only to Scene rendering, not to its
directly connected controller inside the loop; its Sun-direction-change
assertion fails. It is outside the three-fixture repair scope and is left
untouched for Architecture. No rerun or scope expansion. A12-AR-002/003 remain
open; exact commands and failure are appended to the A12 review.

## A12-AR-002 final Spec follow-up execution — 2026-09-04

Added only the two authorized `effects.update` calls before the existing
selected-time and final Orthographic renders. No assertion, parameter or
product change. Exact command
`npm run test -- --includeName "loads exact Globe assets and publishes the height/time/projection render matrix"`
passed `1/1 SUCCESS` on Chrome 152 (36.942 s Spec). The previous aggregate
remains `78 SUCCESS / 1 FAILED`; no new aggregate or other fixture was run.

A12-AR-003 remains open: original-tab discovery still returns zero accessible
tabs. No replacement page, reload or live-state mutation; no visual benefit
is claimed. New executable delta is only these two Spec lines.
Upstream/generated/new SGP/API/resource/Planar deltas are zero. Shared
candidate remains uncommitted/unpushed and returns for Architecture review.

## A12-AR-003 execution access limitation — 2026-09-04

After Architecture reported successful access to the original tab, Execution
performed the required single read-only inventory. Its own browser surface
still returned `tabs=[]`. Thus Architecture's successful access does not
currently extend to this execution context. No tab was selected, opened,
refreshed or polled again; no camera, time, parameter, loop or shader changed.
Current-state capture, loaded-shader verification and a valid same-state
comparison/drag observation could not be performed. A12-AR-003 remains open,
with no visual benefit or acceptance claimed. A12-AR-001/002 stay frozen.
This update changes records only; no tests, product edits, commit or push.

## Candidate 1 execution — 2026-09-04

Implemented only the assigned exact-zero weather return in
`SceneGISGlobeCloudDensitySampleInternal`: after the layer loop,
`all(equal(weatherDensity, vec4(0.0)))` returns density `0.0` and gradient
`0.5`. The positive path and filtering are unchanged; no new threshold,
sample advance, occupancy change or alternate optimization.

The existing coverage/extinction Spec now compares compiled product and
full evaluation (only this return block removed) over one four-column,
two-row input: zero, positive, zero and formula-derived small positive weather.
RGBA records primary density/gradient and shadow-only density/gradient.
The outputs match exactly; empty columns return `0/0.5/0/0.5`.
At layer height fraction `0.5`, zero weather texels yield
`weatherDensity=(coverage*heightScale-0.4)/0.6`. Choosing coverage for
`weatherDensity=2^-12`, shape/detail `1`, gives final density `2^-14`;
it remains positive and matches the independent formula within `1e-7`.
Temporary programs/textures are destroyed. Original Planar, coverage,
extinction and MRT assertions remain; no standalone Spec was added.

Sequential isolated results, Chrome 152:

- `npm run test -- --includeName "keeps compiled coverage monotonic and isolates material density from extinction"`:
  `1/1 SUCCESS` (32.847 s Spec).
- `npm run test -- --includeName "marches controlled cloud density into the bounded Beer atlas on the actual GPU"`:
  `1/1 SUCCESS` (50.761 s Spec); this fixture is unchanged.

The first Spec lint caught a loop closure over mutable `scene`; capturing its
local `context` fixed that warning without changing inputs/assertions.
Spec ESLint then passed. These test durations are not performance evidence.

New executable changes are confined to the one Globe GLSL and its existing
Spec. The accepted Test FPS line and Architecture/role records are preserved.
Upstream/generated/new SGP/API/program-category/command/texture/FBO/history/
GPU-byte/Planar deltas are zero. No owner browser operation, service restart,
aggregate/package/generator/type/release run, commit or push. Architecture
performance measurement, independent review and visual judgment remain pending;
no speedup or owner acceptance is claimed.

## Candidate 2 execution — 2026-09-04

The existing R8 base-copy loop now derives strict positivity from the actual
copied byte, including byte 1; non-R8 data is ineligible. The file-local
creation result carries the proof to the SceneGIS candidate resource record.
Successful publication swaps texture and proof together; the private
`u_cloudOccupancyAllPositive` callback reads only current resources. No second
scan, Texture3D metadata, retained buffer, independent cache or warm rescan.

The Globe helper preserves start/end/middle heights and active-layer overlap.
Only an overlapping layer may return 1 before query-only offset/coordinate,
scale, LOD and texture work. No overlap returns 0; false and Planar paths
retain their algorithms. Occupancy textures, max mips and upload padding remain.
Candidate 1 is untouched.

Only the two assigned existing fixtures are amended. Occupancy evidence uses
published all-byte-1 R8, one-zero replacement and reverse replacement, checks
Planar ineligibility, and compares compiled inside/below/above bounds exactly
with a forced-query oracle. Existing mip conservatism and thin-data integrated
MRT assertions remain. Failure evidence retains Planar checks and injects a
Globe weather mip failure after occupancy allocation, checking last-good
texture/proof/uniform identity, live resources and candidate cleanup.

Executable scope is the private renderer, shared volumetric cloud GLSL and
existing Spec. Persistent GPU bytes, textures/FBOs/history, program categories,
commands/passes, public API/default/range, upstream-owned/generated/new SGP and
Planar deltas are zero. CPU state adds one resource-owned boolean and the
shader one private boolean. SGP-0008/0009 remain consume-only. No owner browser
operation, service restart, candidate-3 implementation, commit or push.
Architecture performance/visual review remains pending; no gain or owner
acceptance is inferred.

### Focused validation

Sequential final-source commands on Chrome 152, each run once:

- `npm run test -- --includeName "uploads conservative occupancy mips and matches exhaustive density support"`:
  `1/1 SUCCESS`, 49.699 s Spec, exit 0.
- `npm run test -- --includeName "destroys candidate 3D textures when cloud mip generation fails"`:
  `1/1 SUCCESS`, 21.801 s Spec, exit 0. Globe failure destroys four candidate
  3D textures, three 2D textures, seven program references and one VA/buffer;
  the published generation stays live. These durations are not performance data.
- `npx eslint` on the assigned renderer and Spec: exit 0.
- Direct `npx prettier --check --ignore-path .gitignore` on
  `SceneGISVolumetricClouds.glsl`: exit 1, no parser could be inferred.
  Repository Prettier has no GLSL parser; no plugin/config/dependency was added.
  GLSL uses existing indentation and passes the actual shader compilation.

No additional fixture, aggregate, browser/performance, package, generator,
type or release matrix was run. Implementation has no design deviation;
GLSL Prettier support is the sole tooling limitation. Candidate 2 is submitted
for Architecture review, not accepted; candidate 3 remains separately assigned
only after Architecture design and candidate-2 closure.

Final scoped Prettier (renderer/Spec and all six records), six-record
Markdownlint and `git diff --check` pass; diff reports retained LF/CRLF
warnings only. Initial appended duplicate blank lines were removed by scoped
Prettier formatting. GLSL parser unavailability above remains explicit.

## A13 candidate 3 execution blocker — 2026-09-04

Medium phased tracing is implemented but not qualified. The sole new GPU
fixture still reports NaN RGB on history rejection; Architecture direction is
requested before changing frozen A12 clipping or continuing validation. Exact
evidence is in the [A13 review](../reviews/2026-09-04-a13g-globe-performance.md#candidate-3-execution-blocker--2026-09-04).
Candidates 1/2 stay closed for code review. A13 performance/visual acceptance
and checkpoint remain pending; no next-phase or Planar action.

The blocker is now independently diagnosed as
[A13-AR-001](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-001--inverted-finite-variance-interval).
A bounded variance-interval arithmetic correction and finite-history evidence
are assigned within candidate 3; this does not activate a new phase or change
the accepted quality policy. Performance and owner gates remain pending.

Execution's interval correction passes the new finite-history and retained
history fixtures. Two lifecycle/resource fixture setup/API errors still prevent
candidate qualification; see the [A13 results](../reviews/2026-09-04-a13g-globe-performance.md#final-focused-command-results).
No phase closure, performance claim, commit or push.

Architecture confirms A13-AR-001 fixed and assigns
[A13-AR-002/003](../reviews/2026-09-04-a13g-globe-performance.md#current-spec-only-follow-up-assignment)
within the existing Spec. Product source is frozen; only three affected
qualification fixtures need rerun. A13 remains active with performance/owner
gates pending.

Execution's Spec-only follow-up passes the medium phased/cut and lazy-resource
fixtures. Candidate cleanup is still unqualified (zero destroy calls under
the retained global update injection); see the [review results](../reviews/2026-09-04-a13g-globe-performance.md#spec-only-follow-up-results).
A13-AR-003 and overall qualification remain open. No product or phase change.

Independent review closes A13-AR-002. The remaining Spec injection hits native
GlobeDepth instead of the cloud candidate; the bounded
[A13-AR-003 continuation](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-injection-continuation)
targets the intended candidate and retains the current failure policy.
Only that fixture needs rerun; performance/owner gates remain pending.

The targeted failure fixture passes, completing the assigned focused evidence
with the reused phased/lazy/history passes. See the [execution handoff](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-execution-result--2026-09-04).
Independent review and performance/visual qualification remain pending; no
phase closure, checkpoint or next-phase action.

## A13 current reconstruction correction — 2026-09-04

Architecture closes A13-AR-003 and completes the first same-state candidate-3
medium cost observation: 31.89 -> 59.80 FPS. Visible alternating cloud holes
over continuous sloped terrain nevertheless block acceptance. The bounded
[A13-AR-004 assignment](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004--continuous-sloped-receivers-rejected-as-depth-edges)
corrects local receiver compatibility without changing the approved medium
sampling/resource policy. A13 remains active; no owner gate, checkpoint,
next-phase or Planar work is authorized.

The bounded A13-AR-004 correction passes its fixed sloped-plane/mutation and
retained history fixtures; [execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004-execution-result--2026-09-04)
is review-ready. No resource-policy change or live performance claim accompanies
it. Architecture/owner qualification and phase checkpoint remain pending.

Architecture now closes all A13 findings and code-approves candidates 1/2/3.
Corrected medium reaches 59.96 FPS in the retained same-view comparison, with
the comb removed; [independent closure](../reviews/2026-09-04-a13g-globe-performance.md#independent-candidate-3-closure-and-owner-handoff)
records bounded motion observations and remaining limits. A13 awaits explicit
owner medium visual/performance acceptance, not more coding. No phase
checkpoint, push, next-phase or Planar work is authorized yet.

The subsequent owner report confirms the speed improvement but rejects the
increased medium shimmer. The approved
[A13-AR-005 assignment](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005--interpolation-support-collapses-history-statistics)
separates clipping statistics from phased interpolation without changing the
sampling budget or accepted occlusion/history contracts. A13 remains active;
prior findings remain fixed. Architecture owns analysis/review and Execution
only the bounded resolve/Spec correction. No checkpoint or next-phase work.

The bounded A13-AR-005 implementation now separates statistical support from
current interpolation, with no resource/API delta. Its fixed four-phase GPU
witness passes; [execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-execution-result--2026-09-04)
records the mutation, unchanged history-off output and geometric exclusion.
This is not owner shimmer acceptance or a new performance claim.

Architecture independently closes A13-AR-005 for code. The
[bounded fresh-page review](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-independent-review-and-bounded-live-observation)
records 53.70 FPS under different conditions from the prior comparison and
leaves dynamic quality/sustained performance open. Execution holds the same
uncommitted candidate; A13 is not completed and no next phase is activated.

The owner then reports horizontal cloud gaps during rotation, specifically in
medium. Architecture reproduces a current-frame failure with history disabled:
the low trace and full resolve disagree on the same finite receiver distance
after a lossy log-to-perspective-depth round trip. The existing precise Cesium
overloads remove this discrepancy and the gaps in a temporary GPU diagnostic.
[A13-AR-006](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006--lossy-log-depth-round-trip-erases-medium-clouds)
therefore reopens candidate 3 for a bounded two-shader/Spec correction, not a
new optimization strategy. A13-AR-001..005 stay fixed. The sampling budget,
occlusion tolerance, temporal policy, resources and other tiers remain frozen;
Architecture retains live quality/performance review. No checkpoint or next
phase is authorized.

A13-AR-006 execution applies the existing native raw-depth overloads only to
phased Globe reconstruction, preserving resource and temporal contracts.
[Execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-execution-result--2026-09-04)
records the fixed analytic log-depth regression and native Orthographic linear
witness. This is a bounded code handoff, not phase or owner acceptance.

A13-AR-007 execution implements the prescribed phased cloud-depth support
without changing receiver precision or resource budgets. The existing fixture
uses actual jittered product estimates and a known-color error oracle; see
[execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-execution-result--2026-09-04).
Live quality/cost and owner acceptance remain open; no phase advance is made.

## A14-G execution handoff

Following the frozen A13 checkpoint, the Globe sample now maps native Cesium
Clock time to caller-owned cloudTime with a fixed epoch and editable offset.
The single focused Chromium E2E and scoped static checks pass; see
[A14 execution evidence](../reviews/2026-09-04-a14g-globe-clock-linkage.md#execution-result--2026-09-04).
Only sample/E2E assembly and five records change; no product, GPU resource or
upstream delta. Independent review/owner observation remain pending, with no
commit, push or next-phase activation.

## A14-G project-owner acceptance — 2026-09-11

The owner explicitly accepts A14. Architecture closes the phase after the
existing independent code approval, focused Chromium E2E (1/1, 34.7 s) and
live playback/paused-seek observation. These results are reused without a
new GPU/browser run. The earlier A14 pending-owner and execution-hold states
are superseded; see the [final review record](../reviews/2026-09-04-a14g-globe-clock-linkage.md#project-owner-acceptance--2026-09-11).

The isolated checkpoint contains the two approved sample/E2E paths and five
records. Upstream-owned files, generated files and new SGP are all zero.
Existing large-date validation and temporal cuts remain accepted limits.
This closure neither pushes the branch nor activates a successor; P1 and
later Planar effects remain deferred.
