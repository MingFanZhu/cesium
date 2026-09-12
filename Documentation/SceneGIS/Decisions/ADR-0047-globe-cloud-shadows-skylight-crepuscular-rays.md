# ADR-0047：Globe Cloud Shadows, Skylight, and Crepuscular Rays

## 状态

- Status：`accepted; A5-G Architecture and owner visual gates passed`
- Date：`2026-08-28`
- Decision owners：Architecture Agent
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md`
- Related patch：active `SGP-0008`（consume only）、active `SGP-0009`
- Builds on：ADR-0040、ADR-0041、ADR-0044、ADR-0045、ADR-0046

## 上下文

A4-G已经完成Globe reference-first volumetric cloud core，但云只参与自身lighting与resolved HDR composite。地表尚未消费
atmosphere irradiance或cloud optical-depth shadow，aerial/fog也没有Sun-to-view segment的cloud shadow length，因此缺少云影、统一天光和
crepuscular rays。

固定参考实现的Beer Shadow Map（BSM）使用cloud density得到光学深度，而Cesium native `ShadowMap`面向geometry depth与derived command。
两者不是同一种visibility authority。参考实现还使用temporal Beer shadow、PBO和raw WebGL路径；这些容器机制不符合SceneGIS的resource
ownership与A6 temporal边界。参考实现同时把`shadow_length`传给Bruneton `GetSkyRadianceToPoint`，并在cloud composite中执行完整
`approximateHaze`。最初决策曾把后者折叠进A3 exponential height fog；A5-AR-012的固定源码复核证明该处理丢失了reference默认启用、由
cloud coverage与cloud top共同定义的独立cloud-local source term。本ADR仍禁止screen-space radial blur与另一套通用高度雾，但不再把
reference cloud haze误判为重复的A3 fog。

Cesium `GlobeFS.glsl`在imagery/material合成后、native lighting选择处仍持有可解释为Globe surface base reflectance的`color`。这是本阶段唯一获准
消费SceneGIS Sun/sky irradiance的scene surface。resolved scene color已经包含Models、3D Tiles与其他primitive的Cesium lighting，不能在
fullscreen composite中再次统一relight。

## 决策

### Public contract

`SceneGISEnvironmentEffects`增加两个writable boolean option/property与一个Globe-only renderer calibration：

| Property               | Default | Meaning                                                              |
| ---------------------- | ------: | -------------------------------------------------------------------- |
| `showCloudShadows`     |  `true` | `showClouds`时用Beer optical depth衰减Globe surface的direct Sun      |
| `showCrepuscularRays`  |  `true` | `showClouds`时把equivalent cloud shadow length传入atmosphere/fog积分 |
| `surfaceRadianceScale` |  `10.0` | 把Globe physical surface radiance映射到Cesium scene-linear domain    |

不增加`showSkylight`。当advanced Globe controller `enabled && ready`时，Globe surface Sun+sky lighting是A5-G固有能力；
`showAtmosphere`继续只控制既有sky/aerial可见分量，不建立第二套irradiance authority。`showCloudShadows`和
`showCrepuscularRays`只控制cloud对该lighting的影响。Global `enabled=false`仍保持Cesium原始画面与零A5资源。

`surfaceRadianceScale`必须finite且位于`[0,64]`，只作用于Globe surface和其finite-path asymptotic calibration；Planar无consumer。
三个setter遵守既有warm-property规则：值实际变化且controller已连接、active时只`requestRender`并失效相关frame/history state，不得同步创建资源或编译
program。`showClouds=false`时两个cloud coupling均为identity。

### Beer Shadow Map owner and budget

A5-G使用一个SceneGIS-owned current-frame BSM atlas：

- one `RGBA16F` color texture、one framebuffer、one shader program；无depth attachment、无history；
- 2×2 tile atlas，low为2 cascades × 256（512² atlas），medium为3 × 512（1024² atlas），high为3 × 768（1536² atlas）；
- persistent texture bytes固定为low `2,097,152`、medium `8,388,608`、high `18,874,368`；
- practical split lambda=`0.5`，camera shadow distance最多`200000 m`；支持Perspective与Orthographic frustum；
- low shadow march=`25` steps，medium/high=`50`，program使用统一最大50步与runtime count，不建立quality shader variants；
- 每个需要BSM的rendered Globe frame在advanced background slot内、sky/cloud consumer之前执行最多3个atlas tile commands；
- primary与Sun density必须复用A4-G Globe cloud material、preset、time、asset与geodetic-normal/local-ENU anchor。

Cascade使用camera frustum split corners建立local-ENU light-space orthographic bounds，覆盖cloud shell并把XY投影按tile texel snap。不得用ECEF大数值
直接构造float shader matrix。Atlas channel契约沿用reference topology：R=`frontDepth / 200000`，其中`frontDepth`从cloud-top/segment-entry
起点开始计量；G=`meanExtinction`（m⁻¹）、B=`maxOpticalDepth`、A=`tail`。Ground receiver先恢复`frontDepth = R * 200000`，再使用
`min(B, G * max(0, distanceToTop - frontDepth))`恢复bounded optical depth并执行Beer-Lambert transmittance。每个cascade使用固定3×3
tent PCF：每个tap先恢复Beer transmittance，采样坐标clamp到当前tile half-texel interior，以`[1,2,1] x [1,2,1] / 16`加权后再转回
bounded optical depth。Cascade overlap同样在transmittance domain blend。不得平均packed channels/raw optical depth，也不创建独立temporal
stabilization。

### Globe surface lighting seam

Renderer在Globe surface command构建之前的pipeline update中，于当前`FrameState`发布一个显式、frame-local、read-only SceneGIS Globe lighting
record；只有candidate resources ready后才可标记active，inactive frame必须不存在或明确inactive。Atlas commands随后在advanced background slot执行，
Globe uniform callbacks在surface draw时读取同一帧已完成的atlas。禁止
prototype patch、implicit global与load-order dispatch。`GlobeSurfaceShaderSet`只在该record active时选择一个新的SceneGIS surface shader variant，
使用现有最高位之后的`0x400000000` flag并注入SceneGIS-owned Bruneton/surface helper source；`GlobeSurfaceTileProvider`只增加读取该record的uniform
callbacks；`GlobeFS.glsl`只在native final
lighting selection处增加一个互斥SceneGIS branch。这个最小上游接缝登记为`SGP-0009`。

SceneGIS branch把imagery/material后的`color.rgb`作为Lambertian albedo，计算：

```text
surfaceRadiance = surfaceRadianceScale * albedo / PI *
  (sunIrradiance * max(dot(normal, sunDirection), 0) * cloudTransmittance
   + skyIrradiance)
