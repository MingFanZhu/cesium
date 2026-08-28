# A5-G Owner Visual Corrections

## Status

- State: `resolved; Architecture and owner visual gates passed`
- Date: `2026-08-28`
- Phase: `A5-G`
- Findings: `A5-AR-004 through A5-AR-016 closed or superseded`
- Scope: Globe only; Planar and A6-G remain frozen

## Owner report

The project-owner Globe gate rejected the current A5-G result for five visible
reasons: blocky cloud shadows, a black surface around/after sunset, a returned
aerial boundary while looking down, invisible crepuscular rays, and a Test
scene with no meaningful imagery or terrain.

The three screenshots are visual failure evidence. Root-cause decisions below
come from source isolation and direct live toggles; the screenshots themselves
are not treated as executable specifications.

## Root-cause isolation

### A5-AR-004 — BSM reconstruction is single-tap

`SceneGISCloudShadows.glsl` reconstructs one Beer optical-depth value from one
atlas texel per cascade. The implemented overlap blend cannot filter texel
boundaries inside a cascade. The current medium atlas uses 256-pixel tiles and
high uses 512; switching medium to high made the blocks smaller but did not
remove them. Disabling `showCloudShadows` removed the entire mosaic while the
surface remained otherwise unchanged.

This is an implementation miss against ADR-0047, which already required
bounded PCF/blend. Resolution alone is not the repair.

### A5-AR-005 — Globe surface lacks a renderer-domain radiance calibration

The new Globe branch feeds physical A2 Sun/sky irradiance directly into Cesium
material color. Background sky is calibrated by `backgroundRadianceScale=10`,
clouds by `cloudRadianceScale=48`, and aerial geometry by
`aerialRadianceScale=1`; the new surface bridge has no corresponding unit
conversion. At the true-sunset state, disabling cloud shadows did not restore
the ground, while disabling the advanced controller did restore Cesium's base
surface. Cloud visibility is therefore not the cause.

The repair is a public Globe-only `surfaceRadianceScale`, default `10`, finite
range `[0,64]`. It multiplies the combined Lambertian Sun-plus-sky surface
radiance, not albedo, cloud transmittance, one light source, display transfer,
or an additive ambient floor. No hidden multiplier or night light is allowed.

### A5-AR-006 — finite and clear paths have different far-path calibration

ADR-0044 intentionally uses scale `1` for near resolved-geometry aerial
inscattering and scale `10` for the background. Once A5 owns a physically lit
Globe surface, the finite path still approaches an aerial source in the scale-1
renderer domain while the adjacent clear path is in the scale-10 domain. The
solid-color, no-imagery Test ground makes this discontinuity especially
obvious, but imagery cannot correct the unit mismatch.

For the Globe finite-geometry path only, use the path transmittance to establish
an asymptotic renderer-domain bridge:

```text
extinctionWeight = clamp(1 - max(T.r, T.g, T.b), 0, 1)
effectiveAerialScale = mix(
  aerialRadianceScale,
  surfaceRadianceScale,
  extinctionWeight)
scene = inputColor * T + physicalAerial * effectiveAerialScale
```

Near geometry remains at the accepted A3 scale. Fully extinguished distant
geometry approaches the surface/background default scale. This is not a depth
epsilon, distance bias, screen-space horizon blend, retry, or second haze.

### A5-AR-007 — the rays view does not look toward the Sun

The existing low-Sun evidence uses a fixed camera heading unrelated to the
live Sun. The directional fog term contains
`pow(max(dot(viewDirection, sunDirection), 0), exponent)`; with the default
exponent `8`, a non-Sun-aligned camera drives the visible source toward zero.
The legacy cloud forward-phase button is not an A5 low-Sun camera and produced
an unusable black view at the current sunset clock.

Keep product defaults and Planar unchanged. Add one Globe-only A5 owner preset
that derives heading and pitch from the live local Sun direction, places the
camera below the cloud base, and reports both solar elevation and
`dot(view, sun)`. The visible preset explicitly uses the existing public
controls `heightFogDirectionalInscatteringScale=0.6` and
`heightFogDirectionalInscatteringExponent=4`. Rays off/on are judged in this
same state; no radial blur, bloom, extra haze, or hidden product scale is added.

### A5-AR-008 — the owner scene has no surface data

`Test/高级环境.html` currently creates the Globe viewer with
`baseLayer=false`, `baseLayerPicker=false`, and a flat `globe.baseColor`. This
is useful as a diagnostic mode but is not a sufficient cloud-shadow/skylight
surface.

Add a visible Globe layer selector with three explicit modes:

1. `Natural Earth II (offline)` — default, using the checked-in Cesium
   `Assets/Textures/NaturalEarthII` TMS provider and ellipsoid terrain;
