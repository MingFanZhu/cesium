# A8-G Globe Qualification and Delivery Review

## Status

- Phase: `A8-G`
- State: `approved; closed`
- Reviewer: Architecture Agent
- Open findings: `none; A8-AR-001 through A8-AR-034 closed`
- Owner visual gate: `passed 2026-09-02`
- Phase plan:
  [A8-G phase plan](../plans/2026-08-31-phase-a8g-globe-qualification-delivery.md)
- Frozen predecessor checkpoint:
  A7-G=`6f70b54c80ce174bf7befe49fe37262230288e61`

## Review boundary

Review release qualification of the frozen A2-A7 Globe stack: direct Test
structure and lifecycle, build/types/API docs, installed package, upstream
patch audit, focused dev/release E2E, consolidated resource evidence, upgrade
checklist and bounded owner visual matrix.

No predecessor product recalibration, new effect, resource topology, upstream
seam, generated file edit or Planar product qualification is inside this
review.

## Required review evidence

- Changed-path and ownership audit.
- Source review of the split pages, local `lil-gui` imports and cleanup.
- Exact focused Spec/build/type/docs/package/audit results.
- Focused Playwright results for development and release output.
- Resource/tier inventory against frozen ADRs.
- Direct project-owner judgment of the six fixed Globe observations.

## Findings

### A8-AR-010 — Globe cloud material remains flatter than fixed reference

Severity: high. Status: implemented, awaiting Architecture review.

The project-owner fixed comparison against local
`three-geospatial@b012ad06` shows materially richer cloud layering, edge
erosion and internal light transport. Source inspection confirms that the
current Globe shader does not yet preserve the equivalent topology: it reads
only `.r` from the existing RGBA shape/detail volumes, keeps `cumulus` as one
full-thickness layer, and spreads its bounded local Sun samples over the entire
exit segment without adding the already available Beer shadow field. The
reference uses two overlapping low layers, approximately `3.333 km` shape and
`166.667 m` detail repeats, short-range local Sun detail plus BSM remainder,
eight-octave multiple scattering, sky light, powder and one ground-bounce
sample. SceneGIS already has the last three transport items and the Beer atlas,
but the first execution draft incorrectly treated the authored reference
assets as interchangeable with SceneGIS-generated RGBA data. The owner rejected
that approximation. The corrected boundary directly imports the five fixed
MIT reference payloads with exact provenance, then mode-selects them for Globe;
Planar keeps its original assets. Runtime texture/request counts and quality
sample counts do not increase.

The authorized correction remains Globe-only. It may change Globe texture
dimensions/formats and one internal quality-controlled turbulence uniform, but
must preserve public properties/defaults, A5 receiver/ray semantics, A6 history
ownership, A7 postprocessing, upstream-owned files, generated-module ownership
and SGP scope. The focused actual-GPU fixtures must prove the imported texture
types, reference layer/density and ground-bounce equations, finite bounded
transport and unchanged radiance calibration before Architecture re-review and
a new project-owner visual judgment.

### A8-AR-001 — SGP-0009 structural cast parser/type boundary

The first structural JSDoc cast passed runtime review but failed the A8 type
delivery boundary. Architecture supplied the final parser- and TypeScript-proven
compact `Partial.<...>` expression. Execution changed only that comment inside
the existing paired SGP-0009 hunk; runtime tokens, property access and variant
semantics are unchanged. Final `build-ts` and `tsc` both exit `0`.

No other finding is open. Awaiting Architecture review of the Execution
`review_ready` delivery and the bounded owner visual gate.

## Execution review package — 2026-08-31

### Changed delivery surface

- Globe direct sample: `Test/高级环境.html`.
- Retained Planar direct sample: `Test/高级环境-平面.html`.
- Shared page lifecycle/presentation: `Test/AdvancedEnvironment/**`.
- Focused delivery E2E and upgrade checklist.
- No navigation hub and no `Test/高级环境-球面.html`, per project-owner scope.
- One compile-time-only comment correction in the existing upstream-owned
  SGP-0009 path `GlobeSurfaceShaderSet.js`.

### Exact results

- Focused Specs: `77/77`, `7/7`, `4/4`, `5/5`, `57/57` — all success.
- Build/package: development build, release build, `build-ts`, `tsc`, docs,
  installed delivery `26/26`, and upstream audit — all exit `0`.
- Development Playwright: `1/1 passed`; release-config Playwright:
  `1/1 passed`; retries remain disabled and external requests are rejected.
- The existing Windows-incompatible npm wrapper
  `release=true playwright ...` fails before Playwright starts; the exact same
  release configuration passes with PowerShell-scoped `release=true`.
- Direct Globe observation: ready/HDR, high Sun `67.484°`, and zero current
  render errors. Planar startup is retained only and is not visually qualified.

### Ownership and residual risk

A8 runtime/resource/API deltas are zero. Current-delivery upstream-owned count
remains one registered SGP-0009 path, generated count is zero, no SGP is added,
and SGP-0008 remains consume-only. The remaining decisions are Architecture
review, project-owner judgment of the six fixed Globe observations, and whether
the existing cross-platform release npm wrapper should be normalized in a
separate authorized maintenance change.