```

Sun与sky来自同一个A2 transmittance/irradiance LUT和current Sun authority；cloud shadow只衰减direct Sun，不能压暗sky irradiance。优先使用terrain
normal；无terrain normal时使用WGS84 inverse-radii-squared计算ellipsoid geodetic normal。position/normal转换复用A4-G local ENU和virtual
Bruneton sphere映射。

Globe finite geometry的aerial source在renderer domain使用下式建立near-to-clear asymptote：

```text
extinctionWeight = clamp(1 - max(T.r, T.g, T.b), 0, 1)
effectiveAerialScale = mix(
  aerialRadianceScale,
  surfaceRadianceScale,
  extinctionWeight)
scene = inputColor * T + physicalAerial * effectiveAerialScale
```

近处`T -> 1`保持ADR-0044已接受的`aerialRadianceScale`，完全extinguished的finite path使用Globe surface domain；默认
`surfaceRadianceScale=backgroundRadianceScale=10`时与clear background同域。Planar、cloud-body atmosphere与background公式不变。禁止用depth
epsilon、distance bias、screen-space horizon blend或ambient floor代替此契约。

SceneGIS surface lighting与Cesium native `globe.enableLighting`互斥；冲突必须在任何A5 resource mutation前fail closed。Models、3D Tiles、water/terrain
material topology和其他primitive继续使用Cesium现有路径；A5-G不对resolved scene color做通用relighting，也不接管`scene.light`。

### Crepuscular shadow-length transport

Cloud low-resolution pass建立独立于cloud-body support segment的Globe
shadow-view interval：从camera/entry开始，到finite scene distance、ellipsoid
ground或shadow-top sphere exit中的最近者结束，并clamp到`200000 m`。使用现有
quality的`primarySteps`（`32/64/64`）个midpoint interval采样同一BSM并积累
equivalent `shadowLength`，不得因cloud support miss、primary density、occupancy、
transmittance early-out或cloud validity跳过该积分：

```text
shadowLength += (1 - exp(-cloudOpticalDepth)) * stepLength * attenuation
```

长度范围固定为`[0, 200000] m`。不得增加第三Cloud MRT attachment或第二套history。现有distance attachment的alpha在rays启用时复用为
cloud-validity与10-bit shadow-length的half-float-exact编码：

```text
code = round(clamp(shadowLength / 200000, 0, 1) * 1023)
packed = valid ? 1 - code / 2048 : code / 2048
```

因此`shadowLength=0`保留旧validity alpha的exact `0/1`。Shadow length独立于primary cloud validity：clear/invalid cloud pixel可以携带positive
length，而color/distance仍保持invalid。Resolve/history必须先逐sample解码validity和length，分别执行既有semantic selection/filter，再repack；不得直接
平均packed bits，也不得用cloud validity丢弃clear-ray length。切换rays或影响BSM的cloud参数时复用既有cloud-history invalidation，不新增shadow
history。

解码后的length按A5-AR-011分别进入Globe infinite-sky与finite-point Bruneton transport。A3 Globe height fog继续把等效length解释为其自身
camera-near阴影前缀；这只定义通用height fog的consumer语义，不替代reference cloud haze。A5-AR-012另在既有Aerial composite中恢复
reference `approximateHaze`：coverage-coupled analytic optical depth、A2 ground Sun/sky irradiance、dual-HG directional source、固定scattering
albedo以及cloud-front/scene/ground/cloud-top bounds。`showCrepuscularRays=false`只令其shadow length为零，不能删除完整lit cloud haze baseline。
禁止radial blur、屏幕空间god-ray遮罩、另一套通用height-fog subsystem、cloud-local tone map或bloom。

### Lifecycle and failure

- BSM capability要求与现有Cloud MRT兼容的RGBA16F render target及至少2 draw buffers；不得因A5增加3-draw-buffer要求。
- Atlas/commands/program必须由现有renderer owner按context lazy-create、resize failure-atomically、destroy exactly once。
- capability、native-lighting conflict或candidate allocation失败均保留last-good/disabled identity，不发布partial frame-state record。
- request-render mode只在真实rendered frame更新BSM；不注册timer、listener、wall-clock animation或permanent render loop。
- Planar renderer、shader、controls、calibration和owner gate在A5-G保持冻结。

## 最小充分验证

本阶段只运行与新增契约直接相关的检查：

1. public defaults/setters、disabled identity、native-lighting conflict与resource lifecycle；
2. 一个actual-GPU BSM fixture，覆盖known density、3×3 sub-texel smoothing、tile isolation和cascade overlap连续性；
3. 一个packed-alpha/shadow-length fixture覆盖exact round-trip；一个actual producer fixture覆盖独立shadow-view interval；一个actual
   height-fog fixture覆盖zero/full/partial shadow segment、独立optical-depth比例与ambient identity；
4. 一个Globe surface shader fixture，覆盖SceneGIS variant on/off、mid-latitude terrain/WGS84 geodetic normal、
   `surfaceRadianceScale`与finite-path near/far endpoint；
5. 既有EnvironmentEffects controller/A1 pipeline、受SGP-0009影响的focused Globe surface specs、package public-contract verifier；
6. changed-scope lint/format/Markdown/patch audit与`git diff --check`；
7. direct Test只取高太阳云影off/on、true sunset/civil twilight surface、live-Sun-aligned rays off/on、一个downward
   finite/clear profile、offline imagery default与no-moon night的少量Globe单帧证据。

默认不运行full repository、Scene aggregate、unrelated generator/type/build矩阵，不增加hash/replay/convergence gate。项目负责人以最终Globe画面判断
shadow softness、cascade visibility、surface skylight和crepuscular-ray质量。

## 被拒绝的方案

- **Cesium native `ShadowMap`**：只表示geometry depth，不能表示volumetric Beer optical depth。
- **resolved-scene fullscreen relighting**：会把Models/3D Tiles已完成的lighting再次照明。
- **第三Cloud MRT attachment**：提高draw-buffer capability和resource预算，且现有alpha可精确承载所需语义。
- **reference temporal BSM/PBO/raw `_gl`**：属于A6与不允许的runtime容器机制。
- **radial blur god rays或另一套通用height fog**：重复现有fog/aerial composition。固定reference `approximateHaze`是A5-AR-012要求恢复的
  cloud-local source term，不属于本拒绝项。
- **同步实现Planar**：违反已批准的Globe-first串行交付顺序。

## 后果

A5-G新增一个bounded current-frame atlas和一个最小Globe surface upstream seam，换取云、地表、atmosphere与fog共享同一Sun/sky/cloud optical
authority。Models与3D Tiles不会获得新的SceneGIS skylight，这是一项有意的首阶段consumer边界；如未来需要scene-wide PBR environment/IBL，应以独立ADR
建立material-level contract，而不是扩张本阶段fullscreen composite。

## Execution writeback — 2026-08-28

Execution implemented the accepted decision without changing its public,
resource or consumer boundaries. `SGP-0009` is active on exactly the three
registered Globe surface paths. Low/medium/high atlas storage is exactly
2,097,152/2,097,152/8,388,608 bytes, with one RGBA16F texture/FBO/program, no
depth and no history.

The implementation uses a 5% cascade overlap blend and Cesium's fixed-frame Sun
conversion during controller update. Terrain variants request the existing
vertex normal varying, while geodetic-normal fallback remains in the fragment
branch; `GlobeVS.glsl` is unmodified. Focused actual-GPU transport/surface,
lifecycle, upstream surface, package/provenance and eight-state Globe browser
evidence passed. Generated paths and assets remain unchanged. Architecture and
project-owner review remain subsequent gates.

## Architecture correction — 2026-08-28

Independent source review found three implementation-contract mismatches. The
original R-channel text also omitted `RGBA16F` range normalization, so this ADR
now makes front depth cloud-entry-relative and stores it normalized by the
fixed 200 km bound. It also makes clear-ray shadow length explicitly independent
of cloud validity and requires the no-terrain fallback to use the WGS84
inverse-radii-squared normal.

These corrections do not change the public API, consumer topology, atlas byte
budget, pass/MRT/history count or upstream seam. Closure requires only the three
focused GPU assertions stated above. Owner visual review, checkpoint and A6-G
remain blocked until Architecture accepts the corrected implementation.

## Correction execution writeback — 2026-08-28

The corrected implementation now follows the clarified contracts exactly:
front depth is segment-entry-relative and normalized in atlas R; shadow length
is integrated and filtered independently of cloud validity; and the SceneGIS
fallback normal uses WGS84 inverse radii squared. Clear-sky atmosphere applies
only the shadowed-versus-unshadowed point-radiance delta, preserving exact
length-zero composition, while A3 fog continues to attenuate only directional
Sun.

The three focused actual-GPU closure fixtures and their three directly affected
existing fixtures passed. Atlas bytes, public API, consumer topology,
pass/MRT/history counts, `SGP-0009` path scope and Planar behavior remain
unchanged. Architecture re-review is still required before owner review or a
phase checkpoint.

## Clear-depth fog execution correction — 2026-08-28

Clear-depth Globe composition now adds only the delta between shadowed and
zero-length applications of the existing A3 fog function. Both evaluations use
the same base color and fog parameters, so base, ambient and transmittance terms
cancel algebraically and the background's existing unshadowed fog is not applied
twice. Exact zero length remains the accepted A4-G composition.

An actual-GPU fixture using the production Bruneton/CloudShadow/HeightFog stack
proved invalid-cloud positive length reduces directional fog and leaves the
ambient-only result unchanged. Public API, resources, SGP scope, Planar and all
other A5 contracts remain unchanged pending Architecture closure.

## Architecture correction re-review — 2026-08-28

The normalized atlas-depth and WGS84 fallback-normal corrections are accepted.
The clear-ray length producer, packing and resolve are also accepted, but its A3
fog consumer is not yet complete: clear depth bypasses the height-fog function,
so the background pass retains its unshadowed directional fog.

Closure requires a clear-depth shadowed-minus-unshadowed height-fog delta. This
preserves the already-composited background fog, cancels ambient/sky exactly and
changes only the directional source. One direct actual height-fog/Aerial GPU
assertion replaces the current helper-only proof. No public, resource, topology,
upstream-seam or Planar decision changes.

## Architecture final correction review — 2026-08-28

The final clear-depth implementation matches the corrected decision. It adds
only the delta between shadowed and zero-length applications of the existing A3
fog function, so common base, transmittance and ambient terms cancel and only
directional Sun is attenuated. Zero length retains exact prior composition.

Architecture independently passed the actual production-stack height-fog
fixture and packed identity fixture, and confirmed the unchanged three-path
`SGP-0009` boundary. All A5-G technical findings are closed. Project-owner
visual acceptance remains the only phase gate before checkpoint and A6-G.

## Project-owner visual correction — 2026-08-28

Owner visual gate拒绝当前A5-G：云影呈atlas texel马赛克、twilight地表全黑、downward view出现finite/clear aerial分层线、低太阳体积光不可见，且
Test Globe只有flat base color。Architecture source/toggle isolation确认：receiver只有single tap；medium/high只改变block尺寸；cloud-shadows-off不恢复
sunset地表，而controller-disabled恢复Cesium surface；surface没有renderer-domain scale；finite aerial仍以scale 1邻接scale 10 background；low-Sun
camera未对准live Sun。

本ADR因此作出以上窄修正：BSM tile改为`256/512/768`并使用3×3 transmittance-domain tent PCF；新增public Globe-only
`surfaceRadianceScale=10`与finite-path transmittance asymptote；Test增加live-Sun-aligned rays preset（显式`0.6/4`既有fog controls）和Globe-only
layer selector，offline Natural Earth II为默认，Cesium World Imagery + World Terrain为optional Ion/network mode，solid color保留为diagnostic。

本修正不增加pass/program/texture/FBO/history，不增加upstream path或SGP，不下载/复制新asset，不修改Planar product或A6 boundary。验证保持最小充分：
PCF、surface/aerial endpoint各一个direct GPU fixture，三个owner可见问题各一个direct state，不建立hash/replay/convergence或full matrix。A5-G重新进入
`changes-requested`，直到Architecture re-review与project-owner visual re-gate通过。

## Owner-correction execution writeback — 2026-08-28

Execution implemented the amended contract without changing its topology.
RGBA16F atlas bytes are `2,097,152 / 8,388,608 / 18,874,368`; the PCF and
surface/aerial actual-GPU fixtures each passed 1/1. The public
`surfaceRadianceScale=10` is published through the existing `SGP-0009` record,
and package/runtime checks pass without generated changes.

The final-source browser confirmed finite/storage-safe output, offline and
online Globe surface modes, high Sun `67.484068°`, aligned sunset `2.175387°`
with `dot(view, sun)=1`, and no-moon raw cloud RGB zero. The direct downward
profile still has a `0.400905` luminance step and the aligned rays off/on
percentiles were identical. These facts are not hidden by another formula or
Test workaround; Architecture/project-owner review remains required.

## Owner-correction Architecture re-review — 2026-08-28

Architecture accepts and freezes the Beer-space PCF, `surfaceRadianceScale`,
finite-aerial asymptote and Globe layer selector. Their two direct GPU fixtures
were independently rerun and passed 1/1. `A5-AR-004`, `A5-AR-005` and
`A5-AR-008` are closed.

The delivered downward profile is not finite/clear evidence. Its camera is at
120 km with pitch `-8°`, while the WGS84 horizon is roughly `-11°`; the center
ray therefore misses the ellipsoid. The 33 sparse display-only samples contain
no depth classification, so their maximum step and zero tail cannot be
attributed to an aerial discontinuity. `A5-AR-006` remains open only for one
corrected single-frame Test observation; the accepted product asymptote is not
reopened.

`A5-AR-007` remains open for a product correction. The current A3 fog consumer
maps metres to directional visibility with `exp(-shadowLength/200000)`, so a
normal kilometre-scale cloud-shadow segment attenuates fog by only a few
percent. This is neither the accepted Bruneton final-shadow-segment meaning nor
a height-density-weighted fog integral. The decision above now states the exact
bounded optical-depth fraction. Closure requires that focused fog fixture plus
one integrated resolved-length/local rays observation, not another full-frame
percentile gate or expanded matrix.

## Bounded 006/007 execution writeback — 2026-08-28

The Globe A3 fog implementation now follows the decided final-shadowed-segment
contract exactly: clamp decoded `L` to the bounded fog segment, evaluate the
existing height-density optical depth on the final subsegment, and multiply
directional Sun by `(tauTotal-tauShadow)/tauTotal`. Zero length is identity,
full length is zero directional contribution, and ambient/transmittance are
unchanged. The obsolete `exp(-L/200000)` helper is removed.

The production-source actual-GPU fixture passes zero, partial, full and
ambient-only cases; the partial result matches an independent CPU integral.
Same-frame Test evidence at 120 km/`-20°` identifies a finite depth
`0.876953125` to exact-clear depth `1` neighbor with luminance
`0.803154/0.818690`. The fixed low-Sun observation resolves 3,666 nonzero
shadow-length pixels (median `391.007 m`, `p90=1173.021 m`) and a small negative
17×17 near-Sun RGB delta. These measurements add no new radiometric control,
effect, resource or acceptance threshold.

## Architecture bounded-correction re-review — 2026-08-28

`A5-AR-006` is closed by the corrected same-frame depth observation. The
remaining rays failure is traced to the producer interval. At fixed reference
commit `three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`,
`getShadowRayNearFar` and `marchShadowLength` cover a separate ray from the
camera to scene/ground/shadow top, capped at 200 km. SceneGIS currently samples
only the cloud-support segment and therefore returns only roughly
`0.2–1.8 km` in the fixed view.

The main decision above is amended to preserve the existing 32/64-sample cost
while spanning that independent shadow-view interval. It also corrects the A3
fog placement to the camera-near prefix used by reference `approximateHaze`;
the earlier final-subsegment Architecture instruction is superseded for A3 fog
only. Public API, BSM resources, pass/program/texture/FBO/history counts,
Bruneton point transport, upstream scope and Planar remain unchanged.

## Bounded producer execution writeback — 2026-08-28

The implementation now derives the Globe shadow-view interval independently
from cloud support, bounded by the nearest finite scene distance, ground or
shadow-top exit and the existing 200 km maximum. It redistributes the existing
`primarySteps` BSM samples across that interval without adding another BSM loop
or changing any resource. Cloud material transport remains on its accepted
support interval and may be invalid while encoded shadow length is positive.

The A3 Globe fog implementation now removes the camera-near height-density
optical-depth prefix from directional Sun only. Focused actual-GPU producer and
fog-prefix fixtures each pass 1/1. The fixed low-Sun evidence expands the
resolved rays-on distribution to 197,878 nonzero pixels with median
`2737.048 m` and p90 `16031.281 m`, but the 17×17 near-Sun displayed RGB remains
unchanged at 8-bit precision. That residual owner-visible risk is reported for
Architecture review; no additional effect, calibration or search is adopted.

## Test witness correction writeback — 2026-08-28

The product transport decision remains frozen. Test evidence now separates
twilight warmth (`trueSunset`, `18:30Z`) from the crepuscular owner state
(`17:30Z`). At 15°E/45°N, the latter measures Sun elevation `11.647154°` with
the camera exactly aligned (`dot(view,sun)=1.000000`) and retains coverage
`0.65`, cloud time `0`, and visible fog controls `0.6/4`.

One fixed off/on pair remains visually without a distinct shaft and shows only
slight broad dimming, despite 68,306 nonzero resolved rays-on lengths. The
derived 17×17 center ROI difference is no longer an acceptance authority. No
replacement threshold, state search or product decision follows from this Test
witness.

## Architecture producer re-review — 2026-08-28

The independent shadow-view producer and camera-near A3 fog prefix are accepted
as the final product contract. Both focused actual-GPU fixtures pass under
independent review, and no further radiometric multiplier, source term, public
control or resource change is authorized.

The owner evidence must not reuse the `2.175387°` true-sunset state as the sole
crepuscular-rays witness. True sunset remains the twilight surface/color state;
a separate Test-only rays state uses `2026-06-21T17:30:00Z` at 15°E/45°N,
live-Sun camera alignment, coverage `0.65`, cloud time `0`, and visible `0.6/4`
fog controls. Its acceptance is one direct owner visual off/on pair, not a
center-ROI threshold or automated gate. This evidence correction does not alter
the product, public API, SGP-0009, resources, Planar boundary or A6 scope.

## Shadow-length sampling amendment — 2026-08-28

The Test-only witness correction did not produce a distinct shaft and exposed
a product sampling discrepancy missed by the preceding review. The fixed
reference evaluates shadow length with raw radius-zero BSM samples and
progressive intervals beginning at `50 m` and growing by `1.01`; approximately
374 intervals cover the `200 km` bound. The accepted SceneGIS candidate instead
reused the cloud-body `32/64/64` uniform sample budget and the surface
receiver's 3×3 PCF for every view sample.

The earlier statement that the producer is final is superseded. Surface shadow
reception retains the 3×3 Beer-space PCF. Shadow-length integration receives a
separate raw one-tap BSM reconstruction, retains transmittance-domain cascade
overlap, and uses at most 384 progressive `50 m × 1.01` intervals with the
last interval clipped to the bounded segment. Cloud-body sampling, packing and
resolve, Bruneton and A3 consumers, resources, public API, SGP-0009 and Planar
remain unchanged. This amendment replaces at least 576 filtered atlas reads at
medium/high quality with at most roughly 384 raw reads rather than adding a new
rendering resource or pass.

## Raw/progressive BSM execution writeback — 2026-08-28

The accepted surface/cloud 3×3 Beer-PCF receiver remains unchanged. Equivalent
shadow-length integration now owns a raw one-tap BSM reconstruction with the
same atlas decode and cascade selection, including transmittance-domain cascade
overlap. Its bounded view march uses at most 384 intervals, beginning at 50 m
and growing by `1.01`, with actual interval weighting and an exact final clip.
The cloud-body primary march and all resource/API boundaries are unchanged.

The focused actual-GPU result matches an independent CPU progressive equation
and rejects the former filtered 64-uniform mutation. The fixed 17:30Z pair still
shows no distinct shaft despite 68,288 nonzero rays-on lengths; it exhibits only
slight broad dimming. Consistent with the bounded assignment, this evidence
does not authorize another source term, multiplier, state search or phase
change.

## Full participating-medium amendment — 2026-08-28

The raw/progressive BSM correction is accepted, but its unchanged visual result
exposed an earlier decision error. Fixed-reference `approximateHaze` is not a
shadow-only delta: at zero shadow length it still renders full Sun and sky
inscattering, and positive length removes only directional Sun scattering over
the camera-near equivalent prefix. SceneGIS clear depth instead added only
`F(shadowLength) - F(0)` to the existing background. It could therefore show
only slight negative modulation and no clearly illuminated shafts.

The correction does not add a second medium. Globe clear depth applies the
existing exponential height fog exactly once with decoded length, including
zero, and the early return must not bypass it while height fog is enabled. Its
Globe directional source consumes physical A2 Sun color without max-solar
normalization; the existing public power-lobe exponent and directional scale
remain the SceneGIS adaptation. Ambient, extinction, finite/cloud fog and
Bruneton transport are unchanged.

The sole owner witness maps the fixed reference haze coefficients directly:
`density=3e-5`, `heightFalloff=1e-3`, `startDistance=0`,
`maximumOpacity=1`, and `directionalScale=0.9/(0.9+0.5)`. These values replace
the former hand-selected `0.6/4` visibility setup only where they map a named
reference coefficient; no sweep or hidden multiplier is authorized. A single
amended production-source fog fixture and the unchanged `17:30Z` pair are the
complete evidence boundary.

## Full participating-medium execution writeback — 2026-08-28

The Globe clear-depth path now evaluates the existing height-fog medium exactly
once with decoded shadow length. Zero length renders the complete lit baseline;
positive length changes only its directional Sun prefix. Enabled Globe fog is
not bypassed when clouds are disabled. The Globe directional source now uses
physical A2 Sun RGB directly, while Planar retains the normalized formula.

The production-stack GPU fixture passes the full/directional/ambient/unit and
two-mutation authority. The fixed 17:30Z reference-medium pair still has no
distinct visible shaft and shows only broad dimming. No second haze, source
term, multiplier, state search or further architectural change is adopted from
that result.

## Reference intensity mapping amendment — 2026-08-28

The full-medium correction is accepted. A2 physical Sun RGB defines the
spectral incident source, but it does not replace the fixed reference's
explicit scene-linear haze calibration. Reference directional haze multiplies
that source by `sunIntensity = 20` and scattering albedo
`0.9 / (0.9 + 0.5)`.

For the A5-G fixed owner witness, map both named coefficients through the
existing public directional fog scale as `20 * 0.9 / 1.4`. This amendment does
not change the public default/range or any product shader. It authorizes one
Test preset correction and one direct off/on visual pair only; no sweep,
derived threshold, additional resource or Planar work is part of the decision.

## Reference-intensity Test execution writeback — 2026-08-28

The fixed 17:30Z witness now maps the named reference coefficients exactly to
the existing control value `12.857143`. Its sole off/on pair remains without a
distinct visible shaft and instead produces a broadly bright, nearly uniform
medium with only a small distribution change. No product/default/range change,
state search or further architectural decision is adopted from this Test-only
result.

## Clear-sky Bruneton branch amendment — 2026-08-28

The reference-intensity Test result closes that hypothesis without adopting
its coefficient: source intensity cannot recover spatial shafts when clear sky
uses the wrong transport branch. The fixed owner preset returns to the prior
`0.9 / 1.4` directional scale.

This ADR now makes the reference branch distinction explicit. Exact clear
depth consumes decoded cloud shadow length through Bruneton
`GetSkyRadiance(camera, ray, shadowLength, ...)`; finite scene geometry and
cloud bodies consume it through `GetSkyRadianceToPoint`. A planar background
distance sentinel must never stand in for an infinite Globe sky ray. The
SceneGIS background continues to render zero-length sky, and Aerial may compose
the clear shadow as the additive difference between shadowed and zero-length
infinite-sky radiance so the already-rendered Sun disk and unshadowed background
remain unchanged.

The existing full A3 height fog remains the deliberate SceneGIS adaptation and
continues to consume the same decoded length; it is not a replacement for the
Bruneton clear-sky branch and receives no new calibration. This amendment adds
no API, resource, pass, program, texture, FBO, history, SGP, asset or Planar
decision. Closure is one focused actual-GPU source fixture and the existing
single fixed owner pair only.

## A5-AR-011 execution writeback — 2026-08-28

Execution implements the amended branch contract without deviation. The
infinite-sky wrapper passes nonnegative metres converted to kilometres into
`GetSkyRadiance`; Background supplies exact zero; Globe exact-clear Aerial
composes the shadowed-minus-zero-length infinite-sky delta. Finite geometry and
cloud bodies continue through `GetSkyRadianceToPoint`.

The focused actual-GPU source fixture passes and deterministically rejects the
former `1e9 m` finite-point mutation. The single fixed owner witness retains an
active resolved shadow-length field but still lacks a distinct separated
shaft under direct inspection. This result authorizes no additional
calibration, resource, API, SGP, Planar or phase change.

## Reference cloud haze amendment — 2026-08-28

A5-AR-011 is accepted and frozen, but its unchanged owner image exposes a
separate omission in this ADR. At fixed commit
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`, `haze=true` is a
base default inherited by every quality preset. `CloudsMaterial.ts` therefore
compiles `HAZE` with density scale `3e-5`, exponent `1e-3`, scattering `0.9`,
absorption `0.5` and sky scale `1`. Low and medium may disable the expensive
shadow-length march, but they do not remove the lit haze baseline.