2. `Cesium World Imagery + Terrain (Ion/network)` — optional, using Cesium's
   official async providers when network/token authority is available;
3. `Solid diagnostic` — the retained flat-color mode.

An unavailable online provider reports one visible error and retains the last
good mode. It does not retry. The selector affects the Globe viewer only.

## Converged correction

- Raise BSM tiles to low/medium/high `256/512/768`, still in one 2×2 RGBA16F
  atlas: `2,097,152 / 8,388,608 / 18,874,368` bytes.
- Reconstruct every receiver sample with a 3×3 tent PCF in transmittance space.
  Clamp taps to the selected tile's half-texel interior, average Beer
  transmittance with weights `[1,2,1] x [1,2,1] / 16`, and convert the result
  back to bounded optical depth. Cascade overlap also blends transmittance, not
  packed channels or raw optical depth.
- Add `surfaceRadianceScale=10` and the Globe-only asymptotic aerial bridge
  above. Preserve exact scale-zero behavior, cloud-shadow ratio, sky authority,
  albedo chroma, no-moon zero-light behavior, and Planar source.
- Add the live-Sun-aligned low-Sun Globe owner preset with visible `0.6/4`
  directional controls.
- Make offline Natural Earth II the stable Test default and expose the optional
  Cesium online and solid modes.

## Minimal sufficient evidence

Run only the checks that can falsify these repairs:

1. one actual-GPU PCF fixture covering a sub-texel boundary and atlas-tile
   isolation;
2. focused public/default/linearity Spec for `surfaceRadianceScale`, plus one
   Globe surface/aerial GPU fixture for near and fully extinguished endpoints;
3. one direct downward/horizon capture with a finite-to-clear luminance profile,
   used as evidence rather than a permanent screenshot/hash gate;
4. one low-Sun Sun-aligned rays off/on capture reporting solar elevation,
   `dot(view, sun)`, and the existing finite/storage facts;
5. one Test smoke for offline default and one optional online selection attempt;
6. the existing focused controller, affected Globe surface, package, SGP,
   lint/format/Markdown and diff checks.

Do not run a full repository matrix, add frame convergence/replay/hash machinery,
or multiply screenshot scenarios. Project-owner visual judgment remains the
authority for shadow softness, twilight surface readability, the aerial seam,
and visible shafts.

## Execution evidence — 2026-08-28

The converged correction is implemented without fallback or parameter sweep.
BSM tiles are `256/512/768`; every 3×3 tent tap reconstructs bounded optical
depth, averages Beer transmittance, and cascade overlap also blends in
transmittance space. `surfaceRadianceScale=10` is warm, finite `[0,64]`, and is
published only through the existing `SGP-0009` frame record. Globe finite
aerial uses the agreed transmittance asymptote; Planar and cloud-body formulas
remain unchanged.

The PCF and surface/aerial actual-GPU fixtures each passed 1/1. Final-source
browser evidence was finite and storage-safe in every state. Natural Earth II
and solid switched successfully; the sole World Imagery + World Terrain attempt
also succeeded. The low-Sun preset measured `2.175387°` and
`dot(view, sun)=1.000000`; no-moon raw cloud RGB remained exact zero.

Two owner-visible risks remain and are returned without another workaround:

- the downward/horizon profile still has a maximum adjacent luminance step of
  `0.400905` and reaches a zero-valued region after the finite/clear transition;
- low-Sun rays off/on produced identical displayed p10/median/p90
  (`0.127958 / 0.416954 / 0.742794`) in the aligned frame.

Execution therefore did not add a depth epsilon, horizon blend, extra haze,
hidden scale, retry or alternate camera search.

## Architecture re-review — 2026-08-28

`A5-AR-004`, `A5-AR-005` and `A5-AR-008` are closed. Source inspection matches
the converged PCF, radiance and layer-selection decisions, and Architecture
independently reran the two direct GPU fixtures with 1/1 success each. Their
product and evidence paths are frozen.

The reported `A5-AR-006` residual is not valid finite/clear evidence. The
`downwardProfile` camera is 120 km high at pitch `-8°`; the ellipsoid horizon
from that altitude is about `-11°`, so its center ray is still above the ground.
The helper then takes 33 sparse display-luminance samples over the whole center
column without reading depth. It cannot know which samples are finite geometry,
clear atmosphere or outside the atmosphere, and its maximum `0.400905` step and
zero tail do not prove a product seam. Keep the accepted Globe finite-aerial
formula unchanged. Replace only this evidence with one fixed 120 km, `-20°`
single-frame capture that copies final color and resolved depth in the same
`postRender`, locates the real finite/clear boundary, and reports the immediate
neighboring samples. No threshold, hash, replay or extra render is required.

