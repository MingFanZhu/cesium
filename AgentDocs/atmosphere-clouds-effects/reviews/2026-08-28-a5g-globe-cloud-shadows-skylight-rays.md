# A5-G Globe Cloud Shadows, Skylight, and Crepuscular Rays Review

## Status

- Phase: `A5-G`
- State: `accepted; Architecture review and owner visual gate passed`
- Reviewer: Architecture Agent
- Open findings: `none`
- Phase plan:
  [2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md](../plans/2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md)
- Decision:
  [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md)

## Review boundary

Review the current-frame Beer shadow atlas, the `SGP-0009` Globe surface seam,
A2 Sun/sky surface lighting, packed shadow-length transport and Bruneton/fog
crepuscular coupling. Verify the fixed resource budget, disabled identity,
native-lighting conflict and lifecycle semantics.

Planar adaptation, temporal BSM, bloom/lens flare, generic Models/3D Tiles
relighting and A6-G are outside this review.

## Findings

### A5-AR-001 — BSM front depth uses incompatible origin and storage units — closed

`SceneGISCloudShadowFS.glsl` starts the march about 200 km before the cascade
center and stores that absolute ray distance in the atlas R channel. The
receiver instead subtracts R from a cloud-top-relative distance of only a few
kilometres. This makes positive atlas optical depth resolve to zero for normal
ground receivers. The stored value also exceeds the finite `RGBA16F` maximum.

Repair only the representation contract: measure front depth from the
cloud-top/segment-entry origin, store `frontDepth / 200000`, decode it back to
metres at the receiver, and add one actual atlas-to-receiver GPU assertion that
positive atlas optical depth produces `cloudTransmittance < 1`.

### A5-AR-002 — clear-sky shadow length is discarded — closed

The reference path marches shadow length independently of a primary cloud hit.
The current cloud pass samples the BSM only after primary density is positive,
returns before packing when no cloud is hit, and resolve/aerial then gate the
decoded length on cloud validity. A clear pixel therefore cannot carry the
positive shadow length required for crepuscular rays.

Repair the existing channel semantics without adding resources: march bounded
BSM shadow length independently of primary cloud validity, preserve invalid
cloud color/distance while carrying positive packed length, filter length with
its own weight in resolve/history, and let aerial/fog consume it whenever rays
are enabled. Add one actual-GPU clear-ray fixture proving directional Sun is
reduced while ambient/sky is unchanged.

### A5-AR-003 — fallback surface normal is geocentric — closed

The SceneGIS no-terrain branch passes unit inverse radii to
`czm_geodeticSurfaceNormal`, which reduces to `normalize(position)` and is not a
WGS84 geodetic normal. Use WGS84 inverse-radii-squared in the SceneGIS branch
only and cover one mid-latitude numeric probe. Cesium native lighting remains
unchanged.

### A5-AR-004 — BSM receiver exposes atlas texels — closed

The receiver takes one atlas sample per cascade. Medium uses 256-pixel tiles;
high uses 512. The owner screenshot and direct high/medium toggle show the same
square pattern at different sizes, and disabling cloud shadows removes it.
ADR-0047 already requires PCF, so implement a bounded 3×3 tent filter in Beer
transmittance space, keep taps inside the selected atlas tile, and raise the
low/medium/high tiles to `256/512/768`.

### A5-AR-005 — Globe surface radiance has no Cesium-domain scale — closed

The A5 surface shader sends physical A2 irradiance directly into Cesium
material color while background/cloud/aerial already have explicit renderer
calibrations. At true sunset, cloud-shadows-off stays black but
controller-disabled restores the native base surface. Add public Globe-only
`surfaceRadianceScale=10`, finite `[0,64]`, to the combined Lambertian Sun+sky
surface term. Do not add light, tint, exposure or a hidden multiplier.

### A5-AR-006 — downward profile lacks finite/clear depth authority — closed

The delivered Globe product now interpolates the source scale from
`aerialRadianceScale` to `surfaceRadianceScale` with
`1 - max(transmittance.rgb)`, matching the accepted near and extinguished
endpoints. That code is accepted. The remaining evidence uses a 120 km,
`-8°` center ray above the ellipsoid horizon and 33 sparse display-only samples
without resolved depth, so it cannot identify a finite/clear boundary. Replace
only the Test observation with one true ground-intersecting, same-frame
color/depth capture before making any further product claim.

### A5-AR-007 — shadow-length transport cannot produce visible shafts — closed

The delivered camera now aligns to the live Sun and reports
`dot(view,sun)=1`, so camera geometry is no longer the cause. The A3 fog
consumer instead converts the decoded metre length with
`exp(-shadowLength/200000)`. Ordinary kilometre-scale cloud lengths therefore
attenuate directional fog by only a few percent. Replace this scalar with the
existing Globe height-density optical-depth fraction outside the final
shadowed segment, preserving ambient and exact zero-length identity. Keep the
fixed visible `0.6/4` owner controls, resources, public defaults and Planar
unchanged.

### A5-AR-008 — Test Globe has no imagery/terrain authority — closed

The page explicitly disables `baseLayer` and `baseLayerPicker`, then renders a
flat `globe.baseColor`. Add a visible Globe-only selector with offline Natural
Earth II as the default, optional official Cesium World Imagery + World Terrain,
and the retained solid diagnostic mode. Online failure keeps the last-good mode,
reports once and does not retry.

### A5-AR-009 — clear depth has no full participating medium — open

The raw/progressive producer is correct, but the fixed off/on image remains
without a distinct shaft. Fixed-reference `approximateHaze` renders full Sun
and sky haze even at zero shadow length, then removes directional Sun over the
equivalent shadow prefix. SceneGIS clear depth renders no full height fog; only
when length is positive it adds `shadowedFog - unshadowedFog` to the existing
background. This topology can only darken that background slightly and cannot
establish a visibly illuminated medium. Apply one full Globe clear-depth fog
evaluation, retain zero length for rays-off, and use physical A2 Sun units for
the Globe directional source. No second haze layer or Planar change is needed.

## Evidence

### Execution delivery — 2026-08-28

Implemented the fixed A5-G contract with one current-frame RGBA16F Beer atlas,
the active `SGP-0009` Globe surface variant, and semantic 10-bit shadow-length
transport in the existing distance alpha. Public defaults are
`showCloudShadows=true` and `showCrepuscularRays=true`; both setters are warm.
Native Globe lighting is rejected before A5 allocation. No Planar-specific,
A6-G, display-transfer, asset or history work was added.

Resource audit:

- low: 2 cascades, 256 tiles, 25 steps, 512 x 512 RGBA16F = 2,097,152 bytes;
- medium: 3 cascades, 256 tiles, 50 steps, 512 x 512 RGBA16F = 2,097,152 bytes;
- high: 3 cascades, 512 tiles, 50 steps, 1024 x 1024 RGBA16F = 8,388,608 bytes;
- one texture, one FBO, one program, no depth, no shadow history and at most
  three atlas commands.

Exact automated results:

- packed-alpha/directional-only actual GPU: 1/1 success;
- Beer/cascade-overlap actual GPU: 1/1 success;
- controlled-density atlas actual GPU: 1/1 success;
- Globe surface variant and terrain/geodetic normal actual GPU: 1/1 success;
- `SceneGISEnvironmentEffects`: 71/71 success;
- A1 private pipeline: 7/7 success;
- `GlobeSurfaceTileProvider`: 57/57 success;
- CloudCore generator: 10/10 success;
- installed package/provenance verifier: 23/23 success.

Same-final-source browser evidence used one controlled frame per fixed Globe
state. High-Sun elevation was 67.484068 degrees; raw median luminance was
1.002142 ground and 1.205260 oblique, with finite/storage-safe attachments.
True sunset elevation was 2.175387 degrees and source RGB was
0.587051/0.219676/0.050138 (`R > G > B`). No-moon night elevation was
-20.119677 degrees and raw cloud source was exact 0/0/0. All eight states were
valid and browser console/render errors were zero.

Ownership audit: the only upstream-owned changes are the three registered
`SGP-0009` paths. Generated changes=0, new SGP=1, existing `SGP-0008` remains
consume-only, static assets=0 and runtime dependencies=0. Visible residual risks
for owner judgment are shadow legibility over the current terrain palette,
cascade softness at oblique range and low-Sun shaft strength. No owner gate is
requested by this delivery.

### Architecture independent review — 2026-08-28

Architecture inspected the final shader data flow and independently reran only
the directly relevant checks. The packed-alpha fixture and controlled-density
atlas fixture each passed 1/1, and the upstream patch audit passed with exactly
the three active `SGP-0009` paths and no generated changes.

Those checks establish the isolated encodings and allocation boundary, but do
not exercise the mismatched atlas producer/receiver origin, invalid-cloud with
positive shadow length, or the numerical WGS84 fallback normal. The three
findings above are therefore changes-requested. Product-owner visual review,
checkpoint, commit/push and A6-G remain blocked. The correction boundary is
limited to those findings and their three focused GPU assertions; no broad
matrix or defensive evidence framework is requested.

### Execution correction response — 2026-08-28

`A5-AR-001` is repaired by measuring weighted front depth relative to the cloud
segment entry, storing `frontDepth / 200000` in atlas R and decoding metres at
the receiver. The actual atlas output produced positive receiver optical depth
and `cloudTransmittance < 1`; all atlas channels remained finite and bounded.

`A5-AR-002` is repaired by sampling the BSM at every bounded coarse view
interval before occupancy/density rejection. Invalid cloud output now packs the
independent positive length. Resolve spatial/history length has separate weights,
and aerial consumes decoded length without validity reset. The actual-GPU
clear-ray probe decoded `valid=false, length=100000`, reduced directional Sun by
`exp(-0.5)` and preserved the ambient/sky sentinel exactly.

`A5-AR-003` is repaired with a shared SceneGIS surface-normal helper using WGS84
inverse radii squared. The 15°E/45°N actual-GPU result matched
`Ellipsoid.WGS84.geodeticSurfaceNormal` and rejected `normalize(position)`.

Exact correction validation:

- real atlas producer-to-consumer fixture: 1/1 success;
- invalid clear-ray directional transport fixture: 1/1 success;
- WGS84 mid-latitude normal fixture: 1/1 success;
- existing packed shadow-length round-trip: 1/1 success;
- existing Beer cascade overlap: 1/1 success;
- existing compiled Globe surface variant: 1/1 success.

The correction changes no public API/default, atlas size/bytes, resource count,
pass/program/texture/FBO/history count, upstream-owned path or Planar behavior.
Architecture re-review remains authoritative for closing the three findings.

### A5-AR-002 final Execution response — 2026-08-28

The remaining clear-depth fog omission is repaired in
`SceneGISEnvironmentEffectsAerialFS.glsl`. For positive decoded length, the
Globe branch evaluates `sceneGISApplyExponentialHeightFog` with identical base
color and uniforms for shadowed and zero-length cases, then adds
`shadowedFog - unshadowedFog`. The shared base, ambient and transmittance terms
therefore cancel; only directional Sun changes and zero length remains identity.

The previous helper-only test was replaced. The new actual-GPU fixture compiles
the same production Bruneton definitions/common/runtime, atmosphere,
CloudShadow and HeightFog sources used by Aerial. Starting from packed
`valid=false, length=100000`, it proves:

- directional-scale-one shadowed fog is lower than zero-length fog;
- directional-scale-zero ambient-only output is exact unchanged;
- cloud validity remains false;
- the Aerial clear-depth source contains both real fog calls and their delta.

Exact results: replacement fixture 1/1 success; existing packed round-trip 1/1
success. Static and ownership results are recorded after final writeback. No
accepted A5-AR-001/003 code or frozen boundary was changed.

### Architecture correction re-review — 2026-08-28

Architecture independently reran the three correction fixtures. The controlled
atlas producer/receiver, invalid clear-ray helper and WGS84 normal fixtures each
passed 1/1. The patch audit also passed with exactly three current-delivery
upstream paths under `SGP-0009` and no generated changes.

Source review closes `A5-AR-001`: atlas R is now segment-entry-relative,
normalized on write and decoded before the receiver formula. It also closes
`A5-AR-003`: the actual SceneGIS fallback call now uses the shared WGS84
inverse-radii-squared helper.

`A5-AR-002` remains open. The clear-ray fixture executes only packed-length
encode/decode and `sceneGISCloudShadowDirectionalTransmittance`; it does not
execute Aerial or A3 height fog. In product source, clear depth still bypasses
`sceneGISApplyExponentialHeightFog` through the `!isClearDepth` condition, while
the background pass has already applied unshadowed fog with length zero.
Therefore invalid-cloud positive length affects clear-sky Bruneton radiance but
not clear-sky A3 directional fog, contrary to the accepted contract.

The remaining repair is narrow: for clear depth, apply the difference between
the actual shadowed and unshadowed height-fog results so the existing background
fog is not applied twice and ambient cancels unchanged. Replace the helper-only
fixture with one direct actual height-fog/Aerial assertion. No other product,
resource, evidence or validation expansion is authorized.