The original decision to absorb `approximateHaze` into A3 is superseded. The
reference term is coupled to cloud coverage and cloud bounds, consumes scalar
ground Sun/sky irradiance, uses the same equal dual-HG cloud phase, and applies
an opacity-weighted cloud-front clamp before post-cloud composition. A3's
public density, power lobe and generic scene composition are not equivalent.
The required term is therefore part of the reference cloud effect, not another
generic height-fog subsystem.

SceneGIS will adapt the exact reference equations in the existing Globe shader
program and Aerial pass. The medium exists whenever Globe clouds are active;
`showCrepuscularRays=false` gives it zero shadow length and a fully lit baseline.
Positive length removes only directional Sun over the camera-near equivalent
prefix; total haze opacity and sky scattering remain unchanged. The result is
composited once after the existing scene/cloud result with reference ordering.

This amendment adds no pass, program variant, texture, FBO, history, asset,
public API, calibration scalar, upstream patch or Planar behavior. A3 and the
A5-AR-011 Bruneton paths remain independently valid and unchanged. Validation
is limited to one amended production-source GPU fixture and one fixed direct
17:30Z off/on witness with A3 disabled for source isolation.

## A5-AR-012 execution writeback — 2026-08-28

Execution restores the reference cloud-local haze without deviation. The
existing Globe Aerial program now evaluates its bounded analytic medium from
the real Cesium near plane, consumes existing cloud coverage and Bruneton
ground Sun/sky irradiance, and composites it once after the retained scene and
cloud result. Cloud shadow length affects only directional Sun; zero length
preserves the fully lit haze baseline.