The low-Sun camera itself is now correct, but `A5-AR-007` exposes a separate
product defect. `sceneGISCloudShadowDirectionalTransmittance` currently uses
`exp(-shadowLength/200000)`. A 5–20 km equivalent shadow length therefore
reduces directional fog by only about 2.5–9.5%, which explains why aligned rays
remain visually unchanged. The Bruneton consumer already interprets length as
the final shadowed view segment; A3 fog must use the same geometry. For fog
segment `[s0,s1]`, compute existing Globe height-density optical depth over the
whole segment and over `[s1-L,s1]`, then multiply directional Sun only by
`(tauTotal-tauShadow)/tauTotal`. Preserve exact zero-length and ambient identity.

Closure is intentionally narrow: one actual fog fixture proves zero, full and
partial segments against an independently evaluated optical-depth ratio; one
fixed low-Sun, coverage `0.65`, time `0` capture reports the decoded resolved
shadow-length distribution and a local rays off/on difference near the Sun.
Full-frame percentiles are not an acceptance metric because a localized shaft
can disappear in them. No runtime camera/time search, new effect, public knob,
resource or Planar change is authorized.

## Bounded execution result — 2026-08-28

The Globe fog consumer now clamps `L` to `[s0,s1]`, reuses
`sceneGISHeightFogGlobeOpticalDepth` for `[s1-L,s1]`, and applies
`(tauTotal-tauShadow)/tauTotal` to directional Sun only. Zero length retains
the initialized identity factor; a full segment selects exact zero. The old
`sceneGISCloudShadowDirectionalTransmittance` helper is removed as unused.

The production-source actual-GPU fixture passes zero/partial/full shadow and
exact ambient-only identity. Its partial result matches an independent radial
exponential optical-depth evaluation within half-float tolerance.

The corrected 120 km/`-20°` single-frame evidence locates a real adjacent
finite/clear transition at center-column `y=348/349`: raw depth
`0.876953125/1`, RGB
`[0.823529,0.780392,0.968627]/[0.772549,0.815686,0.984314]`, and luminance
`0.803154/0.818690`. No residual large seam is demonstrated by this direct
boundary.

At the one fixed Sun-aligned state (`coverage=0.65`, `cloudTime=0`, elevation
`2.175387°`, `dot(view,sun)=1`), the resolved rays-on length distribution has
3,666 nonzero pixels, `p10=195.503 m`, median `391.007 m`, `p90=1173.021 m`,
and maximum `1759.531 m`; rays-off is exactly zero-length. The 17×17 near-Sun
mean RGB changes by `[-4.07e-5,-2.71e-5,-4.07e-5]`. This observation is reported
without a visibility threshold, alternate state search or further product
calibration.

## Architecture bounded-correction re-review — 2026-08-28

The corrected depth-backed observation closes `A5-AR-006`: its true adjacent
finite/clear luminance change is only `0.015536`, so the prior sparse-profile
claim is withdrawn and the accepted product formula remains frozen.

`A5-AR-007` remains open because the fixed owner view still has no visible
shaft. Fixed-reference inspection shows that the consumer repair addressed the
wrong boundary first. Reference `getShadowRayNearFar` / `marchShadowLength`
integrates the BSM along an independent camera-to-scene/ground/shadow-top ray
up to 200 km. SceneGIS samples only within `sceneGISCloudSegment`, so its length
cannot represent the long shadowed atmosphere beneath and beyond the cloud
body.

The assigned repair separates those intervals without raising the current
32/64-sample cost: the BSM length samples span the independent shadow-view ray,
while density/radiance remain on the cloud-support ray. For the A3 fog consumer,
equivalent length removes the camera-near fog optical-depth prefix, matching
fixed-reference `approximateHaze`; the Bruneton point consumer remains as-is.
Only the affected producer/fog fixtures and this one fixed owner observation
are repeated.

## Bounded producer execution — 2026-08-28

`sceneGISMarchClouds` now evaluates an independent Globe shadow-view segment
before cloud-support clipping. It ends at the nearest positive finite scene
distance, ellipsoid ground or shadow-top exit, is bounded to 200 km, and uses
exactly the existing `primarySteps` midpoint count with one BSM optical-depth
reconstruction per interval. The primary cloud-body march is unchanged and no
longer owns shadow-length sampling or suppresses it on support miss.

The A3 directional fog fraction now subtracts the camera-near prefix optical
depth `[s0,min(s0+L,s1)]`. Its actual-GPU zero/partial/full and ambient-only
fixture passes 1/1. A second actual-GPU producer fixture passes 1/1 for BSM
occlusion outside cloud support and its deterministic cloud-support-clipped
mutation returns zero as required.

