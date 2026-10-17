# ADR-0044：Separate Background and Aerial Radiance Calibration

## 状态

- Status：`approved`
- Date：`2026-08-15`
- Decision owners：Architecture Agent、project owner gate feedback
- Related extension：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- Related phase：
  `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md`
- Related review：
  `AgentDocs/atmosphere-clouds-effects/reviews/2026-08-14-a2-bruneton-atmosphere-aerial-perspective.md`
- Related patch：active `SGP-0008`（consume only）
- Amends：ADR-0043 scene-linear radiance mapping与visual diagnostics
- Constrains：ADR-0041、ADR-0042、ADR-0043

## 上下文与第三次 owner gate 证据

第三次project-owner visual gate判定A2不能通过：default `radianceScale=10`时地表被大气颜色覆盖。Architecture直接检查当前
`Test/高级环境.html`并隔离pass：

- background-only保留Globe与Planar的原始深绿地表，Planar黄色comparison box也保持黄色；
- aerial-only在scale `10`把两种世界的地表变为近乎统一的蓝色，并把黄色box漂白；所以问题不来自background order、native冲突或
  RGBA16F storage clamp；
- scale `10`的ground/day aerial-only统计为Globe `L1=41,327,126`、`max=465`、`305,232` changed pixels，Planar
  `L1=66,585,926`、`max=414`、`334,665` changed pixels；每个changed pixel的平均RGB绝对偏移约为`135.4/199.0`；
- 同一场景把scale降到`1`后，Globe/Planar aerial-only平均偏移降为约`3.7/24.7`，地表颜色恢复，但combined sky重新变暗，复现了前一次
  owner gate的“强度较弱”。

ADR-0043的单一`radianceScale`假设physical atmosphere radiance与Cesium geometry scene color共享同一radiometric calibration。实际
Cesium材质输出是renderer scene-linear color而非有绝对物理单位的surface radiance。用同一倍率把sky调到可见，会使aerial in-scattering相对
`inputColor * transmittance`过强；降低该倍率又会同时削弱sky。单一默认值不存在能满足两个gate的稳定折中。

## 决策

### Public calibration contract

A2尚未checkpoint或发布，因此在首个A2提交前移除含义含混的public `radianceScale`，不保留alias或deprecation shim，改为两个双世界一致的
public calibration：

- `backgroundRadianceScale`：constructor option与writable property；default=`10.0`；finite `[0.0, 64.0]`；只用于
  background sky、Sun disk与background ground-boundary radiance；
- `aerialRadianceScale`：constructor option与writable property；default=`1.0`；finite `[0.0, 64.0]`；只用于resolved geometry的
  aerial in-scattering radiance；
- 两个setter都只更新uniform source并`requestRender`，不得reload LUT、recompile program、重建FBO/texture或改变generation state；
- Test页分别暴露`Background radiance`与`Aerial radiance`控制，不得用一个UI slider在runtime外再次耦合两者。

这是active、uncommitted phase中的public contract correction，不是已发布API的breaking change。Package、types与docs中不得残留
`radianceScale`。

### Shader composition

- Background先完成physical sky/Sun/ground composition，再计算
  `physicalRadiance * backgroundRadianceScale`，最后执行ADR-0043 RGBA16F storage guard。
- Aerial继续计算
  `inputColor * transmittance + radiance * aerialRadianceScale`，最后执行storage guard。不得把aerial scale乘到input color、
  transmittance或整个composition，也不得新增隐藏mix/opacity/exposure multiplier。
- LUT、phase function、multiple-scattering、segment transmittance、log-depth reconstruction与Sun physical formula均保持不变。
- 两个scale只解决Cesium renderer domain的calibration mismatch；它们不宣称改变physical transport，也不引入gamma、white-point或tone
  mapping。Cesium仍是display-transfer authority。

### Two-sided visual diagnostics

ADR-0043仅用`max RGB delta >= 8`作为minimum observability floor，不能识别过强效果；本次gate证明单侧下限会把严重washout误报为PASS。
A2R3诊断必须同时证明“看得见”和“保留地表颜色”：

- ground/day的background、aerial与combined仍报告`L1`、`max`与changed pixels；nonidentity case继续要求`max >= 8`；
- ground/day aerial-only额外报告`meanChangedDelta = L1 / changedPixels`。Globe与Planar默认值都必须满足
  `0 < meanChangedDelta <= 32`；当前错误默认的约`135/199`必须失败；
- Direct Test还应报告每个viewer下方中央ground ROI的mean RGB delta，排除少量远景box或Sun pixel掩盖整片地表。ROI必须避开badge、logo和
  sky；默认值应非零且不超过`32`；