The amended production-source GPU fixture passes. The one fixed A3-disabled
owner pair retains an active resolved shadow-length field but still lacks a
distinct separated shaft under direct inspection. This result authorizes no
additional calibration, resource, API, SGP, Planar or phase change.

## A5-AR-013 haze input-authority correction — 2026-08-28

The A5-AR-012 implementation does not yet satisfy this amendment. Camera haze
terms and Bruneton scalar irradiance must use the actual unshifted virtual
camera position; the Cesium near offset is only the start of the bounded haze
interval. The cloud opacity clamp must consume the decoded cloud-front
distance, while mean distance remains reserved for cloud atmospheric/fog
transport.

This is a correction of coordinate and attachment authority, not a new model or
calibration. It changes no fixed haze coefficient, phase, source composition,
resource, API, upstream seam or Planar behavior. Closure remains one amended
existing GPU fixture and the same single A3-disabled 17:30Z visual pair; no
additional test matrix or visibility metric is part of the decision.

## Terrain-preservation and horizon-domain amendment — 2026-08-28

Owner World Terrain evidence adds two constraints to the reference cloud-haze
adaptation. First, cloud-local haze is not a second generic finite-scene fog:
exact-clear sky retains it, but finite geometry consumes it only when the
existing cloud selection identifies a visible cloud body before the scene.
Without that sample, A2/A3 composition is preserved exactly. This is the
`A5-AR-014` scope correction.