The single authorized fixed view (coverage `0.65`, cloud time `0`, solar
elevation `2.175387°`, `dot(view,sun)=1`) resolves 197,878 nonzero rays-on
lengths with `p10=1173.021 m`, median `2737.048 m`, `p90=16031.281 m`, and
maximum `23069.404 m`; rays-off remains zero. The 17×17 near-Sun displayed mean
RGB is identical off/on at 8-bit precision. This is reported as an unresolved
owner-visible risk, without a new threshold, alternate camera/time, or further
product adjustment.

## Test witness correction execution — 2026-08-28

The retained `trueSunset` remains `2026-06-21T18:30:00Z`. A separate
`crepuscularRays` owner state now uses `17:30Z` at 15°E/45°N and aligns the
camera to the live Sun, measuring elevation `11.647154°` and
`dot(view,sun)=1.000000`. Coverage `0.65`, cloud time `0`, and visible fog
directional controls `0.6/4` are unchanged.

Exactly one fixed rays-off/on pair was captured. Its displayed
p10/median/p90 is `0.420470/0.810409/0.888542` off and
`0.417130/0.809174/0.888542` on. Rays-on has 68,306 nonzero resolved lengths
with median `5669.599 m`; rays-off has none. The pair remains visibly without a
distinct shaft and shows only slight broad dimming. The former derived 17×17
center ROI comparison is removed as an acceptance authority, and no replacement
gate or alternate-state search was added.

## Architecture producer re-review — 2026-08-28

The producer and fog-prefix implementation are accepted. The independent
shadow-view topology matches fixed-reference `getShadowRayNearFar`,
`marchShadowLength` and `approximateHaze`; Architecture independently reran the
producer and fog actual-GPU fixtures with 1/1 success each.

Final-source browser isolation changes the interpretation of the residual. At
the assigned `2.175387°` true sunset and visible `0.6/4` fog controls, rays-on
changes displayed p10/median/p90 from approximately
`0.103951/0.179230/0.523751` to `0.097528/0.173038/0.516905`, while the center
17×17 ROI remains exact. Thus transport is active, but the selected true-sunset
frame presents a small broad attenuation and its center ROI is not shadowed; it
is not a valid visible-shaft witness. A single bounded diagnostic at stronger
fog settings only increased broad attenuation and did not change the center
ROI, so no hidden multiplier is adopted.

Keep the product and its two fixtures frozen. Split the Test evidence into a
true-sunset state for twilight and a separate crepuscular-rays state at
`2026-06-21T17:30:00Z`, 15°E/45°N, with the camera aligned from the live Sun,
coverage `0.65`, cloud time `0`, and the existing visible `0.6/4` controls.
Capture one rays-off/on visual pair and report measured elevation and
`dot(view,sun)` only. Do not add a center-ROI threshold, hash/replay,
multi-frame convergence, time/parameter search, product calibration or new
automated test.

## Architecture sampling correction — 2026-08-28

The completed `17:30Z` off/on pair still shows broad dimming without a distinct
shaft, so the time split and former center ROI were not the root cause. A
second source audit found a material reference mismatch that the previous
producer review missed:

- Reference `marchShadowLength` calls `sampleShadowOpticalDepth` with radius
  zero, which selects the raw one-tap BSM path.
- It advances from `50 m` with `perspectiveStepScale = 1.01`; about 374
  progressive intervals cover the bounded `200 km` ray.
- SceneGIS currently uses only the cloud-body `primarySteps` (`32/64/64`),
  uniformly spaced over the full interval, and every sample executes the
  surface receiver's 3×3 PCF.

The current path therefore spends at least `64 × 9 = 576` atlas reads at
medium/high quality while convolving away the high-frequency shadow boundary
that should form a shaft. The previous product-freeze decision is superseded.
Keep the surface PCF unchanged; give the shadow-length march a raw one-tap
reconstruction with the existing transmittance-domain cascade overlap, and
replace only that march with at most 384 clipped progressive intervals starting
at `50 m` and growing by `1.01`. No radiometric multiplier, alternate camera,
new resource, public control, Planar change or broader validation is authorized.

## Raw/progressive BSM execution — 2026-08-28

The 3×3 Beer-transmittance PCF path remains unchanged for normal surface and
cloud-shadow receivers. A new shadow-length-only raw reconstruction takes one
atlas sample, applies the same RGBA decode and cascade selection, and preserves
cascade overlap in transmittance space. The view-length march no longer uses
cloud-body `primarySteps`: it starts with a 50 m interval, grows each interval
by `1.01`, clips the final interval exactly, and stops within 384 iterations or
the existing segment/200 km bound.

One compiled actual-GPU fixture matches an independently written CPU
progressive accumulation on a controlled high-contrast atlas. Its deterministic
filtered 64-uniform mutation loses the controlled contrast and fails the direct
comparison; the same fixture retains invalid-cloud positive-length coverage.

