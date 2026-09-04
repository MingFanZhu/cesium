# Discussion: A13-G Globe Performance Source Discovery

## Metadata

- Type: `discussion`
- Status: `resolved; A13-AR-001..007 fixed; Architecture and owner gates passed`
- Author role: Architecture Agent
- Created / updated: `2026-09-04`
- Product baseline: `fd868387d4c38d6faf67a9395434cc9fccc6384c`
- Plan: [A13-G](../plans/2026-09-04-phase-a13g-globe-performance.md)
- Review: [A13-G](../reviews/2026-09-04-a13g-globe-performance.md)

The owner accepts the corrected result on 2026-09-04. Existing bounded evidence
and accepted residual grain/cost limits close A13; no new measurement is added.
The clock-linkage follow-up is separate from these performance decisions.

## Current-source facts, not a measured cost ranking

Paths below are relative to `packages/engine/Source/`.

| Work            | Confirmed current behavior                                                                                                                                                  | Source anchor                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud body      | Globe medium/high scale 1.0; progressive cap 500, 50 m minimum, growth 1.01; early exit at segment end or transmittance 0.01                                                | `SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`: `cloudQualityProfiles`, `executeCloudPass`; `Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`: progressive march |
| Cloud lighting  | Retained density samples evaluate local Sun optical depth, optional Beer body queries and ground optical depth; high ground ray count differs from medium                   | `SceneGISVolumetricClouds.glsl`: `sunOpticalDepth`, `groundOpticalDepth` branches                                                                                                                    |
| Cloud resolve   | Existing 3x3 current reads, full-resolution output, A12 variance bound and established temporal/semantic rejection                                                          | `executeCloudResolve`; `SceneGISEnvironmentEffectsCloudResolveFS.glsl`                                                                                                                               |
| Beer shadows    | On active cloud-shadow/ray frames: clear, one producer execution per active cascade, then one atlas resolve; high is three 768-square cascades with 50-step producer budget | Renderer: `prepareGlobeLighting`, `renderBackground`, `cloudQualityProfiles`                                                                                                                         |
| HDR optics      | One aerial/fog/cloud composition target, then Bloom threshold + three horizontal/vertical pairs + composite when active                                                     | Renderer: `executeHdr`, `executeBloom`                                                                                                                                                               |
| CPU publication | `updateFrame` is reached from preparation/background/HDR; celestial work already guards same frame number and JulianDate                                                    | Renderer: `updateFrame`, `updateGlobeCelestialAuthority`                                                                                                                                             |

Graph lookup located renderer symbols but returned obsolete source offsets
and incomplete GLSL coverage. The anchors above were checked directly against
the current files; historical A6 profile/resource prose is not current cost
authority. In particular, BSM now has its accepted temporal resources and
Globe medium/high no longer use the original half-resolution profile.

No matching timer-query abstraction was found in the inspected Cesium
`Renderer` source. Native `PerformanceDisplay.update` measures elapsed frame
cadence, not GPU command duration. A new raw-GL timer path is not authorized.

## Bounded live baseline — 2026-09-04

The original accessible page remains at `Test/高级环境.html?a11-owner-gate=1`.
It has changed since A12 visual observation through owner interaction; the
performance sample uses its present state, not a restored historical camera.

- Ready/HDR, high/mixed, coverage `0.35`, density `0.5`, cloudTime `0`.
- OSM Buildings loaded, native Moon visible; effect controls including cloud
  shadows, rays, Bloom and Moon lighting/shadows enabled.
- Drawing buffer `1433 x 1150`; default loop active, requestRenderMode false,
  simulation animation paused; document visible, browser/render errors `0`.
- One `1501 ms` public postRender window observed `31` renders: `20.6529`
  frames/s, median interval `49.1 ms`, P95 interval `63.2 ms`. Camera remained
  unchanged during this window. This short sample is a diagnostic starting
  point, not a benchmark distribution or acceptance threshold.
- A separate Chrome CPU sampling window lasted `1748.497 ms` with `840`
  samples. Performance metrics over `1.790339 s` reported main-thread task
  duration `0.575489 s`, script duration `0.307883 s`, layout `0.005528 s` and
  style recalculation `0.000717 s`. Sampled idle time was `1187.285 ms`;
  unclassified program time was `261.264 ms`. Named self samples included
  `continueDraw`, terrain command assembly, credits, uniforms and tile SSE.

The original longer collection hit the browser tool's command timeout and
produced no usable timing record. Both profilers were disabled; the later
short bounded samples above completed. No scene reload, camera/tier/parameter
change, screenshot readback, software instrumentation patch or test run was
performed. Temporary observation listeners and profilers were removed, and
the default loop and saved time/parameters remained unchanged.

Main-thread saturation is not established by these samples. GPU or presentation
work is a plausible next focus, not proven attribution: idle time is not GPU
duration, and neither the frame interval nor a maximum shader loop count
identifies the responsible pass. Device load, native geometry, streaming and
the observer itself can affect such short windows.

## Same-session effect isolation — 2026-09-04

Architecture used the current public effect setters for one bounded
`1500 ms` postRender window per condition. Each condition restored its original
flags in `finally`. The full baseline was measured before and after the three
isolations. No camera, simulation time, cloudTime, coverage, density, preset,
quality or drawing-buffer change occurred; every window recorded unchanged
inputs, a visible document and zero browser/render errors. These are short
cadence observations, including transition frames, not a warm-up, convergence
loop or GPU timer. Native FPS was enabled throughout.