Second, the A5-AR-006 transmittance interpolation is superseded for Globe.
Every Bruneton source evaluated inside the Globe Aerial program belongs to the
same renderer domain as Background and is multiplied by
`backgroundRadianceScale * aerialRadianceScale`. The latter remains default
one and is a relative Globe coefficient; Planar retains its existing absolute
meaning. `surfaceRadianceScale` remains solely a Globe surface-lighting
calibration and no longer participates in Aerial source scaling.

The Globe exponential-height-fog source similarly enters the background
radiance domain exactly once before the existing fog component coefficients
and Beer composition. Background, finite scene and cloud-body callers pass the
same `backgroundRadianceScale`; Planar passes identity. This does not change
fog extinction, start/end bounds, maximum opacity, directional shadowing or
public fog controls.

These `A5-AR-015` changes preserve exact raw-depth classification, Bruneton
LUTs and horizon clamping, physical transport, public defaults/ranges, SGP,
resources and display transfer. A blur, depth epsilon, distance bias or
screen-space horizon blend is prohibited. Validation amends only the existing
surface/aerial and production fog fixtures and uses one fixed World Terrain
four-state direct inspection; no additional gate machinery is authorized.

### A5-AR-013/014/015 execution writeback — 2026-08-28

Execution applies the accepted authority and domain corrections without a new
public or renderer seam. Haze uses the actual virtual camera and non-sea-level
irradiance position, while the near-shifted origin remains an interval-bound
input. Decoded front and mean distances are separate, and finite/no-cloud
pixels skip cloud-local haze. Globe Aerial Bruneton source uses the
background/aerial product; Globe fog source uses the background scale once and
Planar passes identity. Both amended GPU fixtures pass, and the fixed World
Terrain four-state inspection preserves terrain and horizon continuity. The
fixed 17:30Z pair still lacks a distinct separated shaft despite an active
resolved-length field; no further model or calibration change follows from
this execution result.