The only repeated owner pair remains the fixed 17:30Z state at elevation
`11.647154°` and exact Sun alignment. Rays-on resolves 68,288 nonzero lengths
with p10/median/p90/max `782.014/5669.599/9775.171/12903.226 m`. Displayed
p10/median/p90 changes from `0.420470/0.810409/0.888542` to
`0.417115/0.809174/0.888542`, but direct inspection still shows only broad
dimming and no distinct shaft. No additional search or correction followed.

## Architecture full-medium source correction — 2026-08-28

The raw/progressive producer is accepted: Architecture independently reran its
single actual-GPU fixture with 1/1 success. Its negligible visual change proves
that the remaining defect is downstream rather than another BSM sample issue.

The fixed references both keep a full haze term when shadow length is zero:
`approximateHaze` computes total optical depth, unshadowed Sun scattering and
sky scattering, then removes Sun scattering over the equivalent camera-near
shadow length. SceneGIS does not implement that topology for clear depth. It
starts from the already-rendered background and adds only
`F(shadowLength) - F(0)` when length is positive. With no unshadowed height-fog
source in the frame, unchanged pixels cannot read as illuminated shafts; the
result is necessarily a small negative modulation of the background.

The repair folds the reference topology into the existing A3 fog rather than
adding another haze layer. Globe clear depth receives one full fog evaluation
with decoded length (zero when rays are disabled); the early return may not
bypass that evaluation when height fog is enabled. Globe directional fog uses
the existing A2 Sun irradiance without the current max-solar normalization.
The public directional power lobe remains the SceneGIS adaptation, and ambient,
finite/cloud fog, Bruneton transport and Planar remain unchanged. The sole
owner state uses the fixed reference haze values `density=3e-5`,
`falloff=1e-3`, `start=0`, `maximumOpacity=1`, and
`directionalScale=0.9/(0.9+0.5)`; these are a source mapping, not a search.

## Full participating-medium execution — 2026-08-28

The Globe clear-depth Aerial branch now assigns the result of one
`sceneGISApplyExponentialHeightFog` call using decoded length. A zero length is
therefore the complete lit medium and a positive length removes only the
camera-near directional prefix. The early return preserves Globe height fog
when clouds are disabled. The Globe directional source uses physical A2 Sun
RGB; the Planar normalized branch is unchanged.

The amended actual-GPU fixture compiles the real Aerial and height-fog sources.
It proves full zero-length clear fog, directional-only positive-length
reduction, exact ambient identity, physical Sun-unit output, and deterministic
failure of the delta-only plus normalized-source mutations.

At the sole fixed reference state, off/on displayed p10/median/p90 changes from
`0.492689/0.810866/0.889093` to `0.489900/0.806791/0.889093`. Rays-on retains
68,288 nonzero lengths, but direct inspection still shows no separated shaft,
only modest broad dimming. No alternate state, coefficient or product term was
attempted.

## A5-AR-010 — reference Sun intensity was omitted from the owner preset

A5-AR-009 is source-correct and closed. Its full-medium result still changes
the fixed frame only slightly because the reference coefficient mapping is
incomplete, not because another fog or BSM algorithm is needed.

The fixed reference directional haze term is proportional to
`sunIntensity * scatteringAlbedo`, with `sunIntensity = 20` and
`scatteringAlbedo = 0.9 / (0.9 + 0.5)`. SceneGIS currently sets the public
directional scale to only the latter value. A2 physical Sun RGB supplies the
spectral incident source, but it is not the reference's explicit scene-linear
intensity calibration; SceneGIS likewise calibrates background, cloud and
surface radiance separately.

The bounded correction is therefore the exact existing-public-control mapping
`20 * 0.9 / 1.4` in the sole Test owner preset. No shader, API, default, range,
resource, Spec or Planar change is authorized. Reuse one off/on pair and direct
inspection only, without a parameter sweep or numeric visibility gate.

## Reference-intensity Test execution — 2026-08-28

The sole 17:30Z owner preset now sets the existing public directional scale to
the exact named coefficient `20 * 0.9 / 1.4 = 12.857143`. All other fixed state
and medium values are unchanged, and no product/API/default/range modification
is involved.

One off/on pair was inspected directly. Displayed p10/median/p90 changes from
`0.872892/0.911818/0.951085` to `0.872892/0.911557/0.949685`; rays-on retains
68,288 nonzero shadow lengths. The stronger source makes the scene broadly
brighter and nearly uniform but still does not produce a separated visible
shaft. No alternate state, threshold or coefficient followed.

## A5-AR-011 — clear sky uses the finite-point Bruneton entry point

A5-AR-010 is closed as a disproved Test-only hypothesis. It confirms that
directional intensity cannot recover spatial separation when the clear-sky
transport itself consumes shadow length with the wrong endpoint semantics.