| Condition                                   | Elapsed ms | Frames | Frames/s | Median interval ms | P95 ms |
| ------------------------------------------- | ---------: | -----: | -------: | -----------------: | -----: |
| Full baseline                               |     1512.6 |     44 |    29.09 |               33.8 |   39.0 |
| Bloom and lens disabled                     |     1503.4 |     44 |    29.27 |               34.6 |   39.8 |
| Cloud shadows and crepuscular rays disabled |     1503.1 |     53 |    35.26 |               27.3 |   36.4 |
| Clouds disabled                             |     1504.6 |     86 |    57.16 |               16.7 |   24.1 |
| Restored full baseline                      |     1502.6 |     43 |    28.62 |               35.1 |   43.0 |

The same-session bracket, not the earlier separate 20.65 FPS sample, is the
comparison authority. Cloud-dependent work is the leading family. Disabling
shadows/rays removes a group of costs: Beer producer/resolve, body/surface
atlas consumption and view-ray shadow length. Disabling clouds additionally
removes Cloud MRT/resolve and dependent consumers; it is not an isolated body
timer. Bloom/lens removal has no clear effect beyond short-window variation.
Do not subtract these frame intervals and label the result GPU pass time, or
claim that an optimization can reproduce the disabled-effect frame rate.

At the current `1433 x 1150` buffer, Globe high executes its Cloud MRT and
history resolve at all `1,647,950` pixels. The 500-step cap is only an upper
bound; actual iterations and the fraction of empty samples were not measured.
No further toggle matrix is needed to prioritize this first bounded proposal.

## Reference comparison and ranked proposals

The local three-geospatial HEAD was independently verified as
`b012ad06d858fc035d88aacfd73f092f93c994e4`, matching the asset provenance.
Its `packages/clouds/src/shaders/clouds.frag` `marchClouds` first evaluates
weather and skips `sampleMedia` when weather contributes no density. The
reference also increases traversal distance for empty weather; that separate
approximation is **not** part of the first proposal below.

### 1. Exact-zero weather early return in the shared Globe density helper

Current `SceneGISGlobeClouds.glsl` `sceneGISGlobeCloudDensitySampleInternal`
constructs `weatherDensity` and active-layer masks, but still samples turbulence,
shape and optional detail when every weather density is exactly zero. The
following remaps cannot create positive density from that zero input under
the current nonnegative material coefficients and normalized R8 samples.
The result and unused height gradient are already `0` and `0.5` respectively.

Recommended first implementation: return those same outputs immediately after
the existing weather/layer loop when every component is zero. Keep every
positive density, including arbitrarily small values; do not add a threshold.
Preserve primary/secondary sample positions, progressive advancement, jitter,
lighting formulas and temporal history. Lighting already skips zero final
density in the outer march, so the newly eliminated work is the intervening
material sampling, not a newly invented lighting early-out.

This helper serves visible-cloud density, local Sun/ground density and the
shadow-layer-only Beer producer. The current renderer uses base-level LINEAR
shape/detail textures for Globe, and weather/turbulence use explicit
`textureLod`; the proposal must preserve these filtering contracts. It must
not introduce a Planar branch or copy the reference's long empty-weather step.

- Expected benefit: source-proven removal of up to three texture operations
  plus associated math per exact-empty density call; realized speedup is
  unmeasured and depends on empty regions, GPU branching and texture cost.
- Likely implementation surface: the Globe density GLSL and one existing
  focused GPU fixture; no renderer state, resource, public API or invalidation
  change is required.
- Smallest correctness witness: compare retained and early-return density
  semantics on exact-empty and positive weather, including the shadow-layer
  mask and mixed empty/nonempty neighboring pixels. Preserve nonempty output,
  gradient, cloud MRT semantics and existing shadow/temporal contracts.
- Cost witness after an authorized implementation: one bounded before/after
  comparison at matching workload and camera/time/tier, with baseline variance
  stated. No promise of a particular FPS or new diagnostic framework.

### 2. Avoid ineffective positive-only occupancy texture queries

`SceneGISVolumetricClouds.glsl` `sceneGISCloudOccupancyBound` tests height
overlap and then samples a conservative shape-max hierarchy. Globe considers
only an exact-zero hierarchy cell empty. A read-only scan of the shipped
`CloudCore/globe-shape.bin` found `2,097,152` bytes, minimum `112`, maximum
`253`, and zero zero-valued texels. `createCloudOccupancySource` copies this
R8 source directly and builds maxima, so its valid mip cells cannot become
zero. Inside an active layer, the texture part of this test always retains
the interval. Height-based empty-interval rejection remains useful.

A later bounded optimization could retain the exact layer/radial interval
test while bypassing texture work when the current resource generation proves
its hierarchy cannot contain zero. Derive that invariant during the already
existing source scan; do not hard-code the bundled asset assumption for custom
resources, remove the general occupancy path, or change the step schedule.
The invariant must follow candidate-first resource replacement and reset with
the resource lifecycle. A new internal flag/uniform would require separate
renderer/Spec review; no such change is currently assigned.

- Expected benefit: eliminates useless shape-occupancy reads for the shipped
  Globe asset. Runtime gain is not yet measured; prioritize the shared density
  early return because it also applies to secondary and Beer density calls.