### Architecture final correction review — 2026-08-28

Architecture inspected the final clear-depth branch and independently reran the
replacement actual height-fog fixture and the packed-length identity fixture;
both passed 1/1. The upstream audit again passed with exactly three
current-delivery paths under `SGP-0009` and no generated changes.

The clear-depth branch evaluates the existing A3 fog function from one shared
base with decoded shadow length and with zero length, then adds only their
difference. Base, transmittance and ambient terms cancel, so the already-rendered
background fog is not applied twice and only directional Sun changes. The
replacement fixture executes the production Bruneton, CloudShadow and HeightFog
sources from packed `valid=false` plus positive length and proves directional
attenuation with exact ambient-only identity.

`A5-AR-002` is closed. Together with the previously closed `A5-AR-001` and
`A5-AR-003`, A5-G has no open technical findings. Technical review passes; the
project-owner Globe visual gate remains pending before checkpoint, commit/push
or A6-G activation.

### Project-owner visual gate — changes requested 2026-08-28

The owner rejected the live Globe result for blocky cloud shadows, black
twilight ground, a returned aerial layer line in downward views, invisible
crepuscular rays, and an insufficient flat-color Test surface. Architecture
reproduced the decisive toggles: disabling cloud shadows removes the mosaic;
high quality only shrinks it; shadows-off remains black at true sunset; and
controller-disabled restores the native surface. Source inspection confirms a
single BSM tap, no surface radiance calibration, a scale-1 finite aerial source
beside the scale-10 clear background, and a low-Sun camera unrelated to the Sun.

`A5-AR-004` through `A5-AR-008` are open under the converged correction in the
active plan and owner-corrections discussion. A5-G returns to
`changes-requested`; checkpoint, commit/push, owner re-gate, A6-G and all Planar
work remain blocked.

### Execution review handoff for A5-AR-004 through A5-AR-008 — 2026-08-28

Implemented the converged correction only:

- BSM tile resolutions are `256/512/768`, giving exact RGBA16F atlas bytes
  `2,097,152 / 8,388,608 / 18,874,368`;
- the receiver uses fixed 3×3 `[1,2,1]²/16` tent PCF, clamps every tap to the
  selected tile half-texel interior, averages Beer T and converts back to OD;
  cascade overlap also blends T;
- public `surfaceRadianceScale` defaults to `10`, remains finite `[0,64]`, and
  uses the existing warm request-render and `SGP-0009` frame-local seam;
- Globe finite aerial interpolates the physical source scale from aerial scale
  at `T=1` to surface scale at `T=0`; Planar/cloud-body code is unchanged;
- Test defaults to offline Natural Earth II plus ellipsoid terrain, exposes
  official Cesium online and solid modes, and provides the live-Sun-aligned
  below-cloud rays preset with visible `0.6/4` fog controls.

Exact focused results:

- `npm run test -- --includeName "filters Globe cloud shadows in Beer space without crossing atlas tiles on the actual GPU"`
  -> 1/1 success;
- `npm run test -- --includeName "scales Globe surface radiance and matches aerial extinction endpoints on the actual GPU"`
  -> 1/1 success;
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`
  -> 75/75 success;
- `npm run test -- --includeName "SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline"`
  -> 7/7 success;
- `npm run test -- --includeName "Scene/GlobeSurfaceTileProvider"`
  -> 57/57 success;
- `node scripts/scenegis/verify-planar-packages.mjs` -> pass;
- `node scripts/scenegis/audit-upstream-patches.mjs` -> pass, three current
  delivery upstream paths, `SGP-0009`, generated status zero.

Same-final-source browser facts:

- every fixed capture reported `valid=true`, finite raw attachments, zero bound
  failures and storage-safe RGB; browser errors were zero;
- high Sun measured `67.484068°`; sunset measured `2.175387°` with
  `dot(view, sun)=1.000000`; no-moon night measured `-20.119677°` and raw cloud
  RGB was exact zero;
- Natural Earth II -> solid -> Natural Earth II succeeded; the sole online
  World Imagery + World Terrain attempt succeeded;
- the downward finite/clear profile still reports maximum step `0.400905` and
  a zero-valued tail;
- aligned rays off/on displayed p10/median/p90 were both
  `0.127958 / 0.416954 / 0.742794`.

The last two facts are retained owner-visible risks. The explicit stop
condition was honored: no depth epsilon, horizon blend, extra haze, hidden
multiplier, retry, camera search or new validation framework was added.

Ownership/resource audit: upstream-owned changed paths remain exactly
`GlobeSurfaceShaderSet.js`, `GlobeSurfaceTileProvider.js` and `GlobeFS.glsl`
under the existing `SGP-0009`; this correction adds no upstream path, generated
file, SGP, asset, pass, program, texture, FBO or history. One existing atlas
allocation changes byte size by quality as listed above. Tree remains
uncommitted and unpushed; owner re-gate, checkpoint, A6-G and Planar are blocked.

### Architecture owner-correction review — changes requested 2026-08-28

Architecture independently reran only the two directly decisive GPU fixtures:
Beer-space PCF/tile isolation and Globe surface-scale/aerial endpoints both
passed 1/1. Source review also confirms the offline-first Globe layer selector.
`A5-AR-004`, `A5-AR-005` and `A5-AR-008` are closed and frozen.

`A5-AR-006` remains open for evidence only. The product asymptotic aerial scale
matches the accepted decision, but the supplied profile uses a 120 km,
`-8°` center ray above the roughly `-11°` ellipsoid horizon and samples 33
sparse display pixels without depth classification. Its maximum step and zero
tail cannot identify a finite/clear boundary. Replace it with one fixed true
ground-intersecting capture and same-frame resolved-depth classification; do
not change the product shader unless that valid observation reproduces a seam.

`A5-AR-007` remains open for product code. The aligned camera proves
`dot(view,sun)=1`, but A3 fog converts the decoded metre length using
`exp(-L/200000)`. This arbitrary normalization makes ordinary cloud lengths far
too weak and disagrees with the accepted final-shadowed-segment semantics.
Compute the directional visibility from the existing Globe fog optical depth:
whole segment minus the final `L` segment, divided by whole-segment optical
depth. Ambient remains unchanged; zero/full/partial segment behavior is direct
fixture authority. Add one integrated resolved-length/local-ROI observation at
the fixed visible state, not a full-frame percentile gate.

No broad controller, Scene, package or repository matrix is requested. Owner
re-gate, checkpoint, commit/push, A6-G and Planar remain blocked pending these
two bounded corrections.

### Execution handoff — A5-AR-006/007 review-ready 2026-08-28

Product correction is confined to `SceneGISExponentialHeightFog.glsl` plus
removal of its now-unused helper from `SceneGISCloudShadows.glsl`. For Globe,
decoded `L` is clamped to the active fog segment. The final `[s1-L,s1]`
height-density optical depth is subtracted from the total and divided by total
to weight directional Sun only. Zero optical depth and zero length retain
identity; full coverage yields exact zero. Planar, ambient, fog transmittance,
public API and resources are unchanged.

The actual-GPU production fog fixture passes 1/1 for zero/partial/full lengths;
the partial ratio matches an independent exponential-height CPU integral and
ambient-only output is exact unchanged. The directly affected packed-length
fixture also passes 1/1.

Test evidence now copies actual final RGBA8, resolved Cloud distance and the
Aerial-consumed scene depth inside the same `postRender`. At 120 km and pitch
`-20°`, the immediate center-column transition is finite raw depth
`0.876953125`, RGB `[0.823529,0.780392,0.968627]`, luminance `0.803154`, followed
by exact-clear depth `1`, RGB `[0.772549,0.815686,0.984314]`, luminance
`0.818690`.

The fixed rays observation uses coverage `0.65`, time `0`, elevation
`2.175387°`, and `dot(view,sun)=1`. Rays-off has zero nonzero lengths; rays-on
has 3,666 with p10/median/p90/max values of
`195.503/391.007/1173.021/1759.531 m`. The 17×17 near-Sun on-minus-off mean RGB
is `[-4.07e-5,-2.71e-5,-4.07e-5]`. Both captures are valid and render errors are
zero. No alternative state was searched and no threshold gate was added.

Ownership/resource audit: no upstream-owned file changed in this correction,
so the patch audit was not rerun. Generated delta, new SGP, pass, program,
texture, FBO, history and GPU-byte delta are all zero. The shared tree remains
uncommitted and unpushed.

### Architecture bounded-correction re-review — changes requested 2026-08-28

`A5-AR-006` is closed. The replacement observation copies final color and the
actual Aerial depth authority in the same render and identifies an adjacent
finite/clear pair. Its luminance delta is `0.015536`, so the prior sparse
`0.400905` result was an invalid classification rather than a demonstrated
product discontinuity.

`A5-AR-007` is not closed by the passing fog equation fixture. In the fixed
owner state, Architecture independently observed no visible rays with the
toggle, consistent with the returned local RGB delta of only about `4e-5`.
The short resolved distribution is a producer symptom, not a remaining scalar
calibration problem.

At fixed reference commit
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`,
`packages/clouds/src/shaders/clouds.frag` uses `getShadowRayNearFar` to build a
separate camera-to-scene/ground/shadow-top interval capped at 200 km, then
`marchShadowLength` samples the BSM throughout that interval even when no cloud
body is hit. Current `sceneGISMarchClouds` instead returns when
`sceneGISCloudSegment` is absent and accumulates BSM length only at the primary
cloud-support coarse midpoints. That truncates the physical shaft domain to the
cloud shell and explains the observed `195–1759 m` values.