- air/high允许更强的距离雾化，不套用ground ROI上界；night、clear-depth与nonintersecting继续按identity/optional规则判断；
- 数值门槛只是防止明显回归，不能替代project-owner visual judgment。

## 验证

- Public Specs覆盖两个constructor option/property的default、finite range、requestRender、warm resources及no-fetch/no-compile；确认
  `radianceScale`不再出现在public runtime/types/docs。
- Shader contract与raw RGBA16F pixel fixtures分别证明background只响应`backgroundRadianceScale`、aerial只响应
  `aerialRadianceScale`；另一scale变化不得改变对应pass。
- 既有Sun-aligned scale `10/64` storage fixtures迁移到background scale；aerial scale `0/1/2` linearity、scale `64` finite、
  transmittance invariance与log-depth fixtures迁移到aerial scale。
- Test页在ground/day默认`10/1`下执行background/aerial/combined、full-frame mean与ground ROI双侧诊断；local Chromium保存准确统计与截图，
  然后重新请求第四次project-owner visual gate。
- A1 slots/reference frame、Scene aggregate、build/types/docs、installed package、exact LUT/hash、disabled/native conflict/lifecycle、upstream与
  generated audit全部回归。

## 停止条件

A2R3不得修改LUT、physical transport、`Scene.js`、SGP-0008、FramebufferManager或新增render target。若双scale仍不能在default ground/day
同时满足sky可见与地表保持，Execution必须停止并提交新的Architecture discussion，不得继续增加Test-only multiplier或进入A3。

## 参考

- [ADR-0041](ADR-0041-bruneton-atmosphere-aerial-perspective.md)
- [ADR-0042](ADR-0042-planar-precomputed-atmosphere.md)
- [ADR-0043](ADR-0043-atmosphere-log-depth-and-radiance-mapping.md)

## A5-G Globe surface amendment — 2026-08-28

[ADR-0047](ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md) adds a
Globe-only `surfaceRadianceScale=10` after the first physical Sun/sky surface
consumer exposed the missing Cesium renderer-domain bridge. This does not
change `backgroundRadianceScale`: it remains background-only. It also does not
restore one global atmosphere multiplier.

For Globe finite geometry only, ADR-0047 uses path extinction to interpolate the
additive physical aerial source from `aerialRadianceScale` at `T -> 1` to
`surfaceRadianceScale` at `T -> 0`. This preserves the near-ground anti-washout
endpoint accepted here while making fully extinguished distant surface use the
same default renderer domain as the Globe surface and background. Planar and
cloud-body formulas remain governed by this ADR without that A5-G amendment.

## A5-AR-015 Globe horizon-continuity amendment — 2026-08-28

The preceding A5-G interpolation is superseded after direct World Terrain
evidence showed that partial-transmittance finite rays still cannot converge to
the clear background. The Globe Aerial program now treats
`backgroundRadianceScale` as its renderer-domain authority and
`aerialRadianceScale` as a relative coefficient. Every Globe Bruneton source in
that program uses their product; `surfaceRadianceScale` remains exclusive to
Globe surface lighting. Near geometry does not need a scale interpolation
because physical in-scattering itself approaches zero with optical path length.

Planar retains this ADR's original absolute `aerialRadianceScale` semantics
until its later phase. Public defaults and finite ranges remain unchanged. The
amendment changes no LUT, transmittance, scattering equation, scene-input
attenuation, depth classification or display transfer.

### A5-AR-015 execution writeback — 2026-08-28

The Globe Aerial program now applies
`backgroundRadianceScale * aerialRadianceScale` to exact-clear shadow deltas,
finite point radiance and cloud-body Bruneton radiance. The superseded
transmittance-to-`surfaceRadianceScale` interpolation is removed. The existing
height-fog helper receives an explicit source-domain coefficient: Globe
Background/Aerial/cloud-body calls pass `backgroundRadianceScale`, while Planar
passes `1.0`. The amended actual-GPU fixtures pass and public defaults/ranges
remain unchanged.

## P5 Planar horizon-continuity amendment — 2026-09-12

Planar P2/P4 now supply physical surface/model lighting. The original absolute
aerial mapping leaves a 10:1 source-domain step between extinguished distant
geometry and clear sky at default settings. Removing the obsolete atmosphere
distance clip (ADR-0042 P5) exposes this separate discontinuity in the fixed
daytime view. The same accepted A5-AR-015 solution now applies to Planar:
`backgroundRadianceScale * aerialRadianceScale` scales physical aerial radiance
for both finite geometry and cloud optical composition. Thus aerial scale is
relative to background scale on both worlds, with existing defaults/ranges.