### A8-AR-002 — release-bundle authority

The original direct-page smoke always imported the required Unminified ESM and
therefore did not distinguish release output. The amended same E2E file retains
that delivery-page smoke and then uses the existing `cesiumPage` fixture. Its
`process.env.release` selection injects the corresponding local public bundle
before one offline Globe controller lifecycle is exercised. No second E2E file,
retry or private renderer assertion was added.

### A8-AR-003 — release-page private readback removal

The release sample no longer reads private pipeline/resources, constructs
temporary framebuffers or synchronously reads Cloud MRT. Its state and visible
card contain only public controller/scene observations. Finite, bounds, storage
and frozen resource topology remain backed by the accepted focused automated
qualification and the upgrade checklist.

### A8-AR-004 — owner-paced quality observation

The former nested `postRender` medium-to-low-to-high automation is removed.
Each owner click now advances one visible tier only, updates the observation
label and GUI, and leaves that tier active for manual inspection. There is no
timer, RAF, settling render or E2E metric gate.

All three corrections are ready for Architecture re-review. Product, API,
resource, upstream, generated and Planar behavior remain unchanged.

### Correction validation

- `npm run test-e2e -- Specs/e2e/scenegis-globe-environment.spec.js`:
  `1/1 passed`.
- PowerShell-scoped release Playwright with `release=true`: `1/1 passed` and
  exercises the public `Build/Cesium/Cesium.js` selected by `cesiumPage`.
- Focused Test/E2E ESLint and Prettier pass.
- Direct Globe smoke: ready/HDR, errors `0`; quality clicks land visibly at
  `low`, `high`, `medium`. Retained Planar smoke: ready/HDR, deferred, errors
  `0`.
- No accepted Spec/build/type/docs/package/SGP matrix was rerun.

## Architecture correction closure — 2026-08-31

Architecture independently reviewed the amended direct pages, public-only
lifecycle state, owner-paced quality action and focused E2E. `A8-AR-002` is
closed because the same spec now uses the existing `cesiumPage` fixture after
the direct-page smoke; the release invocation therefore loads
`Build/Cesium/Cesium.js` and exercises one public offline Globe controller
lifecycle. Architecture independently reran that PowerShell-scoped release E2E
with retries disabled: `1/1 passed`.

`A8-AR-003` is closed because the release page contains no `_pipeline`,
`_resources`, `_ownsGlobeDepthTestLifecycle`, temporary framebuffer or
`readPixels` dependency. Accepted focused Specs and the upgrade checklist remain
the finite/storage/resource authorities. `A8-AR-004` is closed because each
quality action click advances exactly one visible tier and leaves it active for
owner inspection; no frame loop or settling mechanism remains.

Together with the already closed compile-time-only `A8-AR-001`, A8-G has no open
code or delivery finding. The existing POSIX release npm wrapper remains an
upstream cross-platform maintenance residual; the equivalent Windows release
invocation is documented and has passed. A8-G now waits only for the project
owner's six-state Globe visual gate. No Planar product qualification is opened.

### A8-AR-005 — native Viewer controls restored

The project owner requested Cesium's native layer picker and timeline on the
direct Globe page and removal of the duplicate `lil-gui` surface selector. The
correction enables the public `Viewer` default `BaseLayerPicker` and `Timeline`
using Cesium's unmodified default imagery and terrain factory results, and
removes the custom `surfaceMode` mutation path. No provider or category is
created by SceneGIS; the built-in Natural Earth II and WGS84 Ellipsoid entries
are only selected initially to keep startup offline. The fixed observation day
is shown through the public timeline range. Minimal layout rules keep the
native picker above the effect GUI and reserve the timeline edge.

Architecture reviewed the source and the amended existing E2E. The E2E passes
`1/1`, finds both native widgets visible, finds no “Globe 表面” controller or
`SceneGIS` provider category, and retains the accepted Globe/Planar lifecycle
checks. `A8-AR-005` is closed. Product, Planar, API, resource, upstream,
generated and SGP deltas are zero; the project-owner visual gate remains
pending.

### A8-AR-006 — rapid-view terrain depth bands

Severity: high. Status: fixed, awaiting project-owner visual recheck.

The supplied fast-view reproduction affected both Globe aerial perspective and
exponential height fog, confirming a shared depth/integration defect. Runtime
inspection captured an immediate post-change frame with an empty current
frustum list and the prior depth texture still bound. A later isolated frame
showed DEM LOD height blocks amplified by both atmosphere integrations; the
same view with those effects disabled did not contain the broad bands.

The correction has two bounded parts. First, the pipeline exposes whether the
current frame produced any frustum commands and all Globe depth consumers use
clear-depth semantics when it did not. Second, finite terrain atmosphere
integration preserves exact near depth but smoothly removes far-field DEM LOD
height from the endpoint by converging on the local Bruneton bottom sphere.
Exact depth remains unchanged for cloud visibility/occlusion and Planar retains
its prior reconstruction.