Execution must separate the shadow-view and cloud-body intervals while keeping
the existing `primarySteps` sample budget. A3 fog must use the camera-near
shadow prefix used by reference `approximateHaze`, not the previously assigned
final subsegment; that earlier Architecture instruction is superseded for the
A3 fog consumer only. The existing Bruneton point call is unchanged. One
producer mutation fixture, the amended fog fixture, and one fixed low-Sun
observation are sufficient. No parameter sweep, numeric visibility gate,
replay/hash mechanism or unrelated matrix is requested.

### A5-AR-007 bounded producer execution — review-ready 2026-08-28

The Globe cloud pass now computes shadow length on an independent view segment
before cloud-support clipping. The segment terminates at the nearest finite
scene distance, ellipsoid ground, or shadow-top exit and is capped at 200 km.
It consumes exactly one BSM reconstruction for each existing `primarySteps`
midpoint. Cloud density, occupancy, radiance, front distance and validity stay
on the original cloud-support interval; an invalid cloud may carry positive
shadow length.

The A3 Globe fog consumer now subtracts the camera-near prefix optical depth
from the directional source only. The producer actual-GPU fixture passes 1/1
and rejects a deterministic mutation back to cloud-support clipping. The
production fog prefix fixture passes 1/1 for zero, independently evaluated
partial, full and ambient-only cases.

The sole repeated fixed observation uses coverage `0.65`, cloud time `0`, Sun
elevation `2.175387°`, and `dot(view,sun)=1`. Rays-off resolves no nonzero
length. Rays-on resolves 197,878 pixels with p10/median/p90/max values of
`1173.021/2737.048/16031.281/23069.404 m`. Its 17×17 near-Sun mean RGB equals
the off result exactly at 8-bit precision. The longer producer domain is thus
confirmed, but the requested owner-visible shaft is not demonstrated and
remains a review risk rather than being hidden by another adjustment.

This correction changes no upstream-owned or generated file and introduces no
public API, SGP, pass, program, texture, FBO, history or GPU-byte delta. The
shared tree remains uncommitted and unpushed.

### A5-AR-007 Test witness correction — review-ready 2026-08-28

Only `Test/高级环境.html` changes executable behavior. It preserves the
`18:30Z` true-sunset state and adds `17:30Z` as a separately labelled
crepuscular-rays state. The live-Sun camera measures `11.647154°` elevation and
`dot(view,sun)=1.000000`; coverage `0.65`, cloud time `0`, and fog directional
controls `0.6/4` remain fixed. The helper now owns one off/on pair for this
state and removes the derived center-ROI difference record.

Both direct captures are valid. Off displayed p10/median/p90 is
`0.420470/0.810409/0.888542`; on is `0.417130/0.809174/0.888542`. Off resolved
length is zero, while on has 68,306 nonzero pixels with median `5669.599 m` and
maximum `12707.722 m`. The inspected pair still has no distinct visible shaft,
only slight broad dimming. Per the bounded assignment, no alternative state,
metric gate, formula or product edit was introduced.

Product GLSL, Specs, API/defaults, resources, upstream paths, SGP-0009, assets
and Planar are unchanged by this witness correction. The tree remains
uncommitted and unpushed.

### Architecture producer re-review — changes requested 2026-08-28

Architecture accepts the A5-AR-007 product correction. The independent
shadow-view interval and camera-near fog prefix match the fixed reference, and
the two directly affected actual-GPU fixtures independently pass 1/1. Product
GLSL and those fixtures are frozen.