## Globe terrain-depth lifecycle amendment — 2026-08-28

All active Globe fullscreen environment consumers require one unified actual
terrain-plus-scene depth authority. Cesium's default
`globe.depthTestAgainstTerrain === false` does not satisfy this requirement:
after drawing Globe, Cesium copies terrain depth to `czm_globeDepthTexture`,
clears the main depth buffer, writes `DepthPlane`, and later exposes the
post-clear main depth-stencil texture to post processing and `SGP-0008`.

Therefore an enabled Globe `SceneGISEnvironmentEffects` instance owns
`scene.globe.depthTestAgainstTerrain = true` for its active lifecycle. It
snapshots the prior value, establishes the prerequisite before pipeline
allocation, requires it to remain true while active, and restores the prior
value on disable or disconnect if it changed it. A pre-existing true value is
left owned by its caller. External mutation while active is a configuration
conflict and fails through the existing controller error path.

The project owner explicitly accepts this visible Globe setting as a normal
project prerequisite; it must be established by production controller code,
not hidden in `Test/高级环境.html`.

This lifecycle matches the fixed Cesium reference, which enables the same Globe
property before its atmosphere/cloud pipeline. It deliberately retains the
existing main-depth input through consume-only `SGP-0008`: no second
terrain-depth texture, packed-depth merge, additional pass, ellipsoid fallback,
far-plane heuristic, horizon epsilon/mask or opacity adjustment is allowed.
The requirement is Globe-only and leaves Planar unchanged. While active, the
normal Cesium consequence that primitives depth-test against terrain is part of
the accepted contract; exact prior behavior is restored when SceneGIS releases
the lifecycle.