Evidence is minimal and direct: the amended existing actual-GPU fixture passes
`1/1`, including near, far-LOD, high-camera and no-current-frustum cases; the
existing full clear-depth Globe fog production-stack fixture passes `1/1`.
After rebuilding the direct page, one fixed rapid ground-to-near-space
observation showed no broad bands with aerial-only and no broad bands with
fog-only. No wait/retry/settling behavior, resource, API, upstream-owned,
generated, SGP or Planar delta was introduced.

### A8-AR-007 — camera-dependent blocky Globe cloud shadows

Severity: high. Status: fixed, awaiting project-owner visual recheck.

The cloud-shadow producer previously fitted independent light-space width and
height values to the current view-frustum slice. Camera rotation therefore
changed both the atlas projection scale and `u_sceneGISShadowFootprint`, causing
the sampled cloud field itself to rearrange. This was a projection defect; an
atlas-resolution increase or temporal smoothing would only conceal it.

Each practical cascade now uses the maximum corner distance from its slice
center, expanded by the fixed `1.05` coverage margin, as one square half-size.
The center is projected and snapped on the resulting fixed Sun-space texel
lattice. The Beer receiver uses a deterministic `16`-tap Vogel disk of radius
two atlas texels, computes optical depth per tap, averages transmittance and
then converts back to optical depth. The raw BSM path used by shadow-length
integration remains single-sample and unfiltered.

The amended actual-GPU Beer filtering fixture passes `1/1`, including smooth
support beyond the former one-texel kernel and isolation from adjacent atlas
tiles. The amended existing lifecycle fixture passes `1/1` and proves all three
medium-tier cascade half-sizes are square and invariant across a fixed-position
`90°` heading change. A same-final-source browser observation measured the
unchanged half-sizes at approximately `29.05/50.22/155.54 km` and no longer
showed the former rectangular shadow lattice. The visible vertical color split
survived an explicit cloud-shadow disable and is not evidence against this
correction.

No program, command, texture, FBO, history, GPU-byte, public API, upstream-owned
file, generated output, SGP or Planar behavior changed. The deliberate hot-path
cost delta is `9 -> 16` atlas samples per selected cascade, with up to two
selected cascades only inside the existing overlap. Interactive performance and
final appearance remain project-owner judgments.

### A8-AR-008 — cloud body and shadow use different moving coordinates

Severity: high. Status: fixed, awaiting project-owner visual recheck.

The follow-up drag reproduction proved A8-AR-007 was necessary but incomplete:
it stabilized cascade size and filtering while the cloud material itself still
depended on the moving camera-footpoint ENU frame. The Beer-atlas light basis
also selected its right/up vectors from that local vertical. As the camera moved
over the ellipsoid, the atlas producer and visible cloud march therefore sampled
different moving approximations of what should have been one world-anchored
medium. The Globe occupancy hierarchy compounded the discrepancy by sampling
with Planar morphology scales instead of the accepted Globe density scales.

The audited reference confirms the required topology: reconstruct cloud samples
from world positions, build a world-space light view from a fixed axis, and use
that same world field in the receiver. The correction preserves the existing
local precision frame for ray intersection, but converts every resulting sample
to a stable spherical material position using its actual ECEF position, WGS84
geodetic normal and ellipsoid height. Primary density, occupancy, local Sun
transport and Beer-atlas production now share it. The light basis is fixed in
ECEF and transformed locally only for execution.

Minimal direct evidence passes: the amended lifecycle Spec holds the world light
basis across a `15°E -> 20°E` camera move; the amended integrated mid-latitude
actual-GPU Spec rejects the old camera-relative mapping; the actual Beer-atlas
producer Spec passes; and the combined Globe/frozen-Planar material Spec passes.
A single rebuilt-page drag showed no abrupt view-locked atlas rearrangement. No
new texture, FBO, pass, command, program, history, public API, upstream-owned
file, generated output, SGP or Planar behavior was introduced. Project-owner
interactive alignment remains the closing visual authority.

### A8-AR-009 — stacked Globe distance fade and dark cloud-haze strip

Severity: high. Status: fixed, awaiting project-owner visual recheck.

The first correction deliberately answers the project-owner's architecture
challenge: Globe does not retain the old `60-100 km` sample visibility beneath
the reference behavior. That visibility is now compiled only for Planar. Globe
applies the Cesium port's `11-51 km` entry-distance fade once to premultiplied
cloud radiance and opacity after integration.

The entry correction alone left the reported gray-black strip, so a real
rebuilt-bundle control disabled only cloud-local haze. The strip disappeared,
which excluded cloud-body density, entry fading and terrain depth. Comparison
with the original `three-geospatial@b012ad06` haze helper then identified the
domain error: its RGB is already integrated in-scatter, while the retained
Aerial composition multiplied it by opacity again and failed to apply the
Globe background/aerial source-domain coefficient used by the neighboring sky
transport.

The production composition is now the standard over operation with integrated
haze radiance scaled exactly once. The amended production-stack GPU fixture
passes and rejects deterministic double-weighted and unscaled mutations; it
also proves source-domain linearity. The existing integrated Globe cloud GPU
fixture passes the reference entry behavior. A single rebuilt direct page
retained haze with a continuous horizon and zero errors. No public API,
resource, upstream-owned file, generated output, SGP or Planar behavior changed.