The fixed reference has two distinct branches. Exact clear depth calls
`getSkyRadiance(camera, ray, shadowLength, ...)`, which delegates to Bruneton
`GetSkyRadiance`; finite geometry calls `GetSkyRadianceToPoint`. In the former,
`shadow_length` removes the camera-near part of the infinite sky scattering.
SceneGIS correctly uses the finite-point function for geometry and cloud-body
composition, but also uses it for clear depth with the shared planar sentinel
distance `1e9 m`. Its point lies far outside the atmosphere, and the runtime
subtracts only a few kilometres from that artificial distance before clamping
the lookup radius. The shadowed and unshadowed clear results consequently
collapse even though the resolved length field is spatially nonzero.

The correction restores the reference branch distinction without introducing
another medium. `sceneGISGlobeSkyRadiance` receives an explicit shadow length;
Background passes zero, while the Aerial clear-depth delta evaluates the same
infinite-sky function at decoded length and zero. `GetSkyRadianceToPoint`
remains authoritative for finite geometry and cloud bodies. The accepted A3
full fog remains a separate deliberate adaptation and is not recalibrated.
The A5-AR-010 Test coefficient returns to `0.9 / 1.4` because its higher value
was only the rejected diagnostic and visibly saturates the fixed owner state.

Closure uses one amended actual-GPU clear-sky fixture that directly rejects the
old `1e9 m` finite-point mutation, plus the existing single 17:30Z off/on pair
and direct inspection. No parameter search, numeric visibility gate, replay,
hash, new API/resource, Planar work or broader validation is part of this
finding.

## A5-AR-011 execution result

The bounded branch correction is implemented exactly: the infinite-sky
wrapper consumes shadow length, Background remains zero-length, and the Globe
exact-clear Aerial path composes the shadowed-minus-unshadowed infinite-sky
delta. The finite-point path remains unchanged for geometry and cloud bodies.
The existing GPU fixture passes and its restored `1e9 m` finite-point mutation
does not reproduce the independently measured infinite-sky change.

At the unchanged 17:30Z witness, Sun elevation is `11.647154°` and
`dot(view,sun)=1`. Rays-on resolves 69,268 nonzero shadow lengths
(`p10/median/p90/max = 782.014/5865.103/9970.674/12903.226 m`), while displayed
p10/median/p90/max changes from `0.518031/0.817954/0.891347/1` to
`0.514059/0.814048/0.891347/1`. Direct inspection still does not show a
distinct separated shaft. Per the assignment, no additional parameter,
camera, time or formula was tried.

## A5-AR-012 — omitted default reference cloud haze

A5-AR-011 is source-correct and closed. The real infinite-sky wrapper now
consumes the decoded length, its former finite-point mutation is rejected, and
finite geometry/cloud transport is unchanged. The fixed owner frame still has
no separated shaft, so another Bruneton or A3 coefficient change is not
justified.

The remaining source mismatch is earlier and architectural. At fixed commit
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`, base defaults set
both `haze=true` and `lightShafts=true`; low/medium disable the expensive
shadow-length march but do not disable haze. `CloudsMaterial.ts` compiles
`HAZE` from that default and supplies `3e-5`, `1e-3`, `0.9`, `0.5` and sky scale
`1`. `clouds.frag#approximateHaze` then performs all of the following before
the cloud result is published:

- maps coverage through `[0.2,0.4]` and evaluates a spherical analytic
  exponential optical depth bounded by scene, ground and cloud top;
- obtains scalar ground Sun and sky irradiance from the Bruneton LUTs;
- uses the same equal dual-HG `g=(0.7,-0.2)` phase for directional Sun;
- removes directional Sun only over the decoded camera-near equivalent shadow
  length while retaining sky scattering and total haze opacity;
- applies scattering albedo `0.9/(0.9+0.5)` and composites the result after the
  cloud body.

The original A5 decision treated this default cloud source as optional generic
fog and folded only selected coefficients into A3. That was incorrect: A3 has
independent public density, power-lobe and composition semantics, so repeated
changes to A3 can produce only the observed broad brightening/dimming. Restoring
the reference cloud-local term does not authorize radial blur or a second
generic height-fog subsystem.

The bounded correction belongs in the existing Globe source composition and
Aerial pass. Base haze remains present whenever Globe clouds are active;
`showCrepuscularRays=false` supplies zero shadow length rather than deleting the
lit medium. The haze distance is clipped by the exact finite scene distance,
ground, cloud top and opacity-weighted cloud front. After the existing scene and
cloud composition, apply the reference `mix(result, haze.rgb, haze.a)` once.
No public scale, tint, A3 change, new resource or Planar branch is permitted.

The fixed 17:30Z owner pair will disable A3 height fog in both off/on captures
so it directly isolates the restored reference source; every other fixed
location, time, Sun alignment, coverage and cloud-time value remains unchanged.
This is one direct visual witness, not a parameter search or numeric gate.