### A5-AR-016 closure

The production controller implements this lifecycle before pipeline allocation,
preserves a caller-owned true value, rejects active external invalidation and
restores an owned prior-false value on disable or disconnect. Architecture
independently reviewed the source and reran the amended focused lifecycle Spec
with a 1/1 success result. No upstream patch, shader, resource or Planar change
was introduced. Owner visual acceptance remains a separate explicit gate.

### A5-G owner gate closure

The project owner manually rechecked the corrected Globe result after
A5-AR-016 and reported that the effect is correct. A5-G therefore satisfies the
Architecture and visual gates. The required local checkpoint remains blocked by
A5-AR-017 until the existing SGP-0009 FrameState extension read has an explicit
local structural JSDoc type boundary and engine `tsc` passes. This type-only
closure does not activate A6-G or Planar.

### A5-AR-017 execution

The SGP-0009 read uses a local structural JSDoc cast for the optional
`_sceneGISGlobeLighting` record and its optional boolean `active` field. This
keeps upstream `FrameState` unaware of the SceneGIS extension while retaining
the accepted frame-local runtime protocol. Engine `npx tsc` passes; the cast
adds no runtime branch, fallback, resource, API, upstream path or new SGP.

### A5-AR-017 closure

Architecture independently reviewed the local structural cast and reran engine
`npx tsc` successfully. The type boundary is closed without changing runtime or
the SGP-0009 path set. Together with the accepted owner visual gate, this closes
A5-G. The phase-closing local commit is its checkpoint; A6-G and Planar remain
separately gated.

## 2026-09-01 A8-AR-013 spherical receiver amendment