### Owner-requested delivery addition — Cesium OSM Buildings

Status: implemented and directly verified.

The Globe sample now uses Cesium's public `createOsmBuildingsAsync` helper
behind one explicit button. The online dependency is not part of startup and no
credential is stored. Globe terrain remains visible below the building-only
tileset. A successful load selects Cesium's official New York observation and
owns only the added tileset. Removal, cancellation, stale completion and page
destruction restore or release the corresponding camera/status state.

The live online check reached `已加载 · Cesium OSM Buildings`, displayed the
New York building geometry and kept the error counter at zero. The remove
action restored the prior camera, observation and Globe surface. The focused
delivery E2E passes `1/1` against the existing development server; its network
block confirms that the unchanged offline startup does not contact ion. No
product, public API, resource, upstream-owned, generated, SGP or Planar change
is introduced.

### A8-AR-010 execution delivery

Status: implemented, awaiting independent Architecture and owner visual review.

Execution replaced the approximation boundary with deterministic direct use of
the pinned reference shape/detail/weather/turbulence/STBN payloads. Exact
provenance and MIT license accompany the five package files; Globe selects them
without co-residency, while Planar retains its existing generated assets. The
already installed Bruneton files are byte-identical to the same pinned source.

Source topology now matches the audited reference for layer overlap, density
profile, weather/shape/detail sampling, quality turbulence, local Sun detail,
Beer remainder and ground bounce. The final live check found and corrected a
dimensional double scale: reference layer density is normalized by its `0.2`
low-cloud baseline before SceneGIS applies the public per-meter extinction.
This keeps the API unit contract intact and restores visible default clouds.

The focused production GPU fixtures pass, the remaining 76 aggregate product
checks pass, and the only aggregate miss was a test tolerance for amplified
binary16 radiance (`0.0265` measured versus `0.025`). The exact fixture passes
after a bounded `0.03` tolerance. Installed delivery passes all `26/26` shader
and generated-module checks plus exact payload/provenance/license verification.
The rebuilt default Globe view is finite, visibly populated and reports zero
browser/render warnings or errors. Resource topology, public contract, Planar,
upstream paths and SGP scope are unchanged.

### A8-AR-011 — overlapping density and uniform-step flattening

Severity: high. Status: implemented, awaiting Architecture and owner visual
review.

The pinned material was being sampled by a non-reference integration topology.
First, the sum of independently bounded layer densities was clamped back to
`1`, erasing the additional extinction and optical-depth response of overlapping
low layers. Second, a uniform whole-segment schedule assigned the same sampling
effort to empty and occupied regions. Third, the integration step participated
in shape/detail LOD selection, so long horizon steps discarded authored
frequency even when the projected pixel footprint was smaller.

The correction is Globe-only. It keeps per-layer saturation but not a final
sum clamp, converts the existing quality budget into bounded progressive
sampling with conservative empty-interval advance, and selects material LOD
only from projected pixel footprint. Planar remains behind its unchanged
preprocessor branch. The tier table, public API and GPU resources do not change.

Focused actual-GPU fixtures directly reject a total-density clamp and a
deterministic long-step LOD mutation, demonstrate a progressive ray above the
old `64`-interval ceiling, and retain exact occupancy distance/transmittance
semantics. One exhaustive-path RGB value differs by a single binary16 ULP after
executing an additional known-zero sample, so only RGB uses a `0.0005` storage
tolerance; support, distance and transmittance stay exact. The initial aggregate
run was `75/76`, and the corrected failing fixture passes `1/1`. Direct Globe
inspection reports zero warnings/errors; owner-visible similarity and
interactive cost remain residual judgments.

### A8-AR-012 — retained scheduler/default calibration still erased reference material

Severity: high. Status: implemented, awaiting project-owner visual review.

The imported reference material and density algebra were correct in an isolated
medium, but the final Globe view still used fractional-resolution integration,
an adapted `256`-interval ceiling and the old low-extinction/high-background
defaults. Those retained decisions were visible as blocky, weak and nearly
uniform clouds. They did not match the supplied reference project.

Globe now uses full resolution for medium/high, the reference `500/200`
medium-high/low iteration bounds and explicit Globe defaults
`high / 0.3 / 0.005 / background 4`. Planar keeps its prior defaults,
fractional resolutions and scheduler. The obsolete Globe entry fade and
`100 km` visible-range cap are removed. Focused actual-GPU texture and bounded
sampling fixtures, constructor validation and installed-package verification
pass. The rebuilt page shows non-blocky cloud edges and visible thickness
shading. The final controller aggregate passes `76/76`; performance and final
appearance remain owner judgments.

### A8-AR-013 — BSM producer/receiver geometry mismatch

Severity: critical. Status: implemented, awaiting project-owner rotation review.

The BSM producer traced the curved cloud shell, but both Globe receivers used a
flat tangent-plane distance-to-top reconstruction. At lateral distance or low
Sun this selected the wrong position along the atlas ray; because the local
frame follows the camera surface anchor, the error appeared as a large shadow
translation during view rotation. The receiver also ignored the producer's
bounded tail field.