Only additive atmospheric radiance changes. Input attenuation, LUTs, optical
coefficients, surface/cloud material scales, fog calibration, HDR and native
shadow ownership remain unchanged. Near-path in-scattering naturally tends to
zero; do not add distance-dependent artistic blending. This supersedes the
Planar absolute semantics above. Document the public property meaning and run
full build/types plus actual background/finite/cloud GPU endpoint tests and
near/far visual review. No new upstream path, SGP, uniform or resource.

## 2026-10-16 amendment: Neutral surface and atmosphere defaults

Subsequent owner review at local noon with HDR still found a dark image. Equal
default scales establish only relative consistency. The owner then approved
restoring the missing spectral-to-linear-RGB conversion described below. Visual
qualification remains pending; equal-scale tests alone do not establish it. See RAD-04 in the
[diagnostic review](../../../AgentDocs/webgl-deferred-renderer/reviews/2026-10-16-environment-radiance.md).

The owner requests engine-level radiance consistency while leaving automatic
exposure disabled by default. Both worlds already consume physical surface
irradiance and atmospheric radiance in linear space. However, automatic scenes
used surface scale 1 with atmospheric scale 4 (Globe) or 10 (Planar); explicit
controllers used surface scale 10. The default therefore amplified in-scattering
relative to surface lighting, independently of display HDR.

Set surfaceRadianceScale and backgroundRadianceScale to 1 for both worlds and
both creation paths. Aerial and cloud relative scales remain 1. Remove the
automatic instance's LDR-specific surface override. This supersedes earlier
default values in this ADR, ADR-0046, ADR-0047 and ADR-0161, while preserving the
existing explicit property meanings, ranges and warm-update behavior.

At neutral settings the composition is `surfaceRadiance * transmittance +
atmosphericRadiance`, with no unequal calibration hidden in the creation path.
The common photometric scene unit is defined below; this is not an EV100 camera
calibration. Independent explicit scales remain artistic
controls and can deliberately depart from that baseline. Unlit annotations and
emissive content retain their separate material semantics.

Overall brightness belongs to the display transform. Keep HDR exposure and tone
mapping, LDR clamp/gamma, and automatic exposure's disabled default unchanged.
A common gain of 4 was inspected but clipped sunlit map surfaces in noon LDR;
do not compensate for missing display tone mapping by scaling only surfaces or
only atmosphere. Existing applications that intentionally depend on the old
appearance can specify their former scale values explicitly.

The default-only step did not change Shaders. The spectral amendment below adds
constant arithmetic at source boundaries; it does not change LUTs, optical
coefficients, render passes, attachments, samplers or upstream-owned files.
Validation covers real Globe / Planar linear
pixels across HDR/LDR and default/explicit ownership, resource reuse, existing
physical material consumers and visual comparison. See the
[maintenance plan](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-16-environment-radiance.md).

## 2026-10-16 amendment: Spectral transport to scene RGB

