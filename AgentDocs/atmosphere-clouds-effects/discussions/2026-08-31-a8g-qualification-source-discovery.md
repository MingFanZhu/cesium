# A8-G Globe Qualification and Delivery Source Discovery

## Metadata

- Status: `resolved; A8-G activated`
- Date: `2026-08-31`
- Owner: Architecture Agent
- Scope: Globe qualification, release delivery and direct Test restructuring;
  Planar product qualification remains deferred
- Frozen predecessor checkpoint:
  A7-G=`6f70b54c80ce174bf7befe49fe37262230288e61`
- Phase plan:
  [A8-G Globe qualification and delivery](../plans/2026-08-31-phase-a8g-globe-qualification-delivery.md)

## Current delivery facts

- A2 through A7 already own the accepted Globe atmosphere, aerial perspective,
  exponential height fog, volumetric cloud, cloud shadow, participating-medium
  rays, temporal stabilization, quality policy, Bloom and lens artifacts. A8-G
  is a qualification phase, not a new rendering feature phase.
- The A7-G checkpoint is clean and frozen. A8-G may not silently repair or
  recalibrate predecessor product behavior. A reproduced product defect must be
  returned to Architecture as a focused finding before any runtime edit.
- `SGP-0008` owns the advanced background/HDR Scene slot in `Scene.js`.
  `SGP-0009` owns the three-path Globe surface-lighting seam. Both are audit-only
  in A8-G; no new upstream hunk or SGP is required for qualification.
- Existing SceneGIS Specs already cover the controller, actual-GPU effects,
  private render pipeline, atmosphere reference frame, advanced render slot and
  Globe surface provider seam. A8-G needs a focused delivery smoke, not another
  synonymous shader or resource matrix.
- Root build entry points already provide development build, release build,
  TypeScript generation/checking and API documentation generation. The existing
  installed-package verifier covers root and engine exports, types, API docs,
  private hiding, 26 GLSL modules and deterministic environment assets.
- Playwright already has separate development and release configurations. A
  single local, deterministic Globe delivery spec can exercise both without an
  all-browser or full-E2E run.

## Direct Test diagnosis

The current `Test/高级环境.html` is a 5,175-line, roughly 203 KiB dual-world
page. It contains product controls, historical phase observations, evidence
JSON, owner-gate helpers and both Globe and Planar lifecycle ownership in one
document. It was useful during A2-A7 development, but it is not a clear
release-facing sample and previously allowed evidence panels to obscure the
owner viewport.

The repository already vendors unmodified `lil-gui 0.21.0` under
`Test/lib/lil-gui/`, with MIT license and provenance recorded in
`Test/lib/README.md`. Existing Test pages establish the supported local ESM
import and cleanup pattern. No network loader or new dependency is needed.

## Adopted Test structure

A8-G will replace the monolithic release entry with:

1. `Test/高级环境.html` — lightweight Chinese navigation and capability status;
2. `Test/高级环境-球面.html` — the authoritative Globe A2-A8 direct sample and
   manual qualification states;
3. `Test/高级环境-平面.html` — the separated Planar sample, clearly labelled as
   retained/deferred rather than A8-qualified;
4. small shared ESM/CSS files under `Test/AdvancedEnvironment/` for lifecycle,
   common controls and presentation without duplicating Cesium runtime identity.

Both world pages use the local `lil-gui` bundle. Historical per-finding JSON,
hash/replay/convergence machinery and obsolete owner-gate buttons are not
release UI. Representative named observations and compact live status remain.

## Qualification boundary

Minimal sufficient evidence is:

- the existing focused SceneGIS/Globe Spec authorities;
- sequential development/release/type/docs/package builds;
- installed-package and upstream-patch audits;
- one focused local Playwright spec executed once against development and once
  against release output;
- one bounded Globe manual matrix using the release-facing page.