Both filtered and raw Globe receivers now solve the producer's top-sphere
intersection and consume `maximumOD + tail`. The existing fixed ECEF light
basis, square stable cascade extent and Beer-space overlap are retained. The
actual-GPU fixture matches an independent CPU sphere equation and rejects the
planar result while retaining PCF tile isolation. The lifecycle fixture passes
low/medium/high allocation and fixed-basis checks. A final owner drag test is
still required; no acceptance is inferred from numerical evidence.

### A8-AR-014 — reference layer, filtering and world-shadow parity

Severity: critical. Status: owner-rejected; superseded by `A8-AR-015`.

The final three reported symptoms had independent causes. Globe retained a
`1500 m` low-cloud base instead of the reference `750 / 1000 m` overlapping
layers; orbital weather sampling forced `LOD 0`; and exact-stationary Globe
frames neither advanced STBN nor reused temporal history. Separately, the BSM
atlas orientation was ECEF-stable but its texel phase still derived from the
camera-local surface origin, so rotation and camera relocation moved the
world-space shadow lattice.

The correction matches the reference layer altitudes, uses footprint-selected
weather mips, advances Globe STBN per rendered frame and reuses the existing A6
history at `0.9`. The BSM producer adopts the reference structured-volume
sample construction and snaps square cascades in global ECEF light-plane
coordinates. Focused fixtures prove global integer-texel centers before and
after camera motion, moving stationary history, a nonzero real-texture delta
against forced `LOD 0`, and successful compiled BSM execution.

No BSM temporal resource was imported. Texture/request counts remain fixed;
weather mips add `349,525` bytes and make the exact six-texture Globe total
`7,364,997`. Planar and upstream paths are unchanged. Interactive shadow
blockiness, high-altitude shimmer and the final cloud silhouette remain owner
judgments. Final automated results are controller `77/77`, private pipeline
`7/7`, and installed delivery `26/26` for both GLSL and generated shader
modules. Fixed ground and cloud-above observations completed with zero browser
or render errors; no visual acceptance is inferred.

### A8-AR-015 — material-domain mismatch and moving shadow authority

Severity: critical. Status: assigned to Execution.

The owner observed only the lower cloud altitude from `A8-AR-014`; morphology,
thickness-dependent transport and terrain-locked shadows remained incorrect.
Architecture's direct source comparison invalidates the earlier conclusion that
asset import, STBN advance and global texel phase were sufficient.

For the reference defaults, low-layer density contributes with coefficient
`0.2`. SceneGIS first normalizes that coefficient to `1` and then applies
`cloudDensity=0.005`, making the default material extinction forty times weaker
before lighting. The detail mip gate, secondary Sun/ground step schedule and
Bruneton sample position also remain adaptations rather than source parity.
Because reference absorption is zero by default, scalar Beer integration can
still be algebraically correct; a struct-only rewrite would not address these
confirmed differences.

For shadows, the fixed ECEF light axes and texel phase sit on top of a still
camera-dependent mapping: Euclidean cascade selection, camera-footpoint local
shell intersections and a matrix that encodes only atlas x/y. The reference
selects by view-space depth and uses paired full world light matrices and their
inverses. Its temporal shadow pass stabilizes an already-correct world mapping;
it is not a substitute for one.

Closure requires exact production/reference material probes and a cross-frame
fixed-ECEF receiver invariant that fails deterministic restorations of the
current approximations. Only then may bounded BSM temporal history be added and
audited. Owner visual review remains blocked until Architecture closes both
code paths; existing proxy statistics and zero browser errors are insufficient.

### A8-AR-015 Execution review target — 2026-09-01

The candidate now uses the authored `0.2` low-layer coefficient with public
Globe `cloudDensity=1.0`, exact material mip/jitter gating, reference secondary
Sun/ground schedules and actual spherical ECEF incident positions. The same
helper is compiled into visible-cloud and BSM producers. The former normalized
coefficient and custom Sun schedule fail the amended production GPU fixture.

BSM cascades now publish invertible forward/inverse ECEF matrices. Producers
reconstruct their ECEF ray from the inverse; cloud and terrain receivers project
the same spherical ECEF point and select by view depth. The existing BSM GPU
fixture holds one receiver while rotating/orbiting the camera and rejects
Euclidean selection, local-shell and two-dimensional matrix mutations. No
temporal BSM allocation was necessary. Controller `77/77`, A1 `7/7` and
installed delivery `26/26` pass. The one fixed reference-Basic observation is
ready/HDR with errors `0`; visual acceptance is not inferred.

### A8-AR-016 — reference material LOD and cloud source still diverge

Severity: critical. Status: assigned to Execution; owner gate blocked.

`A8-AR-015` correctly restores the authored material coefficient domain, but
the production march still initializes the material footprint as
`1 + distance * 1e-5`. The local reference measures the cloud-entry projected
weather footprint before the divergent loop and carries that footprint through
the ray. The current formula therefore does not prove reference mip selection
and can still discard or churn shape/detail at high altitude.