- Likely surface: renderer asset metadata/uniform publication, shared
  volumetric GLSL under Globe-only guards, and focused occupancy/lifecycle
  fixture amendments. Planar and arbitrary zero-containing assets retain the
  existing authority. Persistent texture/resource removal is not proposed.
- Smallest witness: positive-only and zero-containing source cases, preserved
  height-interval rejection, identical cloud output and resource replacement
  behavior; then one scoped cost comparison if the first change leaves this
  work material. Do not measure the two optimizations as one unexplained gain.

## Exclusions and next decision

Existing body BSM sampling already uses a single raw tap at ordinary Sun
elevations and the accepted filter near the horizon. It is not an unconditional
16-tap-per-body-step path. Existing early transmittance termination, depth
clipping, progressive steps and same-frame celestial cache are also present.
Atlas noise and temporal resolve evolve even with a stationary camera;
camera-only atlas caching or reduced update cadence is not justified by the
current evidence. Bloom and generic CPU cleanup are lower priority here.

The owner approved Architecture's recommendation to implement candidate 1
first. The A13 phase plan now contains the exact one-helper change, the existing
fixture amendment, two focused GPU commands and role boundary. Candidate 2
remains deferred and is not part of this approval. Execution owns only that
coding/automated validation work; Architecture retains live before/after
measurement and visual review. All diagnostic live flags were restored and
native FPS remains enabled. No speedup or implementation acceptance is yet
claimed.

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

## Independent candidate-1 comparison and medium target — 2026-09-04

Architecture confirmed the actual loaded old cloud program lacked the new
predicate before measurement, then reloaded the page and confirmed the current
compiled program contained it. The owner's view had changed since the earlier
29 FPS isolation: use this new comparison, not the older cadence, to judge
candidate 1. Current drawing buffer is `1433 x 1150`, high/mixed, coverage
`0.35`, density `0.5`, cloudTime `0`, OSM Buildings in New York, Bing Maps
Aerial and WGS84 Ellipsoid, all prior effect toggles retained. Clock animation
is paused at the same JulianDate; measured status Sun elevation is `56.043°`.

Before reload, Architecture saved the public effect setters, clock, frustum
and camera. The new page restored them and the same native imagery/building
selection, including Moon visibility and collapsed GUI. The largest restored
camera position/direction/up component difference was `2.78e-15`; effect
parameters and time matched. Globe and building tiles reported loaded before
the valid measurements. Each window used a temporary public postRender listener
and recorded unchanged inputs. No GPU timer, pixel readback or render-loop
override was introduced.

| Loaded source / view                           | Tier   | Elapsed ms | Frames | Frames/s | Median ms | P95 ms |
| ---------------------------------------------- | ------ | ---------: | -----: | -------: | --------: | -----: |
| Old / owner view                               | high   |     1501.3 |     76 |    50.62 |      19.6 |   25.1 |
| Old / owner view                               | medium |     1500.4 |     90 |    59.98 |      16.9 |   19.9 |
| Candidate / restored owner view                | medium |     1502.3 |     90 |    59.91 |      17.0 |   20.5 |
| Candidate / restored owner view                | high   |     1515.7 |     91 |    60.04 |      16.8 |   18.9 |
| Candidate / one 30° look-up from same position | medium |     1502.4 |     49 |    32.61 |      29.1 |   40.6 |

The high owner-view observation improved by about 19% and reached the apparent
60 FPS presentation ceiling. Medium was already near that ceiling, so no
additional medium gain can be resolved in the owner view. These short windows
are directional evidence, not a cross-device guarantee, a stable percentile
benchmark or GPU pass timing. Reload/driver state remains an uncertainty;
the one look-up has no old-source counterpart and is not used to calculate
an optimization speedup.

During review the owner requested medium at approximately 60 FPS. Architecture
therefore added exactly one more workload: `camera.lookUp(pi/6)` from the
retained position, with only quality changed to medium. Direct inspection
showed considerably more visible cloud area, preserved body shading and no
obvious new rectangular artifact. Its 32.61 FPS means the broader medium
target is **not met**. Afterwards Architecture restored the original high
tier and camera; all saved public effects and time matched, native FPS and
default loop remained enabled, ready/HDR and final page errors were zero.

One discarded collector attempt referenced `Cesium` as a global, although this
sample imports it as a module. The callback had already removed its listener
before throwing. This caused one tool-origin `Cesium is not defined` entry
on the old page, not a render failure. The collector was corrected to read the
existing tiles' public readiness without that global; the normal candidate
reload cleared the old page record. No diagnostic listener or profiler remains.

Source interpretation: medium/high both retain `globeScale=1.0`, detail and
the same Globe primary cap. High has the more expensive ground-light budget
and `3 x 768` Beer cascades, versus medium `3 x 512`. Thus the tiers differ,
but medium does not reduce the full-resolution primary pixel domain. The
look-up result prioritizes per-pixel cloud traversal/material/light work;
it does not by itself isolate an individual shader cost.

Candidate 1's code/automated evidence and bounded live appearance are approved
by Architecture. Owner acceptance and A13 closure are not inferred. The new
working target is medium near 60 FPS on this device/resolution in both the
retained owner view and the identified cloud-heavier view, with accepted quality
preserved; it is not a universal public FPS guarantee. Further analysis and
design stay with Architecture. Candidate 2, tier changes, reduced resolution,
fewer samples and atlas update changes remain unassigned.