A8-G does not add screenshot hashes, FPS thresholds, replay loops, settling
frames, all-browser runs, full Jasmine, a second resource audit framework or a
Planar visual gate. No new ADR is required unless qualification discovers a
new long-lived product or delivery contract.

## A8-AR-008 cloud-shadow reference comparison

The follow-up owner reproduction was compared against the already audited
reference rather than treated as a filter-tuning problem. Its
`CloudShadowPass.updateShadowCascades` constructs the light view in world space
with a fixed world up axis. `CloudShadowFrag` reconstructs world positions from
that light projection and samples the same cloud material functions used by the
visible cloud body; `AerialPerspectiveEffect.getShadowUv` projects receivers
through the same world shadow matrix.

The retained A8 candidate differed in three relevant ways: the Globe cloud
noise position was a tangent-plane approximation anchored at the current camera
footpoint, the light right/up basis used that moving local vertical, and the
occupancy hierarchy used Planar scales while Globe density used reference
Globe scales. Those are confirmed coordinate-authority defects. The adopted
repair keeps local coordinates only for precision and ray intervals, then
reconstructs one ECEF-derived WGS84 material position for all cloud producers
and uses a fixed ECEF light basis. It deliberately does not add temporal shadow
history, resolution, retries or a visual proxy gate.

## A8-AR-009 cloud-entry and cloud-haze reference comparison

The Cesium cloud port at `1f38602b84ab5c3f2bc289f9e4464df3db917155`
fades the completed cloud layer from `11 km` to `51 km` according to layer
entry distance. It does not combine that rule with this extension's older
`60-100 km` per-sample visibility. The adopted Globe path therefore uses the
entry fade directly and confines the older visibility to Planar.

The original `three-geospatial@b012ad06` `approximateHaze` function returns
opacity-integrated in-scatter RGB and a separate opacity. A rebuilt local
control proved the dark horizon strip belonged to this haze consumer, not the
cloud march. The retained consumer used `mix(scene, haze.rgb, haze.a)`, which
weighted integrated radiance twice, and it placed physical haze beside Globe
sky/aerial radiance that had already been multiplied by
`backgroundRadianceScale * aerialRadianceScale`. The adopted expression uses
the standard over operator and applies that shared source-domain scale exactly
once. It preserves reference haze instead of hiding the symptom by disabling
it or adding another distance cutoff.

## Cesium ion global buildings sample boundary

The current engine exports `createOsmBuildingsAsync`, and the official Cesium
OSM Buildings example supplies the New York camera used by this delivery
control. The page follows that helper rather than hard-coding its current ion
asset ID. Unlike Google Photorealistic 3D Tiles, this dataset contains buildings
without terrain, so the existing Globe and BaseLayerPicker remain active and no
Google geocoder is required.

The buildings are deliberately opt-in. This keeps local Natural Earth II/WGS84
startup deterministic. When the button succeeds, the page owns the returned
tileset and snapshots the camera plus observation status before selecting the
official New York view. Removing the buildings restores those snapshots. A
generation token makes cancelled or post-destroy completions release their
candidate rather than add it to a stale scene. This remains example assembly;
no reusable loader or credential policy is added to the product.

## A8-AR-010 fixed-reference cloud material audit