The lighting path also remains in the former SceneGIS calibration domain. It
uses solar transmittance, divides sky irradiance by solar irradiance, estimates
ground irradiance from coverage and finally applies `cloudRadianceScale=48`.
The reference instead supplies physical Sun/sky and ground irradiance at their
actual spherical positions and applies scattering before Beer integration. The
fixed browser comparison exposes the consequence: white, weakly shaded cloud
bodies rather than the reference's thickness-dependent gray bases. Closure
requires equation-level GPU parity, not another visual coefficient search.

### A8-AR-017 — shadow spatial mapping lacks reference temporal closure

Severity: critical. Status: assigned to Execution; owner gate blocked.

The full ECEF matrices are a necessary spatial repair, but the reference also
renders depth/velocity and temporally resolves each cascade using reprojected
history, closest depth and variance clipping. SceneGIS still publishes a
single noisy Beer atlas. The existing test's small camera motion and broad
`0.15` OD tolerance cannot close the owner's large rotation failure.

The receiver additionally blends the selected cascade into the next cascade
over the final 5% of the first interval even though the declared cascade
intervals do not overlap. That makes receiver selection depend on data rendered
for a different depth range and is not the reference's single-cascade rule.
Closure requires the audited temporal lifecycle, a truthful substantial-motion
fixed-ECEF fixture and either one selected cascade or real producer/receiver
overlap. No owner review is permitted before both `A8-AR-016` and
`A8-AR-017` close.

## Execution review candidate — A8-AR-016/017

Status: `review_ready`; Architecture closure and owner judgment remain pending.

The candidate implements reference footprint propagation and physical A2
cloud/ground irradiance without changing the accepted material density or
assets. The Globe default `cloudRadianceScale` is now `1`; Planar remains `48`.
GPU authority compares the compiled helper against independent footprint and
irradiance equations and rejects the former distance-only and normalized-source
mutations.

The BSM candidate publishes current Beer and front-depth/velocity, resolves
into two ping-pong histories with closest-depth reprojection and bounded 3x3
variance clipping, and exposes the resolved atlas to the unchanged Beer-space
surface PCF. It removes the non-overlap cascade blend. The amended GPU fixture
proves second publication, non-temporal mutation rejection, bounded motion and
camera-cut invalidation; the cascade fixture proves one selected cascade.

Validation: focused affected GPU fixtures pass; controller `77/77`; A1 `7/7`;
installed delivery `26/26`. Current-diff ownership adds no upstream path, no
generated file and no SGP. Across the retained A8 candidate, the only
upstream-owned path remains the registered SGP-0009
`GlobeSurfaceShaderSet.js` seam. The navigation page is not part of this
delivery and was not edited by this correction.

### A8-AR-018 — footprint fixture validates a new constant against itself

Severity: high. Status: assigned to Execution; owner gate blocked.

The physical irradiance and scene-domain mapping portions of `A8-AR-016` are
accepted for retention. Its LOD closure is not. The candidate uses `0.35`,
while the local reference uses `0.25` when temporal upscale is active and `1`
otherwise. The matched Basic story uses the temporal path. The fixture embeds
the product's `0.35` in its expected shader and calls only the helper, so it
cannot detect the wrong reference mode or missing production wiring.

Closure requires an equation-derived reference-mode scale and a compiled
`CloudFS`/march witness whose distance-only mutation fails at high altitude.

### A8-AR-019 — BSM temporal path still fails fast-rotation authority

Severity: critical. Status: assigned to Execution; owner gate blocked.

The candidate allocates and executes the declared temporal resources, but the
producer continues to fetch STBN slice `0`. The reference advances the slice by
frame specifically so temporal history integrates different spatial samples.
The current implementation therefore cannot resolve the blockiness that
motivated the temporal pass.

History is also globally rejected when camera direction/up exceeds the A6
`0.984807753` dot threshold. This recreates a raw moving atlas during the
owner's fast rotation. Linear history lookup is not clamped within the packed
atlas tile, and hard cascade selection replaces the reference faded overlap
with a discontinuity. Material changes are absent from the BSM continuity
snapshot, so stale history may survive coverage/density/preset/layer changes.

The fixture does not close these risks: its OD comparison rotates only
`0.5 degree` and accepts `0.25`; the later orbit asserts only finite range. A
substantial fixed-ECEF invariant, temporal-jitter mutation, tile sentinel,
cascade-transition witness and material reset are required before owner review.

## Execution response — A8-AR-018/019

The product and amended existing fixtures now close the assigned source
contracts: exact reference temporal footprint `0.25` through compiled
`CloudFS`; frame-driven STBN; substantial-rotation ECEF history retention;
complete material/quality reset authority; per-tile half-texel history clamp;
and producer-covered cascade overlap blended in Beer-transmittance space.
Deterministic distance-only, fixed-slice, no-history, unclamped-tile and hard-
cascade mutations are rejected by the focused evidence.

Exact final results: focused reference/BSM/lifecycle fixtures passed;
`SceneGIS/Scene/SceneGISEnvironmentEffects` `77/77`; A1 private pipeline
`7/7`; installed-delivery verifier `26/26`. The fixed Basic observation was
ready/HDR with zero browser/render errors. One direct fast rotation produced no
persistent trail in the captured frame, but interactive shimmer/blockiness
remains an owner-visible judgment. This correction adds zero resources, API,
upstream paths, generated files or SGPs and leaves the existing A8 BSM budget
unchanged. No standalone navigation page was edited.

