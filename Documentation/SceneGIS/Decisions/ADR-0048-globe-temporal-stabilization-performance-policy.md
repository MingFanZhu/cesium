# ADR-0048：Globe Temporal Stabilization and Performance Policy

## 状态

- Status：`accepted; A6-G completed`
- Date：`2026-08-28`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-28-phase-a6g-globe-temporal-stabilization-performance.md`
- Related patches：active `SGP-0008`（consume only）、active `SGP-0009`（unchanged）
- Builds on：ADR-0040、ADR-0046、ADR-0047

## 上下文

A4R已经拥有一组SceneGIS-owned cloud history：两个full-resolution ping-pong
framebuffer managers，每个保存premultiplied cloud radiance/transmittance与
mean/front/scene distance、validity和A5 shadow length。当前resolve只在同一
screen UV读取history，并把camera/reference frame写入compatibility key，因此任何
camera motion都会退回spatial-only；A5的atmosphere、height fog与cloud-local haze虽
消费同一个resolved shadow length，却不能从camera-motion temporal stabilization受益。

固定`three-geospatial`参考使用velocity attachment、previous view/projection、
variance clipping与16-phase temporal upscale；其Beer shadow又建立独立temporal
targets。固定Cesium fork还包含raw WebGL/PBO final-frame TAA。这些实现证明了
reprojection方向，但第三Cloud MRT、第二套shadow history、16帧收敛与raw `_gl`/PBO
都不符合SceneGIS现有capability、request-render与resource ownership边界。

参考quality presets本身是caller-selected static profiles，并没有跨机器FPS反馈控制。
SceneGIS也不能从system time、timer或持续render loop建立另一套性能authority。

## 决策

### 单一performance authority

现有public `cloudQuality="low"|"medium"|"high"`继续是Globe cloud、Beer atlas与
resolve的唯一performance tier。它可由caller在运行时warm切换，因此这里的
dynamic policy指caller-owned动态档位选择，不是renderer自主测FPS或猜测camera运动后
降档。A6-G不增加public option/property，也不改变default `"medium"`。

固定profiles保持：

| Tier     | Cloud scale | Primary/fine/Sun | Detail | BSM cascades/tile/steps |
| -------- | ----------: | ---------------: | :----: | ----------------------: |
| `low`    |     `0.375` |         `32/1/2` |  off   |              `2/256/25` |
| `medium` |       `0.5` |         `64/4/3` |   on   |              `3/512/50` |
| `high`   |      `0.75` |         `64/4/4` |   on   |              `3/768/50` |

Quality mutation必须继续failure-atomic地resize既有targets并exact invalidate同一
cloud history。不得增加wall-clock采样、timer/listener、automatic tier downgrade、
额外settling render或permanent render loop。性能验收使用相同设备/场景的相对GPU
command与configured sample budget，不建立绝对FPS gate。

### 演进现有cloud history，不新增history

A6-G只演进ADR-0046已经批准的两个ping-pong history managers：

- 不增加texture、attachment、framebuffer、pass、command或program category；
- 不增加velocity MRT。Resolve用现有mean/front/scene distance、当前camera ray和
  CPU保存的previous successful Globe frame重建world position与previous UV；
- previous state只包含可复用的camera position/direction/up/right、projection、frustum、
  cloud offset/time与必要的continuity scalars，不逐帧分配数组、对象或string key；
- valid cloud用opacity-weighted mean distance建立radiance history anchor，并保留front与
  scene-position compatibility；invalid cloud的shadow length以finite scene position为
  anchor，exact-clear ray使用direction reprojection；
- continuous `cloudTime`的cloud-body anchor补偿caller-owned wind advection，不能读取
  system time；
- history color/transmittance先限制到当前3×3 spatial neighborhood的finite range，再按
  reprojected position、scene edge、validity与radiometry compatibility决定是否blend；
- A5 packed alpha必须先解码。Cloud validity和shadow length分别选择、过滤、再repack，
  不直接插值packed bits，也不因invalid cloud丢弃positive length。

Globe Aerial、Bruneton sky/point transport、A3 directional fog与cloud-local haze继续只
读取同一个resolved Cloud attachment，因此自动共享这次stabilization。A5 current-frame
Beer surface atlas继续使用已接受的texel snapping、3×3 Beer PCF与cascade overlap；没有
已复现的剩余surface-shadow temporal defect，A6-G不为它建立独立history。

### Stationary、continuous与cut

History只由成功执行的Cloud resolve推进。每个rendered Globe frame只能属于以下一种：

1. `spatial-only invalid`：没有previous successful frame，或发生既有resource/config/
   enable/disable/context/quality/preset/support/log-depth discontinuity；
2. `spatial-only stationary`：camera、frustum、Sun与`cloudTime`均与previous successful
   frame相同；不得对同一current spatial result反复积累；
3. `reprojected continuous`：至少一个view/time input变化且通过continuity bounds；
4. `spatial-only cut`：任何continuity bound失败，必须在history sampling前invalidate。

Globe continuity bounds冻结为：same projection；camera translation不超过`25 km`；
direction与up dot都不小于`cos(10°)=0.984807753`；每个frustum edge相对previous
horizontal/vertical span的变化不超过`25%`；`abs(deltaCloudTime) <= 1 s`；Sun direction
dot不小于现有`0.99999`。Non-finite input直接cut。边界来自当前cloud visible end
`100 km`的四分之一与可重投影的小角度运动域，不是retry/fallback；超界first frame就是
完整current spatial output。

Projection/world/mode、viewport、quality、preset、cloud support/material/wind/radiance、
log-depth、asset generation、enable/disable/connect/disconnect/retry/context loss/destroy
继续沿用ADR-0046的exact invalidation。Planar保留A4R现有same-UV/history行为；A6-G不
修改或重新验收Planar。

### Resource and hot-path budget

A6-G的persistent GPU delta必须为零。Cloud仍是one low-resolution two-attachment
RGBA16F MRT、two full-resolution two-attachment history managers与one resolve command；
A5 BSM仍是one current-frame RGBA16F atlas/FBO/program。Low/medium/high BSM bytes保持
`2,097,152 / 8,388,608 / 18,874,368`，command与march limits保持上表。

Renderer用复用的structured compatibility snapshot替换当前每帧array/map/join构造的
string key。CPU previous-frame state也必须预分配并原地更新。A6-G不以隐藏sample reduction、
shader recompile、resolution oscillation或额外GPU readback换取性能数字。

## 最小充分验证

1. 一个amended actual-GPU Cloud resolve fixture覆盖smooth Perspective translate/rotate、
   expected previous UV、continuous `cloudTime` advection、stationary spatial-only和一个
   over-bound camera cut；pre-A6 same-UV mutation必须在该fixture中失败。
2. 同一fixture覆盖cloud-valid与invalid-positive-shadow-length两种anchor，证明packed
   validity/length semantic、finite geometry edge与clear direction不会ghost。
3. 一个现有lifecycle/resource Spec确认three tier配置、quality resize/invalidation、GPU
   resource/command/program counts与bytes没有新增。
4. 运行focused `SceneGISEnvironmentEffects` controller与A1 private pipeline，以及
   changed-scope lint/format/Markdown和`git diff --check`。没有upstream edit时不重复跑
   SGP audit、package/generator/type/full矩阵。
5. Direct Test只增加一个Globe high-Sun fixed camera/cloud-motion观察和一个quality切换
   观察；显示history mode/reset reason与tier budget即可。不得增加hash、replay、
   convergence loop、settling frames或数值代理gate。最终稳定性由项目负责人观看判断。

## 被拒绝的方案

- **第三Cloud velocity MRT**：提高draw-buffer/capability与memory边界；现有distance可重建
  所需position。
- **独立temporal BSM**：会复制history authority，并在high额外增加至少一个
  `18,874,368` byte atlas；当前没有未解决的surface-shadow temporal复现。
- **16-phase sparse temporal upscale**：要求多帧收敛并使request-render单帧不完整。
- **automatic FPS/timer adaptation**：引入跨机器阈值、wall-clock与隐式质量authority。
- **raw WebGL/PBO/final-frame TAA**：绕过Cesium Context ownership且错误覆盖整个scene。
- **Planar同步改造**：违反Globe-first顺序；Planar在A8-G后单独source-discover。

## 后果

A6-G能在不增加GPU resource category的前提下让smooth Globe camera/cloud motion复用
existing history，并让A5 shadow-length consumers共享稳定结果。代价是resolve增加少量
world-position/reprojection ALU与最多一个独立shadow-history lookup；cut frame仍有意使用
完整spatial-only输出。任何后续surface BSM temporal需求必须先有固定可复现画面并修订
本ADR，不能在执行期顺手加入。

## Execution writeback — 2026-08-28

Execution implemented the decision in the existing Cloud resolve category. A
preallocated structured snapshot retains the previous successful camera basis,
frustum, Sun, cloud time/offset and compatibility fields. Globe selects the
mean-distance cloud anchor, finite-scene invalid-cloud anchor or exact-clear
direction, then applies bounded previous-frame projection and wind compensation.
Cloud validity and decoded shadow length use independent history weights and are
repacked only after selection. Planar remains same-UV.

The prior per-frame array/map/join key and temporary framebuffer array are gone.
Persistent GPU/resource/category delta is exactly zero. The frozen low/medium/
high profiles and A5 BSM byte counts are unchanged. The amended GPU mutation
fixture, tier lifecycle fixture, `76/76` focused controller and `7/7` A1 suite
all pass. The fixed Test observations report the expected continuous motion and
quality-reset modes; subtle interactive ghosting/shimmer remains an owner visual
gate rather than a new numerical threshold.

## Architecture review correction — 2026-08-28

Independent review found that the first candidate does not yet implement four
parts of this decision: current-neighborhood color/transmittance clipping;
semantic mean/front/scene position compatibility with RGBA16F-aware bounds;
independent shadow-length selection with finite/clear scene-edge checks; and
Orthographic exact-clear reprojection. The passing first fixture observes CPU
mode selection and differing attachments but does not prove a moved cloud-valid
pixel retains temporal history.

These are `A6-AR-001` through `A6-AR-004` in the active A6 review. The accepted
resource topology, quality profiles, continuity thresholds, A5 paths, public
API, upstream seams and Planar boundary remain unchanged. Correction must reuse
the existing GPU fixture and add no new matrix, resource or fallback.

## Execution correction writeback — 2026-08-28

The corrected Globe resolve clips sampled history radiance/transmittance to the
finite current 3x3 range before compatibility and blend. It reconstructs the
mean, front and scene semantics independently and uses binary16 ULP-derived
quantization radii rather than a fixed normalized-integer tolerance. Invalid
cloud output retains scene distance for finite/clear edge classification.

Cloud radiance compatibility is independent of decoded shadow length. Invalid
finite shadow history requires semantic scene-position compatibility, exact
clear rejects a previous finite scene, and Orthographic exact-clear derives its
previous UV from the current ray origin projected into the previous plane.
Perspective direction reprojection and the frozen Planar same-UV path remain
unchanged.

The one amended actual-GPU history fixture proves current-range clipping,
moved-cloud history survival, changed-length radiance reuse, finite/clear edge
rejection and failing Perspective/Orthographic same-UV mutations. It passes
`1/1`; final focused controller and A1 runs pass `76/76` and `7/7`. Persistent
GPU/resource/category/API/upstream/SGP delta remains zero.

## Architecture correction re-review — 2026-08-28

`A6-AR-001`, `A6-AR-003` and `A6-AR-004` are closed. `A6-AR-002` remains open:
the candidate computes but discards front/scene projected UVs, compares their
expected distances against channels read at the mean UV, and publishes a blend
of current distances with raw previous-camera distances. That does not provide
coordinate-aligned semantic compatibility or a valid current-frame history
record.

The correction must retain current-frame `xyz` semantics and compare history
channels in the coordinate domain from which they were sampled. One second
bounded motion frame in the existing fixture is the minimum direct proof that a
successful history publication remains reusable; it is not a convergence loop.
All resource, lookup, API, tier, A5, upstream and Planar decisions remain frozen.

## Architecture second A6-AR-002 correction — 2026-08-28

The previous-ray reconstruction, binary16 plus bounded `16 m` float tolerance,
and current-frame `xyz` publication are accepted. `A6-AR-002` remains open for
two final points: a valid cloud must treat exact-clear scene depth as a
classification rather than comparing two diverging `200 km` synthetic world
points; and the same-UV mutation must preserve the real anchors and demonstrably
select a different NEAREST texel.

The existing fixture must restore meaningful bounded camera motion and apply a
second bounded camera/cloud transition. This remains one direct temporal test,
not a convergence loop or matrix. Resource, lookup, API, tier, continuity, A5,
upstream and Planar decisions stay frozen.

## Architecture code closure — 2026-08-28

All A6 code findings are closed. Exact-clear scene compatibility now uses the
stored clear classification; finite scenes and cloud mean/front use
coordinate-aligned world positions; history distance output remains in the
current camera domain. The bounded binary16 plus `16 m` tolerance and the
zero-resource previous-ray reconstruction are accepted.

The existing GPU fixture proves two consecutive bounded `100 m / 0.1 rad`
camera/cloud transitions, different NEAREST history texels, nonzero reuse and
current-frame distance publication, and independently passes `1/1`. The phase
now requires only project-owner interactive motion judgment. No resource, API,
tier, continuity, A5, upstream or Planar decision changed.

## A6-AR-002 continuation execution — 2026-08-28

The implementation now reconstructs the previous ray at the selected history
coordinate and interprets all three sampled distance channels on that same ray.
Mean/front anchors retain cloud-advection compensation; scene anchors do not.
Compatibility combines binary16 ULP radii with the observed 16 m float
reconstruction floor. Successful output keeps the current spatial distance
`xyz`, preventing previous-camera distances from entering the next frame.

The existing actual-GPU fixture uses nonuniform semantic distance data, asserts
current-domain publication, and proves reuse across the initial bounded motion
and one second bounded cloud-time motion. It passes `1/1`; controller `76/76`
and A1 `7/7` also pass. Resource, lookup, renderer-state, API, upstream, SGP,
A5 and Planar deltas remain zero.

## A6-AR-002 final continuation execution — 2026-08-28

For a valid cloud whose current scene depth is exact clear, compatibility now
requires an exact-clear sampled history scene code rather than comparing two
synthetic points at the `200 km` encoding limit. Finite scene depth continues
to use the coordinate-aligned scene-position bound. All accepted mean/front,
shadow and current-domain publication semantics remain intact.

The amended existing fixture proves two bounded `100 m / 0.1 rad` camera moves
with cloud-time motion, distinct projected/current NEAREST texels, semantic
distance separation beyond the compatibility floor, a UV-only same-UV mutation
failure, current `xyz`, and nonzero second-transition history reuse. Focused
results are history `1/1`, controller `76/76`, and A1 `7/7`; frozen resource,
API, renderer, upstream, SGP, A5 and Planar boundaries remain unchanged.

## A6-G completion — 2026-08-28

Architecture closed all code findings and the project owner explicitly passed
the prepared interactive Globe motion gate. Bounded camera/cloud motion showed
no rejected screen-space trail, stopping required no settling-frame snap, and
the assigned `medium -> low` transition produced a clean spatial reset. A6-G is
therefore complete with the frozen zero-resource, caller-owned tier and
Globe-first decisions intact. The phase-closing commit containing this record
is the unpublished local A6-G checkpoint.

## A8-AR-011 Globe sampling-schedule clarification — 2026-08-31

The quality table remains the public and renderer-side tier authority. Its
Globe primary/fine values now define a maximum detailed-sample budget rather
than a mandatory nested uniform grid: low `32x1` becomes at most `32`
progressive samples, while medium/high `64x4` become at most `256`. Resolution,
Sun steps, detail enablement, Beer cascades and atlas sizes are unchanged.

Within that budget the Globe shader uses the reference-derived progressive
`50/100 m`, `1.01`, `1000 m` schedule and conservative empty-space advance.
Planar retains the pre-A8 nested uniform interpretation. No resource or public
tier value changes, but interactive performance and final cloud appearance
remain required owner observations because sample placement has changed.

## A8-AR-014 stationary Globe and high-altitude filtering — 2026-09-01

Globe STBN phase is a render-frame sequence, not a function of `cloudTime`.
Exact-stationary Globe frames therefore advance their spatial sample pattern
and reuse the existing A6 ping-pong history at weight `0.9`; they are reported
as `exact-stationary-temporal`. Moving views retain the established reprojection
and continuity policy. Planar keeps its pre-existing cloud-time slice and
stationary spatial-only behavior.

This amendment allocates no history, texture, FBO, attachment, program or
command. High-altitude weather aliasing is handled by the A4 material's
projected-footprint mip selection, not by a camera-height branch, fade,
settling frame or screen-space fallback. A deterministic `LOD 0` mutation and
the existing motion/history fixture are the bounded automated authorities;
interactive shimmer remains a visual gate.

## A8-AR-015 execution amendment — temporal boundary

The corrected BSM world mapping is spatial: full ECEF forward/inverse matrices,
view-depth cascade selection and global cloud-shell/material coordinates. It
does not add a shadow history or alter the A6 cloud history. Existing cloud
history modes, quality tiers, allocations and reset causes remain unchanged;
any future BSM temporal resolve still requires a separately declared lifecycle
and byte budget rather than masking projection drift.

## A8-AR-017 execution amendment — shadow continuity policy

The separately declared BSM history now uses the existing A6 continuity
authorities: projection equality, bounded camera translation/orientation and
frustum change, cloud-time continuity and Sun-direction continuity. A failed or
non-finite bound invalidates history before sampling; resize and quality changes
publish candidate resources only after complete allocation. History stores
resolved Beer only, while current front depth and velocity remain producer
attachments. This does not change A6 cloud-history modes, public quality tiers
or Planar behavior.

## A8-AR-019 execution amendment — BSM continuity specialization

BSM history reuses the A6 bounded projection, translation, frustum, cloud-time
and Sun authorities but does not apply the visible-cloud global orientation cut
when full-ECEF reprojection remains valid. Its reusable snapshot additionally
invalidates preset, coverage, density, layer, detail, ellipsoid and quality
changes before history sampling. This specialization changes neither A6 cloud
history nor any public quality tier.

## A8 qualification amendment — current/resolved raster conversion

Temporal cloud footprint authority distinguishes the actual current Cloud MRT
dimensions from resolved output dimensions. The reference current raster is
`ceil(resolved / 4)`; derivative conversion is applied per axis before the
fixed temporal mip scale. This is a coordinate-unit conversion, not a dynamic
quality coefficient, and does not alter the public low/medium/high tiers or
history/resource topology.

## A8 qualification amendment — fixed-world BSM witness

BSM temporal qualification samples the real nonuniform producer and resolved
atlas for one fixed ECEF receiver through substantial bounded rotation/orbit
and a real cascade transition. Same-UV, wrong-coordinate and cascade mutations
must fail. Published OD bounds derive from cascade texel footprint, structured
integration and binary16 storage; arbitrary metre cushions are not authority.

## A12-G amendment — bounded Globe variance clipping (2026-09-04)

The owner accepted A11-G at checkpoint
`53465cf9bc8f3af1e935b3225c81364e380ea528` and requested less fine cloud
grain. Current Globe medium/high already use full input resolution, a 500-step
budget and frame-index STBN with stationary history weight `0.9`. A direct
stationary cloud-body crop does not support broad distance rejection as its
dominant failure, so no distance threshold is reopened.

A12-G may replace the Globe extrema-only history clamp with the pinned
`three-geospatial@b012ad06` full-resolution variance-clipping approach: first
and second moments of the existing finite 3x3 samples, fixed gamma `1.0`, and
coherent mean-centered AABB clipping within the current finite outer range.
Premultiplied radiance and transmittance remain finite, bounded and compatible
with the existing blend. Uniform input remains identity. No extra texture
lookup, resource, pass, history, API, sample budget or production readback is
authorized.

The spatial kernel, `0.9/0.82` weights, camera/scene/distance rejection,
current-domain distance publication and independent packed shadow semantics
remain frozen. Planar retains its prior path. First invalid/cut output remains
complete without added request-render frames. Known-error GPU comparison
against the old extrema-only mutation plus the owner's current-view quality and
motion judgment must demonstrate benefit; a merely different or blurred image
does not close the phase. Any broader sampling/denoising change requires a new
evidence-backed amendment. Phase details are in
[A12-G](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-04-phase-a12g-globe-cloud-noise-reduction.md).

## A12-G execution candidate — 2026-09-04

Globe now derives finite first/second moments from the existing 3x3 reads and
uses gamma-1 bounds within current extrema. One AABB fraction clips RGB and
transmittance coherently, including exact zero-width bounds. This adds only
fixed ALU; no lookup, uniform, state, resource, command, pass, sample-budget,
API or Planar change is introduced. Existing history weights and semantic
compatibility/publication remain intact. Controlled GPU evidence is recorded
in the A12 review. The single restored-view observation retains recognizable
cloud detail but does not establish visible grain reduction; the candidate
must not be treated as owner-accepted or extended without Architecture review.

### A12 review clarification — 2026-09-04

The candidate's extension of the RGB clip fraction to transmittance is
rejected under A12-AR-001: zero transmittance variance can collapse valid RGB
history for an alpha-only binary16 discrepancy. The corrected adaptation must
derive its common clipping fraction from RGB, retaining color coherence, and
bound transmittance separately in its finite variance/extrema interval and
`[0,1]`. No new epsilon, weight, compatibility threshold, texture read or
resource is authorized. The rest of the A12 amendment is unchanged; visual
benefit and focused regression qualification are still open.

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

### A12 correction code closure — 2026-09-04

Architecture has accepted the RGB-derived clipping fraction and independently
bounded transmittance, including the existing GPU fixture's exact alpha-only
ULP witness. A12-AR-001 is fixed. This closes the adaptation defect, not the
image-quality goal: A12-AR-002 has one Spec-only time-publication follow-up and
A12-AR-003 still lacks the original-view visual evidence. All previously
accepted resource, sample, semantic and Planar boundaries remain frozen.

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

### A12 automated qualification closure — 2026-09-04

Architecture accepts the final Spec-only explicit-time correction and its
exact passing fixture together with the prior 78 aggregate passes. A12-AR-001
and A12-AR-002 are fixed; no additional product amendment is required.
A12-AR-003 remains open until the original-view grain comparison is available.
This is not a claim of visual acceptance or a new aggregate run.

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

### A12 owner visual criterion revision — 2026-09-04

The owner removes matched-view before/after evidence as a prerequisite and
permits expected close-range fine grain. This supersedes the earlier strict
same-view requirement: acceptance now considers current normal-distance
appearance, cloud detail/internal shading and objectionable flicker/trails.
The known-error GPU evidence remains required and unchanged. No zero-noise
target, stronger filter, additional sampling, phase replay or parameter search
is introduced. Architecture's bounded final-program observation supports
presenting the candidate for explicit owner judgment; it is not a quantified
relative-improvement or owner-pass claim. Existing product boundaries remain
frozen.

## A12-G owner acceptance — 2026-09-04

The owner explicitly accepted the retained close-range grain after the final
candidate observation. A12-G's RGB-only variance clipping and independently
bounded transmittance are complete with no resource, lookup or sampling-budget
change. Performance work follows separately from this accepted image-quality
baseline; no quality-tier reduction is implied by this acceptance.

## A13-G amendment — medium 2x2 phased tracing (2026-09-04)

Accepted for implementation after owner direction approval and candidate-2
code closure; performance and visual qualification remain pending. This
supersedes the full-resolution Globe medium raster and its spatial-resolve
assumptions only. It does not supersede the accepted material, lighting,
high/low/Planar paths or world-space Beer shadow system.

### Raster and phase authority

Globe medium's current two-attachment Cloud MRT becomes
`ceil(W/2) x ceil(H/2)`. Both existing resolved histories remain `W x H`.
The existing native-frame STBN slice also selects four Bayer offsets, in order
`(0,0), (1,1), (1,0), (0,1)`. One private Globe-medium boolean enables the path;
no clock, second phase counter, native-camera jitter or extra render is added.
For integer low texel `l`, the actual full-pixel index is
`p = min(2*l + phase, fullSize-1)` and its UV is `(p+0.5)/fullSize`.
The clamp explicitly handles odd/one-pixel dimensions. Producer and resolve
must use the same shared coordinate helper.

Raw depth classification, resolved depth reconstruction, Perspective or
Orthographic ray, STBN pixel and Cloud MRT distances all belong to that exact
sample coordinate. Invalid medium cloud samples also publish the known scene
distance in z; exact clear publishes 1. The current distance encoding remains
1,000,000 m. Per-ray angular/origin footprint uses full output dimensions for
this phased path; the existing material entry-derivative conversion still
receives actual current and resolved dimensions. Do not change density,
optical steps, filtering coefficients, STBN assets or lighting budgets.

### Complete current reconstruction

Only the medium path replaces the old unshifted-grid spatial assumption.
Gather the existing 3x3 low color/distance neighborhood around the phase-aware
grid coordinate. Obtain each tap's actual full-pixel coordinate from the shared
helper. Use separable tent weights
`product(max(1-abs(targetFullPixel-sourceFullPixel)/2, 0))`, normalized over
eligible taps. This gives exact current samples unit support and avoids the
old low-tier broad blur being selected merely because the raster is smaller.

Each tap uses exact source raw-depth clear/finite classification, allowing at
most nine additional current-depth texel reads. Different source/target scene
classes are rejected for both cloud reconstruction and shadow length. For
finite geometry, reconstruct its source endpoint from source z and source ray;
compare to the target's actual endpoint. The allowed spatial radius is the
separation of those two rays at the target distance plus the existing binary16
position tolerance. This is the actual sampling footprint, not a new metre or
depth-percentage tuning constant. Reject cloud mean/front behind the target
receiver beyond storage tolerance. Rejected geometry must not enter color
moments or silhouette reconstruction.

Convert accepted source mean/front world points into target-ray distances by
projection onto the target ray before weighted accumulation. Publish current
target scene z, never an average of neighboring geometry z. Cloud color/validity
and decoded shadow length use independent eligible weights; preserve positive
length on invalid clouds and repack only after selection. With no eligible
current support, publish transparent cloud color, invalid cloud, current scene
z and zero length, rather than copying an unrelated historical sample. This
defines the conservative empty-support result at disocclusion boundaries.

The full output is written on the first frame and every invalid/cut/resize
frame. It may be spatially approximate at subpixel features; it must not wait
for four frames, copy undefined history, or erase a broad cloud/terrain region.
Owner visual judgment is required; interpolation is not claimed pixel-identical
to a full-resolution march.

### Existing temporal authority, coordinate-correct sampling

The medium path retains A12 gamma-1 RGB-coherent clipping with independently
bounded transmittance, weights 0.9/0.82, and all global continuity/reset causes.
It does not use history-only nonfresh pixels or a larger variance gamma.
Current valid cloud anchors use the converted target-domain mean/front;
invalid finite/clear anchors and wind compensation retain their accepted roles.

Reject out-of-frame reprojection before sampling. Medium reads the actual
NEAREST full-history texel and reconstructs its ray at that texel center.
Mean/front/finite-scene compatibility therefore includes the existing binary16
position radius plus that full-history pixel's half-diagonal world footprint:
`0.5*length(previousFrustumSpan/historySize)` for Orthographic, multiplied by
the larger compared distance for Perspective. The frustum coordinates are the
existing normalized Perspective-plane coordinates. This radius accounts only
for NEAREST full-raster quantization, never for an entire low-resolution block;
no continuity threshold or arbitrary cushion changes. Exact-clear scene
classification and independent packed shadow-history decisions remain required.
Successful xyz publication is always current-domain, never blended previous
distances. High/low and Planar retain their pre-amendment behavior.

### Resource and qualification boundary

No added manager, attachment, texture, history, program category, command or
pass. Current MRT bytes become `16*ceil(W/2)*ceil(H/2)` from `16*W*H` for medium;
history remains `32*W*H`. Existing candidate-first resize, failure cleanup and
disconnect ownership remain. No persistent CPU buffer or phase state is added.
There is no public API/default, asset, upstream, SGP, Beer, Bloom or light-budget
change. The exact new uniform and extra current-depth reads must be audited.

One bounded GPU fixture proves all four phases, odd-size coordinate/depth
alignment, complete first/cut frames, nonuniform current-domain reconstruction,
meaningful temporal reuse and depth-edge rejection. Existing high/Planar history
and cloud lifecycle/failure fixtures remain regression authorities. Exact paths,
commands and owner performance/visual gates are in the
[A13 plan](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-04-phase-a13g-globe-performance.md).

### A13 candidate 3 execution limitation — 2026-09-04

The current implementation is not qualified: the sole new GPU fixture still
reports nonfinite RGB on history rejection. The frozen A12 variance helper
has not been changed, and no tolerance or fallback was introduced. Exact
development failures and the request for bounded Architecture direction are in
the [A13 review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#candidate-3-execution-blocker--2026-09-04).
The five-path executable boundary is retained; resource/category/history/API,
upstream/generated/new-SGP and Planar deltas remain zero except for the assigned
medium current-target dimension reduction. Its byte formula is not an FPS claim.

### A13 numerical interval correction — 2026-09-04

Independent GPU diagnosis in
[A13-AR-001](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-001--inverted-finite-variance-interval)
demonstrates that finite constant channels and a weighted sample count of
3.75 can round the mean outside the sampled extrema. A one-sided intersection
then produces negative width and division by zero in coherent RGB clipping,
poisoning history before the later depth-rejection witness.

The approved narrow exception to frozen A12 arithmetic clamps both interval
endpoints to the finite sampled extrema:

```glsl
vec4 lower = clamp(mean - sigma, minimumColor, maximumColor);
vec4 upper = clamp(mean + sigma, minimumColor, maximumColor);
```

Monotonic clamping preserves an ordered interval for finite inputs and positive
sample count; a constant channel has exact zero width. Keep the existing
gamma-1 moments, coherent RGB fraction, separate transmittance clamp, history
weights, semantic rejection and output packing. Do not substitute an epsilon,
minimum variance, per-channel RGB clamp or nonfinite fallback. This correction
applies to the shared Globe helper, including its high/low callers; their
sampling policy and the Planar path do not change. It adds no resource, lookup,
uniform, public API or continuity threshold. The existing phased fixture must
prove finite output at each transition before claiming meaningful history use;
the retained full-resolution history fixture remains the A12 regression check.
Implementation and qualification remain pending the Execution correction.

Execution has applied exactly these two endpoint clamps and retained all other
clipping arithmetic. The phased and legacy history GPU fixtures pass, including
finite full RGBA and positive bounded contribution at both fixed motion samples.
Two retained resource-fixture setup/API failures keep full qualification pending;
the [review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#final-focused-command-results)
records exact outcomes. No extra uniform, lookup, resource, API, upstream/SGP
or Planar change; no fallback or numerical threshold was introduced.

Architecture independently confirms A13-AR-001 fixed. The remaining
[A13-AR-002/003 follow-up](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#current-spec-only-follow-up-assignment)
corrects Spec tier selection and framebuffer-wrapper assertions only; it
introduces no further algorithm or policy exception. Performance/visual
qualification of the medium phased path is still pending.

The Spec-only follow-up now verifies the actual medium camera cut and lazy
resource transition. Last-good GPU objects remain live after the injected
failure, but zero candidate destroy calls leave cleanup qualification open;
see [exact results](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#spec-only-follow-up-results).
No algorithm, resource, lookup, uniform or public contract changed in this turn.

Architecture confirms the medium-cut/setup finding A13-AR-002 fixed. The
remaining [A13-AR-003 continuation](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-injection-continuation)
corrects which test update receives the injected failure; it does not change
the renderer's candidate-first ownership or error policy. Candidate-wide
qualification remains pending.

The targeted Spec injection now passes, demonstrating candidate-first failure
cleanup and last-good liveness without changing the product policy. The
[execution record](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-execution-result--2026-09-04)
reuses the accepted phased/lazy/history results; no runtime or resource delta.
Candidate review and performance/visual acceptance remain pending.

### A13 continuous-receiver reconstruction correction

[A13-AR-004](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004--continuous-sloped-receivers-rejected-as-depth-edges)
demonstrates that equal-range angular separation does not bound positions on
an oblique continuous receiver. It must not classify legitimate terrain slope
as a disocclusion and erase untraced cloud rows. For phased-medium finite
spatial support, use the local receiver-plane residual in the existing
translation-free ray domain. Compute its normal from current-position screen
derivatives in uniform control flow; require a finite positive normal magnitude
and point-to-plane distance within the existing binary16/16 m position bound.
No enlarged tolerance, assumed ellipsoid normal, new lookup/normal texture,
resource or fallback is introduced.

Raw finite/clear and cloud mean/front foreground gates remain independent and
mandatory. Temporal compatibility, weights, phase schedule, first-frame
publication, packing, high/low and Planar policies do not change. Validate the
continuous sloped-plane case and retained silhouette rejection in the existing
GPU fixture before another Architecture visual/cost observation. A13-AR-003
is independently closed, but this newly observed quality regression keeps
candidate 3 changes-requested; the measured short-run speedup is not acceptance.

Execution has implemented the uniform-flow receiver derivatives and exact
unnormalized plane residual with the existing storage radius. The fixed
analytic plane and old-gate mutation pass in the existing phased fixture,
including retained occlusion/temporal assertions; the legacy history fixture
also passes. [Results](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004-execution-result--2026-09-04).
No implementation deviation, added lookup, resource or public-policy change.
Independent review and corrected-source visual/performance judgment remain
pending; Execution did not operate the owner page.

Architecture independently confirms this implementation and its direct GPU
regression evidence. Corrected-source live inspection removes the diagnosed
comb while retaining the medium cost benefit; [closure and limitations](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#independent-candidate-3-closure-and-owner-handoff)
record the representative result. No further policy or implementation exception
is introduced. All A13 code findings are closed; phase acceptance remains the
project owner's quality/performance decision.

### A13 independent interpolation and clipping support

The owner subsequently reports increased medium shimmer and approves
[A13-AR-005](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005--interpolation-support-collapses-history-statistics).
Phased current reconstruction's tent weights must not define its history
statistics: a directly traced phase otherwise collapses the statistical
interval to one current value and nullifies temporal denoising.

Use the existing clamped 3x3 samples, with unit statistical weight/count after
finite color/distance, exact finite/clear, finite receiver-plane and valid-cloud
foreground qualification. Zero tent weight is not a statistical rejection.
Current color/distance and independent shadow reconstruction retain their
original positive tent weights and ordering; statistical support cannot create
current validity or bypass the no-support immediate output. Geometry may
legitimately reduce the statistical neighborhood, without a variance floor.

The accepted clipping formula, ordered interval correction, gamma, history
weights/rejection, packing and current-domain publication remain frozen. No
sampling/phase/STBN, footprint, high/low/Planar, API or persistent-resource
change is authorized. Existing fetches are reused; extra qualification ALU
must be checked against the medium performance objective. A fixed four-phase
GPU witness must distinguish the old statistical rule and preserve history-off
spatial/occlusion behavior. This decision authorizes implementation; neither
complete shimmer removal nor owner acceptance is inferred. Subsequent live
cost/quality and effective-history/noise analysis remain Architecture-owned.

### A13 independent-support execution

The bounded implementation reuses the phased 3x3 fetches for geometrically
qualified unit-count statistics, leaving current positive-tent sums, clipping
formula and history semantics unchanged. The actual-GPU four-phase witness
passes and rejects the former statistical support on the aligned phase;
history-off publications remain exact and incompatible zero-tent samples
remain excluded. See the
[execution record](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-execution-result--2026-09-04).
No resource/API/upstream delta; added qualification ALU and residual shimmer
still require Architecture's live review rather than inferred acceptance.

Architecture independently confirms the implementation and discriminating GPU
oracle, with no additional policy exception. The
[bounded live review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-independent-review-and-bounded-live-observation)
does not establish sustained 60 FPS or complete dynamic stability; phase quality/
performance acceptance remains open. Current interpolation, geometry, history
weights and phase/STBN policies stay frozen pending any separately diagnosed
and approved correction.

### A13 precise phased receiver-depth reconstruction

[A13-AR-006](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006--lossy-log-depth-round-trip-erases-medium-clouds)
shows that the reverse-log-to-normal-depth/vec4 inverse-projection round trip
can make the medium low producer and full resolve disagree on the same finite
receiver at the native small-near, long-range projection. Strict receiver
qualification must not be loosened to compensate for inaccurate endpoints.

For Globe `u_cloudTracePhased` only, reconstruct producer depth using
`czm_screenToEyeCoordinates(cloudCoordinates, rawDepth)` and full-resolution
depth using `czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth)`. These are
the existing precise native `(vec2, float)` overloads. Pass raw depth once,
retain exact-clear gating, and retain the native window builtin dependency.
Do not feed already reversed depth to the raw-depth overload. No custom log
formula, upstream change, alternate texture, larger tolerance or new resource
is authorized. Nonphased Globe and Planar paths remain unchanged.

Native `frameState.useLogDepth` remains the encoding authority. Orthographic
uses the linear variant even when the scene's public log preference is true;
the fixture must not preserve an artificial Orthographic/log combination by
adding a product branch. Qualify a fixed small-near Perspective log case
against analytic receiver distance and the former-expression mutation in the
existing phased fixture, retaining Orthographic linear and existing occlusion/
history tests. The diagnosed strip defect does not reopen the statistical,
temporal, phase/STBN or resource policies. Product review and live medium
quality/performance acceptance remain pending after the temporary diagnostic.

### A13 precise-depth execution

The two phased Globe expressions now use the specified native raw-depth
overloads, retaining their window builtin dependency and ADR-0043 encoding
authority. A fixed analytic small-near Perspective log-depth fixture passes
and rejects the old expressions; Orthographic remains linear. The
[execution record](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-execution-result--2026-09-04)
details current support and retained semantic assertions. No resource, API,
upstream, tolerance or temporal-policy delta; live acceptance remains pending.

Architecture independently confirms the implementation and discriminating
analytic GPU oracle. Corrected-source oblique and native rotation observations
remove the diagnosed horizontal gaps; a single restored-view cadence window
is 59.96 FPS. The
[independent review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-independent-review-and-corrected-source-observation)
records state restoration and the limits of this evidence. A13-AR-006 is fixed
without a new policy exception; owner quality/performance and phase checkpoint
remain pending.

### A13 stochastic cloud-depth support — A13-AR-007

The owner approves the next noise correction. The Architecture-owned
[diagnostic](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007--stochastic-cloud-depth-rejects-stationary-history)
isolates stochastic mean/front rejection in the current medium view. The
[local UE5.2 audit](../../../AgentDocs/atmosphere-clouds-effects/discussions/2026-09-04-a13g-globe-performance-source-discovery.md#local-ue52-source-audit-and-a13-ar-007-decision)
supports distinguishing approximate cloud reprojection depth from opaque
scene depth; it does not authorize copying UE code, defaults or its resource
protocol. This amendment authorizes implementation, not visual acceptance.

Only Globe `u_cloudTracePhased` changes cloud-color history compatibility.
The old mean/front three-dimensional point-equality tests are superseded by
the following sampling-support model; nonphased Globe and Planar retain them.

1. Reuse the existing geometrically qualified 3x3 current samples. After
   finite checks, exact depth classification, receiver-plane qualification
   and cloud-foreground rejection, accumulate two separate longitudinal
   support intervals: mean and front. Only cloud-valid samples enter these
   intervals, independently of positive tent interpolation weight. Do not
   change current interpolation, color statistics or shadow-length ordering.
2. For each semantic source distance `d` in metres, reuse the producer's
   constants to compute `h(d)=min(1000, 50+(1.01-1)*max(d,0))`. This bounds
   the progressive local step scale and reuses the existing two-step initial
   jitter span. Project its radius `2*h(d)` onto the target ray by multiplying
   by `abs(dot(sourceDirection,targetDirection))`. Extend that sample's
   already-converted target distance by this radius, then take interval
   extrema over eligible samples; clamp the lower bound to zero. Reuse the
   named shared constants, not duplicated literals or a new tuning value.
   This is a bounded reconstruction-support policy, not a proof that arbitrary
   heterogeneous-density estimator errors are limited to one jitter span.
   Unsupported samples may still reject history; no convergence promise follows.
3. Keep the existing mean-anchor previous UV, advection, bounds rejection,
   actual NEAREST texel-center selection and previous-ray reconstruction.
   With `s` the current spatial semantic distance in metres, `Pprev` its
   sampled previous-ray anchor and `Pcur` its current anchor expressed in the
   previous-camera domain (already cloud-advected), compute
   `p=s+dot(Pprev-Pcur,targetDirection)`. Compare each mean/front `p` against
   its own current support interval, padded only by the existing semantic
   binary16/16 m plus full-history-texel precision radius. Require nonnegative
   `p`; for a finite receiver, also require both projected historical cloud
   distances in front of the actual current scene distance within the old
   precision radius. Cloud sampling uncertainty never pads receiver depth.
4. Independently require the current advected mean anchor to lie within the
   old mean precision radius of the selected previous ray. For
   `v=currentMeanAnchor-previousRayOrigin`, the residual is
   `length(v-previousRayDirection*dot(v,previousRayDirection))`. This guards
   coordinate alignment without treating stochastic displacement along that
   ray as a lateral error. Do not require the current front anchor to occupy
   the mean-selected ray: under translation they are different volume points.
   Front history instead has its own longitudinal support and foreground gate.
5. Exact-clear scene classification and the finite scene-position check remain
   unchanged and mandatory. Keep current/previous cloud validity, color and
   transmittance compatibility, gamma-1 clipping, 0.9/0.82 weights, all global
   camera/material/light cuts and immediate first/cut/no-support output.
   Shadow-length compatibility remains independent and unchanged. Published
   xyz stays exactly current spatial data; no depth interval is stored in MRT.

The same model applies to stationary and continuous medium frames, with no
stationary-only bypass. It adds fixed min/max/projection ALU within existing
reads, not texture lookups, local sample arrays, uniforms, renderer state,
attachments, resources, passes or history. Producer steps, STBN/phases,
material/lighting, all quality budgets, Beer shadows and public API stay frozen.

The existing phased GPU fixture must distinguish the old point gate using
actual product-march jittered distance estimates and controlled known-error
color, retain meaningful moved-history/wrong-UV and foreground/scene-edge
witnesses, and reject cloud history outside the supported depth interval.
The existing legacy history fixture protects nonphased paths. Architecture
subsequently checks actual per-pixel reuse, visible grain/motion and bounded
cost. Broad intervals can retain stale volume color, and residual sampling
grain can remain; neither numerical history use nor a smooth still image
alone closes the owner quality/performance gate. No stronger spatial filter
or wider interval may be added without a separately diagnosed amendment.

### A13-AR-007 support-model execution

The implementation follows the five steps above with qualified mean/front
intervals, shared step constants, current-ray projection and unchanged strict
receiver precision. The real product-march jitter fixture verifies controlled
color-error reduction, old-point-gate discrimination and unsupported/occluded
history rejection; existing temporal/depth assertions remain. See
[execution evidence](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-execution-result--2026-09-04).
No lookup/resource/API/upstream delta or additional policy exception. Broader
volume support still carries stale-color risk; live quality/cost is not approved
by this controlled result.

Architecture independently approves the five-step implementation and the
discriminating product-estimator/controlled-color/occlusion evidence. The
[live review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-independent-review-and-live-observation)
confirms effective stationary reuse and visible grain reduction without a
short-window cadence loss. No additional policy exception is introduced.
Rotation first-frame grain, subtle trails and sustained/all-view performance
remain explicit owner-quality limits; this closes A13-AR-007 code review, not
the A13 phase or its visual/performance gate.

The owner subsequently accepts the corrected result on 2026-09-04, closing
the A13 quality/performance gate. The bounded evidence and residual limitations
above remain unchanged; acceptance does not establish a universal FPS target
or a zero-grain guarantee. The separately reported cloud/Cesium-clock linkage
does not change the accepted render-frame sampling/temporal policy.

## A15-G amendment — continuous medium cloud coverage

The [A15 diagnosis](../../../AgentDocs/atmosphere-clouds-effects/discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
establishes frequent hit/transparent history rejection at a fixed thin fringe.
The owner authorizes the [A15 phase](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-11-phase-a15g-cloud-edge-stability.md).
This amendment supersedes A13's requirement for both estimates to contain a
cloud and its fixed 0.08 transmittance gate **only for phased Globe medium**.

The resolve represents continuous premultiplied radiance and transmittance.
An available transparent volume estimate is legitimate history. Opaque scene
depth compatibility is mandatory independently of cloud presence; previous
cloud-bearing estimates retain A13 longitudinal support, nonnegative/front
distance and mean-ray alignment checks. UV bounds, global cuts, gamma-1
neighborhood clipping and radiance compatibility remain. Medium alpha uses
that qualified clipping domain directly, with no second fixed difference
cutoff. The stationary/moving weights remain 0.9/0.82.

The packed resolved validity bit denotes a current locally supported cloud
anchor, rather than requiring positive current tent opacity. When tent samples
contain a cloud, their existing mean/front distances remain unchanged. When
they are transparent, use the mean of the current geometrically qualified
cloud-hit neighbors' projected mean/front distances from the same 3x3
neighborhood used for clipping. This supplies the cloud/advection reprojection
anchor and lets aerial composition consume filtered coverage. It does not
change current spatial RGBA or invent opacity on first/cut frames. No qualified
cloud neighbor means invalid/transparent output and immediate history removal.
No positive tent support still returns immediately. Published xyz remains
entirely current-domain data; no historical distance is published or blended.

This adds fixed accumulations to existing reads without new texture lookups,
uniforms, resources or passes. Scene-depth qualification and cloud-foreground
precision do not widen; shadow length stays independently filtered. STBN,
trace phases, producer/material/detail, public options, Clock, high/low and
Planar remain unchanged. Remaining risks are simultaneous neighborhood misses
and adjacent-volume association during motion. Controlled hit/miss, removed
support, moved-anchor and opaque-depth witnesses plus the owner's stationary
and moving visual judgment are required; numerical reuse cannot approve
quality. No UE code is copied and no upstream file or SGP is changed.

The [A15 review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-11-a15g-cloud-edge-stability.md)
qualifies the implementation, alternating-coverage/depth/motion regressions
and bounded native quality/GPU-cost comparison. Owner visual acceptance remains
open; the amendment does not claim universal zero grain or sustained FPS.

### A15 residual HDR flashes and identical integration rays

The owner rejects the initial A15 image: near and horizon edges still jump.
The [active correction](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-11-phase-a15g-cloud-edge-stability.md#owner-reported-residual-flashes-second-correction)
identifies two remaining binary rejection paths. For phased medium, qualified
gamma-1 RGB clipping now also supersedes the fixed radiance-difference cutoff;
global radiance/light/material cuts remain unchanged. A valid clipped HDR
estimate must not lose all temporal filtering because its magnitude exceeds
an additional fixed threshold.

When the renderer's existing continuity snapshot proves exact camera and
cloud-time/offset stationarity (`u_cloudHistoryReprojection == false`), each
pixel integrates the same volume along the same ray. Its random front/mean
estimates need not occupy the current neighborhood's longitudinal interval.
Skip only that interval check in this case. Independently retain nonnegative
historical distances, current opaque-foreground rejection, exact-clear/finite
scene compatibility, mean-ray alignment, qualified clipping and current local
support. Moving/advection frames continue to require the existing intervals.
This supersedes A13's uniform stationary/moving interval rule; it does not
freeze STBN, change weights, publish historical distances or retain unsupported
clouds. High/low, Planar, resources and public API remain unchanged.