The Earth LUTs store spectral samples at 680 / 550 / 440 nm. They are not RGB
color values. Restore the pinned source's three-wavelength approximation from
[AtmosphereParameters.ts](https://github.com/takram-design-engineering/three-geospatial/blob/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/src/AtmosphereParameters.ts):

- Sun conversion: `(98242.786222, 69954.398112, 66475.012354)`.
- Sky conversion: `(114974.916437, 71305.954816, 65310.548555)`.
- Initial shared reference: `U = dot(SunConversion, (0.2126, 0.7152, 0.0722))`;
  superseded by the fixed daylight reference below.
- Scene RGB radiance / irradiance = spectral value × its conversion / `U`.

The initial divisor follows the original implementation's storage convention. Multiplying
converted scene radiance by `U` recovers the approximation's linear-sRGB luminance
channels in cd/m²; irradiance similarly recovers illuminance channels in lux.
Do not normalize each source or color channel separately. Half-float scene
buffers store relative RGB, not the large unnormalized photometric values.
This approximation is tied to the fixed Earth solar spectrum and is not a
general conversion for arbitrary spectra. Retain the source license with the
existing BrunetonEarth asset attribution; recheck factors when the source
commit, spectral preset or LUT wavelength convention changes.

`SceneGISBrunetonAtmosphere.glsl` owns the boundary. Low-level Bruneton functions,
LUT contents, density, optical depth and transmittance stay in the spectral
transport domain. Globe Sun/Sky surface and scalar wrappers, sky / finite-ray
radiance, and the Sun disk return converted values. Planar splits its LUT's
total horizontal irradiance into direct and diffuse spectral terms before
applying distinct factors; ground-boundary radiance uses their converted sum.
That ground-boundary branch needs one additional existing transmittance-LUT
lookup to recover the direct component, with no new texture or render target.

Globe / Planar terrain, models / Tiles, vector material lighting, cloud incident
and ground light, cloud haze and physical sky reflections consume those RGB
sources exactly once. Height fog remains an empirical artistic source, with
its scattering tint expressed in the same RGB basis. RGB albedo, unlit symbols,
emissive materials, readable-night ambient, Moonlight and explicit RGB lights
must not receive the spectral conversion. The CPU primary-light scale divides
Moonlight / custom DirectionalLight RGB by the **converted** solar irradiance,
preserving those existing RGB contracts. Native model lightColor overrides
retain their bypass. The automatic physical Sun still comes from the Earth LUT;
native compatibility intensity is not an extra physical multiplier.

Exposure remains a display operation and defaults to its existing value; no
automatic exposure, display mode, tone curve or hidden global gain is introduced.
Correcting the color basis is not a promise that every material appears bright
at exposure 1. Numerical qualification and the owner's visual gate are separate.

### Fixed daylight scene reference

The owner approves qualifying Globe first at local noon with HDR disabled.
The previous divisor of approximately 75717.3 cd/m² was chosen by the source for
half-float storage, not as a diffuse-white reference. With the frozen Globe LUT,
a sea-level white Lambert surface under a zenith Sun has scene luminance 0.52315,
and an 18% gray surface has 0.09417. Direct clamp/gamma therefore displays the
reference gray below the intended linear 0.18 baseline.

Use a fixed shared scene luminance unit of **40000 cd/m²** for both Sun and Sky
conversion, and the matching CPU primary-light denominator. This corresponds to
a white Lambert surface under 40000*pi (approximately 125664) lux. The frozen
Earth preset produces reference gray near 0.18 at sea level with a zenith Sun.
This is an explicit rendering calibration, not a claim that all real daylight
conditions have this illuminance or that the previous spectral transport was wrong.

The unit does not depend on the frame, camera, display mode, world, or sampled
scene content. Spectra, optical transport, LUTs, relative Sun/Sky energy, and
Lambert normalization stay unchanged. HDR exposure is still a gain on these
relative scene values; LDR still performs only clamp/gamma. Explicit RGB lights,
unlit materials, emissive colors, readable night RGB and annotations retain
their authored scene-value semantics. Automatic exposure remains disabled.

This supersedes only the divisor in the preceding spectral amendment. Default
surface/background/aerial scales remain 1. No new API, uniform, resource, pass,
or upstream patch is required. Globe white/gray GPU tests and source/ownership
regressions qualify the calibration; Planar transport and visual review remain
separate follow-ups after Globe acceptance.

### Planar finite-grid correction

The subsequent LDR review exposed a real subtraction error: the total irradiance
LUT is 64x16, while transmittance is 256x64. Their edge texels represent different
Sun cosines and heights. Subtracting direct irradiance at the requested coordinates
from interpolated total irradiance can remove valid sky energy. At ground/zenith
the spectral red sky component becomes -0.00559 and is clamped to zero, although
the stored irradiance texel contains approximately 0.03856 of red sky energy.

Recover diffuse irradiance at each contributing irradiance texel by subtracting
the analytic direct term at that texel's actual height and Sun cosine; then
interpolate the diffuse values. Use the existing analytic slab transmittance,
which matches the generator. Keep the direct beam sampled independently at the
requested coordinates, retain the asset format/data, and add no textures/passes.
This adds bounded four-texel lookup/analytic work to Planar diffuse queries;
record cost and test real frozen LUT edges/interiors against an independent CPU
reference. Globe irradiance already stores diffuse energy and is unchanged.

## 2026-10-17 amendment: Accepted appearance defaults

After accepting the Globe and Planar visual reviews, the owner explicitly requests
promoting the reviewed appearance to engine defaults. Both automatic Scene-owned
instances and explicitly constructed controllers now default to
`backgroundRadianceScale=2.5` and `surfaceRadianceScale=1.2`. Aerial and cloud
relative radiance scales and night ambient intensity remain 1. The Globe aerial
distance default becomes 0.5; Planar remains 1, as amended in ADR-0166.

These are explicit appearance defaults, superseding the neutral default values
above. They do not change the common 40000 cd/m² unit, spectral RGB conversion,
physical Sun/sky sources, LUTs or scattering recurrence. Callers can still request
neutral scales of 1 or any other supported explicit values, including zero.
Default HDR and automatic exposure remain disabled; explicit display settings and
warm parameter overrides remain caller-owned. No display-mode-dependent defaults,
new Shader, pass, resource or upstream patch are introduced.

Validation reuses actual linear-pixel tests across Globe/Planar, automatic/explicit
ownership and LDR/HDR, public constructor/range/warm tests, and build/type checks.
The physical atmosphere examples inherit these defaults instead of duplicating
the accepted values. See the existing maintenance plan and review for results.