## A8-AR-020 through A8-AR-023 execution evidence — 2026-09-01

The compiled Globe cloud march now converts derivatives from the actual current
Cloud MRT raster to the reference quarter-rate current raster before applying
the reference temporal `0.25` mip scale. For resolved dimensions `R` and actual
current dimensions `C`, the conversion is `C / ceil(R / 4)` per axis; the
reference coordinate remains `globeUv * 100 * R`. An independent CPU equation
and the real `CloudFS` path agree, while the distance-only mutation fails.

Globe shape and detail volumes are now base-level linear textures, matching the
audited reference topology. Weather and turbulence remain mipmapped, occupancy
retains its explicit conservative hierarchy, and Planar remains unchanged. The
focused actual-GPU witness rejects shape/detail LOD mutations in both the
visible Cloud MRT and the real BSM producer.

The BSM fixed-ECEF witness uses nonuniform density, a receiver reconstructed
from real producer coverage, substantial camera rotation/orbit and a real
cascade transition. Its OD tolerance is derived from the selected cascade
texel footprint, the bounded structured integration interval and binary16
quantization. Wrong-coordinate and shape/detail-LOD producer mutations fail.
The producer now uses the reference structured period
`clamp(maxRayDistance / iterations, 100, 1000)` and subtracts
`stepSize * jitter` from the structured entry; the former uniform/no-offset
mutation fails.

Exact focused results: reference fixture `1/1`, BSM fixture `1/1`, Globe shadow
lifecycle fixture `1/1`, controller `77/77`, and A1 private pipeline `7/7`.
Globe persistent CloudCore bytes are `7,060,723`, down `304,274` bytes from the
previous mipmapped-shape/detail candidate; texture, pass, command, program,
FBO, attachment and history counts are unchanged. This correction changes no
upstream-owned or generated path and adds no SGP. The retained candidate still
has only the registered SGP-0009 upstream seam; SGP-0008 remains consume-only.

The same-final-source Basic page reached
`ready · HDR · high · terrain depth owned` with browser/render errors `0`.
After one direct fast drag rotation, the captured frame showed no persistent
screen-space cloud-shadow trail. Shadow softness and any residual block
structure remain project-owner visual judgments; this observation does not
request or infer an owner gate.

## Execution response — A8-AR-024 through A8-AR-028

The product separates local ENU Sun direction from ECEF Sun direction through
the real `CloudFS`/march/lighting call chain. Phase and local Sun integration
remain local; atmosphere incident, ground source and BSM remain ECEF. Receiver
filtering now derives local solar elevation from the receiver normal. The
reference footprint calculation preserves odd-size `4 * ceil(R / 4)` raster
semantics without changing framebuffer topology.

The existing actual-GPU fixtures now include high/low-Sun full `CloudFS`
wiring, two receiver normals under one ECEF Sun, real producer and resolved BSM
textures, real camera depth across a cascade transition, substantial bounded
rotation/orbit, nonuniform history texels and deterministic wrong-coordinate,
same-UV, cascade and LOD mutations. The OD tolerance contains no arbitrary
metre bias and is derived from the selected texel footprint, structured step
and binary16 quantization.

Exact results: reference core `1/1`, Beer receiver `1/1`, BSM integration
`1/1`, Globe shadow lifecycle `1/1`, controller `77/77`, and A1 `7/7`. One
pre-existing controller assertion was narrowed from module-prototype identity
to the `generateMipmap`/`destroy` capabilities it actually spies; its isolated
and aggregate executions pass.

Resource, API, upstream-owned, generated and SGP deltas are zero. The retained
SGP-0009 path count remains three and SGP-0008 remains consume-only. The fixed
page was ready/HDR with zero errors. Ground, one direct rotation and cloud-top
were inspected at coverage `0.4`, density `0.5`, cloud radiance `2` and the
other assigned values; no persistent captured trail appeared. Soft ground
shadows and a bright cloud-top deck remain owner-visible risks. No owner gate
is requested or inferred.

## Execution response — A8-AR-029

The producer/receiver mismatch is removed without reopening accepted cloud
lighting. Mixed visual cirrus no longer contributes BSM density or expands its
support; the renderer publishes the exact low-layer top instead of
`base + thickness`, and cirrus-only disables the frame-local shadow/ray
coupling. The existing actual-GPU BSM fixture now samples one visible fixed
ECEF ground receiver before and after bounded pitch/orbit motion from the raw
current atlas, resolved atlas and production Globe surface helper. The product
remains bounded, while mutations restoring all visual casters and the former
receiver top fail; all four preset support values and cirrus zero output are
covered.

The exact owner gesture was reproduced before the correction and repeated once
on the same final-source high/mixed page. Runtime remained ready/HDR with zero
errors; no persistent world-space translation was visible in the retained
frame, although the very soft broad shadow field still limits visual landmark
precision. Owner visual acceptance is not inferred. No resource, API,
upstream-owned, generated, SGP, Planar or navigation-page delta was introduced.