## Industry/reference comparison for the medium target — 2026-09-04

Architecture continued the diagnosis at the owner's request; this is not an
Execution assignment. The pinned reference remains
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`.

### The missing amortization is before, not after, primary tracing

Current SceneGIS medium/high have `globeScale=1.0` in
`_SceneGISEnvironmentEffectsRenderer.js::cloudQualityProfiles`.
`executeCloudPass` allocates and executes that complete pixel domain before
`executeCloudResolve` uses current neighbors and history. A12's reprojection,
variance clipping and temporal noise improve stability; they do not omit
primary rays. At the retained `1433 x 1150` buffer that is `1,647,950` primary
ray invocations, each with early exits but a potential 500 progressive steps.
The cap is not a measurement of actual iterations.

The reference's `CloudsMaterial.ts` defaults `temporalUpscale=true`.
`CloudsPass.ts::setSize` then makes its current target
`ceil(width/4) x ceil(height/4)` while resolve/history retain the output size.
`CloudsMaterial.ts::copyCameraSettings` offsets cloud rays using a 16-phase
Bayer sequence. `shaders/cloudsResolve.frag::main/temporalUpscale` selects one
fresh pixel in each 4x4 block and reconstructs the other pixels from reprojected,
variance-clipped history. This is approximately one sixteenth of the output
pixel count in new primary rays, not a claim of sixteen times higher FPS.
No reference FPS or live reference configuration was measured in this turn.

Reference medium also disables light shafts and turbulence, uses height-endpoint
Sun/sky interpolation (`accurateSunSkyLight=false`), and uses 256-square Beer
cascades. Our current medium retains the owner's enabled rays, turbulence,
per-sample irradiance evaluation and 512-square cascades. Both retain a 500
primary cap. Thus similarly named tiers are not equivalent workloads.
`clouds.frag::getCloudsSunSkyIrradiance` and the conditional ground-bounce
block confirm these are real reference quality tradeoffs, not missing caches.
Do not silently adopt them after the accepted low-Sun/Moon/ground-light work.

### Primary industry sources and applicability

- Guerrilla's [2015 SIGGRAPH presentation, slides 91–94](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)
  describes about 20 ms before sparse temporal reconstruction and about 2 ms
  for its optimized PS4 setup, with one fresh pixel per 4x4 block. Those are
  historical implementation-specific measurements, not a SceneGIS budget
  prediction. Reduced tracing plus reconstruction is a mature approach,
  rather than a recent elimination of volumetric-cloud cost.
- Epic's [Volumetric Cloud documentation, Ray Marching Quality Modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-cloud-component-in-unreal-engine#raymarchingqualitymodes)
  documents lower-resolution tracing followed by reconstruction/upscaling,
  with different responsiveness and opaque-intersection tradeoffs. The same
  document describes conservative-density material rejection and the
  cost/accuracy distinction between secondary ray marches and Beer shadows.
  SceneGIS already has weather rejection, transmittance termination and the
  local-light/Beer combination; these must not be proposed as absent.
- Guerrilla's [Nubis³ publication](https://www.guerrilla-games.com/read/nubis-cubed)
  describes compressed signed-distance-field acceleration and light-sampling
  acceleration for voxel clouds. This requires a different volume/acceleration
  representation; it is not a drop-in flag for our animated procedural layers.
  No voxel/SDF subsystem or asset change is proposed in A13.

### Bounded proposal ranking

1. Candidate 1 is code-approved: exact-zero weather avoids detailed material
   work without changing ray positions. Its recorded gain does not establish
   the cloud-heavier medium target.
2. Keep candidate 2 as the low-risk, unassigned next work-removal option.
   The previously scanned bundled R8 shape has minimum 112 and no zero texels.
   Max-mip occupancy therefore cannot reject height-overlapping intervals,
   while `sceneGISCloudOccupancyBound` still performs coordinate/LOD/texture
   work. Prove the positive-only invariant from each loaded resource, retain
   height rejection and the zero-containing custom-resource path, and bypass
   only ineffective queries. Do not increase a threshold or infer an interval
   is empty from a single zero-weather point. Benefit remains unmeasured.
3. New candidate 3 is a design proposal, not approved implementation: medium
   half-width/half-height cloud tracing with cloud-only 2x2 phased sampling
   and full-resolution depth-aware temporal reconstruction. At this buffer,
   `717 x 575` is `412,275` rays, about a quarter of the current primary pixel
   work; resolve, shadow atlas, scene rendering and HDR work remain, so this
   is not a fourfold FPS prediction. Begin more conservatively than the
   reference's 4x4/16-phase policy. Retain material, optical step policy,
   Sun/Moon lighting, world-space shadows and the accepted high path.

Candidate 3 cannot be implemented by only changing `globeScale`. Its design
must align sparse sample UV, ray/depth endpoints and mean/front/scene distance
semantics, retain independent shadow-length validity, reject disoccluded or
out-of-frame history, and produce a complete spatial image immediately on
first frame/camera cut/resize/tier change. The reference explicitly uses an
approximate scene-depth approach for shadow-length history; that shortcut
does not replace our accepted semantic checks. Do not compensate with higher
history weight, wait for settling frames, or jitter the native scene camera.
Actual resource/state changes and focused existing-fixture amendments require
a separate plan/ADR review before a concrete Execution assignment.

Lighting interpolation, dropped turbulence/shafts and changed atlas cadence
are not additional assigned candidates. The measured approximately 32.61 FPS
cloud-heavier case needs a substantial total-frame improvement to approach
16.67 ms; source-level ray-count ratios alone cannot guarantee that target.

### Attempted follow-up measurement and restored state

The same owner state was saved again. Before changing it, Cesium's native
counter already showed approximately 1000 ms per frame. A single 1507.8 ms
window at the previously recorded medium/30-degree look-up observed only one
postRender callback. Document visibility/focus were true, default loop was
on, requestRenderMode was false, imagery/buildings were loaded and page errors
were empty; screenshot capture was also unavailable. The cause was not
established. This is not comparable to the preceding valid 32.61 FPS sample
and is not used as GPU evidence or an optimization regression.

Architecture stopped the proposed shadow/ray isolation before disabling those
features, did not repeat the measurement or change browser throttling/render
loop policy, and removed the temporary listener. It restored the exact saved
effect parameters, clock and camera (direction/up within floating-point
roundoff), high tier, native FPS and default loop. Final page errors remained
empty. No executable, resource, upstream, SGP or generated-file change was made
by this investigation. Candidate 2/3, owner gate and A13 completion remain open.

## Owner-approved two-step continuation — 2026-09-04

The owner approved both candidate 2 and candidate 3. Architecture completed
candidate-2 source/lifecycle discovery and placed the concrete coding assignment
in the current phase plan. It derives an all-positive R8 proof during the
existing base construction, publishes it with the candidate occupancy texture,
and skips only ineffective query work after active-layer/height rejection.
ADR-0046 now records this bounded optimization. The GPU proof stays tied to
current resources; no texture mutation, filename assumption or altered threshold
is part of the product contract.

The current source's `publishResources` creates all resources before swapping
`_resources`; a later weather `Texture.generateMipmap` failure can directly test
that an uncommitted new proof never replaces the old one. Existing occupancy
and texture-failure fixtures are the two assigned checks. Tests that directly
mutate private textures must explicitly use the corresponding Spec-owned
proof/uniform setup, not imply a new public mutable-texture API.

Execution owns candidate-2 coding/validation only. Architecture owns the
candidate-3 design: sparse sample coordinate/depth authority, output mean/front/
scene semantics, disocclusion, independent shadow-length reuse, odd dimensions,
first-frame/cut completeness and candidate-first resource replacement. The
approved direction is medium 2x2 with high/Planar preserved, not a license to
copy the reference's approximate shadow-history handling or drop features.
Candidate-2 review precedes the candidate-3 coding assignment. No repeat owner
authorization of the same direction is needed; acceptance and A13 completion
still require actual implementation/review/visual evidence.

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

## Candidate-2 measurement and candidate-3 source conclusions — 2026-09-04

The independent candidate-2 review is approved. One restored-state comparison
at 1433x1150 measured 35.86 FPS before and 36.24 after the bypass in the same
medium/mixed, 30° upward owner view. The windows contain 72/73 frames over
2007.7/2014.5 ms. This small difference is not a stable speedup claim. The live
new shader contains the bypass and the current resource proof is true. The
original camera, clock, parameters, layers/buildings and loop were restored;
errors remained zero. Full details and limits are in the current review.

Current-source correction to the earlier comparison: the renderer's
`u_sceneGISGlobeCloudTurbulence` is true only for `high`; medium already disables
that branch. Candidate 3 must preserve this current policy, not turn turbulence
off again or claim its removal as a new gain. Detail, local lighting, rays,
atlas configuration and the 500-step medium cap remain unchanged.

`executeCloudPass` currently traces medium/high at full input dimensions.
`CloudFS` already couples full-pixel depth, explicit camera ray and STBN through
one `cloudCoordinates`; candidate 3 must replace that coordinate coherently,
not jitter the Cesium camera. The existing entry-footprint helper converts
actual raster derivatives to the reference raster; changing target size alone
must not double the per-ray angular footprint or alter optical step policy.

The current resolve assumes an unshifted low grid, soft-weights scene distance,
averages encoded distances, and uses the target ray for history reconstruction.
At half resolution these assumptions require explicit phase-aware sampling,
source-to-target distance conversion and depth-edge rejection. Invalid raw
cloud samples currently lack scene z; the medium producer must publish its
already-known current scene endpoint even for invalid clouds. The actual shared
distance encoding is 1,000,000 m, not the historical A6 200,000 m. New tests must
derive that authority from the current contract rather than reuse the old literal.

The selected design retains the two full-size histories, existing 0.9/0.82
weights, A12 RGB/alpha clipping, continuity cuts and independent decoded shadow
length. Medium traces one sample per 2x2 block each native frame and always
constructs a complete depth-aware current image. It does not copy the reference's
history-only nonfresh pixels, larger variance gamma, velocity attachment or
approximate shadow-length reprojection. Spatial interpolation is necessarily an
approximation near subpixel cloud/geometry edges; automatic evidence and owner
motion/visual judgment must qualify it. Exact design and budgets are in the
phase plan and ADR-0048; no parameter sweep or stronger history weight is approved.

### Candidate 3 implementation feedback — 2026-09-04

The new controlled GPU fixture exposes NaN RGB during history rejection after
the assigned phased reconstruction. This is an unresolved implementation
blocker, not performance or visual evidence. Exact failures, corrected setup
issues and the frozen clipping dependency are recorded in the
[A13 review](../reviews/2026-09-04-a13g-globe-performance.md#candidate-3-execution-blocker--2026-09-04).
Architecture direction is required; no new optimization or fallback is selected.

Architecture subsequently isolated finite-input interval inversion in the A12
helper, not a depth or sampling-budget failure. The exact GPU evidence and
bounded correction are recorded in
[A13-AR-001](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-001--inverted-finite-variance-interval)
and ADR-0048. Both bounds will be clamped to the sampled extrema; no larger
variance, history weight, tolerance or nonfinite fallback is authorized.

Execution applied that exact correction; all phased transition attachments
are now finite and both fixed moved center samples show positive bounded
history contribution. Retained high/Planar history also passes. The two resource
fixtures expose separate setup/API errors, recorded with the four exact outcomes
in the [review](../reviews/2026-09-04-a13g-globe-performance.md#final-focused-command-results).
No new diagnosis, tuning or performance observation is claimed.

Independent review closes A13-AR-001. Source inspection confirms the remaining
failures are implicit high-tier setup and a nonexistent framebuffer-manager
method, including a medium-cut coverage gap. The bounded Spec-only
[A13-AR-002/003 assignment](../reviews/2026-09-04-a13g-globe-performance.md#current-spec-only-follow-up-assignment)
does not change the rendering algorithm or begin performance measurement.

Actual medium/cut and lazy-resource qualification now pass. The failure test
proves last-good liveness but not candidate cleanup: its retained global update
injection yields zero destroy calls. The [follow-up record](../reviews/2026-09-04-a13g-globe-performance.md#spec-only-follow-up-results)
requests Architecture direction on that exact injection boundary, without
inferring a product defect or changing the sampling algorithm.

The Architecture caller probe identifies native GlobeDepth's 9x5,
single-color/depth-stencil update as the intercepted call, before cloud
candidate creation. The
[targeted continuation](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-injection-continuation)
limits injection and cleanup counting to the actual medium cloud candidate.
No rendering or performance-policy change follows from this diagnostic.

Execution's targeted injection passes: exactly one new cloud candidate is
intercepted/cleaned, while last-good GPU objects remain live and unchanged.
[Exact result](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-execution-result--2026-09-04).
No additional diagnostic or performance observation was run; independent review
and later owner judgment remain Architecture responsibilities.

### Current-view performance and receiver-plane correction

Architecture closes A13-AR-003. One fresh same-view medium comparison across
reload measures 31.89 -> 59.80 FPS, but visual inspection and bounded GPU
readbacks identify alternating transparent reconstruction rows. Continuous
receiver slope, not missing cloud density, exceeds the new equal-distance
angular footprint test. The [A13-AR-004 evidence and design](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004--continuous-sloped-receivers-rejected-as-depth-edges)
use the local resolved-depth receiver plane with the existing storage bound;
raising a global tolerance or blurring the holes would not fix that geometry.
Execution receives only that concrete resolve/Spec correction. Existing
phase/resource budgets and shadow/history semantics remain fixed. Original
high page state is restored; sustained 60 FPS and owner visual acceptance are
still open, not inferred from the short cadence result.

Execution's exact point-to-plane implementation passes a single fixed analytic
receiver with history disabled, where the old equal-range gate recreates a
transparent untraced pixel. Retained depth edges, foreground occlusion and
history checks also pass. [Exact evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004-execution-result--2026-09-04).
No additional live observation or design change was made; Architecture must
qualify the corrected source rather than reuse the prior defective image.

Architecture independently confirms the correction and loaded final shader.
The prior comb is absent, and the same-state medium observation is 59.96 FPS
against the retained 31.89 FPS baseline. Bounded native rotation/release images
remain complete; near-view grain and subtle motion-edge quality remain owner
judgments. [Evidence and limitations](../reviews/2026-09-04-a13g-globe-performance.md#independent-candidate-3-closure-and-owner-handoff)
avoid treating short cadence or stationary diagnostic samples as universal
performance/motion proof. No further optimization is assigned before that gate.

### Owner shimmer feedback and reconstruction-first diagnosis

The owner confirms the medium performance improvement but reports stronger
shimmer. Architecture's read-only source/algebra check finds that phased tent
weights also select and weight clipping statistics. Interior four-phase
positive-support counts are 1/4/2/2; the one-sample phase makes min=max=current,
so clipping discards the historical difference regardless of nominal weight.
No live per-pixel attribution or new GPU/performance observation was made in
this diagnosis. The owner approves the bounded
[A13-AR-005 correction](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005--interpolation-support-collapses-history-statistics).

The local three-geospatial revision
`b012ad06d858fc035d88aacfd73f092f93c994e4`,
`packages/clouds/src/shaders/varianceClipping.glsl`,
uses unweighted center-plus-neighbor 5/9-sample statistics independently of
interpolation. This supports separating responsibilities, not copying its
epsilon or relaxing geometry rejection. Epic's public
[Volumetric Cloud documentation](https://dev.epicgames.com/documentation/unreal-engine/volumetric-cloud-component-in-unreal-engine?lang=en-US)
describes half-resolution tracing with full-resolution reconstruction in mode 1;
its [console-variable reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-console-variables-reference)
also exposes neighborhood-constrained reprojection and depth-aware upsampling.
These are public documented strategies, not an audit of UE's private shader
implementation or evidence that its defaults can be copied unchanged.

Two secondary checks remain Architecture-owned: actual per-pixel effective
history after stochastic mean/front compatibility, and whether selecting
every fourth slice for a pixel parity preserves the intended STBN temporal
behavior. Neither is a confirmed cause or an authorized sequence/tolerance
change. NVIDIA's [STBN explanation](https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/)
supports temporal accumulation as a sampling strategy, not a guarantee for
this subsampled schedule. First correct statistical support while freezing
phase/STBN, cloud shape, sampling budget and history policy; then Architecture
checks cost and residual motion quality. No stronger weight or detail reduction
is substituted for a diagnosed correction.

### A13-AR-005 bounded execution

The compiled four-phase witness confirms the diagnosed support collapse:
unit-count qualified statistics retain history on the aligned phase, whereas
restoring only the old tent statistics returns current color. History-off
spatial output is identical and incompatible zero-tent data is excluded.
[Execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-execution-result--2026-09-04)
records the bounded change. Extra qualification ALU has not been measured here;
this establishes neither total shimmer attribution nor retained FPS.

Architecture independently approves the correction and its GPU evidence. The
[fresh-page observation](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-independent-review-and-bounded-live-observation)
records 53.70 FPS at 1600x900/high Sun/Natural Earth II, which is not a controlled
comparison with the earlier 59.96 FPS state. Visible clouds remain complete,
but static screenshots and post-render stationary diagnostics cannot establish
live effective history or absence of dynamic shimmer. These remain explicit
Architecture questions, not an unbounded Execution optimization assignment.

## Medium-only horizontal gaps: precise current depth

Architecture independently closes this correction after source review and
corrected-product browser inspection; the
[closure](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-independent-review-and-corrected-source-observation)
records complete clouds in the failure view and the first native rotation
frame, with actual continuous reprojection. One restored-view observation is
59.96 FPS; it is not a sustained/all-view guarantee. The original page state
is restored, Execution holds and owner quality/performance remains pending.

Architecture independently reproduces the owner's new strip artifact with a
9000 m, -0.3 rad oblique camera and history weight zero. Raw current cloud
samples are finite and present, but spatial resolve clears most corresponding
pixels. The low/full stages disagree by about 168 m on the same receiver at
23 km, despite using the same texture, native projection and phase. Their
near=0.1 m / far approximately 708 km projection makes reverse-log-to-normal
depth followed by inverse projection lose precision. The
[A13-AR-006 record](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006--lossy-log-depth-round-trip-erases-medium-clouds)
contains the bounded buffer comparison and cleanup details.

Native `windowToEyeCoordinates.glsl` documents its raw-depth `(vec2, float)`
overload as more precise and directly replaces homogeneous w with inverse
decoded camera distance. A temporary GPU counterfactual using it in the two
phased consumers eliminates the diagnosed holes without relaxed depth gates,
extra history, higher resolution or a sampling change. The native vertex
layout/builtin dependency must be retained when constructing such a diagnostic.

The resulting assignment is a precise two-shader correction, not another
temporal-noise experiment. The regression must exercise Perspective log depth
at the actual small-near/long-range scale and compare against an independent
analytic endpoint. The old fixture's near=100 m misses that scale; its forced
Orthographic/log pair is not a reachable native encoding and is replaced by
Orthographic linear depth plus the new Perspective log witness. Other tiers,
Planar, resources, thresholds and all prior fixed findings remain frozen.
No FPS conclusion is drawn from paused/manual diagnostic renders. Architecture
owns later cost/visual verification; Execution receives only concrete coding
and focused validation. The original page state has been restored.

### A13-AR-006 bounded execution

The product phased producer/resolve now use the native precise raw-depth
overloads in accordance with ADR-0043. One fixed analytic small-near/long-range
GPU witness retains complete current cloud support and rejects the former
expressions; Orthographic coverage uses its native linear encoding. See
[execution evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-execution-result--2026-09-04).
No tolerance, temporal/noise policy, resource or browser change accompanies
this correction. Execution makes no new visual or performance claim.

## UE comparison and current-view stochastic depth rejection

The owner requests further grain analysis using a UE screenshot as the visual
reference. The [A13-AR-007 diagnostic](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007--stochastic-cloud-depth-rejects-stationary-history)
measures the current medium scene, not the earlier ground-view crop: four
stationary phases retain color history for only 41.2-44.0% of valid cloud
pixels. Most rejection is isolated to stochastic mean/front distance while
the actual receiver check passes. This supplies the per-pixel evidence that
the earlier secondary hypothesis lacked; it does not attribute every visible
detail to temporal noise or reopen the fixed statistics/depth-strip findings.

Epic's public [Volumetric Cloud documentation](https://dev.epicgames.com/documentation/unreal-engine/volumetric-cloud-component-in-unreal-engine?lang=en-US)
describes separate trace/reconstruct/upsample stages. Its
[console-variable reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-console-variables-reference)
documents bilateral upsampling and explicitly warns that approximating a
volume as a single cloud front can create reprojection errors; disabling
near-cloud reprojection increases noise. These public policies support
separating noisy volume estimates from hard scene geometry. They do not
identify the supplied image's settings or constitute a private UE shader
audit. Volumetric Fog settings must not be attributed to Volumetric Clouds.

The pinned local three-geospatial source remains
`b012ad06d858fc035d88aacfd73f092f93c994e4`. In
`packages/clouds/src/shaders/cloudsResolve.frag`, full-resolution TAA selects
velocity from a closest current neighbor, reprojects, clips color, then mixes
with temporalAlpha 0.1. It does not sample a previous mean/front attachment or
apply this product's binary16-only cloud-point equality test. Its 4x4 upscale
path instead publishes traced current texels directly and fills other texels
with clipped history; `CloudsResolveMaterial.ts` supplies varianceGamma 2 for
that path. These are different protocols and quality/ghosting tradeoffs, not
permission to copy constants or drop Cesium terrain occlusion guards.

Architecture's next design separates strict opaque depth/disocclusion from
sampling-aware cloud history confidence. Restore meaningful temporal reuse
before deciding whether residual grain warrants an edge-preserving spatial
filter. The existing phase schedule, ray budget, cloud material/lighting,
0.9/0.82 weights, shadow behavior, resources and Planar stay frozen while the
proposal is developed. No policy amendment or coding assignment is issued.

## Local UE5.2 source audit and A13-AR-007 decision

After owner approval, Architecture reads the supplied local source.
`Engine/Build/Build.version` declares 5.2.0; this copy has no Git metadata,
so an exact Epic commit is unavailable. The screenshot's renderer settings
remain unknown. Graph discovery/indexing is limited to the Renderer subtree;
the mapped HLSL is inspected directly. No UE code or asset is copied.

Source anchors relative to the reference root:

- `Engine/Source/Runtime/Renderer/Private/VolumetricRenderTarget.cpp`,
  `FReconstructVolumetricRenderTargetPS` and
  `ReconstructVolumetricRenderTarget`: maps the shader below; defaults are
  mode 0, upsampling mode 4 and reprojection-box constraint disabled. In this
  actual 5.2 source, modes 1/3 skip this reconstruction pass; older help text
  about half-trace/full-reconstruction is not an exact pass map for all modes.
- `Engine/Shaders/Private/VolumetricRenderTarget.usf`,
  `ReconstructVolumetricRenderTargetPS`: approximate current cloud-front depth
  drives previous projection. Cloud-front and opaque scene depths are distinct.
  Non-minmax history rejection compares receiver/scene depth, with a current
  neighbor fallback at disagreement, rather than demanding old/new cloud front
  and opacity-weighted mean agree within storage precision. Mode/minmax paths
  differ; their kilometre/percentage thresholds are not adopted here.
- The optional reprojection box constraint clamps to current neighbors; it
  must not be described as universally enabled. `ComposeVolumetricRTOverScenePS`
  uses depth-aware upsampling, with smooth bilinear sampling away from depth
  edges and bilateral weighting near them in mode 4. Some modes explicitly
  rely on downstream TAA; SceneGIS does not inherit that pipeline or cost.

The applicable design principle is to preserve opaque occlusion while treating
cloud depth as an estimator, not a hard surface. Architecture selects the
[ADR-0048 sampling-support amendment](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md#a13-stochastic-cloud-depth-support-a13-ar-007)
for medium only. Current eligible cloud-neighbor extrema and the unchanged
producer jitter span define longitudinal mean/front support; the selected
previous ray retains a separate mean-coordinate guard. Scene depth and cloud
foreground remain strict and do not inherit that uncertainty. Stationary and
moving frames use the same model, existing advection and current-domain xyz.

This is an independent adaptation to SceneGIS's two-attachment protocol, not
an exact UE algorithm or a formal bound on all stochastic volume errors. It
does not remove depth validity, copy history-only holes, enlarge weights or
add a spatial denoiser. Remaining risks are stale volume-color reuse inside
a broad support interval, residual grain and added ALU cost. The
[bounded assignment](../plans/2026-09-04-phase-a13g-globe-performance.md#current-assignment-a13-ar-007-cloud-depth-support)
requires a real product-estimator witness plus controlled color/occlusion
oracles; Architecture keeps live analysis and review. No new browser or
performance observation accompanies this source-only decision.

### A13-AR-007 bounded execution evidence

The assigned current-ray support model is implemented without copying UE code
or changing the producer. Fixed nonuniform volume inputs exercise the actual
progressive stochastic estimator in the existing GPU fixture. A separate known
color oracle verifies error reduction and clipped blending, while the old point
gate loses the aligned-phase benefit. Qualified zero-tent support does not
relax finite receiver occlusion. See
[execution record](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-execution-result--2026-09-04).
This is not UE equivalence, whole-image denoising or a performance conclusion;
Architecture retains the live grain/ghosting/cost assessment.

### A13-AR-007 independent result and remaining limit

Architecture confirms the assigned implementation and existing GPU oracles.
On corrected source with the original current view restored, real per-pixel
history reuse is 96.08-96.34%; evaluating only the old cloud point gate on the
same inputs gives 41.07-43.98%. Current/previous validity and opaque scene
conditions are not relaxed. Static appearance is visibly smoother, supporting
the diagnosed stochastic-depth rejection as a material source of grain.

The [independent review](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-independent-review-and-live-observation)
records exact counts, paired short cadence, raw finite data and cleanup. The
native cut and continuous-rotation first frames show complete cloud bodies
without the former horizontal gaps, but retain more grain than the stationary
image. Global mode/nominal weight is not evidence of per-pixel reuse during
motion; that separate attribution was not measured. No UE-equivalence,
no-ghosting or sustained-performance claim is made. Further motion analysis
remains Architecture-owned if required; Execution receives no new task.