## A5-AR-012 execution result

The reference term is restored in the existing Globe source composition. Its
zero-length form remains a fully lit cloud haze; decoded length removes only
directional Sun. Total opacity and sky irradiance remain invariant. The Aerial
caller starts at `czm_currentFrustum.x`, applies scene/ground/cloud-top bounds,
then applies the reference opacity-weighted cloud-front clamp and post-cloud
`mix` exactly once.

The single production-stack fixture passes, including an independent scalar
optical-depth equation, ambient-only invariance and integrated Aerial use. The
sole A3-disabled 17:30Z off/on pair changes displayed p10/median/p90/max from
`0.382456/0.790802/0.888542/1` to
`0.380834/0.790235/0.888542/1`. Rays-on has 68,288 nonzero lengths
(`p10/median/p90/max = 782.014/5669.599/9775.171/12903.226 m`). Direct
inspection remains a continuous warm haze without a distinct separated shaft;
no alternate state, coefficient or formula followed.

## A5-AR-013 — reference haze inputs are still substituted

The A5-AR-012 formula is not yet a faithful reference adaptation. Product
inspection finds two concrete substitutions before any further visual
hypothesis is warranted:

1. The helper receives `hazeRayOrigin`, already advanced by
   `czm_currentFrustum.x`, and samples Bruneton irradiance at a fixed sea-level
   point. Reference `approximateHaze` uses the actual camera position for
   camera height and its origin/horizon frame, while reference vertex
   irradiance is sampled at that actual position. Near distance affects the
   haze interval only.
2. The post-cloud clamp consumes attachment `x` mean distance. The required
   front authority is attachment `y`; those values intentionally describe
   different parts of the cloud body.

The isolated fixture masks the first substitution with constant 1x1 LUTs and
does not construct distinct mean/front values, so its pass cannot close these
paths. The next repair changes only the two input authorities, amends that same
fixture with one non-sea-level LUT case and one distinct-front case, and repeats
the same fixed 17:30Z pair. Parameter tuning, evidence expansion and alternate
states remain prohibited.

## A5-AR-014 — cloud-local haze has the wrong finite-scene scope

The new World Terrain report is reproducible by component isolation. Sky alone
preserves terrain. Enabling only the cloud composition removes distant terrain
and the mountain silhouette even where the cloud MRT contains no selected
cloud body. The A5-AR-012 caller currently applies the reference cloud haze to
all finite pixels, so a cloud-coupled source has become a second global terrain
fog on top of A2/A3.

The bounded adaptation keeps clear-sky haze and keeps haze in front of an
actually selected cloud body. Finite geometry without a selected cloud sample
skips that one post-cloud haze mix. This preserves the reference source where
it has a cloud/sky role while restoring SceneGIS A2/A3 as the only generic
finite-terrain transport. No density, coverage, opacity or depth threshold is
changed.

## A5-AR-015 — finite aerial and height fog cannot meet the clear sky

The new aerial-only and height-fog screenshots expose the same renderer-domain
fault through two source terms. Globe Background publishes physical sky at
`backgroundRadianceScale`. Finite A2 scattering instead interpolates from
`aerialRadianceScale` to `surfaceRadianceScale` using transmittance, so a
partially extinguished ray cannot approach the clear-sky value. A3 then mixes
an unscaled physical/normalized fog source into scene color. The hard boundary
follows the real terrain silhouette because that is where those branch-local
calibrations switch.

The fixed reference aerial implementation evaluates clear and finite Bruneton
transport in one postprocess and applies one renderer exposure after both. The
SceneGIS adaptation will retain its public controls but restore that topology:
Globe Bruneton Aerial source uses
`backgroundRadianceScale * aerialRadianceScale`; the latter is a relative
coefficient with default one. Globe A3 fog source uses
`backgroundRadianceScale` before its existing component scales and Beer mix.
Planar remains frozen.

This decision does not alter exact clear-depth authority, atmospheric LUTs,
the Bruneton horizon clamp, fog density, surface reflectance, cloud density or
display transfer. It expressly rejects a horizon epsilon, blur, depth bias and
screen-space seam blend. One fixed terrain camera and amendments to two
existing GPU fixtures are sufficient.

## A5-AR-013/014/015 execution evidence

The implementation now preserves the three assigned authorities directly:

- haze camera-dependent terms and irradiance lookup use the actual unshifted
  virtual camera; near offset only bounds the interval;
- decoded cloud front controls the opacity-weighted haze clamp while decoded
  mean distance continues to own cloud atmosphere/fog transport;
- exact-clear retains cloud haze, but finite/no-cloud terrain preserves A2/A3;
- Globe Bruneton Aerial source uses the background/aerial product and Globe fog
  source enters the background domain once; Planar receives identity.