### A8-AR-029 owner-witness correction — 2026-09-01

The preceding visual statement is withdrawn. The owner's two saved cameras
intersect the WGS84 ellipsoid at the same terrain target within a few metres,
while the annotated captures show the same two shadow bodies translating to
different terrain landmarks. The direct GPU fixture isolated the remaining
cause to cascade scale: deriving radius from geodetically mapped frustum corners
changed cascade zero from `34911.980651 m` to `34895.930725 m` across the exact
gesture. Texel-center snapping cannot stabilize a grid whose texel size changes.

The renderer now derives each cascade radius analytically from its projection
and producer split before pose-dependent Globe mapping. The mapped corners still
select the cascade center and the existing light-space texel snapping remains.
The exact owner cameras now publish `34913.065606 m` for both views and preserve
the fixed receiver's two-dimensional world-texel phase. A deterministic
mapped-corner-radius mutation changes that phase and fails the amended existing
GPU fixture. No post-edit browser claim is made against the old cloud bodies:
refreshing changes the stochastic cloud witness, as the owner explicitly noted.
Resource, API, upstream, generated, SGP and Planar deltas remain zero.

Final scoped execution: the amended BSM GPU fixture passed `1/1`, the exact
`SceneGISEnvironmentEffects` aggregate passed `76/76`, and the A1 private
pipeline passed `7/7`. Focused ESLint, Prettier and four-record Markdownlint
passed. `git diff --check` passed with retained line-ending warnings only.

### Execution response — A8-AR-032

The first-divergence probe confirms that the stable-grid producer is no longer
camera-dependent: three fixed ECEF texels and their raw receiver values are
identical across the saved A/B cameras. The remaining change occurred in
history resolve. Camera-only motion produced an integer atlas shift but its
normalized half-float encoding lost a sub-texel fraction, and the former
mean-plus-or-minus-standard-deviation clamp could alter history even when it
equaled the current texel.

The producer now encodes texel displacement directly and rounds it only when
cloud offset is unchanged. Resolve clips to the finite current `3x3` min/max
range before the retained temporal blend. Continuous cloud advection remains
fractional. The amended existing actual-GPU BSM fixture passes `1/1`, including
fixed-position density, raw/resolved/surface A/B authority, producer coverage
and deterministic mapped-radius/camera-inverse mutation rejection. Resource,
API, upstream-owned, generated, SGP and Planar deltas are zero.

The single same-final-source browser gesture used the exact saved cameras on
one newly loaded stochastic scene. It stayed `ready · HDR` with zero errors and
showed no abrupt whole-field shadow translation. No attempt was made to find
the old annotated clouds; the low-detail Natural Earth background leaves fine
visual landmark acceptance with the project owner.

### Execution response — A8-AR-033

The A8-AR-032 integer texel correction is now fail-closed with respect to grid
scale. The existing shadow snapshot stores the previous atlas resolution and
three cascade half-sizes. Producer displacement rounds only when that state is
exactly compatible and cloud material is stationary; otherwise the accepted
continuous history path retains its fractional displacement.

The existing production GPU fixture keeps the owner's equal-scale A/B gesture,
asserts integer displacement with live history, and adds one in-continuity
`10%` FOV transition. The latter keeps history, reports incompatible scale and
publishes fractional displacement; a compiled unconditional-round mutation
publishes integers and fails the comparison. The fixture passes `1/1`. No
resource, public API, upstream-owned, generated, SGP or Planar delta is added.

### Execution response — A8-AR-034

The producer uniform and renderer predicate are renamed to
`GridLatticeCompatible`. Exact atlas resolution and cascade half-sizes are
necessary but not sufficient: the predicate also requires exact equality of
the retained ECEF Sun direction, which deterministically produces the same
light-space right/up/ray basis. Rounding still additionally requires stationary
cloud material.

The existing actual-GPU fixture retains the owner A/B and FOV witnesses and
adds one fixed `30 s` Sun transition. Its Sun dot remains above `0.99999`,
history remains valid, cascade scale remains exact, lattice compatibility is
false and product displacement is fractional. The compiled mutation that
ignores lattice orientation emits integer displacement and differs from the
product. The fixture passes `1/1`; resources, API, upstream, SGP and Planar are
unchanged.

## Architecture closure — 2026-09-02

Architecture approves the final candidate. The source, GPU fixtures, lifecycle,
release/package evidence and ownership audit close every finding through
`A8-AR-034`. The sole upstream-owned changed path remains
`packages/engine/Source/Scene/GlobeSurfaceShaderSet.js`, fully contained in the
existing paired `SGP-0009` structural-cast hunk; A8 adds no upstream path or SGP.
Tracked generated-source delta is zero.

The project owner explicitly passed the fixed-time interactive Globe
cloud-shadow result on 2026-09-02. Camera pitch changes retain the shadow field
on the same terrain rather than producing the rejected view-dependent drift.
The manual gate is therefore closed. The phase-closing local commit is the A8-G
checkpoint; it is not pushed and contains no successor-phase work.