The owner-visible claim remains open because the fixed evidence conflates true
sunset with the rays showcase. At `2.175387°`, visible `0.6/4` controls produce
a small final-frame luminance reduction (about `0.006–0.007` at the reported
percentiles), but the Sun-center 17×17 ROI is exact off/on. Raising fog strength
in one bounded diagnostic increased broad darkening without changing that ROI,
so another scalar is explicitly rejected.

Changes are requested only in `Test/高级环境.html` and current A5-G records:
retain the true-sunset evidence, add a separate live-Sun-aligned
`2026-06-21T17:30:00Z` rays preset (target elevation about `10–12°`), and show
one direct off/on owner visual pair. Remove the center ROI as an acceptance
authority. No product/Spec change, parameter search, numeric gate, replay/hash,
multi-frame machinery or broad validation is authorized. A5-G remains blocked
before owner re-gate and checkpoint.

### A5-AR-007 Architecture sampling correction — changes requested 2026-08-28

The fixed `17:30Z` witness is valid but still shows only slight broad dimming.
That result rejects the preceding conclusion that only the owner preset was
wrong. The earlier product acceptance is superseded by a newly confirmed
reference mismatch.

Reference `marchShadowLength` uses raw radius-zero BSM sampling and progressive
`50 m × 1.01` intervals, taking about 374 samples to span `200 km`. SceneGIS
uses the cloud-body `32/64/64` uniform budget for shadow length and applies the
surface receiver's fixed 3×3 PCF at every sample. At medium/high quality this
is at least 576 atlas reads while spatially filtering the very BSM transitions
needed for separated shafts.

Changes are requested only for a dedicated raw one-tap shadow-length sampling
path and a maximum-384 progressive march with an exact clipped final interval.
Surface PCF, cloud-body sampling, length packing/resolve, Bruneton and A3 fog
consumers, resources, public API, SGP-0009 and Planar stay frozen. One focused
actual-GPU equation/mutation fixture and the existing single `17:30Z` off/on
pair are sufficient. A5-G remains blocked before owner gate, checkpoint and
A6-G.

### A5-AR-007 raw/progressive BSM execution — review-ready 2026-08-28

`SceneGISCloudShadows.glsl` retains the existing surface/cloud 3×3 Beer-PCF
function verbatim and adds a length-only raw atlas reconstruction. The raw path
uses the same front-depth/OD channel contract, finite bounds, cascade selection
and transmittance-domain overlap. `sceneGISCloudShadowViewLength` now uses one
raw sample in each progressive interval: 50 m first length, `1.01` growth,
compile-time maximum 384, actual interval weighting and exact final clipping.
Cloud-body primary marching remains unchanged.

The one focused production-source GPU fixture passes 1/1. It matches an
independent CPU progressive sum, proves positive raw length outside cloud
support, and deterministically rejects the former filtered 64-uniform path on a
controlled contrast atlas.

The exactly reused 17:30Z off/on pair is valid at Sun elevation `11.647154°`
and `dot(view,sun)=1`. Off/on displayed p10/median/p90 is
`0.420470/0.810409/0.888542` versus `0.417115/0.809174/0.888542`. Rays-on has
68,288 nonzero resolved lengths with median `5669.599 m`; rays-off is zero.
Direct inspection still shows no distinct shaft, only slight broad dimming, so
execution stopped without another state or product adjustment.

This correction changes no public API, resources, passes, programs, textures,
FBOs, history, upstream path, SGP, generated file, asset or Planar behavior.
The shared tree remains uncommitted and unpushed.

### Architecture raw/progressive re-review — A5-AR-007 closed, A5-AR-009 open

The delivered raw/progressive implementation is accepted. The surface 3×3 PCF
is unchanged, the length-only path uses one raw atlas reconstruction with
transmittance-domain overlap, and the clipped progressive loop matches the
assigned bounds. Architecture independently reran the sole production GPU
fixture with 1/1 success. `A5-AR-007` is closed and these paths are frozen.

The fixed visual result identifies `A5-AR-009`. Reference `approximateHaze`
always supplies a complete participating medium; length zero means fully lit
Sun haze, not absence of haze. SceneGIS clear depth instead computes only the
negative difference `F(L)-F(0)`. The reported slight broad dimming is therefore
the expected output of the wrong composition, not a remaining producer or
camera problem.

Changes are requested in the Globe Aerial/height-fog source only: perform one
full clear-depth fog evaluation with decoded length, keep it reachable when
height fog is enabled, and use unnormalized physical A2 Sun color for the Globe
directional source while retaining the public power lobe. Map the fixed owner
preset to the reference `3e-5/1e-3/0/1` medium and `0.9/1.4` directional
coefficient. Amend one existing GPU fog fixture and reuse one fixed `17:30Z`
pair. No second haze, multiplier, parameter search, new test matrix, resource,
API, SGP-0009, Planar or A6 change is authorized.

### A5-AR-009 full-medium execution — review-ready 2026-08-28

`SceneGISEnvironmentEffectsAerialFS.glsl` now evaluates the existing height fog
exactly once for Globe clear depth using decoded shadow length and no longer
bypasses enabled Globe fog when clouds are disabled. The paired delta calls are
removed. `SceneGISExponentialHeightFog.glsl` uses physical A2 Sun RGB only in
the Globe directional branch; Planar normalization and all ambient/extinction
paths remain unchanged.

The amended focused GPU fixture passes 1/1. It compiles the production Aerial
and height-fog sources and proves: zero-length clear output is a full fog
evaluation rather than input background; positive length lowers directional
Sun only; ambient-only output is exact invariant; Globe uses physical A2 Sun
units; delta-only and max-solar-normalized mutations fail.

The single fixed owner pair remains at elevation `11.647154°`, exact Sun
alignment, coverage `0.65`, cloud time `0`, and the reference medium values.
Off/on displayed p10/median/p90 is `0.492689/0.810866/0.889093` versus
`0.489900/0.806791/0.889093`. Rays-on has 68,288 nonzero lengths with median
`5669.599 m`; direct inspection still shows broad dimming without a distinct
shaft. Execution stopped as required.

This correction adds no API, resource, pass, program, texture, FBO, history,
GPU byte, upstream, SGP, generated, asset or Planar delta. The shared tree
remains uncommitted and unpushed.

### A5-AR-009 — accepted; A5-AR-010 — reference intensity omitted

The full-medium Aerial topology and Globe physical-Sun source are accepted.
They satisfy the assigned product contract, and their single focused GPU
fixture is sufficient. A5-AR-009 is closed; no further product shader or Spec
change is requested.