The amended fixtures pass 1/1 each. A single high-Sun World Terrain camera was
inspected in disabled, atmosphere+aerial, atmosphere+aerial+height-fog and
cloud-only states; terrain silhouettes and horizon transitions remain visible
and browser errors are zero. The fixed A3-disabled 17:30Z pair retains an
active 68,288-pixel shadow-length field but still lacks a visually distinct
separated shaft. Execution stopped without another state, coefficient or
formula.

## A5-AR-015 independent review residue

The terrain/horizon product repair is source-correct, and A5-AR-013/014 are
closed. The only remaining review defect is contract maintenance: the old A2
source Spec still forbids the newly required background-scale uniform in
Aerial, and public JSDoc does not describe the Globe-relative meaning of
`aerialRadianceScale`. The exact isolated Spec fails 0/1 on that assertion.

Only the existing assertion and two JSDoc descriptions may change. Product
GLSL and all visual evidence are frozen; no new test, owner state or validation
matrix follows from this correction.

## A5-AR-015 focused Spec/JSDoc execution evidence

The stale negative assertion was replaced by the accepted Globe shared-domain
product assertion without altering the retained Planar formula check. Both
public JSDoc descriptions now state the Globe-relative and Planar-absolute
meaning. The isolated Spec passes 1/1 and no product or visual path changed.

## A5-AR-016 common terrain-depth root cause

The newest isolated owner captures show Aerial, exponential height fog and
volumetric clouds obscuring World Terrain. The common cause is not missing
depth sampling in the three shaders. It is the lifetime of the texture supplied
to them:

1. Cesium draws Globe terrain into the main depth buffer.
2. With `globe.depthTestAgainstTerrain === false`, Cesium copies that terrain
   depth to packed `czm_globeDepthTexture` for native consumers.
3. Cesium clears the main depth, writes `DepthPlane`, and continues later scene
   passes.
4. `Scene.resolveFramebuffers` supplies the resulting main depth-stencil
   texture through `SGP-0008` to SceneGIS Aerial/cloud programs.

Consequently finite/clear reconstruction and cloud maximum-distance clipping
operate against a plane/later-geometry authority rather than actual terrain.
This produces the shared horizon boundary and terrain overwrite seen in all
three captures.

The fixed reference has the decisive lifecycle line
`viewer.scene.globe.depthTestAgainstTerrain = true` in both
`src/ThreeGeospatialPipeline.js#init` and
`src/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js#init`. Its use of a
post-process stage alone is not the distinction. Its fake-depth/far-plane
heuristics are also unnecessary once SceneGIS preserves a unified actual depth
buffer and are rejected as defensive masking.

The selected repair is controller lifecycle ownership, not a shader change.
Active Globe effects acquire the flag before resources are allocated, require
it while active, and restore the exact prior value on disable/disconnect when
they changed it. Test must not set the flag as a hidden prerequisite. The
existing `SGP-0008` remains consume-only, no upstream file or new SGP is needed,
and Planar remains frozen.

The project owner explicitly confirms that enabling
`globe.depthTestAgainstTerrain = true` is acceptable and normally required in
Globe projects. The setting therefore remains visible production behavior with
bounded restoration, not a demo-only workaround.

### A5-AR-016 execution evidence

The controller now records the Globe property's prior value and whether it owns
a mutation. Acquisition occurs after the existing conflict authority and before
the first resource request. While active, an external `false` is reported by the
existing fail-closed controller error path and is not rewritten. Disable and
disconnect restore the snapshot only for an owned mutation, while a caller's
pre-existing `true` remains intact.

The amended existing lifecycle/resource Spec passes 1/1. In one fixed high-Sun
15°E/45°N World Terrain ground view, direct isolated inspection found:

- Aerial-only: mountain ridgelines and the terrain foreground remain visible;
- height-fog-only: fog composites behind/across the real terrain silhouette
  without replacing the terrain body;
- cloud-only: cloud bodies remain behind the foreground terrain, whose ridges
  and imagery stay visible.

The controller stayed ready · HDR. No Test-owned prerequisite, shader change,
depth heuristic, resource delta, public API change, Planar change or upstream
patch was introduced.

### A5-AR-016 Architecture closure

Architecture independently verified the controller acquisition order,
caller-owned true preservation, fail-closed external mutation behavior and both
release paths. The exact amended lifecycle Spec was independently rerun and
passed 1/1. No hidden Test prerequisite or depth workaround is present.
A5-AR-016 is closed; the project owner must still explicitly recheck the three
corrected isolated visuals before any phase gate.

## Final owner disposition

The project owner manually rechecked the corrected Globe output after
A5-AR-016 and reported that the effect is correct. The owner visual gate passes,
this discussion is resolved, and no further A5-G visual correction remains
open. A6-G and Planar are not activated by this disposition.
