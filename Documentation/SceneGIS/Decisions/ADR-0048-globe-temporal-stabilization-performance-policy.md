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