The owner witness still fails because the Test mapping omitted the fixed
reference `sunIntensity = 20`. Reference directional haze is scaled by
`20 * 0.9 / (0.9 + 0.5)`; the current preset uses only
`0.9 / (0.9 + 0.5)`. This is a named source coefficient, not a tuned candidate.

A5-AR-010 requests only that exact value in the existing fixed Test preset and
one reuse of its off/on visual pair. Product defaults/ranges/equations,
resources, Specs, Planar and all broader validation remain frozen. No numeric
visibility gate is required; owner-visible separation is judged directly.

### A5-AR-010 Test coefficient execution — review-ready 2026-08-28

Only `Test/高级环境.html` changes executable behavior. The fixed 17:30Z preset
now uses and visibly reports directional scale `12.857143`, derived exactly as
`20 * 0.9 / 1.4`. Public defaults/range, product JS/GLSL, Specs, resources,
upstream scope, SGP-0009 and Planar remain frozen.

Both direct captures are valid. Off displayed p10/median/p90/max is
`0.872892/0.911818/0.951085/1`; on is
`0.872892/0.911557/0.949685/1`. Off has zero resolved length; on has 68,288
nonzero pixels with p10/median/p90/max
`782.014/5669.599/9775.171/12903.226 m`. Direct inspection still shows no
distinct shaft and the medium appears broadly bright and nearly uniform.
Execution stopped as required.

No product, Spec, API, resource, upstream, SGP, generated, asset or Planar
delta is introduced. The shared tree remains uncommitted and unpushed.

### A5-AR-010 — closed as disproved; A5-AR-011 — wrong clear-sky entry point

The A5-AR-010 implementation exactly followed the Test-only assignment, but
the direct result rejects its premise: multiplying the fog source by 20 raises
the whole medium toward saturation while leaving the rays-off/rays-on
distribution nearly identical. Its coefficient is not accepted and must be
restored to the prior fixed `0.9 / 1.4` owner value.

`A5-AR-011` is a product-blocking transport finding. Reference exact-clear
depth calls `getSkyRadiance`, hence Bruneton `GetSkyRadiance` with the decoded
shadow length. SceneGIS exact-clear depth instead calls
`sceneGISGlobeSkyRadianceToPoint` at
`SCENEGIS_PLANAR_BACKGROUND_DISTANCE = 1e9 m`. The finite-point runtime defines
the shadow as the final part of its point segment; after subtracting a
kilometre-scale length from this artificial ray and clamping to the atmosphere,
the shadowed and unshadowed lookup endpoints are effectively the same. This
explains why a valid, spatially varying resolved length field produces only
broad A3 fog modulation and no Bruneton shaft.

Required repair is limited to the existing Globe wrapper and clear Aerial
branch: pass shadow length to infinite-sky `GetSkyRadiance`, keep Background on
zero, and form the clear additive delta from shadowed versus zero-length
infinite-sky radiance. Finite/cloud `GetSkyRadianceToPoint`, A3 fog, BSM,
packing/resolve, API/resources, SGP-0009 and Planar are frozen. One amended
actual-GPU fixture must reject the old finite-point mutation; one fixed direct
visual pair remains the only owner evidence. No matrix or visibility metric is
requested.

## A5-AR-011 execution handoff — 2026-08-28

Implemented paths are limited to the Bruneton wrapper, Background zero-length
call, Globe exact-clear Aerial branch, the existing focused fixture, and the
fixed Test preset. The focused actual-GPU fixture reports 1/1 success: the real
infinite-sky zero/positive calls are finite and different, the compiled Aerial
branch consumes them, and the former `1e9 m` finite-point mutation is rejected.

The sole fixed witness uses `2026-06-21T17:30:00Z`, 15°E/45°N, Sun elevation
`11.647154°`, `dot(view,sun)=1`, coverage `0.65`, cloud time `0`, and restored
directional scale `0.642857`. Off/on displayed p10/median/p90/max is
`0.518031/0.817954/0.891347/1` versus
`0.514059/0.814048/0.891347/1`; rays-on length has 69,268 nonzero pixels and
`p10/median/p90/max = 782.014/5865.103/9970.674/12903.226 m`. Direct inspection
still shows no distinct separated shaft. No follow-on calibration or fallback
was introduced.

Resource/pass/program/texture/FBO/history/API/SGP/asset deltas are zero;
upstream-owned changed by A5-AR-011 is zero, generated changed is zero, and
Planar remains untouched.

### A5-AR-011 — closed; A5-AR-012 — default cloud haze omitted

The A5-AR-011 implementation matches its assignment and is accepted. The
actual infinite-sky function changes at positive shadow length, the compiled
Aerial branch consumes it, and the old `1e9 m` finite-point mutation fails.
No defect remains in that bounded change.

`A5-AR-012` is product-blocking. Fixed-reference base defaults enable `HAZE`,
and every quality preset inherits it. Reference `approximateHaze` is not the A3
medium: it derives density from cloud coverage and camera altitude, bounds its
ray by scene/ground/cloud top and cloud front, samples ground Sun/sky irradiance,
uses cloud dual-HG phase, shadows only directional Sun, and composites after
the cloud result. Current SceneGIS contains none of that source or composition;
it substitutes a generic public A3 power-lobe fog. The repeated broad-dimming
results are therefore expected and cannot close the owner finding.

The earlier architecture prohibition on this term is superseded. Restore the
reference helper within the existing Globe cloud/Aerial shader composition,
with its fixed constants and no public calibration. Lit haze remains when
rays are off; the decoded length changes only its direct source. Clamp the haze
ray to actual scene, ground, cloud top and opacity-weighted cloud front, then
apply the reference `mix` after existing cloud composition. A3, Bruneton
A5-AR-011, BSM, API/resources, SGP-0009 and Planar remain frozen.

One amendment to the existing production-stack fixture and one fixed 17:30Z
off/on pair with A3 height fog disabled are sufficient. No second Spec,
parameter sweep, numeric visibility gate, hash/replay mechanism or broad matrix
is requested.

## A5-AR-012 execution handoff — 2026-08-28

Implemented executable paths are limited to `SceneGISGlobeClouds.glsl`, the
Globe branch of `SceneGISEnvironmentEffectsAerialFS.glsl`, the existing focused
fixture, and the fixed Test evidence isolation. The helper retains the exact
reference constants, coverage remap, normal blend, analytic optical depths,
ground Sun/sky irradiance, dual-HG phase and scattering albedo. Positive length
changes only directional Sun; opacity and ambient-only output are invariant.