The project owner supplied a direct visual comparison from the locally checked
out `E:/Learn/cesium/three-geospatial` Storybook. The audited authority remains
the already licensed and pinned upstream commit
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`; no runtime
dependency on that checkout is introduced.

The reference default is not one homogeneous slab. It contains overlapping low
layers at `750 m / 650 m` and `1000 m / 1200 m`, plus a thin high layer at
`7500 m / 500 m`. Its low layers share approximately `3.333 km` shape and
`166.667 m` detail periods, use all precombined FBM information supplied by the
shape/detail generators, and apply the linear density profile
`0.75 * heightFraction + 0.25`. Lighting combines a short local Sun march with
the non-overlapping BSM remainder, eight multiple-scattering octaves, sky
irradiance, powder and one medium-quality ground-bounce sample.

The first correction draft tried to reconstruct the reference hierarchy from
the SceneGIS-generated RGBA volumes. The project owner correctly rejected that
approximation: the pinned checkout already contains licensed authored
`shape.bin`, `shape_detail.bin`, `local_weather.png`, `turbulence.png` and
`packages/core/assets/stbn.bin`, together with their exact sampling code.
Those files have now been audited individually at the pinned commit and imported
through a deterministic local script with fixed source/output SHA-256 records
and the upstream MIT notice. There is no runtime dependency on the local
checkout or network.

Globe now selects the imported R8 `128³` shape, R8 `32³` detail, RGBA8 `512²`
weather, RGBA8 `128²` turbulence and R8 `128×128×64` STBN payloads. Planar
continues to select the original SceneGIS-generated assets. Each controller
still owns exactly six cloud textures and performs eight total asset requests;
the five cloud payloads are mode-selected rather than co-resident. The imported
binaries total `4,292,608` bytes, while the Globe cloud-texture allocation is
`7,015,472` bytes including mips and the existing occupancy hierarchy.

The shader maps public base/thickness values onto the reference-relative layer
layout and its exact density scales, shape/detail periods, weather remap and
high-quality 2D turbulence sampling. Sun extinction is divided into a short
local detail march plus the non-overlapping Beer remainder; one downward sample
provides the reference ground-bounce topology. Public controls, quality sample
counts, texture count and Planar output remain intact.

### Density-domain correction discovered by the fixed page

Direct payload use alone initially made the default cloud field nearly
invisible. The cause was not the imported data: shape/detail ranges and all
payload hashes were correct. The reference multiplies its authored layer
weights by an internal scattering coefficient of `1`, whereas SceneGIS owns an
explicit public extinction coefficient in meters. Applying both
`densityScale=0.2` and `cloudDensity=0.001` reduced the established default
normalized medium by five times.

Globe therefore keeps the reference ratios `0.2 / 0.2 / 0.003`, but normalizes
them by the reference low-cloud baseline `0.2` before the SceneGIS coefficient.
The resulting relative weights are `1 / 1 / 0.015`; `cloudDensity` remains the
sole dimensional extinction authority. A fixed default page reload then showed
the expected structured low cloud field without changing any public value.

## A8-AR-011 progressive integration comparison

The follow-up owner observation correctly separated asset parity from marching
parity. In the pinned reference, each layer is saturated before its four density
channels are summed; the sum itself is not clamped. Its primary ray begins at a
`50 m` high-quality (`100 m` low-quality) step, grows by `1.01`, advances toward
`1000 m` only in empty space and derives material mip from projected screen
footprint. SceneGIS still clamped the layer sum, uniformly subdivided the full
cloud segment and included integration length in its material footprint.

The adopted Globe correction maps that topology onto the already accepted
SceneGIS tier budget rather than copying the reference's `500/200` iteration
counts. Low retains `32` maximum detailed samples; medium/high retain `256`
(`64x4`). A conservative occupancy query covers the entire candidate skip
interval, so empty-space acceleration cannot step over known material support.
Texture filtering no longer changes merely because the Beer integration step
grew. Planar retains its established scheduler and sampling domain.

Actual-GPU probes show the summed overlapping density exceeds `1`, a clamped
mutation loses that contribution, the real pinned textures respond differently
to a deterministic long-step LOD mutation, and the progressive Globe path uses
more than `64` intervals without exceeding `256`. The occupancy/exhaustive
comparison retains exact semantic attachments; executing an extra known-zero
sample changes one RGB value by one binary16 ULP only. This is storage rounding,
not missed cloud support.

## A8-AR-012 final reference-budget comparison

The owner comparison after A8-AR-011 showed that adapting only the reference
scheduling shape was insufficient. The pinned reference's default/high path is
full resolution with `500` primary iterations; medium also keeps full
resolution and `500`, while low uses `200`. Its basic cloud story uses coverage
`0.3` and a substantially stronger medium-to-background ratio than the retained
SceneGIS defaults. A controlled final-source page confirmed the split:
`density=0.005` produced authored shape and thickness in isolation, while
`backgroundRadianceScale=10` erased that structure in the full atmosphere.
`backgroundRadianceScale=4` retained it without changing cloud radiance or
display transfer.

The adopted Globe defaults and budgets follow those observations directly.
They are mode-specific so Planar continues to expose its established contract.
This supersedes the earlier assumption that `64x4=256` was an acceptable
reference budget and the interim Globe `11-51 km` post-integration fade. The
public options still permit explicit lower budgets and prior calibration.

## A8-AR-013 shadow projection comparison

The producer and receiver shared atlas matrices but not the same ray geometry.
`SceneGISCloudShadowFS` intersects the exact local top sphere through
`sceneGISCloudSegment`; the receiver reconstructed distance with a planar
height division. The independent equation diverges materially for an off-axis
receiver, exactly the regime in the owner's rotated/top-down observations.

The correction uses the positive Sun ray/top-sphere intersection at the
receiver, then reconstructs bounded OD from the producer's front, mean
extinction, maximum OD and tail. No screen-space reprojection, camera-relative
offset, shadow translation or temporal workaround is added.

## A8-AR-014 direct local three-geospatial comparison

This correction intentionally excludes all other cloud implementations. The
local `three-geospatial` Basic story uses low layers at `750 m` and `1000 m`, a
high layer at `7500 m`, a `300 m` camera, frame-varying STBN with temporal
accumulation, mip-capable material sampling and world-light cascades. SceneGIS
had already imported its payloads and transport but still kept a `1500 m`
Globe base, fixed weather `LOD 0`, a cloud-time STBN slice with stationary
history disabled, and a cascade texel phase measured from the camera-local
surface frame.

Those retained adaptations explain the observed thin bodies, orbital sparkle
and view-dependent shadow translation without invoking a new radiometric
calibration. The adopted correction changes only those structural mismatches:
reference layer heights, projected-footprint weather LOD, frame STBN plus the
existing A6 history, reference structured-volume BSM samples and global ECEF
light-plane texel snapping. `cloudRadianceScale` remains unchanged because a
controlled lower value made the final medium too faint rather than restoring
reference thickness.

The weather mip chain raises its measured allocation from `1,048,576` to
`1,398,101` bytes. The exact six-texture Globe total is consequently
`7,364,997`; resource counts and all shadow allocations remain unchanged.

## A8-AR-015 owner rejection and exact source re-audit

The owner rejection demonstrates that `A8-AR-014` fixed symptoms without
closing the reference contracts. Only the reference layer altitude was visibly
different. Weather mips and frame STBN can reduce aliasing, and global
light-plane texel phase can reduce one source of movement, but none proves that
the production material or shadow ray is the same as the reference.

The material re-audit corrects one preliminary Architecture hypothesis. The
reference carries four layer densities and weights, but with its default zero
absorption the final scalar scattering and extinction can be integrated by an
equivalent scalar Beer step. Merely retaining a `vec4` through the marcher would
therefore be structural churn, not a demonstrated visual repair. The confirmed
differences occur earlier and around that step:

- reference low layers multiply authored density by `0.2`; SceneGIS normalizes
  that value and applies `cloudDensity=0.005`, a `40x` default extinction gap;
- reference detail participation is gated by material mip and jitter, while
  SceneGIS applies a separate Globe LOD adaptation;
- reference high-quality secondary Sun steps cover the progressive
  `50 + 100 m` schedule and ground uses three steps, while SceneGIS currently
  uses a different doubled four-step Sun span and one ground sample;
- SceneGIS derives Bruneton irradiance from a camera-footpoint tangent virtual
  position rather than the actual spherical/ECEF cloud sample.

The shadow re-audit compares complete topology rather than atlas statistics.
`three-geospatial` fits each cascade in full light view/projection space, stores
the inverse matrix, reconstructs the producer ray from it and projects the same
world point in the receiver. Cascade choice is view-space orthographic depth.
SceneGIS still uses Euclidean camera distance, builds only atlas x/y rows,
traces through a camera-footpoint osculating sphere and lets the BSM footprint
choose a material LOD different from the visible ray. The existing integer
texel-center fixture cannot detect any of those errors. The reference also
temporally resolves its shadow pass, but that stage is useful only after the
world-space mapping is invariant.

`A8-AR-015` therefore requires exact material-equation probes and a fixed-ECEF
receiver test across camera motion. Parameter sweeps, broader PCF, extra history
weight or another global phase adjustment are explicitly rejected as root-cause
evidence.

## A8-AR-015 execution comparison

The implemented material path now follows the audited `clouds.glsl` ownership:
weather and authored layer coefficients produce density, shape/detail apply in
the reference material mip/jitter domain, and scalar extinction enters the
existing Beer step. High quality uses the reference two-sample `50 + 100 m`
secondary schedule and three ground samples. The deterministic old normalized
coefficient and four-step schedule mutations both fail the compiled probe.

The implemented shadow path follows the audited `CascadedShadowMaps.ts` /
`shadow.frag` topology without importing its temporal pass: a full invertible
ECEF light transform defines each cascade, the inverse reconstructs producer
rays, and the forward transform addresses receivers. This closes the spatial
authority first with zero new GPU resources; reference temporal shadow resolve
remains deliberately unconsumed because it is not needed to hide projection
drift.

## A8-AR-015 Architecture re-review against the final sources

The fixed candidate/reference screenshots confirm that lower layer altitude
was not the remaining dominant difference. SceneGIS still saturates broad cloud
regions and loses the reference's gray bases and internal thickness response.
Source comparison identifies two material causes and one shadow-stability
cause.

First, the reference computes an entry mip from derivatives of
`globeUv * localWeatherRepeat`, blends it by camera height and passes its texel
footprint into the entire march. SceneGIS uses only
`log2(1 + distance * 1e-5)`. The formulas coincide only when the entry
footprint is one texel, which is not generally true and is especially false in
the high-altitude case reported by the owner.

Second, the reference accurate-light path calls
`GetSunAndSkyScalarIrradiance` at the cloud position and
`GetSunAndSkyIrradiance` at the ground point/normal. SceneGIS still mixes a
dimensionless Sun transmittance, solar-normalized sky irradiance and an
approximate coverage-based ground term, then applies the older intrinsic
radiance scale. Density parity cannot make those source terms equal.

Third, the corrected ECEF matrices establish a plausible stationary world
mapping, but the local reference's shadow output is not a raw single-frame
atlas. It publishes front depth and velocity, reprojects a history target,
chooses the closest depth, variance-clips a 3x3 neighborhood and blends with a
slow temporal alpha. SceneGIS lacks that pass and introduces a non-reference
5% next-cascade blend without matching producer overlap. A small-angle fixture
with a broad OD tolerance cannot substitute for the owner's large-angle fixed
world observation.

The follow-up is split into `A8-AR-016` for projected material footprint plus
physical radiance-source parity, and `A8-AR-017` for BSM temporal/cascade
closure. Both remain Globe-only and must be implemented before another owner
gate.

## Execution extraction — A8-AR-016/017

The implemented source map now follows the discovered reference boundaries:

- entry footprint is derived once at the cloud-shell entry and propagated into
  the existing march, so distance only widens a physically established base
  footprint;
- Sun/sky and ground sources execute Bruneton irradiance at their actual cloud
  and ground positions, then map once into the SceneGIS background HDR domain;
- the atlas producer emits Beer plus front depth/velocity and a separate
  zero-resource-category resolve command performs closest-depth reprojection,
  current-neighborhood clipping and ping-pong history publication;
- receiver cascade selection is singular and view-depth based, matching the
  audited reference instead of blending unrelated producer regions.

No reference code, opaque asset, runtime dependency or upstream seam was added
by these corrections. The retained checked-in CloudCore provenance remains the
asset authority.

## A8-AR-016/017 Architecture source recheck

The local Basic story leaves `CloudsMaterial.temporalUpscale` at its default
`true`. `copyCameraSettings` consequently writes `mipLevelScale=0.25`; it writes
`1` only in the non-temporal branch. SceneGIS's new `0.35` is not present in
either source path. The corresponding fixture duplicates `0.35`, so the test is
not independent reference evidence.

The reference shadow producer enables both `TEMPORAL_PASS` and
`TEMPORAL_JITTER`. Its shared `getSTBN` samples `frame % textureDepth`.
SceneGIS's producer still uses `texelFetch(..., slice 0)`, which means a static
view never supplies a new sample to its newly allocated history. The reference
receiver also uses `getFadedCascadeIndex`: it expands adjacent view-depth
intervals and uses jitter to choose one covered cascade through the overlap.
SceneGIS now has a hard interval boundary instead.

The tiled-atlas adaptation adds one more constraint absent from the reference's
array texture. A linear history sample must be clamped to half-texel centers of
its own tile. The current conversion from local UV to atlas UV has no such
clamp, so motion at a tile edge can blend another cascade.

Finally, the BSM continuity decision reused the A6 visible-cloud orientation
cut. A heading change beyond about `10 degree` disables history for the whole
atlas even when full ECEF matrix reprojection is valid. This is precisely the
fast-rotation regime under review, and the execution fixture avoids it rather
than proving it. `A8-AR-018/019` close these remaining source contracts.

## A8-AR-018/019 implementation note — 2026-09-01

The adopted reference-mode boundary is now exact: temporal cloud footprint
`0.25`, frame-indexed STBN, full-ECEF BSM reprojection through substantial
rotation, and faded cascade overlap. The tiled-atlas adaptation adds the
required half-texel clamp and performs overlap combination in Beer-
transmittance space. A reusable BSM snapshot covers preset, coverage, density,
layer dimensions, detail policy, ellipsoid authority, quality, projection,
frustum, Sun and cloud time. Focused production/mutation evidence and the final
controller/A1/delivery checks passed without resource or ownership expansion.

## A8-AR-020 through A8-AR-023 source closure — 2026-09-01

The reference footprint is defined in resolved-output coordinates but measured
on its quarter-rate current Cloud raster. SceneGIS therefore converts actual
current-raster derivatives by `current / ceil(resolved / 4)` before applying
the reference temporal scale `0.25`. The compiled `CloudFS` result matches an
independent CPU equation.

The audited reference samples shape/detail from base-level linear volumes;
only weather/turbulence use mip chains. SceneGIS now preserves that split for
Globe without changing Planar. The reference BSM producer also uses a clamped
structured period `clamp(maxRayDistance / iterations, 100, 1000)` and shifts
the entry by `stepSize * jitter`; both terms are now present in the real
producer. Focused mutations restoring shape/detail LOD or uniform/no-offset
sampling fail in actual-GPU evidence.

The matched Basic page reached ready/HDR with zero errors. One direct fast
rotation left no persistent captured screen-space shadow trail; interactive
softness and block structure remain outside numerical source closure and under
project-owner visual authority.

## A8-AR-024 through A8-AR-028 source closure — 2026-09-01

The fixed reference uses two coordinate representations of one physical Sun:
camera-local ENU for local cloud rays and phase, and normalized ECEF for
Bruneton, ground irradiance and BSM. SceneGIS now carries both explicitly
through the real CloudFS call graph. BSM raw-versus-filtered selection likewise
uses receiver-local elevation, not a global `Sun.z` component.

The local Sun march reports its covered distance and BSM starts at that exact
distance, so direct solar OD is covered once while sky/ambient and opacity stay
independent. Reference raster authority for odd dimensions is
`4 * ceil(resolved / 4)`. Focused compiled mutations for wrong Sun space,
global elevation, same-UV history, coordinate/cascade mismatch and LOD all
fail without changing product resources or public API.

## A8-AR-029 shadow-caster source closure — 2026-09-01

The pinned reference's shadow flag belongs to layers, not to the complete
visual preset. Its low layers cast; the high/cirrus layer does not. SceneGIS
previously reused the visual support union in the producer and a separate
`base + thickness` receiver top, so mixed clouds projected two different
shells through one atlas. The adopted mapping keeps visual density unchanged
and introduces a shadow-only support/density selection mirrored exactly in JS
and GLSL. Cumulus and mixed resolve to relative `[0,1450] m`, stratus to
`[250,1450] m`, and cirrus to no support for the baseline `4500 m` thickness.

Fixed-ECEF actual-GPU evidence reads raw producer Beer, temporally resolved
Beer and the production Globe surface result across bounded pitch/orbit states.
This directly distinguishes atlas production, temporal resolution and surface
consumption; the legacy all-layer/top mutations fail without adding a looser
filter, bias, settling frame or resource.

### A8-AR-029 projection-grid continuation — 2026-09-01

The owner's exact camera pair ruled out a changing terrain target: both center
rays reach the same WGS84 location, while the saved captures show translated
shadow landmarks. Raw-atlas isolation then showed that light-space center
snapping was operating on a slightly different texel size in each pose. The
source of that scale change was the radius computed from already geodetically
mapped frustum corners.

The adopted correction separates coverage from sampling scale. Mapped corners
continue to determine the light-space center, but the radius is the analytic
bounding radius of the unchanged projection and producer split. It is therefore
independent of camera pose while retaining the existing `1.05` coverage margin.
The exact pair changes the former radius by about `16.05 m`; the corrected
radius is bit-identical and keeps the receiver's fractional atlas texel phase
stationary. This is a grid-authority repair, not a filter, temporal weight,
cloud-density or display calibration change.

The final current-source BSM fixture, controller aggregate and A1 private
pipeline passed `1/1`, `76/76` and `7/7`. No browser was refreshed after the
product edit, so the owner's saved stochastic cloud bodies remain failure
evidence rather than being replaced by a different visual sample.

### A8-AR-032 first-divergence result — 2026-09-01

The fixed-position producer probe is exact across the saved cameras, including
three nonuniform raw atlas texels. The next stage exposed two resolve-domain
errors: normalized half-float velocity could not preserve the integer snapped
grid shift, and variance clipping could move an exact history/current match.
Encoding texel displacement directly, rounding only the no-advection case and
using finite current-neighborhood min/max clipping preserves the stable world
sample while retaining continuous cloud motion. The focused actual-GPU fixture
passes `1/1`; the former mapped-radius and camera-inverse authorities fail.

One new final-source page was used for the exact A-to-B gesture. Runtime stayed
`ready · HDR` with zero errors and no abrupt field translation; the old
pre-refresh stochastic clouds were deliberately not used as a target.

### A8-AR-033 scale-compatible history policy — 2026-09-01

Cloud-material stationarity does not imply shadow-grid scale stationarity.
The retained policy therefore compares previous/current cascade half-sizes and
atlas resolution before integer publication. Exact scale preserves the stable
snapped-grid integer path; an allowed frustum-scale change preserves fractional
reprojection. One actual-GPU FOV transition rejects unconditional rounding
without changing history, resources or quality profiles.

### A8-AR-034 complete lattice authority — 2026-09-01

Accepted small Sun motion rotates the light-space grid even when projection,
resolution and cascade footprint remain fixed. The integer path therefore also
requires exact equality of the snapshot/current ECEF Sun direction. This reuses
the existing snapshot authority and covers both smooth rotation and the basis
reference-axis branch without redundant state. A bounded actual-GPU Sun step
retains fractional reprojection and rejects the scale-only rounding mutation.