Globe BSM production and reception must use one ray geometry. The producer
intersects the local osculating cloud shell, so surface, cloud-body and ray
receivers may not reconstruct distance with the tangent-plane approximation
`(cloudTop-z)/sun.z`. Receivers solve the positive Sun ray against the same top
sphere and subtract only an explicit already-covered distance.

OD reconstruction consumes the producer's front distance, mean extinction,
bounded maximum OD and bounded tail; dropping the tail is not permitted. The
fixed ECEF light basis, square stable cascade extent, texel snapping,
transmittance-domain cascade overlap and receiver filtering remain authoritative.
This correction adds no shadow translation, screen-space reprojection,
camera-relative offset, temporal shadow history, resource, public API, upstream
path or SGP.

## 2026-09-01 A8-AR-014 world-grid and structured-sampling amendment

Globe BSM cascade orientation and phase are world-space authorities. Light
right/up axes are constructed in ECEF, cascade extents are square, and each
center is snapped to a global ECEF light-plane texel lattice. The camera-local
osculating frame may convert the resulting world center for shader execution,
but it may not define or reset the lattice phase. Rotating the camera therefore
cannot translate a fixed Sun/cloud shadow across the terrain.

BSM integration adopts the pinned `three-geospatial` structured-volume sample
construction with a stable world ray and per-frame STBN phase. This changes no
atlas size, cascade count, filtered receiver, pass, program, texture, FBO,
history allocation, API, upstream-owned path or SGP. The reference's separate
temporal shadow pass is not imported; any remaining sub-texel blockiness is a
project-owner visual risk rather than authority for an unbounded resource
addition.

## A8-AR-015 execution amendment — full ECEF BSM authority

Each Globe BSM cascade now owns one full invertible ECEF light transform and
its inverse. The producer reconstructs its ray from the inverse matrix; surface,
cloud-body and shadow-length receivers project the same spherical ECEF material
position with the forward matrix. Cascade selection uses camera view-space
depth, and shell intersection is camera independent. Atlas dimensions,
cascades, commands, programs, textures, FBOs, PCF and bytes are unchanged. No
temporal BSM history was added after the spatial invariant passed.

## A8-AR-017 execution amendment — temporal Beer atlas

The later owner rotation evidence authorizes the audited temporal shadow pass.
The producer retains one atlas draw topology but adds front depth and velocity
as its second RGBA16F attachment. A single resolve program/command publishes
Beer into two ping-pong history targets using closest-depth velocity,
reprojection, current 3x3 mean/variance clipping and alpha `0.01`. Surface and
cloud consumers continue to decode Beer and use the existing 3x3 surface PCF.

Receivers select exactly one view-depth cascade; the former 5% blend between
non-overlapping cascade domains is removed. Added low/medium/high storage is
`6,291,456 / 25,165,824 / 56,623,104` bytes. Program/command/texture/FBO/
attachment/history deltas are `+1/+1/+3/+2/+3/+2`. No API, asset, upstream
path or SGP is added.

## A8-AR-019 execution amendment — temporal BSM sampling and overlap

The Beer-shadow producer advances its existing STBN volume by rendered frame.
History remains valid through substantial rotation when full-ECEF reprojection
and projection/frustum/translation/Sun/material/quality bounds remain valid.
Linear history samples are clamped to their atlas tile's half-texel interior.
Adjacent producer-covered cascades overlap and combine in Beer-transmittance
space; surface PCF and the declared resource topology remain unchanged.

## A8 qualification amendment — structured BSM sampling authority

The Globe BSM producer uses the reference structured sample period
`clamp(maxRayDistance / iterations, 100, 1000)` and subtracts
`stepSize * jitter` from the structured entry before marching. The existing
25/50 quality budgets and resource topology remain unchanged. Fixed-world
qualification uses nonuniform material, real producer coverage, substantial
camera motion and producer-covered cascade transitions; OD tolerances derive
from cascade texel footprint, bounded interval size and binary16 quantization.

## A8 qualification amendment — receiver-local elevation and OD ownership

Cloud-body BSM filtering selects raw versus filtered reconstruction from the
receiver-normal/ECEF-Sun dot product. The local Sun march owns only its reported
covered interval; BSM reconstruction starts at that distance and contributes
direct solar OD only. Sky/ambient, opacity, atlas topology and PCF remain
unchanged.

## A8 qualification amendment — shadow-enabled layer authority

Globe BSM support is the union of reference layers explicitly enabled for
shadow casting, not the union of all visible cloud layers. Cumulus, stratus and
mixed use their low layers; cirrus/high layers remain visible but do not enter
BSM density or support. One renderer table/helper and its GLSL mirror own the
same offsets and thickness fractions. The resulting shadow top is published to
both atlas receivers and the frame-local Globe surface seam. A preset without
caster support publishes identity shadow/ray coupling. This changes no visual
cloud density, color, atlas topology, filter, resource, public API, upstream
path or SGP.

## Planar P10 activation — 2026-09-12

The owner authorizes the Planar volumetric-light successor to P9. Reuse the
accepted packed equivalent-length transport, raw progressive Beer view march,
independent shadow history and cloud-local haze in the existing programs.
Planar uses absolute metric Z and a shadow interval bounded by zero and the
low-layer caster top; its atlas coordinates retain CPU origin subtraction.
Equivalent length denotes a camera-near prefix within that interval, including
above-cloud entry. The Planar LUT correction removes prefix scattering with
entry transmittance and preserves whole-path extinction and ground radiance.
Generic fog removes directional source only over the overlapping prefix.
Because Planar Background already applies fog, clear Aerial adds the source
and atmosphere delta attenuated by that fog, without applying fog twice.
The reference cloud haze retains coverage, albedo and phase coefficients but
uses exact fixed-Z density integration and physical Planar Sun/diffuse sky.
Zero length preserves its lit baseline. Native geometry shadows, Globe behavior,
public defaults, resources and upstream seams remain unchanged. The equivalent
prefix remains an approximation; it does not store individual shadow intervals.
