# Phase Plan: A5-G Globe Cloud Shadows, Skylight, and Crepuscular Rays

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture and owner visual gates passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-27-phase-a4g-globe-integrated-cloud-core.md](2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-28`
- Updated: `2026-08-28`
- Branch: `feature/atmosphere-clouds-effects`
- Predecessor checkpoint: A4-G=`241de41fc36835114a4e9312ad53ca2ac64407b8`
- Architecture decision:
  [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md)
- Source discovery:
  [A5-G shadow/skylight/rays source discovery](../discussions/2026-08-28-a5g-shadow-skylight-rays-source-discovery.md)
- Owner corrections:
  [A5-G owner visual corrections](../discussions/2026-08-28-a5g-owner-visual-corrections.md)
- Upstream patches: active `SGP-0008` (`consume only`), active `SGP-0009`
- Open review findings: `none`
- Owner visual gate: `passed on corrected A5-AR-016 candidate`

## Goal

Add the first physically connected Globe lighting slice above A4-G: a bounded
Beer optical-depth atlas, direct cloud shadows on the Cesium Globe surface,
Bruneton Sun/sky irradiance for that approved surface consumer, and equivalent
cloud shadow length shared by atmosphere, clouds and directional height fog.

The result must remain in the existing SceneGIS HDR graph, preserve Cesium
lighting for Models/3D Tiles, and introduce no Planar behavior.

## Frozen predecessor

- A4-G density, reference coordinates, macro/LOD scales, preset/material assets,
  lighting transport, `cloudRadianceScale=48`, occupancy hierarchy, log-depth,
  resolve/history owner and accepted visual result are frozen except where the
  new shadow-length semantic must explicitly pass through the existing distance
  alpha.
- A2 LUTs, Sun authority and A3 composition order remain the only atmosphere/fog
  radiometric sources.
- `SGP-0008` render slots remain consume-only.
- Planar product shaders, calibration, controls, tests and owner gate are frozen.

## Deliverables

### 1. Public controller contract

Add `showCloudShadows=true` and `showCrepuscularRays=true` constructor options,
JSDoc and writable properties. Add the Globe-only renderer-domain calibration
`surfaceRadianceScale=10`, finite range `[0,64]`, with the same warm setter and
package-export pattern. Do not add `showSkylight`, an ambient floor or a hidden
calibration scalar.

Advanced Globe surface Sun+sky lighting is inherent while the controller is
enabled and ready. Cloud shadow/ray options only gate the cloud coupling;
`showClouds=false` makes both contributions identity. Controller-disabled output
and resource state remain exact Cesium identity.

### 2. Current-frame Beer shadow atlas

Implement a SceneGIS-owned cascade builder and renderer, preferably as a small
private owner plus shared Globe shader helpers rather than expanding the main
renderer monolith.

- one RGBA16F atlas/FBO/program, no depth or history;
- low 2×256, medium 3×512, high 3×768 in a 2×2 atlas;
- atlas bytes are exactly 2,097,152, 8,388,608 and 18,874,368 respectively;
- practical split lambda 0.5, maximum distance 200 km, Perspective and
  Orthographic frustum corners, local-ENU light bounds and texel snapping;
- 25/50/50 shadow steps through one maximum-50 program;
- at most one tile command per active cascade, issued before its same-frame
  consumers in the existing background slot;
- exact A4-G Globe density/material/time/preset/assets and geodetic-normal anchor;
- reference RGBA channel topology and Beer ground decode from ADR-0047.

Each cascade receiver uses one bounded 3×3 tent PCF. Reconstruct Beer
transmittance per tap, clamp taps to the selected tile half-texel interior,
average in transmittance space and convert back to bounded optical depth.
Cascade overlap also blends reconstructed transmittance. Do not average packed
channels or introduce temporal filtering.

Candidate creation/quality resize must be failure-atomic. Use public Cesium
Context abstractions only; no native `ShadowMap`, raw `_gl`, PBO, runtime fetch,
jitter or temporal BSM.

### 3. Minimal Globe surface seam (`SGP-0009`)

Create the SGP manifest entry and paired markers only in:

- `packages/engine/Source/Scene/GlobeSurfaceShaderSet.js`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
- `packages/engine/Source/Shaders/GlobeFS.glsl`

The renderer publishes an explicit active/inactive frame-local lighting record
during pipeline update, before Globe surface command construction, and marks it
active only after candidate resources are ready. Atlas commands execute later in
the advanced background slot; surface uniform callbacks then read that same
frame's completed atlas. ShaderSet adds variant bit `0x400000000` after the existing highest bit and
injects SceneGIS-owned Bruneton/surface helper source only for that variant.
TileProvider adds only uniform callbacks.
GlobeFS adds one mutually exclusive branch at the existing final lighting
selection. `GlobeVS.glsl` must remain unchanged.

Use terrain normals when the current mesh provides them and geodetic normals
otherwise. Evaluate
`surfaceRadianceScale * albedo / PI * (direct Sun * cloud T + sky irradiance)`
with the same A2 LUT/Sun authority and A4 local-ENU virtual-sphere mapping.
For Globe finite-geometry aerial composition, interpolate the renderer-domain
source scale from `aerialRadianceScale` at zero extinction to
`surfaceRadianceScale` at full extinction using
`1 - max(transmittance.rgb)`. This establishes the finite-to-clear asymptote
without a depth epsilon or screen-space horizon blend. Require native
`globe.enableLighting=false` before any A5 mutation. Do not relight resolved
color, Models or 3D Tiles and do not take ownership of `scene.light`.

### 4. Shadow-length transport and crepuscular coupling

During the existing low-resolution Cloud pass, march the BSM along every
relevant view segment and accumulate the ADR-0047 equivalent shadow length.
Reuse distance alpha with the exact half-float encoding:

```text
code = round(clamp(length / 200000, 0, 1) * 1023)
packed = valid ? 1 - code / 2048 : code / 2048
```

Decode each sample before existing spatial/temporal selection, filter validity
and length semantically, then repack. Reuse the current cloud-history reset when
the encoding mode or BSM authority changes. Do not add a third MRT or new history.

Feed decoded length to Globe finite-geometry/cloud/clear-sky Bruneton
`GetSkyRadianceToPoint`. Apply it only to A3 fog directional Sun inscatter;
ambient/sky fog remains. Length zero must preserve the accepted A4-G visible
composite and exact old alpha `0/1` encoding.

### 5. Direct Test and records

Extend `Test/高级环境.html` with Globe-only shadow and rays toggles plus a small
fixed capture set. One explicit owner state gets one same-frame capture. Report
the existing finite/storage summaries and show final screenshots; do not add
hashes, replays, convergence loops or cross-world matrices.

Add a visible Globe-only surface selector. Default to checked-in Natural Earth
II imagery with ellipsoid terrain; offer optional Cesium World Imagery + World
Terrain through the official async providers, and retain the solid-color
diagnostic mode. Online failure keeps the last-good selection, reports one
visible error and performs no retry. Add a dedicated low-Sun camera derived from
the live local Sun direction, below the cloud base, with visible solar elevation
and `dot(view, sun)`. Its Globe-only owner preset uses the existing public fog
controls `0.6/4`; controller defaults and Planar remain unchanged.

Update this plan, the extension index and an A5-G review record with actual
implementation deviations, resource counts, upstream-owned paths/SGP and
focused validation results.

## Expected SceneGIS-owned paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- optional new private cascade owner under the same `_private/` directory
- new/shared shaders under
  `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/`
- existing Cloud/Aerial/Fog/Bruneton shaders only where shadow transport enters
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/高级环境.html`
- `scripts/scenegis/verify-planar-packages.mjs` for public default/package shape
- current A5-G AgentDocs and ADR execution writeback

Generated shader modules and package barrels must be produced by the repository
generator and must not be hand-edited.

## Minimal sufficient validation

Run only these bounded checks unless implementation evidence exposes a concrete
failure outside them:

1. focused public contract, disabled identity, conflict and lifecycle Specs;
2. one actual-GPU BSM fixture for known optical depth, 3×3 sub-texel smoothing,
   tile isolation and cascade overlap continuity;
3. one packed-alpha/crepuscular fixture for exact round-trip, zero identity and
   directional-only attenuation;
4. one focused Globe surface program fixture for variant off/on, normal path,
   `surfaceRadianceScale` linearity and the near/far aerial scale endpoints;
5. existing `SceneGISEnvironmentEffects` controller and A1 private pipeline;
6. focused upstream Globe surface Specs affected by `SGP-0009`;
7. installed/package verifier, changed-scope lint/format/Markdown/patch audit and
   `git diff --check`;
8. a small Globe browser set: high-Sun ground/oblique shadow off/on, true sunset
   and civil twilight ground, one live-Sun-aligned rays off/on, one downward
   finite/clear profile, offline imagery default and no-moon night.

Do not run the full repository, Scene aggregate, unrelated generator/type/build
matrices, Planar qualification or synthetic hash/replay gates by default.

## Acceptance

- Surface cloud shadows follow the same A4 cloud deck, remain continuous across
  texel/cascade boundaries and do not suppress sky irradiance or show visible
  square mosaic at the medium default.
- Globe ground/terrain receives coherent A2 Sun+sky lighting with native Globe
  lighting conflict rejected before mutation; true sunset and civil twilight
  retain finite positive sky-lit surface radiance while no-moon night may be
  black.
- Downward/horizon views have no renderer-domain finite-to-clear aerial layer
  line at the default scales.
- Low-Sun atmosphere/cloud/fog shows physical shaft separation when enabled and
  returns to length-zero identity when disabled; the evidence camera is derived
  from the actual Sun rather than a legacy cloud-phase camera.
- The Test page defaults to an offline Cesium imagery surface and visibly offers
  optional official online imagery/terrain plus the solid diagnostic mode.
- No radial blur, generic scene relighting, third MRT, second history, raw WebGL
  path or Planar behavior is introduced. The fixed-reference cloud-local haze
  source required by A5-AR-012 is part of the existing cloud/Aerial composite,
  not a second generic height-fog subsystem.
- All resources meet the fixed budget and destroy/resize/request-render semantics.
- Architecture review and project-owner Globe visual gate pass before the A5-G
  checkpoint or any A6-G activation.

## Handoff

Execution implements only this converged boundary, records deviations before
expanding scope, and returns `review_ready` without committing, pushing,
requesting the owner gate or entering A6-G. Architecture performs independent
review and creates the phase checkpoint after technical and owner acceptance.

## Execution result — 2026-08-28

The implementation is review-ready within the planned boundary:

- one current-frame RGBA16F Beer atlas is published failure-atomically before
  Globe surface consumers; low/medium/high allocate exactly 2,097,152,
  2,097,152 and 8,388,608 bytes and issue at most 2/3/3 tile commands;
- practical lambda-0.5 splits, the 200 km far cap, Perspective/Orthographic
  frustum corners, local ENU bounds and texel snapping share the accepted A4-G
  density, preset, time, assets and geodetic anchor;
- `SGP-0009` is active only in `GlobeSurfaceShaderSet.js`,
  `GlobeSurfaceTileProvider.js` and `GlobeFS.glsl`; the frame record, uniform
  callbacks and one mutually exclusive final-lighting branch are explicit;
- the distance alpha carries semantic validity plus a 10-bit shadow length;
  resolve/history decode, select and repack instead of averaging packed bits;
- decoded length affects Bruneton point transport and only directional A3 fog
  Sun inscatter. Zero length preserves the A4-G composition.

Three bounded adaptations were required. The controller computes the fixed-frame
Sun direction with Cesium's ICRF-to-fixed chain because the uniform-state cache
is not populated during controller update. Cascade receivers use a deterministic
5% overlap blend. The terrain-normal variant asks the existing Globe vertex
shader to generate its normal varying; `GlobeVS.glsl` remains unmodified.

Exact focused results: packed-alpha GPU 1/1, Beer overlap GPU 1/1, controlled
atlas GPU 1/1, Globe surface variant GPU 1/1, controller 71/71, A1 pipeline 7/7,
`GlobeSurfaceTileProvider` 57/57, CloudCore generator 10/10 and installed
delivery/provenance 23/23. Browser evidence completed all eight fixed Globe
states with zero console/render errors. Final lint, format, Markdown, SGP and
diff checks are recorded in the review.

## Architecture correction boundary — 2026-08-28

Independent review requests exactly three repairs:

1. make BSM front depth cloud-entry-relative and normalized for `RGBA16F`, then
   prove the actual atlas producer attenuates the ground receiver;
2. carry bounded shadow length through clear/invalid cloud pixels and prove it
   attenuates only directional atmosphere/fog Sun;
3. compute the SceneGIS no-terrain fallback from the WGS84 geodetic normal and
   prove one mid-latitude numeric case.

Keep the accepted public API, atlas/resource budget, three-path `SGP-0009`
seam, Planar freeze and A4-G transport unchanged. Do not add another MRT,
history, pass, retry, hash/replay gate or broad validation matrix. Execution
returns `review_ready` without requesting the owner gate, committing, pushing
or entering A6-G.

## Correction execution result — 2026-08-28

- `A5-AR-001`: producer front depth is segment-entry-relative and stored as a
  normalized `[0,1]` value; receiver decode multiplies by the fixed 200 km bound.
  The real atlas producer-to-consumer GPU fixture found positive optical depth
  and asserted `cloudTransmittance < 1`.
- `A5-AR-002`: a bounded per-coarse-interval BSM march is independent of primary
  density, occupancy and cloud validity. Spatial/history length uses its own
  weights, invalid-cloud positive length is retained, and aerial no longer
  clears length on invalid cloud. Clear-sky atmosphere applies the shadowed
  minus unshadowed directional delta, while fog continues to attenuate only its
  directional Sun source. The focused GPU fixture preserved invalid validity,
  decoded 100 km and left ambient/sky unchanged while reducing directional Sun.
- `A5-AR-003`: the no-terrain branch calls one SceneGIS-owned helper using
  `1 / czm_ellipsoidRadii²`. The 15°E/45°N GPU probe matched the WGS84 normal and
  rejected geocentric normalization.

The three correction fixtures and the existing packed round-trip, Beer overlap
and compiled Globe surface variant fixtures each passed 1/1. No resource,
public API, upstream-path, Planar or phase-boundary delta was introduced.

## A5-AR-002 final correction result — 2026-08-28

The clear-depth Globe branch now evaluates A3 fog twice from one identical base:
once with decoded shadow length and once with zero length, then adds only their
difference. This preserves the already-rendered clear-sky fog and cancels every
shared ambient/base term instead of applying fog a second time.

The replacement actual-GPU fixture starts with packed invalid-cloud plus 100 km
length and executes the real production Bruneton/CloudShadow/HeightFog sources.
With directional scale nonzero the shadowed result is lower; with directional
scale zero the ambient-only outputs are exact equal. The fixture and the prior
packed round-trip each passed 1/1. All frozen boundaries remain unchanged.

## Architecture correction re-review — 2026-08-28

`A5-AR-001` and `A5-AR-003` are closed. Relative normalized atlas depth and the
WGS84 fallback normal are present in the actual consumer paths, and their
focused GPU fixtures passed independently.

`A5-AR-002` remains open only for clear-sky A3 fog. The current clear-depth path
applies the Bruneton radiance delta but skips the height-fog function, leaving
the background pass's zero-length directional fog unchanged. Execution must add
the shadowed-minus-unshadowed clear-depth fog delta and replace the helper-only
probe with one direct actual height-fog/Aerial GPU assertion. Keep all other
code, resources, Planar behavior and validation frozen.

## Architecture final correction review — 2026-08-28

`A5-AR-002` is closed after independent source review and 1/1 passes for the
replacement actual height-fog fixture and packed-length identity fixture. The
clear-depth delta changes only directional fog, preserves ambient and zero-length
identity, and does not reapply the already-rendered background fog.

All A5-G technical findings are closed. The resource/API/SGP/Planar boundaries
remain unchanged and the upstream audit passes. A5-G now waits only for the
project-owner Globe visual gate; checkpoint, commit/push and A6-G remain
blocked until that judgment.

## Project-owner visual rejection and correction boundary — 2026-08-28

The owner gate failed with five visible defects, now tracked as `A5-AR-004`
through `A5-AR-008`. Architecture isolated them to single-tap low-resolution
BSM reconstruction, a missing Globe surface radiance calibration, mismatched
finite/clear far-path renderer domains, a low-Sun camera that does not look at
the Sun, and a Test Globe with no imagery/terrain authority.

The converged repair is the amended contract above: 3×3 transmittance-domain
tent PCF with `256/512/768` tiles; public Globe-only
`surfaceRadianceScale=10`; a transmittance-driven Globe aerial asymptote; one
live-Sun-aligned Globe rays preset using visible `0.6/4` fog controls; and an
offline-first Globe layer selector. No new pass, program, texture, FBO, history,
asset download, upstream path, Planar behavior or A6 work is authorized.

Execution runs only the direct fixtures and small visual set listed here,
records the changed atlas byte budget and public contract, and returns
`review_ready` without requesting the owner gate, committing or pushing. If a
downward layer line remains after this exact correction, Execution stops with a
single toggle-isolated finite/clear profile for Architecture; it must not add a
depth epsilon, fallback blend or retry.

## Owner-correction execution result — 2026-08-28

The exact A5-AR-004 through A5-AR-008 correction is implemented. Atlas bytes
are low `2,097,152`, medium `8,388,608`, high `18,874,368`; the existing single
atlas texture/FBO/program, cascade count, draw count, steps and history topology
are unchanged. The public delta is one warm Globe consumer scale,
`surfaceRadianceScale=10`, finite `[0,64]`.

Focused GPU results are 1/1 for Beer-space PCF tile isolation and 1/1 for
surface scale plus finite-aerial endpoints. The controller is 75/75, A1 is 7/7,
GlobeSurfaceTileProvider is 57/57, installed delivery passes, and the upstream
audit retains exactly the three `SGP-0009` delivery paths with generated status
zero.

Browser evidence proves the offline selector, the single online attempt,
finite/storage-safe raw output, high Sun `67.484068°`, aligned sunset
`2.175387°` with `dot(view, sun)=1`, and exact-zero no-moon raw cloud RGB. The
downward profile still has a `0.400905` maximum step, and the aligned rays
off/on displayed percentiles were identical. Execution stops at the documented
visual-risk boundary without another workaround. Owner re-gate, checkpoint,
commit/push and A6-G remain blocked.

## Architecture owner-correction re-review — 2026-08-28

Close and freeze `A5-AR-004`, `A5-AR-005` and `A5-AR-008`. Their two focused
GPU fixtures passed independently, and no further product or Test expansion is
authorized for them.

Complete only the following remaining work:

1. `A5-AR-006` is Test-only. Replace the 120 km/`-8°` sparse center-column
   display profile with one fixed 120 km/`-20°` controlled render. Copy final
   color and resolved depth in the same `postRender`, classify the real
   finite/clear transition using the existing depth authority, and report its
   immediate neighborhood. Keep the accepted Globe aerial shader unchanged.
2. `A5-AR-007` replaces the fog-only `exp(-L/200000)` mapping with the ADR-0047
   final-shadowed-segment optical-depth fraction. Use the existing Globe fog
   density integral; change directional Sun only and preserve zero-length and
   ambient identity. Replace the synthetic scalar proof with one focused
   zero/full/partial actual fog fixture.
3. In the fixed low-Sun aligned Test state use visible coverage `0.65` and time
   `0`; report the actual decoded resolved shadow-length distribution and one
   local near-Sun rays off/on difference. Do not search time/camera states or
   turn the observation into a screenshot/hash/percentile gate.

Run only the affected fixture(s), Test lint/format, changed documentation lint,
patch audit if an upstream path changes, and `git diff --check`. Do not rerun
the 75-spec controller aggregate or unrelated matrices. Return `review_ready`
without owner-gate request, checkpoint, commit/push, A6-G or Planar work.

## Bounded 006/007 execution — 2026-08-28

- `A5-AR-006`: product code remains frozen. Test now uses the required 120 km,
  `-20°` camera and copies final RGBA8 plus the exact Aerial depth authority in
  the same `postRender`. The immediate finite/clear pair is depth
  `0.876953125/1` with luminance `0.803154/0.818690`.
- `A5-AR-007`: Globe fog directional Sun now uses the final-shadowed-subsegment
  optical-depth fraction. Ambient, fog transmittance, Planar and zero-length
  identity are unchanged; the obsolete exponential helper is removed.
- The focused GPU fog fixture and directly affected packed-length fixture pass
  1/1. Fixed integrated evidence reports 3,666 rays-on nonzero lengths, median
  `391.007 m`, `p90=1173.021 m`, and a 17×17 near-Sun RGB delta of approximately
  `[-4.07e-5,-2.71e-5,-4.07e-5]`.
- No public/resource/SGP/upstream/generated delta is introduced by this bounded
  correction. Architecture review remains the next gate.

## Architecture bounded-correction re-review — 2026-08-28

`A5-AR-006` is closed. The corrected 120 km/`-20°` same-frame depth capture
shows the actual adjacent finite/clear luminance change is `0.015536`; no
product seam is demonstrated and no further work is authorized for this path.

`A5-AR-007` remains changes-requested because its owner-visible contract still
fails. The consumer-only repair is mathematically covered, but the resolved
lengths remain `195–1759 m` and the local RGB change is only about `4e-5`.
Fixed-reference source review locates the cause in the producer interval:

1. Compute a Globe-only shadow-view interval independently of
   `sceneGISCloudSegment`: begin at the camera/entry, end at the nearest finite
   scene distance, ellipsoid ground, or shadow-top sphere exit, and clamp to
   `SCENEGIS_CLOUD_SHADOW_MAX_LENGTH`.
2. Preserve the existing per-quality cost. Use exactly `primarySteps`
   midpoint intervals (`32/64/64`) over that shadow-view segment and one
   existing BSM optical-depth reconstruction per interval. Do not add a second
   sample loop, public quality control, pass, texture or history.
3. Keep cloud density, occupancy, radiance and front-distance integration on
   the existing cloud-support segment. A missing cloud-support intersection or
   invalid cloud color must not suppress the independent shadow-length march.
4. For A3 Globe fog, subtract the optical depth of the camera-near prefix
   `[s0,min(s0+L,s1)]` from total fog optical depth. This matches fixed-reference
   `approximateHaze`; ambient, fog transmittance, zero-length identity, Bruneton
   point transport and Planar remain unchanged.

Validation is intentionally limited to one actual-GPU producer fixture that
places BSM occlusion outside the cloud-support segment and rejects the old
clipped mutation, the amended zero/partial/full fog fixture, and one repeat of
the existing fixed low-Sun observation. Report the resulting length
distribution and visual/local difference; do not create a numeric visibility
gate, search another state, or rerun controller/package/full matrices.

## A5-AR-007 bounded producer execution — 2026-08-28

- Added one Globe-only shadow-view interval independent of cloud support,
  bounded by finite scene distance, ground, shadow-top exit and 200 km.
- Reused exactly `primarySteps` BSM midpoint samples once; the cloud-body
  density/occupancy/radiance march retains its accepted interval and cost.
- Changed only the A3 Globe directional fog placement to the camera-near
  optical-depth prefix. Ambient, fog transmittance, Bruneton point transport,
  Planar and zero-length identity are unchanged.
- The focused producer and prefix-fog actual-GPU fixtures each pass 1/1.
- The fixed low-Sun capture expands rays-on support to 197,878 pixels and a
  `1173.021/2737.048/16031.281/23069.404 m` p10/median/p90/max distribution,
  while rays-off remains zero. The near-Sun 17×17 displayed RGB delta is exact
  zero at 8-bit precision, so owner-visible shaft appearance remains unresolved
  for Architecture review.
- Public API, resources, pass/program/texture/FBO/history counts, GPU bytes,
  upstream scope, generated files and SGP state are unchanged.

## A5-AR-007 Test witness correction execution — 2026-08-28

- Preserved `trueSunset = 18:30Z` and added the distinct fixed rays state
  `crepuscularRays = 17:30Z` at 15°E/45°N.
- The existing live-Sun alignment reports elevation `11.647154°` and
  `dot(view,sun)=1.000000`; coverage/time/fog controls remain
  `0.65`/`0`/`0.6`/`4`.
- The A5 evidence sequence contains exactly one off/on pair for the new state
  and no longer derives the center 17×17 ROI difference authority.
- The one valid pair changes displayed p10/median/p90 from
  `0.420470/0.810409/0.888542` to `0.417130/0.809174/0.888542`. Rays-on resolves
  68,306 nonzero lengths, but direct inspection still shows only broad dimming
  and no distinct shaft. No second state or product correction was attempted.

## A5-AR-007 Architecture re-review assignment — 2026-08-28

The product correction and its producer/fog fixtures are accepted and frozen.
The residual is a Test witness problem: `2.175387°` true sunset yields active
but small broad attenuation, and the selected Sun-center ROI is unshadowed.

Execution completes only this Test/doc correction:

1. Preserve `trueSunset=2026-06-21T18:30:00Z` for twilight surface and color.
2. Add a distinct crepuscular-rays state at
   `2026-06-21T17:30:00Z`, 15°E/45°N, and align the camera to its live Sun.
3. Retain coverage `0.65`, cloud time `0`, and visible fog controls `0.6/4`.
4. Replace the center-ROI acceptance claim with one direct rays-off/on owner
   visual pair plus measured elevation and `dot(view,sun)`.
5. Run only focused ESLint/Prettier for the Test change. Do not change product
   GLSL, Specs, public API, resources or Planar, and do not add a parameter
   search, numeric visibility gate, replay/hash or expanded matrix.

Return `review_ready` without requesting the owner gate, committing, pushing or
starting A6-G.

## A5-AR-007 Architecture sampling correction assignment — 2026-08-28

The Test-only assignment above is complete, but its fixed `17:30Z` pair still
shows no distinct shaft. It has exposed a product sampling mismatch, so the
earlier product freeze is superseded.

Execution completes this bounded correction:

1. Preserve the existing 3×3 Beer-space PCF path for surface cloud shadows.
2. Add a raw single-tap BSM optical-depth reconstruction for shadow-length
   integration, preserving bounded decode and transmittance-domain cascade
   overlap.
3. Replace the shadow-length march's `primarySteps`-based uniform bins with a
   compile-time maximum of 384 progressive intervals: first interval `50 m`,
   multiply by `1.01`, clip the last interval to the segment end, and stop at
   the existing `200 km` bound.
4. Leave the cloud-body primary march at `32/64/64` and leave its density,
   occupancy, radiance and lighting equations unchanged.
5. Add one focused actual-GPU fixture comparing the production raw/progressive
   result with an independent CPU equation and rejecting the former filtered,
   64-bin mutation. Do not create a matrix of new tests.
6. Reuse exactly the existing fixed `17:30Z` off/on owner pair. If it still has
   no visible shaft, stop and report without another state or calibration.

Run only that focused GPU fixture plus focused lint/format/Markdown/diff checks.
Do not rerun controller, package or full matrices. Resources, API, packing,
resolve, Bruneton/A3 consumers, SGP-0009, Planar, owner gate, commit, push and
A6-G remain outside this assignment.

## A5-AR-007 raw/progressive BSM execution — 2026-08-28

- Preserved the accepted 3×3 Beer-PCF receiver and added one dedicated raw
  single-tap OD reconstruction for shadow-length integration.
- Preserved cascade selection and transmittance-domain overlap while replacing
  the 64-uniform length sampling with compile-time max 384, first interval
  50 m, geometric growth `1.01`, actual-length weighting and exact final clip.
- Left cloud-body 32/64/64 marching and every resource/API/Planar boundary
  unchanged.
- The sole actual-GPU fixture passes against an independent CPU equation and
  rejects the filtered 64-uniform mutation while retaining support-miss
  behavior.
- The same fixed 17:30Z pair still shows no distinct visible shaft. Rays-on
  resolves 68,288 nonzero lengths, but displayed median changes only from
  `0.810409` to `0.809174`; no alternate state or formula was attempted.

## A5-AR-009 full participating-medium assignment — 2026-08-28

`A5-AR-007` is closed. Freeze its raw/progressive producer and focused fixture.
The remaining defect is that clear-depth SceneGIS evaluates only the difference
between shadowed and unshadowed fog, whereas fixed-reference
`approximateHaze` always renders the complete medium and shadows only its
directional Sun source.

Execution completes this bounded correction:

1. In the Globe clear-depth Aerial path, replace the paired
   `shadowedFog - unshadowedFog` delta with exactly one full
   `sceneGISApplyExponentialHeightFog` call using the decoded length. Rays-off
   naturally supplies exact zero length.
2. Ensure the clear-depth early return does not bypass Globe height fog when it
   is enabled. Do not change Planar output.
3. In the Globe branch only, feed the directional fog source with the physical
   A2 `sunColor` rather than dividing it by maximum solar irradiance. Retain the
   existing public power-lobe exponent and directional scale; do not add a
   second phase, source multiplier or public property.
4. Preserve ambient/sky source, fog extinction, finite-geometry and cloud-body
   fog, Bruneton shadow-length transport, BSM producer/packing/resolve,
   resources, defaults and SGP-0009.
5. Update the one existing fixed `17:30Z` Test preset to the source reference
   values: density `3e-5`, height falloff `1e-3`, start `0`, maximum opacity
   `1`, and directional scale `0.9 / (0.9 + 0.5)`. Keep its time, camera,
   coverage, cloud time and one off/on pair unchanged.
6. Amend the existing focused actual-GPU fog fixture rather than adding a new
   test. It must prove full zero-length clear fog, positive-length
   directional-only reduction, ambient identity, physical Sun units, and
   rejection of the former delta-only/normalized-source mutation.

Run only the amended fog fixture, focused lint/format/Markdown, and
`git diff --check`. Do not rerun controller/package/full matrices, search
another state, add a visibility threshold, or modify Planar. If the unchanged
single pair still has no distinct shaft, stop and report. Owner gate,
checkpoint, commit/push and A6-G remain blocked.

## A5-AR-009 execution — 2026-08-28

- Replaced the Globe clear-depth fog delta with one full existing height-fog
  evaluation using decoded length; zero length is the lit baseline.
- Kept Globe height fog reachable when clouds are disabled and changed only the
  Globe directional source to physical A2 Sun RGB. Planar remains unchanged.
- Mapped the fixed Test owner state to `density=3e-5`, `falloff=1e-3`, start
  `0`, maximum opacity `1`, directional scale `0.642857`, exponent `4`.
- The amended production-stack actual-GPU fixture passes and rejects both old
  defects.
- The one fixed 17:30Z pair remains without a distinct shaft; displayed median
  changes from `0.810866` to `0.806791`. No second state or formula followed.

## A5-AR-010 Architecture reference-intensity assignment — 2026-08-28

A5-AR-009 is accepted and its product GLSL plus focused fixture are frozen.
The fixed reference audit identifies one omitted coefficient: its directional
haze source uses `sunIntensity = 20` in addition to scattering albedo
`0.9 / (0.9 + 0.5)`, while the current Test preset maps only the albedo.

Execution must make one Test-only correction:

1. In the existing `crepuscularRays` 17:30Z preset, set the existing public
   `heightFogDirectionalInscatteringScale` to `20 * 0.9 / 1.4` and expose the
   resulting value in the existing control. Do not change the public default or
   range.
2. Preserve the exact time, location, Sun-aligned camera, coverage, cloud time,
   density, falloff, start distance, maximum opacity and exponent.
3. Repeat exactly the existing rays-off/rays-on pair and inspect it directly.
   Report the existing displayed summaries and resolved-length summary; add no
   threshold, ROI, hash, replay, convergence, retry or second state.
4. Run only focused Test ESLint/Prettier, the active-document Markdownlint and
   `git diff --check`. Do not run product/controller/package/full matrices and
   do not add or amend a Spec for this Test-only coefficient mapping.

All product JS/GLSL, BSM/packing/resolve/history, public API/defaults, resources,
SGP-0009, Planar, owner gate, checkpoint, commit/push and A6-G remain frozen. If
the same pair still lacks a distinct shaft, stop and return the direct evidence.

## A5-AR-010 execution — 2026-08-28

- Set only the fixed 17:30Z Test preset directional scale to
  `20 * 0.9 / 1.4 = 12.857143` and exposed it in the existing control/output.
- Preserved every other state, coefficient, product, Spec, API, resource and
  Planar boundary.
- The one valid off/on pair changes displayed median from `0.911818` to
  `0.911557`; rays-on has 68,288 nonzero lengths.
- Direct inspection still shows no distinct shaft and a nearly uniform bright
  medium. Execution stopped without another state or correction.

## A5-AR-011 Architecture clear-sky transport assignment — 2026-08-28

A5-AR-010 is closed as a correctly executed but disproved Test hypothesis. The
remaining root cause is the clear-depth Bruneton entry point: reference clear
sky uses `GetSkyRadiance(..., shadowLength)`, while SceneGIS uses
`GetSkyRadianceToPoint` with the artificial `1e9 m` planar background distance.

Execution must perform this bounded correction:

1. Extend the existing `sceneGISGlobeSkyRadiance` wrapper with a
   `shadowLength` argument and pass its nonnegative kilometre conversion to
   Bruneton `GetSkyRadiance` instead of hard-coded zero.
2. Pass exact zero from `SceneGISEnvironmentEffectsBackgroundFS.glsl`, retaining
   exact A4-G background identity.
3. In the Globe exact-clear branch of
   `SceneGISEnvironmentEffectsAerialFS.glsl`, compute the existing additive
   shadow delta from `sceneGISGlobeSkyRadiance` at decoded length and zero.
   Do not route clear depth through `sceneGISGlobeSkyRadianceToPoint` or the
   `1e9 m` sentinel.
4. Preserve `sceneGISGlobeSkyRadianceToPoint` for finite geometry and cloud
   bodies. Preserve the A5-AR-009 full A3 fog evaluation, raw/progressive BSM,
   packing/resolve/history, public API/defaults, resources, SGP-0009 and Planar.
5. Restore only the fixed 17:30Z Test preset directional fog scale from the
   rejected A5-AR-010 diagnostic to `0.9 / 1.4`; keep all other owner-state
   values unchanged.
6. Amend one existing focused production-source GPU fixture. It must execute
   the actual infinite-sky wrapper with zero and positive length, prove a
   finite nonzero clear-sky radiance change, bind the Aerial clear branch to
   those calls, and deterministically reject the former `1e9 m` finite-point
   mutation. Do not add a second fixture or numeric owner-visibility gate.
7. Repeat exactly the existing fixed 17:30Z rays-off/rays-on pair and inspect it
   directly. If no distinct shaft is visible, stop and return that fact without
   another parameter or formula change.

Run only the amended focused fixture, focused lint/format/Markdownlint, and
`git diff --check`. Do not rerun controller/package/generator/full matrices.
Owner gate, checkpoint, commit/push, A6-G and Planar remain blocked.

## A5-AR-011 execution result — 2026-08-28

- Implemented the infinite-sky shadow-length wrapper and exact-clear Aerial
  branch; Background remains exact zero and finite/cloud point transport stays
  unchanged.
- Restored the fixed Test directional scale to `0.9 / 1.4`.
- Amended the existing production-stack fixture; isolated result is 1/1
  success, including the finite-point mutation rejection.
- Reused the single 17:30Z off/on pair. The decoded length field is active, but
  direct inspection still has no distinct separated shaft. Work stopped at the
  authorized boundary; owner gate remains blocked.

## A5-AR-012 Architecture reference haze assignment — 2026-08-28

A5-AR-011 is accepted and frozen. Do not alter its infinite-sky wrapper,
Background zero-length call, finite-point transport or focused authority. The
fixed reference audit now supersedes the original decision to absorb
`approximateHaze` into A3: haze is enabled by every reference quality preset
and is a cloud-local source/composition term, not the generic height fog.

Execution must implement this single bounded correction:

1. In the already MIT-attributed `SceneGISGlobeClouds.glsl`, add a Globe-only
   adaptation of reference `approximateHaze`. Reuse the existing normalized
   equal dual-HG `g=(0.7,-0.2)` phase and the existing Bruneton
   `GetSunAndSkyScalarIrradiance`; do not duplicate or renormalize either
   authority.
2. Preserve the exact reference constants and equations: coverage remap
   `[0.2,0.4]`, density scale `3e-5 m^-1`, exponent `1e-3 m^-1`, sky scale `1`,
   scattering `0.9`, absorption `0.5`, the origin/horizon normal blend, analytic
   total optical depth, and directional optical depth after subtracting
   `min(rayLength, shadowLength)` from the camera-near prefix. Shadow length may
   change directional Sun only; total opacity and sky scattering stay invariant.
3. Build the haze ray from the actual Cesium near distance and local Globe
   camera origin. Bound it by the nearest finite scene distance, ellipsoid
   ground and `u_sceneGISShadowCloudTop`. If a visible cloud body exists, expose
   its decoded front distance from `sceneGISSelectCloudSample` and apply the
   reference opacity-weighted front clamp before evaluating haze.
4. In `SceneGISEnvironmentEffectsAerialFS.glsl`, declare and consume the existing
   `u_cloudCoverage` uniform; the renderer uniform map already owns it. Evaluate
   haze whenever Globe clouds are active. Rays-off uses exact zero length but
   retains the lit haze baseline. Composite it exactly once after the existing
   scene/cloud result with the reference `mix` ordering. Do not couple it to
   `u_showHeightFog` or any radiance-scale property.
5. Do not change A3 height-fog GLSL/defaults, A5-AR-011 Bruneton transport, BSM,
   packing/resolve/history, cloud MRT, public API, resources, SGP-0009, assets,
   upstream paths or Planar.
6. Amend the existing focused production-stack GPU fixture rather than adding a
   test. One controlled ray is sufficient: actual product haze at zero length
   must be finite and nonzero; a positive length must reduce directional Sun
   while leaving haze opacity and an ambient-only result unchanged; the
   integrated Aerial output must consume that helper. Use independently written
   scalar equations for this one case. Add no mutation suite, matrix, hashes,
   replay, convergence loop or visual threshold.
7. In the existing fixed `2026-06-21T17:30:00Z`, 15°E/45°N Sun-aligned owner
   witness, disable A3 height fog for both rays-off and rays-on so the pair
   isolates reference cloud haze. Preserve coverage `0.65`, cloud time `0`,
   camera and all other state. Capture exactly that pair and inspect it directly;
   do not search another state or tune a coefficient.

Run only the amended isolated GPU fixture, focused ESLint/Prettier,
Markdownlint for active records, and `git diff --check`. Do not run controller,
package, generator or full matrices. Owner gate, checkpoint, commit/push, A6-G
and Planar remain blocked.

## A5-AR-013/014/015 execution result — 2026-08-28

- Corrected the haze camera/LUT and front-distance authorities without changing
  fixed coefficients or composition equations.
- Scoped cloud-local haze to exact-clear sky or a finite pixel with an existing
  visible cloud selection. Finite/no-cloud output remains the pre-haze A2/A3
  composition.
- Unified Globe Aerial Bruneton sources under
  `backgroundRadianceScale * aerialRadianceScale`, removed the superseded
  transmittance-to-surface interpolation, and passed explicit Globe/Planar
  background/identity source coefficients through the existing fog helper.
- The two amended GPU fixtures pass 1/1 each. The one World Terrain four-state
  set retained terrain and continuous horizon transitions. The unchanged
  A3-disabled 17:30Z pair has 68,288 nonzero shadow-length pixels but still no
  distinct separated shaft under direct inspection; no further search or
  calibration was performed.

## A5-AR-012 execution result — 2026-08-28

- Added the bounded reference cloud-haze helper and one post-cloud Globe Aerial
  composition; no renderer/resource/public seam changed.
- Reused the accepted dual-HG and Bruneton ground irradiance authorities and
  preserved the exact reference coefficients and directional-only shadowing.
- Amended the existing production-stack fixture; isolated result is 1/1
  success with an independent scalar optical-depth check.
- Captured the single fixed A3-disabled 17:30Z off/on pair. The decoded length
  is active, but direct inspection still has no distinct separated shaft.
  Execution stopped at the authorized boundary; owner gate remains blocked.

## A5-AR-013 Architecture haze-authority correction — 2026-08-28

A5-AR-012 is not accepted as implemented. The reference equation is present,
but the candidate still substitutes two inputs:

1. The haze helper is called with the near-shifted origin and samples
   `GetSunAndSkyScalarIrradiance` at fixed
   `vec3(0, 0, bottom_radius)`. Reference camera height, normal and LUT lookup
   use the actual unshifted camera ray origin; `cameraNear` affects only the
   bounded haze interval.
2. `sceneGISSelectCloudSample` decodes both mean distance in attachment `x`
   and front distance in attachment `y`, but Aerial currently uses the mean for
   the opacity-weighted haze-front clamp. The reference clamp requires the
   decoded front.

Execution must make only this correction:

1. Keep `hazeRayOrigin = rayOrigin + viewDirection * cameraNear` solely for
   scene/ground/cloud-top ray bounds. Pass the unshifted local `rayOrigin` to
   the haze formula. Construct its virtual Bruneton camera position from that
   origin and sample scalar Sun/sky irradiance at that position in kilometres,
   not at a fixed bottom-radius point. Use the same actual camera origin for
   haze height and origin/horizon normal terms.
2. Add a `frontDistance` output to `sceneGISSelectCloudSample`, decoded from
   `distances.y * SCENEGIS_CLOUD_DISTANCE_ENCODING`. Preserve `meanDistance`
   from `distances.x` for cloud atmospheric and fog transport. Use only the
   decoded front for `sceneGISGlobeCloudHazeClampToCloudFront`.
3. Change no constants, phase, optical-depth equation, composition order,
   BSM/packing/resolve/history, A3, A5-AR-011, public API, resource, SGP-0009,
   upstream path, asset or Planar behavior.
4. Amend the existing focused production-stack fixture only. Replace the
   spatially constant irradiance witness with one actual non-sea-level
   Bruneton LUT sample and use it in the already independent scalar haze
   equation. In the same fixture, use one valid cloud sample whose encoded
   mean and front distances are deliberately different, and prove the
   integrated haze clamp follows the front. Add no second fixture, mutation
   suite, matrix, hash, replay, threshold or retry.
5. Reuse exactly the existing A3-disabled 17:30Z rays-off/rays-on owner pair.
   If it still lacks a distinct shaft, stop and return that direct fact without
   another time, camera, coefficient or formula.

Run only the amended isolated fixture, focused ESLint/Prettier, Markdownlint
for the active records and `git diff --check`. Owner gate, checkpoint,
commit/push, A6-G and Planar remain blocked.

## A5-AR-014/015 Architecture terrain/horizon correction — 2026-08-28

New owner evidence supersedes the narrow A5-AR-006 finite/clear sample as the
visual authority. Preserve the A5-AR-013 assignment and add only these bounded
corrections:

1. Apply `sceneGISGlobeCloudHaze` to exact-clear sky as before. For finite
   geometry, apply it only when `sceneGISSelectCloudSample` selected a visible
   cloud body in front of the scene. A finite terrain pixel with no selected
   cloud sample must preserve the pre-haze A2/A3 composition. Reuse the
   existing cloud-validity authority; add no depth epsilon, opacity tuning or
   public toggle.
2. Declare the existing `u_backgroundRadianceScale` in the Globe Aerial
   program and derive one private
   `globeAtmosphereRadianceScale = u_backgroundRadianceScale *
u_aerialRadianceScale`. Use it for the exact-clear Bruneton shadow delta,
   finite `sceneGISGlobeSkyRadianceToPoint` source and cloud-body Bruneton
   source. Delete `sceneGISGlobeEffectiveAerialScale`; `u_surfaceRadianceScale`
   remains owned solely by Globe surface lighting.
3. Pass an explicit source-radiance-domain coefficient through the existing
   exponential-height-fog helper. Every Globe Background/Aerial/cloud-body fog
   call supplies `u_backgroundRadianceScale`; Planar supplies `1.0` and remains
   formula-compatible. Multiply the combined fog source once, before the
   existing Beer mix. Preserve density, falloff, opacity, directional shadow
   fraction and public fog component controls.
4. Update public documentation and ADR semantics only: on Globe,
   `aerialRadianceScale` is a relative multiplier within the background
   radiance domain; Planar retains the existing absolute scale until its later
   phase. Defaults and finite ranges do not change.
5. Do not change exact raw-depth clear authority, Bruneton LUTs/horizon clamps,
   surface lighting, cloud density, BSM, packing/resolve/history, assets,
   resources, SGP-0009 or upstream paths. Do not add a blur, depth bias,
   distance retry or screen-space seam blend.
6. Amend, do not multiply, focused tests. Replace the old A5-AR-006 endpoint
   helper assertion inside the existing surface/aerial GPU fixture with one
   partial-transmittance case proving the exact shared Globe scale and rejecting
   the former interpolation. Extend the existing production fog fixture with
   one source-domain comparison. In that same haze fixture, add the A5-AR-014
   finite/no-cloud identity case while retaining the A5-AR-013 non-sea-level
   and distinct front/mean cases.
7. Use one fixed World Terrain camera for four direct frames only: effects-off
   identity, atmosphere+aerial, atmosphere+aerial+height-fog, and cloud-only.
   Inspect terrain preservation and horizon continuity directly; add no pixel
   metric or gate. Reuse the existing A3-disabled 17:30Z pair once for
   A5-AR-013 and do not search another state.

Run only the two amended isolated GPU fixtures, focused lint/format checks,
active-record Markdownlint and `git diff --check`. Do not run controller,
package, generator or full matrices. Owner gate, checkpoint, commit/push, A6-G
and Planar remain blocked.

## A5-AR-015 Architecture review correction — 2026-08-28

A5-AR-013 and A5-AR-014 are closed. A5-AR-015 product GLSL and its two focused
GPU fixtures are accepted and frozen. One pre-existing source-contract Spec was
not updated and now deterministically fails:

`npm run test -- --includeName "keeps orthographic origins and untruncated slab entry before the medium cap"`
returns 0/1 because line 7470 still expects Aerial not to contain
`u_backgroundRadianceScale`.

Execution must make only these corrections:

1. In that existing Spec, replace the obsolete negative assertion with the new
   Globe shared-domain contract. Retain the existing Planar absolute formula
   assertion; add no test or matrix.
2. In `SceneGISEnvironmentEffects.js`, clarify both existing
   `aerialRadianceScale` JSDoc descriptions: Globe treats it as a relative
   coefficient multiplied by `backgroundRadianceScale`; Planar retains the
   absolute scene-linear scale. Do not change runtime, default, range or API.
3. Rerun only the one failing Spec, focused ESLint/Prettier for the Spec and JS,
   active-record Markdownlint if records are appended, and `git diff --check`.

Do not rerun the accepted GPU/browser evidence and do not modify product GLSL,
Test, resources, SGP, Planar behavior or any coefficient.

## A5-AR-015 focused Spec/JSDoc execution result — 2026-08-28

- Replaced only the obsolete negative Aerial source assertion with the accepted
  Globe shared-domain product and retained the Planar absolute-formula check.
- Updated both existing `aerialRadianceScale` JSDoc descriptions; no runtime,
  default, range or API shape changed.
- The formerly failing focused Spec passes 1/1. Product GLSL, GPU fixtures,
  Test/browser evidence and frozen transport remain untouched.

## A5-AR-016 Architecture assignment — 2026-08-28

A5-AR-015 is closed. The owner screenshots expose one earlier integration
precondition: when Cesium Globe keeps its default
`depthTestAgainstTerrain === false`, `Scene.executeCommands` copies terrain
depth aside, clears the main depth buffer and writes `DepthPlane`. The existing
`SGP-0008` HDR seam then receives the post-clear main depth texture, so Aerial,
height fog and cloud ray clipping cannot use actual terrain occlusion.

Execution must make this bounded lifecycle repair:

1. In the SceneGIS-owned controller, when an enabled Globe controller first
   activates, snapshot `scene.globe.depthTestAgainstTerrain` and set it to
   `true` after native-conflict validation but before pipeline allocation.
2. If the value was already `true`, record no owned mutation. While the Globe
   controller is active, validate that it remains `true` and use the existing
   fail-closed controller error path if an external caller changes it.
3. On `enabled = false` and on disconnect/removal, restore the snapshotted prior
   value only for a lifecycle that changed it. Re-enable acquires it again.
4. Amend the existing lifecycle/conflict/resource Spec rather than adding a new
   matrix. Cover acquire-before-allocation, prior-true preservation,
   disable/disconnect restoration and active external mutation failure.
5. Use one fixed World Terrain camera and inspect aerial-only, height-fog-only
   and cloud-only frames for terrain preservation. Add no hash, replay,
   convergence loop, sweep or pixel-threshold gate.

Do not modify `Scene.js`, `SGP-0008`, any shader equation or coefficient, Test
to set the prerequisite independently, resources, public API, Planar behavior
or upstream files. Run only the amended focused Spec, directly affected static
checks, active-record Markdownlint and `git diff --check`. No full/controller
aggregate, package/generator matrix, owner gate, checkpoint, commit/push, A6-G
or Planar work is authorized.

## A5-AR-016 execution result — 2026-08-28

- The controller acquires the unified Globe terrain-depth lifecycle after
  conflict validation and before its first resource request. It records whether
  it actually changed the property.
- Active external mutation to `false` enters the existing fail-closed error
  path. Disable and disconnect restore the snapshotted value only for an owned
  mutation; re-enable acquires a new lifecycle.
- The amended lifecycle/resource Spec passes 1/1. Focused ESLint and Prettier
  pass for the controller and Spec.
- A single fixed 15°E/45°N high-Sun World Terrain camera showed intact terrain
  silhouettes and foreground occlusion for Aerial-only, height-fog-only and
  cloud-only states. The Globe controller reported ready · HDR.
- No shader, Test prerequisite, resource, public API, Planar, upstream or SGP
  change was made. `SGP-0008` remains consume-only.

## A5-AR-016 Architecture closure — 2026-08-28

Architecture independently inspected the controller ordering and restoration
paths and reran the amended lifecycle Spec, which passed 1/1. The implementation
matches the assigned lifecycle contract without a shader, Test prerequisite,
resource, upstream or Planar change. A5-AR-016 is closed. The phase remains
active until the project owner explicitly rechecks the corrected Globe visuals;
no checkpoint or next phase is authorized by this closure.

## Project-owner visual gate and phase closure — 2026-08-28

The project owner manually rechecked the corrected Globe result and reported
that the effect is correct. The owner visual gate passes. The required local
checkpoint remains blocked only by A5-AR-017, a pre-commit type-check failure at
the existing SGP-0009 FrameState extension read. A6-G and Planar remain
unactivated, and no push is authorized.

## A5-AR-017 bounded type correction — 2026-08-28

The checkpoint hook reports:

`Source/Scene/GlobeSurfaceShaderSet.js(153,46): error TS2339: Property '_sceneGISGlobeLighting' does not exist on type 'FrameState'.`

Execution must keep the runtime expression and existing SGP-0009 path set,
adding only a local structural JSDoc cast for the optional frame-local record at
the current read point. Do not modify upstream `FrameState`, add a fourth
upstream path, use a global suppression, alter runtime behavior or add a test.
Run `npx tsc` from `packages/engine`, focused Prettier, active-record
Markdownlint and `git diff --check`, then return review-ready without commit or
push.

## A5-AR-017 execution result — 2026-08-28

- Added one local structural JSDoc cast inside the existing SGP-0009 marker
  pair. It declares only the optional frame-local record and optional boolean
  `active` field.
- The variant flag and runtime `active === true` selection are unchanged.
- Engine `npx tsc` passes. No Spec or frozen runtime/visual matrix was rerun.
- Upstream path count remains three, generated paths remain zero and no new SGP,
  runtime, resource, API or Planar delta was introduced.

## A5-AR-017 Architecture closure and checkpoint — 2026-08-28

Architecture independently reviewed the structural JSDoc cast and reran engine
`npx tsc`, which passed with no diagnostic. A5-AR-017 is closed. With the owner
visual gate already passed and no other finding open, A5-G is complete. The
phase-closing commit containing this record is its isolated local checkpoint;
A6-G, Planar and push remain unauthorized.