The amended actual-GPU fixture reports 1/1 success. The fixed owner witness
uses `2026-06-21T17:30:00Z`, 15°E/45°N, Sun elevation `11.647154°`,
`dot(view,sun)=1`, coverage `0.65`, cloud time `0`, and A3 disabled in both
captures. Off/on displayed p10/median/p90/max is
`0.382456/0.790802/0.888542/1` versus
`0.380834/0.790235/0.888542/1`; rays-on length has 68,288 nonzero pixels and
`p10/median/p90/max = 782.014/5669.599/9775.171/12903.226 m`. Direct inspection
still shows no distinct separated shaft. No follow-on calibration was added.

Resource/pass/program/texture/FBO/history/API/SGP/asset deltas are zero;
upstream-owned changed by A5-AR-012 is zero, generated changed is zero, and
Planar remains untouched.

### A5-AR-012 — changes requested; A5-AR-013 — wrong haze input authority

`A5-AR-012` cannot close. The product helper evaluates the expected analytic
formula, but two inputs do not match the fixed reference or the Architecture
assignment:

- `sceneGISGlobeCloudHaze` calls `GetSunAndSkyScalarIrradiance` at fixed
  `vec3(0, 0, atmosphere.bottom_radius)` and is passed the near-shifted haze
  origin. Reference camera height, origin normal and irradiance lookup derive
  from the actual camera position; the near plane only shortens the ray.
- Aerial assigns `hazeCloudFrontDistance = cloudMeanDistance`. The distance MRT
  already supplies a distinct decoded front in `distances.y`; using the mean
  extends haze through the cloud body and weakens the spatial separation the
  clamp is meant to preserve.

The green fixture is not contrary evidence. Its 1x1 transmittance and
irradiance textures make all sample positions identical, and its integrated
case never gives front and mean different values. It validates the scalar
equation while missing the two disputed data paths.

`A5-AR-013` requests the minimal source correction: evaluate camera-dependent
haze and scalar irradiance from the unshifted virtual camera position, retain
the near-shifted origin only for interval bounds, expose decoded front distance
alongside the retained mean distance, and use the front solely for the haze
clamp. Amend the same fixture with one real non-sea-level LUT sample and one
cloud sample with distinct front/mean values. Then reuse the same fixed
A3-disabled 17:30Z pair. No tuning, additional Spec, visual metric, alternate
state or broad validation is requested.

### A5-AR-014 — cloud-local haze obscures terrain without a cloud — open

Direct Globe isolation shows sky alone preserves terrain and cloud-only hides
the distant mountain silhouette even where the resolved cloud sample is
invalid. The cause is the A5-AR-012 adaptation applying reference cloud-local
haze globally to finite scene pixels. Reference topology does not grant that
term ownership of generic finite-terrain fog in SceneGIS, where A2 and A3
already own that transport.

Exact-clear sky keeps the reference haze. Finite geometry may receive it only
when the existing cloud selection reports a visible cloud body in front of the
scene. Otherwise the pre-haze scene result is identity. This is a composition
scope correction, not a density, opacity, depth or display adjustment.

### A5-AR-015 — Globe atmosphere and fog use discontinuous radiance domains — open

The owner terrain screenshots and fixed live isolation show a hard horizontal
boundary with aerial perspective and another with height fog. The prior
A5-AR-006 test covered one adjacent pair but did not validate the renderer
domain on real terrain.

The finite Globe A2 branch currently scales physical scattering with
`mix(aerialRadianceScale, surfaceRadianceScale, 1-max(T))`, while exact-clear
sky uses `backgroundRadianceScale`. At any partial transmittance the two
physical source terms are deliberately in different domains. The Globe A3 fog
source is then mixed without either scene-domain scale. These are
SceneGIS-specific calibration discontinuities; changing Bruneton LUTs or its
reference horizon clamp is not justified.

The correction uses
`backgroundRadianceScale * aerialRadianceScale` for every Globe Bruneton source
inside Aerial and removes the transmittance interpolation. Globe fog source
uses `backgroundRadianceScale` once; existing fog source controls remain
relative. Planar, defaults/ranges, surface input, physical transport and exact
depth classification remain unchanged. Closure is limited to amendments of the
existing surface/aerial and fog fixtures plus direct inspection of one fixed
World Terrain four-state set. No new Spec, screen-space blend or numerical
visual gate is requested.

### A5-AR-013/014/015 — execution-fixed; Architecture review pending

The product now uses the unshifted virtual camera for haze height, normal and
the non-sea-level Bruneton irradiance lookup; the near-shifted origin is used
only for the bounded interval. Cloud selection exposes distinct decoded mean
and front distances, with front used only for the haze clamp and mean retained
for cloud transport.

Exact-clear sky keeps haze. Finite/no-cloud pixels skip only the post-cloud haze
mix, while a selected foreground cloud retains it. Globe Aerial Bruneton source
terms use `backgroundRadianceScale * aerialRadianceScale`; the former surface
scale interpolation is absent. Globe fog source uses `backgroundRadianceScale`
once and Planar supplies identity.

The amended production fog/haze fixture and surface/aerial fixture each pass
1/1. At the fixed 15°E/45°N high-Sun World Terrain camera, displayed
p10/median/p90/max were:

- disabled identity: `0.135852/0.173008/0.298668/0.937255`;
- atmosphere+aerial: `0.392154/0.650765/0.824449/0.992157`;
- atmosphere+aerial+height-fog: `0.432849/0.704709/0.792623/0.992157`;
- cloud-only: `0.246096/0.598660/0.905264/0.992157`.

Direct inspection retained terrain silhouettes and continuous horizon
transitions, with no browser errors. The fixed A3-disabled 17:30Z pair changed
displayed p10/median/p90/max from `0.558425/0.867900/0.905664/1` to
`0.548645/0.864761/0.903431/1`; rays-on decoded 68,288 nonzero lengths with
`p10/median/p90/max = 782.014/5669.599/9775.171/12903.226 m`. No distinct
separated shaft is visible, so that owner-visible risk remains for Architecture
disposition. Current correction changes no API, resource, pass, program,
texture, FBO, history, asset, upstream-owned path or SGP.

Focused post-writeback validation:

- `npm run test -- --includeName "renders the full clear-depth Globe fog medium with physical directional Sun on the actual GPU"`
  -> 1/1 success;
- `npm run test -- --includeName "scales Globe surface radiance and matches aerial extinction endpoints on the actual GPU"`
  -> 1/1 success;
- focused Spec/Test ESLint -> exit 0;
- focused Spec/Test/active-record Prettier -> pass;
- focused active-record Markdownlint -> 0 issues;
- `git diff --check` -> exit 0 with retained line-ending warnings only.

### A5-AR-013/014 — closed; A5-AR-015 — one stale contract assertion

Independent source review accepts the unshifted haze camera/irradiance path,
front-versus-mean distance consumers, finite/no-cloud haze identity and shared
Globe atmosphere/fog radiance domain. No product-formula deviation was found.

The review boundary nevertheless has one deterministic failure. Exact command:

`npm run test -- --includeName "keeps orthographic origins and untruncated slab entry before the medium cap"`

Result: 0/1. The old A2 assertion at
`SceneGISEnvironmentEffectsSpec.js:7470` requires
`aerialFragmentSource` not to contain `u_backgroundRadianceScale`, directly
contradicting the accepted A5-AR-015 contract. The existing public JSDoc also
does not state that the same property is relative on Globe and remains absolute
on Planar.

Changes remain requested only for that existing assertion and the two JSDoc
descriptions. Product GLSL, Test, GPU/browser evidence and every other test are
frozen. Closure requires only the formerly failing Spec and focused static
checks; no aggregate or new evidence is requested.

### A5-AR-015 focused Spec/JSDoc correction — execution-fixed

The existing orthographic/source-contract Spec now asserts the accepted Globe
`backgroundRadianceScale * aerialRadianceScale` source contract and preserves
its Planar absolute-formula assertion. The property and constructor-option
JSDoc now explicitly distinguish Globe-relative from Planar-absolute
`aerialRadianceScale` semantics. The isolated formerly failing Spec passes
1/1; no runtime GLSL, Test, resource, SGP or visual-evidence path changed.

### A5-AR-015 — closed; A5-AR-016 — wrong terrain-depth lifecycle authority

The focused A5-AR-015 Spec and JSDoc correction is accepted and closed.

The three new owner screenshots reproduce a common depth failure in isolated
Aerial, exponential-height-fog and cloud states. Source tracing shows that all
three consumers use the depth texture supplied by the SceneGIS HDR seam. Under
Cesium's default `globe.depthTestAgainstTerrain === false`, terrain is first
drawn and copied to packed `czm_globeDepthTexture`; Cesium then clears the main
depth buffer and writes `DepthPlane`. `Scene.resolveFramebuffers` later passes
that post-clear main depth-stencil texture to both SceneGIS and native post
processing. The shaders therefore contain depth-aware formulas but do not have
actual terrain depth in this lifecycle.

The fixed Cesium reference sets
`viewer.scene.globe.depthTestAgainstTerrain = true` in both
`ThreeGeospatialPipeline.init` and `AtmospherePostProcess.init`. This prevents
the terrain-depth clear and retains a single actual terrain-plus-scene depth
authority. Its separate fake-depth heuristics are not adopted.

A5-AR-016 requires the active Globe controller to own that prerequisite for its
bounded lifecycle and restore the previous value on disable/disconnect. It must
fail closed if the value is externally invalidated while active. Changing the
SGP depth source, adding a terrain-only texture/merge pass, ellipsoid fallback,
depth epsilon, horizon mask, blur or radiometric workaround is rejected.
Planar and all product shaders remain frozen.

### A5-AR-016 execution candidate

The SceneGIS-owned controller now acquires `depthTestAgainstTerrain` only for an
enabled Globe lifecycle, after native conflict checks and before the first
resource request. A prior `true` value is observed without an owned mutation.
The active validator rejects an external `false` through the existing error
event and does not silently rewrite it. Disable and disconnect restore the
snapshotted prior value only when the controller changed it.

The amended existing lifecycle/resource Spec passes 1/1 across acquire order,
prior-true preservation, disable restore, disconnect restore and fail-closed
external mutation. Focused static checks pass. Direct inspection at one fixed
15°E/45°N high-Sun World Terrain ground camera preserved the terrain silhouette
and foreground occlusion in the isolated Aerial, exponential-height-fog and
volumetric-cloud states. No GLSL, Test, resource, API, Planar, upstream-owned or
SGP path changed; `SGP-0008` remains consume-only.

### A5-AR-016 — closed

Independent Architecture review found no remaining implementation deviation.
`validateActive` runs before acquisition; acquisition then precedes
`ensurePipeline` and resource generation. The active validator rejects a false
property without silently rewriting it. Disable and disconnect restore the
snapshotted value only for an owned mutation, while a caller-owned true value is
preserved.

Architecture independently reran:

`npm run test -- --includeName "keeps Globe shadow toggles warm and releases the exact atlas lifecycle"`

Result: 1/1 success on Chrome 151. A5-AR-016 is closed. The three fixed World
Terrain observations remain owner-facing visual evidence; Architecture closure
does not infer or request owner approval, checkpoint, A6-G or Planar work.

## Project-owner gate — passed

After A5-AR-016 closure, the project owner manually rechecked the Globe result
and reported that the effect is correct. The visual gate is accepted. The local
checkpoint is nevertheless blocked by the pre-commit type finding below. A6-G,
Planar and push remain outside this gate.

### A5-AR-017 — SGP-0009 FrameState extension lacks a local type boundary

The first Architecture checkpoint attempt ran the repository pre-commit hook.
Runtime lint/format tasks passed, but engine `tsc` failed at
`GlobeSurfaceShaderSet.js:153` because typed upstream `FrameState` does not
declare `_sceneGISGlobeLighting`. This is a real delivery failure even though
the runtime and owner gate are correct.

The repair is limited to an explicit local structural JSDoc cast within the
existing SGP-0009 hunk. Changing `FrameState`, adding an upstream path, using a
global suppression, changing the frame-local protocol or adding validation
machinery is rejected. Closure requires only engine `tsc` and focused static
checks; no GPU/browser rerun follows from this type-only correction.

### A5-AR-017 execution candidate

The accepted SGP-0009 read point now casts `frameState` locally to a structural
object with only optional `_sceneGISGlobeLighting` and optional boolean
`active`. The subsequent record read and strict `active === true` decision are
unchanged. Engine `npx tsc` passes without a suppression or `FrameState` change.
The upstream path set remains exactly three and there is no runtime, resource,
API, generated, SGP or Planar delta.

### A5-AR-017 — closed

Independent Architecture review confirms the cast declares only the optional
frame-local record and optional boolean `active`, while the runtime selection
remains unchanged. Architecture reran `npx tsc` from `packages/engine`; it
exited 0 with no diagnostic. No suppression, `FrameState` edit, fourth upstream
path, resource or behavior change exists. A5-AR-017 and the A5-G review are
closed. The phase-closing commit is the local checkpoint; no next phase or push
is inferred.
