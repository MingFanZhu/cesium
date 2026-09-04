# Phase Plan: A13-G Globe Performance

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; A13-AR-001..007 fixed; owner gate passed`
- Created / updated: `2026-09-04`
- Diagnosis / design owner: Architecture Agent
- Implementation owner: Execution Agent, current candidate 3 only
- Reviewer role: Architecture Agent
- Branch: `feature/atmosphere-clouds-effects`
- Frozen product predecessor: A12-G `fd868387d4c38d6faf67a9395434cc9fccc6384c`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Discussion: [performance source discovery](../discussions/2026-09-04-a13g-globe-performance-source-discovery.md)
- Review: [A13-G review](../reviews/2026-09-04-a13g-globe-performance.md)
- Governing decisions: ADR-0040, ADR-0046, ADR-0047, ADR-0048, ADR-0049, ADR-0053
- Upstream / generated / new SGP delta: `0; SGP-0008/0009 consume only`

## Goal and entry gate

The owner accepted A12's current grain strength and requested performance
investigation. Keep that image-quality baseline, including cloud structure,
internal lighting, terrain depth, fixed-world cloud shadows, low-angle light,
night/Moon behavior and the accepted temporal resolve. A12 is independently
committed before this phase starts. P1 remains deferred.

The first work is Architecture-owned diagnosis, not an Execution assignment
or permission to trade quality for speed. The initial diagnostic delegation
was withdrawn following the owner's explicit role clarification; Execution
confirmed it made no edits or tests before the later concrete FPS and
candidate-1 assignments.
Do not change resolution, primary/secondary samples, noise, material, lighting,
history weights, temporal cadence or public defaults to manufacture a gain.
The later owner-approved candidate-3 assignment explicitly permits its bounded
medium raster/reconstruction change under ADR-0048; other prohibitions remain.

## Confirmed starting facts

The linked discussion records current-source locations and the bounded live
baseline. Globe medium/high render clouds at full input resolution; their
progressive march cap is 500, not the historical 64-step uniform grid. The
active high path also performs local light/ground sampling and atlas queries.
Cloud resolve is full resolution. Beer producer cascades and its temporal
resolve are distinct from the native geometry ShadowMap. Bloom performs six
half-resolution blur executions in addition to threshold and composite.

The current page is high/mixed with OSM Buildings. The same-session isolation
bracket is 29.09/28.62 frames/s: Bloom/lens disabled 29.27, shadows/rays
disabled 35.26, clouds disabled 57.16. A separate earlier short CPU profile
does not show continuous main-thread saturation. These short windows identify
cloud-dependent work as the leading family, not individual GPU pass times.
The discussion records exact state, restoration and uncertainty.

Architecture's recommended first candidate is an exact-zero weather early
return in the shared Globe density helper, preserving all sample locations,
filtering, positive densities and step advancement. A second candidate is
resource-invariant bypass of ineffective positive-only occupancy queries,
retaining height rejection and the general custom-resource path. Both have
source-backed boundaries in the discussion. The owner approved candidate 1;
the exact coding assignment below now applies. Candidate 2 remains unassigned.

## Architecture work: source-backed cost diagnosis

1. Trace actual controller publication, background/Beer, Cloud MRT/resolve,
   aerial/fog and Bloom call paths from current source. Separate CPU work,
   GPU command executions, pixel dimensions, texture dependencies and
   persistent allocations. Count executed work, not merely command objects.
   Include native geometry shadows as a separate consumer, not a Beer alias.
2. Inspect the dominant cloud/Beer shader paths: primary traversal,
   conservative empty-space tests, density/noise evaluation, local light and
   ground rays, shadow queries and view-ray shadow length. Identify repeated
   calculation or unnecessary work with exact dependency reasoning. Existing
   early termination and frame/time caches must be acknowledged, not proposed
   as if absent. Caps are upper bounds, not measured iterations.
3. Consult the existing pinned three-geospatial source where it informs those
   paths. Confirm the reference revision and actual implementation; explain
   sampling/resolution/temporal differences instead of attributing any speed
   to an unmeasured reference FPS. No copying or asset replacement is assigned.
4. Develop at most three ranked candidates. Each needs source evidence,
   measured versus inferred benefit, semantic dependencies, invalidation and
   resource implications, smallest affected paths, and a minimal correctness
   plus cost witness. Rank truly equivalent work removal before quality
   tradeoffs. Any atlas reuse must account for world coverage, light,
   cloud motion/material, noise phase and temporal-history evolution.
5. Propose the smallest next measurement that would distinguish the leading
   hypothesis. No GPU-time assertion may come from JavaScript submission
   timing, FPS, `gl.finish`, readback latency or configured step count. Do not
   add profiling infrastructure merely because per-pass timing is unavailable.

Architecture records its analysis and selects a concrete optimization, then
amends this plan and sends an explicit coding/validation assignment before
Execution starts product work. Execution does not own this diagnosis.

## Scope and ownership

The owner additionally requests Cesium's native FPS display on the Globe test
page. A concrete implementation exception permits only
`viewer.scene.debugShowFramesPerSecond = true` in the existing Viewer setup
in `Test/AdvancedEnvironment/globe.js`. Keep native display/lifecycle behavior;
no custom counter, timer, GUI, render-loop or product change. Execution handles
that bounded coding task and its scoped ESLint/Prettier/diff checks, while
Architecture owns live verification and all performance analysis. No GPU suite
is needed for assembling this existing debug-display API.

Read-only inspection may cover current SceneGIS environment source/Specs,
related Cesium callers and renderer abstractions, build/test entry points,
existing Test assembly and the local pinned reference. Use graph discovery
first; its stale snippets must be checked against current source.

Architecture maintains these diagnostic records:

- This phase plan and its linked discussion/review.
- Extension README/current handoff and extension plan status writeback.

Except for the retained native FPS/candidate-1 changes and the exact current
candidate-2 assignment below, product JS/GLSL, Specs, Test executable/UI,
assets/importers, dependencies, build/package configuration, upstream files,
SGP manifests and generated outputs are frozen. No runtime monkey patch,
raw `Context._gl`, PBO, new
timer/readback resource, persistent profiler or new benchmark framework.
No unrelated product implementation, push, next phase or Planar work. Architecture may
create documentation checkpoints under the existing role protocol.

Architecture owns source/reference investigation, performance measurement and
the current accessible browser observation. Execution has no active analysis
or browser assignment. The existing baseline is diagnostic evidence, not a
replacement for future optimization comparison.

## Approved implementation assignment — 2026-09-04

### Base and retained tree

- Extension/phase: `atmosphere-clouds-effects` / `A13-G`.
- Branch: `feature/atmosphere-clouds-effects`.
- Exact base HEAD: `8aa5508e132a192ce0eecb80e27559b3f71734c0`.
- Frozen product predecessor: `fd868387d4c38d6faf67a9395434cc9fccc6384c`.
- Preserve the shared dirty tree: the accepted one-line Test FPS change,
  two role-record changes and five active extension records. Do not reset,
  stage, commit or push them. No engine product or Spec edit predates this
  assignment in the current diff.

### Exact behavior and allowed executable paths

1. `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.glsl`:
   only amend `sceneGISGlobeCloudDensitySampleInternal`, immediately after
   its existing weather/layer loop and before `bottomWeights`, turbulence,
   evolution, shape and detail work. When
   `all(equal(weatherDensity, vec4(0.0)))`, assign
   `activeLayerHeightGradient = 0.5` and return `0.0`. This exact-zero
   predicate is intentional. No epsilon, threshold, nonpositive/invalid-input
   catch-all or changed material calculation is authorized. Keep the positive
   path byte-for-byte where practical; a short English rationale is permitted.
2. `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`:
   amend the existing `keeps compiled coverage monotonic and isolates material
density from extinction` fixture and only the same-file test helper needed
   by that amendment. Add one bounded controlled actual-GPU comparison of the
   compiled product density helper with a retained full-evaluation variant
   made by removing only this new early-return block in Spec source. Cover
   exact-empty weather, positive weather, mixed empty/positive neighboring
   pixels and the shadow-layer-only entry. Preserve existing Planar and
   coverage/extinction assertions. Include a controlled small positive case
   so a newly invented density threshold would not be accepted; derive it
   from the existing remap, not a parameter search. Confirm zero density and
   gradient `0.5`, unchanged positive outputs and relevant MRT semantics.

The old full-evaluation variant is an equivalence oracle: it is expected to
produce the same result, not fail. Do not invent a visible-output mutation
failure or a timing threshold to prove that dead work is removed. The branch
location plus the compiled equivalence test is the direct witness. Use existing
Spec GPU facilities, and destroy temporary test programs/textures in the
fixture's normal cleanup. No new standalone fixture, product diagnostic
branch, counter, retry loop, readback framework or matrix.

The common helper must continue serving primary cloud, local Sun/ground and
Beer shadow-layer density. Preserve base-level LINEAR shape/detail sampling,
explicit weather/turbulence LOD, all positive densities, sample positions,
progressive advancement, opacity integration, depth, distances, cloud shadow
projection, Sun/Moon lighting and A12 temporal history. Do not change occupancy
queries, step count/length, quality, noise, assets, radiometry or filtering.

Renderer/controller JS, every other GLSL, Test files, public API/default/range,
uniforms, resource/caching/lifecycle code, Planar and candidate 2 are frozen.
Expected program-category/command/texture/FBO/history/GPU-byte deltas are zero.
Existing errors remain unchanged; there is no new fallback. ADR-0046/0048 and
the other listed decisions are consumed unchanged: this eliminates equivalent
work, not a new material, performance budget or architecture contract.
Upstream-owned changes and new SGP are zero; SGP-0008/0009 remain untouched.

### Exact execution validation

Run sequentially on the final candidate:

1. `npm run test -- --includeName "keeps compiled coverage monotonic and isolates material density from extinction"`
   for the amended helper/coverage/Planar equivalence witness and cleanup.
2. `npm run test -- --includeName "marches controlled cloud density into the bounded Beer atlas on the actual GPU"`
   for the existing producer consumer of the same helper; do not amend this
   fixture or expand its cases for this assignment.
3. Scoped ESLint on the changed Spec; Prettier on that Spec and the five
   active extension records using `--ignore-path .gitignore`; Markdownlint
   on those records; `git diff --check`.

`package.json` routes `npm run test` to `gulp test`; the existing engine
build converts GLSL to modules through `scripts/build.js` `glslToJavaScript`.
Use that normal test/build chain. Never edit or commit generated Shader JS,
barrels, Spec lists or Build outputs. No controller aggregate, pipeline
aggregate, full suite, package verifier, generator sweep or type/build-release
matrix is authorized: there is no API/resource/build contract change.

If the narrow change or equivalence cannot be demonstrated under these
contracts, stop and report the concrete cause to Architecture; do not choose
an alternate optimization, change texture filtering or broaden the diagnosis.

### Architecture measurement, records and stop

Architecture retains source diagnosis, before/after performance measurement,
independent code review and manual visual verification. Execution must not
reload or operate the owner's open page, alter its state, restart its server,
run browser performance isolation or infer owner acceptance. Keeping the
existing loaded page permits Architecture to measure the old live program
before requesting the updated bundle; verify that source/state relationship
at review time, then use one matching-workload bounded comparison. Report
frame-cadence variance and do not call it GPU pass timing or promise speedup.

Execution writes implementation details, exact command outcomes, deviations,
ownership/resource audit and pending measurement into the existing A13 plan,
discussion and review, extension README/current handoff and extension roadmap.
Do not overwrite Architecture's measurements or role records. Send a proactive
`review_ready` report and stop **uncommitted/unpushed**, with Architecture
review, performance/visual gate and A13 checkpoint still pending. No next phase
or Planar action. The owner approved implementation, not the unseen result.

## Validation and subsequent gate

The completed diagnosis/native FPS step used scoped Prettier, Markdownlint,
`git diff --check`, Test ESLint and live native display verification without
GPU/controller/package/build/type suites. Candidate 1 now uses the two exact
GPU commands and static checks specified in its assignment above. Review
checks source accuracy, equivalence, risk and whether the proposed measurement
can actually discriminate the hypothesis.

Architecture separately performs the bounded before/after comparison under
matching workload conditions and independent visual review, then seeks owner
judgment where needed. Matching performance workload is not a renewed same-view
cloud-noise acceptance gate.
No absolute cross-device FPS target or expected speedup is promised.

## Exit conditions

Satisfied on 2026-09-04: Architecture has independently approved all seven
findings and the owner accepts the corrected quality/performance result.
Existing GPU, lifecycle and bounded live observations are sufficient; no
additional product test or browser run is required for this status closure.
Architecture creates the independent local A13 checkpoint without push.
The newly reported cloud/Cesium-clock linkage is excluded from this phase.
The earlier pending-gate records below remain as historical evidence.

Diagnosis alone does not complete A13-G optimization. The phase can close
after a reviewed evidence-backed bounded change, adequate correctness/cost
evidence and required owner acceptance, or after the owner explicitly accepts
a diagnostic-only conclusion. Candidate 1 has code approval and a bounded
observed high-tier benefit; the expanded medium objective and owner gate
remain open. A13 completion is not claimed.

## Current gate after candidate-1 review

Candidate 1 has passed Architecture code review and its two assigned GPU
fixtures. Independent same-view observations recorded high 50.62 to 60.04 FPS;
medium remained approximately 60 FPS before and after. The owner requested
medium near 60 FPS as the optimization target. One additional fixed 30° look-up
with more cloud coverage measured candidate medium at 32.61 FPS, so the broader
objective remains open. Exact evidence, scene restoration and short-window
limitations are in the discussion/review; no universal FPS or owner acceptance
is inferred.

Architecture resumes targeted analysis of the medium cloud-heavier workload
at the current `1433 x 1150` buffer. Preserve accepted image quality and the
candidate-1 change. No new Execution task is active; candidate 2 or any tier,
resolution, sampling, atlas/history or resource change requires a separately
defined assignment after analysis. The current old-view/high state has been
restored for the owner, and A13 remains uncommitted/unpushed and incomplete.

## Follow-up design direction after industry comparison

Architecture confirmed the pinned three reference defaults to 4x4/16-phase
sparse cloud tracing and full-size temporal reconstruction, whereas our medium
traces the complete pixel domain before A12 denoising. Reference medium also
disables or approximates several lighting/detail features that the owner keeps
enabled here. The linked discussion records exact sources and primary
Guerrilla/Epic publications; a tier name is not a comparable performance budget.

Candidate 1 stays code-approved. Candidate 2 remains unassigned equivalent
occupancy-query removal with a per-resource positive-only proof and preserved
height/custom-resource behavior. Candidate 3 is now recorded only for design:
medium 2x2 phased, half-width/half-height tracing plus full-resolution,
depth-aware temporal reconstruction. It must preserve first-frame/cut
completeness, mean/front/scene distance domains, independent shadow-length
semantics, lighting and world-space projection. Keep high and Planar unchanged.
Reducing dimensions alone or copying reference shadow-history approximations
is not an acceptable implementation. Resource/lifecycle and ADR implications
must be resolved before authorizing source changes; the existing frozen
resolution/sampling boundary still applies in this turn.

The attempted new cloud-heavier cadence observation was unusable: the native
page already ran near a one-second cadence before the test, and only one frame
was observed in the bounded window. No cause, GPU time, or regression is
inferred. Architecture stopped before the planned effect isolation and restored
the saved owner state. Use the previously recorded valid measurements until
representative presentation is available; no retry/benchmark machinery or
Execution diagnostic assignment is authorized. The next work remains
Architecture design/owner direction, not A13 acceptance or a new phase.

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

## Owner authorization and staged execution — 2026-09-04

The owner approved both follow-up steps: candidate 2 removes ineffective
occupancy queries; candidate 3 introduces medium 2x2 phased cloud tracing with
full-resolution reconstruction. This is implementation-direction approval,
not visual acceptance, a 60 FPS guarantee, or approval to drop lighting/detail.
Both remain inside A13-G. Candidate 1 remains code-approved and preserved.

Execution implements candidate 2 under the assignment below, reports
`review_ready`, and stops. Architecture owns candidate-2 review/performance
measurement and the remaining candidate-3 depth/history/resource design.
Candidate 3 receives a separate concrete assignment after that design and
candidate-2 code closure; do not mix both product diffs before the first review.
The owner need not repeat the same two-step authorization. A13 checkpoint and
owner gate remain pending until the combined outcome is qualified.

### Current assignment: candidate 2, resource-proven occupancy bypass

Base: `feature/atmosphere-clouds-effects` at
`8aa5508e132a192ce0eecb80e27559b3f71734c0`, retaining all shared dirty changes.
Frozen A12 remains `fd868387d4c38d6faf67a9395434cc9fccc6384c`. No index,
checkout, commit, push, server restart or owner-page operation is assigned.

The source-backed chain is `createCloudOccupancySource` ->
`createCloudOccupancyTexture3D` -> `createResources` -> `publishResources` ->
the existing renderer uniform map -> `sceneGISCloudOccupancyBound`. The graph
has stale source offsets; inspect current function bodies before editing.
Globe's R8 base values are copied verbatim and every explicit mip is a padded
maximum reduction. All-positive R8 data therefore makes every sampled max cell
positive. The current GLSL uses only the exact-zero classification for Globe;
height rejection remains useful. This is the reason for the bypass, not a
hardcoded assumption about the default asset's filename or minimum value.

Allowed executable files:

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`

Required implementation:

1. During the existing base-level construction loop, determine whether the
   input is R8 and every copied value is strictly greater than zero. One zero
   makes the result false; byte value 1 remains positive. Non-R8/Planar data
   is never eligible for this Globe bypass. Do not add another volume scan,
   asset hash, hardcoded URL check, threshold, mip change or retained buffer.
2. Carry that boolean through the file-local creation result and store it
   beside `candidate.cloudOccupancyTexture` on the SceneGIS resource record.
   Do not attach metadata to Cesium Texture3D, change its prototype or add a
   public option. The texture helper may return `{ texture, allPositive }`
   while its source result carries the derived boolean. Keep the original
   texture/mip allocation, upload and destruction behavior.
3. Publish the flag only through the existing successful candidate/current
   swap. Expose one private Globe boolean uniform, suggested
   `u_cloudOccupancyAllPositive`, from the current resource record. Warm
   property changes must neither rescan data nor mutate the proof. Resource
   replacement recomputes it, failed candidates retain the old proof/texture,
   and disable/destroy follows existing generation ownership. Do not add a
   registry, separate cache, generation counter or fallback/error policy.
4. Declare the uniform under `SCENEGIS_GLOBE` in the existing shared cloud
   library. Within `sceneGISCloudOccupancyBound`, preserve actual
   start/end/middle height reconstruction and existing active-layer/height
   tests. After the first layer passes those tests, a true flag may return
   `1.0` before query-only position/offset/scale/LOD/texture work. No eligible
   layer still returns `0.0`. A false flag follows the existing calculation;
   the Planar algorithm and thresholds remain unchanged. Arrange texture-only
   work so the true path actually omits it, not merely the texture fetch.

No density, visibility, interval advancement, step count/length, ray position,
filter, quality/resolution, frame jitter, radiometry, Sun/Moon, terrain depth,
cloud/world-shadow projection, packing or A12 history change. Preserve
candidate 1 in `SceneGISGlobeClouds.glsl` without editing that file. No removal
of the occupancy texture or its mips: custom data still needs the general path.
Expected persistent GPU bytes/resources/program categories/commands/passes/
textures/FBOs/history delta is zero; CPU state adds one resource-owned boolean
and shader input adds one private boolean. No public API/default/range delta.

### Candidate-2 minimum validation

Amend existing fixtures, not a new test framework:

- `uploads conservative occupancy mips and matches exhaustive density support`:
  preserve existing Globe/Planar mip and thin-support assertions. Add bounded
  checks of actual published proof/uniform for positive R8 (including value 1),
  zero-containing R8 and noneligible Planar, including replacement in both
  directions. Probe the compiled occupancy helper for a height-overlapping
  interval and intervals wholly outside the active layers. On eligible data,
  compare against a Spec-only forced-query/full-evaluation variant: bounds
  must match exactly. Retain the existing thin-data integrated MRT comparison
  on the false path. Prove branch placement through source/code review;
  equivalent output is expected and is not a required mutation failure.
- `destroys candidate 3D textures when cloud mip generation fails`:
  retain its original Planar checks. Add one bounded Globe replacement failure
  after candidate occupancy creation, using the existing Texture 2D
  `generateMipmap` failure seam in weather creation. Start with a published
  positive proof and attempt zero-containing data. Assert old resource/flag/
  uniform identity survives, old resources remain live, and new allocations
  are cleaned through the existing ownership path. Restore spies and destroy
  temporary resources with the fixture's normal cleanup.

Only necessary same-file helpers/uniform wiring may change; retain existing
assertions and test meanings. Do not introduce GPU counters, raw GL, PBO,
production diagnostic branches, replay loops, image hashes, retries, parameter
sweeps or FPS gates. These two fixtures cover equivalence, custom/Planar
behavior, resource replacement and failure atomicity.

Run sequentially on final source:

1. `npm run test -- --includeName "uploads conservative occupancy mips and matches exhaustive density support"`
2. `npm run test -- --includeName "destroys candidate 3D textures when cloud mip generation fails"`
3. Focused ESLint on renderer/Spec; Prettier on the three executable files,
   five active extension records and amended ADR-0046 (explicit
   `--ignore-path .gitignore` for records); Markdownlint on those six Markdown
   records; `git diff --check`.

The normal `gulp test`/`scripts/build.js` shader generation is the only build
path. Never edit/commit generated shader modules, barrels, Spec lists or Build
outputs. No aggregate/controller/pipeline/Beer/GPU matrix, package verifier,
full build/type/release run is needed for this private, count-preserving change.
If the exact source proof or existing fixture boundary is insufficient, report
the specific blocker to Architecture instead of broadening implementation.

### Candidate-2 records and stop

ADR-0046's A13 amendment governs the resource proof. ADR-0048/0047/0053 are
consumed unchanged; candidate 3 will require its own temporal-policy amendment.
All allowed paths are SceneGIS-owned. Upstream-owned changed/new SGP are zero;
SGP-0008/0009 and their existing upstream paths remain untouched.

Execution writes exact implementation/validation/deviation/audit results into
the current A13 plan, discussion and review, extension README/current handoff,
extension roadmap and ADR-0046. Do not overwrite Architecture's measured
evidence or candidate-3 design. Send a proactive `review_ready` report and stop
uncommitted/unpushed. Architecture independently reviews the complete diff and
owns subsequent representative performance and visual observation; the previous
one-frame browser window must not be treated as a baseline. No owner acceptance,
checkpoint, candidate-3 code, next phase or Planar work is inferred.

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

## Current assignment: candidate 3 — medium phased tracing

Candidate 2 has independent code approval with no finding. Its restored-view
35.86/36.24 FPS comparison is inconclusive, so the medium 60 FPS objective
remains open. The owner already authorized this second direction. The following
is now the only active coding assignment; earlier candidate-1/2 assignments are
completed and their changes must be preserved.

Base is the retained `feature/atmosphere-clouds-effects` checkout at
`8aa5508e132a192ce0eecb80e27559b3f71734c0`, with the entire shared dirty candidate.
A12 `fd868387d4c38d6faf67a9395434cc9fccc6384c` remains frozen. No index operation,
commit, push, service restart or owner-page manipulation is assigned.

### Approved source design and executable paths

Read the complete new A13 amendment in ADR-0048: its coordinate, depth,
interpolation, history and resource formulas are the implementation contract.
ADR-0046's candidate-2 proof and all accepted cloud material/light/Beer policies
remain unchanged. The source chain is `executeHdr -> executeCloudPass ->
executeCloudResolve -> commitCloudHistorySnapshot`; graph offsets are stale,
so verify current bodies. Existing shader generation/test entry remains
`gulp test` through `scripts/build.js`, never hand-edited generated modules.

Executable allowlist:

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`

Implement the following as one bounded candidate:

1. Change only medium `globeScale` to 0.5. One private boolean, suggested
   `u_cloudTracePhased`, is true only for Globe medium. Reuse the existing
   `u_cloudStbnSlice` callback in resolve as well as CloudFS; derive phase from
   its native-frame slice, not a second counter. Keep existing target allocation,
   warm lifecycle, global history invalidation and successful-snapshot timing.
2. Put the small phase/full-pixel mapping helper in the shared volumetric cloud
   library under `SCENEGIS_GLOBE`. Use offsets `(0,0),(1,1),(1,0),(0,1)` from
   slice modulo four, clamp actual full indices for odd/one-pixel dimensions,
   and use that helper in producer and resolve. No camera/projection mutation.
3. Medium CloudFS obtains depth, explicit ray, STBN coordinate and geometry clip
   from the same actual full sample. Its z output is current scene distance even
   when cloud validity is false. Preserve the existing 1,000,000 m encoding and
   exact raw 0/1 authority. Use full output dimensions for per-ray angular/origin
   footprint; retain the existing material derivative helper and actual current/
   resolved dimension inputs. Do not edit `SceneGISGlobeClouds.glsl`.
4. Add the medium-only phase-aware spatial reconstruction described in ADR-0048:
   existing 3x3 color/distance taps, explicit source-depth eligibility, tent
   weights, source-to-target mean/front conversion, target-owned scene z,
   independently decoded shadow length and finite moments. Reject depth-class
   changes and incompatible endpoints using the prescribed sampling footprint,
   not a new hand-tuned depth threshold. Cloud endpoints behind the target
   receiver cannot contribute. Empty support yields the specified neutral
   current record, never borrowed history. Legacy paths retain their kernel.
5. For medium history, sample/reconstruct the actual full-history texel center
   after in-bounds projection. Add only the analytically defined full-history
   half-pixel footprint to the existing binary16 position tolerance, because
   those coordinates are quantized by NEAREST sampling. Do not add the low-grid
   footprint or enlarge continuity limits. Retain mean/front/scene semantic
   checks, independent shadow-length rules, A12 variance clipping and weights.
   Publish current-domain xyz and never blend packed alpha. Invalid/cut history
   is not sampled, and every output pixel is written immediately.

The existing medium already has turbulence disabled; preserve that fact rather
than claiming a new optimization. Detail, 500-step optical march, Sun/Moon,
local/ground lighting, cloud density/form, world-space Beer projection/history,
view-shadow integration, height fog, Aerial and Bloom policies are frozen.
High/low/Planar and every public option/default/range remain unchanged. No new
asset, dependency, controller protocol, GPU readback, profiler, render request,
native-camera jitter, automatic tier, warm-up or settling/convergence loop.

### Resource and cost accounting

The same current two-attachment manager is half-width/half-height only for
medium; both resolved histories stay full size. Persistent texture/FBO/manager/
attachment/history/program-category/command/pass counts are unchanged. The
current target becomes `16*ceil(W/2)*ceil(H/2)` bytes; histories remain `32*W*H`.
At 1433x1150, primary pixel count is 412,275 instead of 1,647,950; current MRT
saves 19,770,800 bytes. This is neither a fourfold FPS prediction nor a pass of
the 60 FPS goal. Extra resolve work is at most nine current raw-depth texel
reads and the bounded coordinate/eligibility ALU, with no new history lookup.

Do not add a retained full-resolution current target or another framebuffer
category for cuts. Existing candidate-first target replacement/cleanup and
error propagation remain. No added persistent CPU array, snapshot field or
phase counter; audit the one new boolean uniform and existing slice reuse.

### Minimum automated qualification

One new focused fixture is authorized, named
`reconstructs phased Globe medium clouds across depth and camera transitions`.
This is a specific product contract, not a new framework or replay harness.
Reuse existing Context, half-float, controlled-material and cleanup helpers:

- At one fixed odd full size, for example 9x5, explicitly cover all four phase
  cases. Probe compiled product coordinate/depth/ray work with a nonuniform depth
  pattern; actual sampled full indices/UV, finite clip and Perspective ray must
  agree. Include one Orthographic/log-depth witness and a one-pixel edge mapping
  assertion. A missing phase offset or old centered-grid mutation must fail.
- Uniform controlled cloud input must reconstruct the entire output immediately
  on the first invalid frame for each phase, including odd borders. Nonuniform
  mean/front input must reconstruct onto the target ray and publish the target's
  actual scene z, not averaged geometry or previous-camera distances.
- Use one finite/clear depth boundary and an all-rejected target to prove no
  behind-geometry cloud or stale history is copied. Preserve positive decoded
  shadow length on eligible invalid-cloud samples; do not interpolate its packed
  code. Changing shadow length alone must not suppress reusable cloud radiance.
- Prove nonzero, bounded stationary history reuse while phase changes, and one
  moved Perspective frame followed by one further bounded transition. Use an
  independent world-plane or equivalent nonuniform oracle, not a probe copied
  back as the sole expected result. Demonstrate a wrong-grid/same-UV mutation
  fails, and an error beyond the actual storage-plus-pixel bound is rejected.
  A single over-bound camera cut yields immediate current spatial output.

Retain the existing `isolates cloud radiance scale transitions from temporal
history` fixture and its assertions. Its legacy Globe full-resolution A6/A12
section may explicitly select high after connection, making its raster premise
clear; do not weaken its oracles or silently move all Globe tests to high.
Amend the existing `executes one lazy cloud MRT and resizes only for quality`
and `retains the last-good cloud MRT when a quality resize fails` fixtures with
bounded Globe assertions for high/medium dimensions, unchanged full histories,
one Cloud + one Resolve execution, warm resource identity and failed candidate
cleanup. Retain their original Planar checks. Necessary same-file helper wiring
is allowed; unrelated fixtures and accepted assertions are frozen.

Run only these four fixture names sequentially on final source, then scoped
renderer/Spec ESLint, supported-file Prettier, touched-record Markdownlint and
`git diff --check`. GLSL has no configured Prettier parser: use its existing
style and actual GPU compilation, not a new dependency or a false formatting
pass. Do not run an aggregate/controller/pipeline/package/type/release matrix
for this initial bounded candidate. If another contract or fixture requires
expansion, report the specific dependency to Architecture rather than weakening
an assertion or starting a broad investigation. No arbitrary thresholds,
parameter sweeps, retry/convergence loops, hashes or product diagnostic branch.

### Records, independent gate and stop

All executable paths are SceneGIS-owned; upstream-owned/generated/new-SGP
delta must stay zero. SGP-0008/0009, native Scene/Globe code and Planar remain
consume-only. Write concise actual evidence into the current review, link it
from the plan/discussion/index/roadmap, and update ADR-0048 with the exact
implementation deviation/audit, if any. Preserve prior evidence; do not paste
the same long validation transcript into every record. ADR-0046 and
Architecture.md require no Execution edits for this task.

Send proactive `review_ready`, then stop uncommitted/unpushed. Architecture
independently reviews code, repeats the representative medium cost comparison
and inspects motion/first-frame/geometry-edge quality before asking for owner
judgment. Candidate-2 equivalence is not candidate-3 visual acceptance. Do not
operate the owner browser, claim 60 FPS, create a checkpoint, or enter another
phase without the corresponding completed gate.

### Candidate 3 execution pause — 2026-09-04

The assigned implementation is retained, not qualified. The new focused GPU
fixture still exposes four NaN RGB pixels on history rejection; see the
[execution blocker](../reviews/2026-09-04-a13g-globe-performance.md#candidate-3-execution-blocker--2026-09-04).
Execution requests bounded Architecture direction at the frozen A12 clipping
boundary. Remaining three fixtures and performance/visual qualification are
not run. No owner-page operation, commit, push or next-phase work.

### A13-AR-001 correction assignment (completed)

Architecture has isolated the blocker to an inverted moment-derived variance
interval with finite inputs; see the independent
[finding and GPU evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-001--inverted-finite-variance-interval).
Execution may resume only the bounded CloudResolveFS endpoint-clamping repair
and finite/meaningful-history assertions in the existing new fixture, then
complete the four already assigned sequential fixture commands and scoped
static checks. ADR-0048 records this narrow shared-Globe A12 arithmetic
exception. No new tuning, fallback, resource, parameter, owner-page or Planar
work is approved. Retain all other candidate-3 changes and candidates 1/2.
Return proactive `review_ready` with exact results; stop uncommitted/unpushed.

A13-AR-001 is execution-fixed with finite, positive bounded motion-history
evidence. The four-command sequence is two successes and two resource-Spec
failures (missing explicit medium setup and nonexistent manager method).
[Exact results](../reviews/2026-09-04-a13g-globe-performance.md#final-focused-command-results)
request bounded follow-up; qualification, Architecture review and performance/
visual gates are not complete. Other executable paths remain untouched.

### A13-AR-002/003 initial Spec correction

Architecture has independently closed A13-AR-001. Remaining qualification is
Spec-only: explicitly select medium in the two targeted setup/cut connections,
and replace the nonexistent manager liveness calls with actual owned
framebuffer/texture liveness and candidate-cleanup assertions. The exact
[findings and assignment](../reviews/2026-09-04-a13g-globe-performance.md#current-spec-only-follow-up-assignment)
authorize changes only within the three affected fixtures in the existing
Spec. Keep all product source and unrelated tests frozen. Run those three
names sequentially; retain the unchanged legacy history success without rerun.
Scoped static checks and concise record disposition complete the handoff,
not the performance or owner gate. Return `review_ready`, uncommitted/unpushed.

The follow-up produces two passing fixtures (including actual medium cut)
and one failed candidate-cleanup spy assertion. Last-good identities/liveness
pass, but the global update injection is not proven to reach the cloud candidate.
[Exact results](../reviews/2026-09-04-a13g-globe-performance.md#spec-only-follow-up-results)
return A13-AR-003 for Architecture direction without changing product or
failure-injection scope. The legacy history pass is reused without rerun.

### A13-AR-003 targeted injection (completed)

Architecture confirms A13-AR-002 fixed. The remaining failure injection
actually intercepts native GlobeDepth's 9x5 single-color/depth-stencil manager
before cloud creation. The exact
[continuation](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-injection-continuation)
authorizes selecting only the new 5x3 two-color/no-depth cloud candidate,
delegating other manager updates and counting cleanup by candidate identity.
Only the existing failure fixture changes; all product and other tests remain
frozen. Run that one fixture and scoped static checks, reuse the three prior
successes, and return `review_ready` uncommitted/unpushed. No owner-page,
performance, checkpoint or next-phase action.

Targeted injection passes `1/1 SUCCESS` with one captured candidate update,
one identity-matched cleanup and live unchanged last-good resources. The
[execution result](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-003-targeted-execution-result--2026-09-04)
completes assigned focused evidence together with the three reused passes.
A13-AR-003 is execution-fixed pending independent review; no performance or
owner acceptance is inferred. The shared candidate remains uncommitted.

### A13-AR-004 receiver-plane compatibility (completed)

Architecture independently closes A13-AR-003. The live same-state medium
comparison is 31.89 -> 59.80 FPS, but a new reconstruction comb blocks quality
approval. The exact [diagnosis and assignment](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004--continuous-sloped-receivers-rejected-as-depth-edges)
replace the phased finite receiver's equal-distance footprint test with a
derivative-defined local point-to-plane residual, retaining the existing
storage tolerance, finite/clear and cloud-foreground gates. Only the resolve
GLSL and existing phased Spec may change. All renderer/resources, phase and
sampling budgets, temporal policy, high/low, Planar and candidates 1/2 are
frozen; zero additional texture lookups are authorized.

The fixed sloped-plane witness must reconstruct untraced visible cloud pixels
without history and reject the old metric mutation, while retaining geometry
edge checks. Run only phased and legacy-history fixtures sequentially, then
scoped static/record checks; reuse unchanged resource-fixture evidence.
Return `review_ready`, no commit/push or owner-page operation. Architecture
handles subsequent same-state cost/visual validation and the owner gate.

Execution applied the exact local plane residual without widening tolerance or
changing other gates. The fixed sloped-plane/old-rule mutation and retained
history/occlusion assertions pass; both assigned fixtures report `1/1 SUCCESS`.
[Detailed result](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-004-execution-result--2026-09-04).
Resource fixture successes are reused. A13-AR-004 awaits independent review
and corrected-source visual/cost qualification; the candidate is uncommitted.

### Prior gate: owner medium performance and visual judgment

Architecture confirms A13-AR-001..004 fixed and candidates 1/2/3 code-approved.
The corrected same-view medium result is 59.96 FPS versus 31.89 FPS before
phased tracing, with the previous horizontal comb absent. Bounded native
rotation/release inspection and its limitations are recorded in the
[independent closure](../reviews/2026-09-04-a13g-globe-performance.md#independent-candidate-3-closure-and-owner-handoff).
The four focused fixture results are sufficient and are not rerun. Original
high/page state is restored; owner review uses the existing medium control.
Execution holds without further changes. No checkpoint, push or next phase
before explicit owner acceptance; all scope/resource/SGP boundaries remain.

### Current correction: A13-AR-005 independent clipping statistics

The owner reports better medium FPS but increased shimmer and approves the
reconstruction-first fix. A13 quality is not accepted. Architecture confirms
that the interpolation tent also chooses/weights the clipping neighborhood:
the directly traced phase has one sample and clips history exactly to current.
This structural defect is not proof that it explains every visible artifact.

The [bounded assignment](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005--interpolation-support-collapses-history-statistics)
separates unweighted, geometrically qualified 3x3 clipping statistics from the
unchanged positive-tent current reconstruction. All finite/clear, receiver-plane,
cloud-foreground, shadow independence, no-support and history-semantic gates
remain. Only the resolve GLSL, the one existing phased fixture and six current
records may change. Renderer, sampling budget/phase/STBN, high/low, Planar,
weights, variance formula and resource/API boundaries stay frozen.

The fixed four-phase witness must prove actual historical contribution on the
directly traced phase, reject the old-statistics mutation, preserve history-off
spatial output and exclude geometrically rejected statistical neighbors.
Run only phased and legacy-history fixtures sequentially plus scoped static/
record checks; reuse unchanged lifecycle evidence. Execution returns
`review_ready` and stops. Architecture owns later live cost/quality checks and
any separate effective-history/STBN investigation; no open-ended diagnostic
coding, owner-page operation, checkpoint or next phase is assigned.

#### A13-AR-005 execution handoff

The authorized resolve/Spec correction is implemented: all geometrically
qualified neighbors contribute unit-count statistics, while current sums keep
their original positive tent weights and ordering. The four-phase witness
passes with actual aligned-phase history, old-statistics rejection, exact
history-off output and zero-tent geometric exclusion. See the
[execution result](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-execution-result--2026-09-04)
for final checks and the derived motion-oracle bound. No resource/sampling/API
delta or browser operation; independent quality/cost review remains pending.

#### A13-AR-005 independent closure

Architecture confirms the bounded statistics correction and discriminating
GPU oracle, without rerunning sufficient automated evidence. The
[live review](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-005-independent-review-and-bounded-live-observation)
uses a fresh 1600x900 high-Sun page and records 53.70 FPS plus bounded
rotation/release inspection. It cannot be compared directly with the prior
59.96 FPS view or certify dynamic shimmer removal. Code is approved; sustained
performance, live effective-history/noise diagnosis and owner visual judgment
remain Architecture-owned. Execution holds with no new assignment; no phase
checkpoint or next-phase work is authorized.

### Current correction: A13-AR-006 precise phased depth

Current disposition: independently fixed and code-approved; see the
[source review and live observation](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-independent-review-and-corrected-source-observation).
Both focused GPU successes are reused. The corrected oblique and first native
rotation frames have no diagnosed horizontal gaps; one original-view cadence
window measures 59.96 FPS. The browser is restored and Execution holds. This
closes the coding assignment below, not the owner's quality/performance gate;
no checkpoint or next-phase authorization follows.

Architecture has reproduced the medium-only horizontal gaps and isolated
inconsistent current depth reconstruction; see the
[finding and live evidence](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006--lossy-log-depth-round-trip-erases-medium-clouds).
The history-zero witness rules out historical color as the cause of these
gaps. The earlier near=100 m fixture misses the observed near=0.1 m precision
loss. Execution receives coding and bounded validation, not an open diagnosis.

Branch/base remain `feature/atmosphere-clouds-effects` /
`8aa5508e132a192ce0eecb80e27559b3f71734c0`, retaining the shared dirty candidate.
The assignment supersedes the hold following A13-AR-005 only as follows:

1. In `SceneGISEnvironmentEffectsCloudFS.glsl`, Globe `u_cloudTracePhased`
   passes normalized `cloudCoordinates` and the **raw** depth sample to
   `czm_screenToEyeCoordinates(vec2, float)`. In
   `SceneGISEnvironmentEffectsCloudResolveFS.glsl`, the same phased branch
   passes `gl_FragCoord.xy` and raw depth to
   `czm_windowToEyeCoordinates(vec2, float)`. Do not pass `czm_readDepth` or
   `czm_reverseLogDepth` output into these overloads. Retain an explicit native
   `czm_windowToEyeCoordinates` dependency for Cesium builtin discovery.
2. Preserve the original expressions for nonphased Globe and Planar paths.
   Exact-clear checks remain before reconstruction. Native program selection
   and `frameState.useLogDepth` remain authoritative; no new define, program,
   uniform or alternate depth authority is needed. No handwritten log inverse,
   upstream builtin change, greater receiver tolerance or fallback is allowed.
3. Amend only the existing
   `reconstructs phased Globe medium clouds across depth and camera transitions`
   fixture. Add one fixed Perspective log-depth finite receiver at near=0.1 m,
   far approximately 700 km, and an oblique receiver in the tens-of-km range.
   Use independently encoded raw log depth and analytic ray/receiver distance.
   Probe the compiled product producer depth, feed its encoded scene endpoint
   into the existing controlled-cloud resolve, and require analytic-distance
   agreement plus nonneutral first-frame cloud support with history disabled.
   Cover the four existing phase offsets without a parameter search. Restoring
   only the former reverse-log/vec4 depth expressions must fail the witness;
   neither raw/resolve mutual agreement alone nor an enlarged tolerance is
   sufficient. Preserve the existing finite/clear edge, foreground, sloped
   receiver, no-support, history, packing and odd-size assertions.
4. Correct the fixture's artificial Orthographic-plus-log case to the actual
   Orthographic **linear-depth** path, retaining its coordinate/endpoint
   assertions and one-pixel edge case. `Scene.js` sets `useLogDepth=false` for
   both Orthographic frustum types. This explicitly supersedes the earlier
   ambiguous combined Orthographic/log witness instruction; the new Perspective
   case is the log-depth witness. Do not introduce a product workaround for an
   unreachable Orthographic log encoding.

Executable allowlist: the two shaders above and
`packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js` only.
Record allowlist: extension README/roadmap, this phase plan, A13 discussion and
review, and ADR-0048. Preserve every other shared edit. No renderer, controller,
Test executable, noise/material/lighting, phase/STBN, weights/clipping, history
semantics, API/default/tier, texture/FBO/pass/command or persistent-byte delta.
No upstream-owned/generated/new-SGP changes; SGP-0008/0009 stay frozen.

Run the amended phased fixture and
`isolates cloud radiance scale transitions from temporal history` sequentially,
then scoped Spec ESLint, Spec/record Prettier, record Markdownlint and
`git diff --check`. Reuse unchanged lifecycle evidence. No aggregate, package,
type, asset generation or owner-browser/performance run is assigned. If the
fixed witness or native overload contradicts this design, report the precise
blocker rather than widening tolerances or starting a new investigation.

Return `review_ready` with exact results, deviations and ownership/resource
audit. No commit, push, checkpoint, owner gate or next-phase/Planar work.
Architecture owns independent source review, corrected-source live rotation
and bounded cost qualification; the temporary diagnostic is not product or
owner acceptance.

#### A13-AR-006 execution handoff

The two authorized phased expressions now consume raw depth through native
precise overloads. The fixed near=0.1 m/far=708391.926050005 m sloped receiver
witness passes across all four phases: analytic endpoints, history-zero full
support and old-expression mutation rejection. Orthographic uses native linear
encoding; prior assertions are retained. See the
[execution result](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-006-execution-result--2026-09-04)
for exact final checks and the zero ownership/resource delta. No browser or
performance work was performed; Architecture review remains pending.

## Architecture follow-up: A13-AR-007 (no coding assignment)

Historical diagnosis boundary; superseded only by the
[owner-approved assignment below](#current-assignment-a13-ar-007-cloud-depth-support).

The owner compares a smooth UE cloud image with the current grainy Globe
image. The [independent diagnosis](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007--stochastic-cloud-depth-rejects-stationary-history)
finds that most valid cloud pixels in the current medium crop lose temporal
color despite nominal 0.9 history. This is a new current-view result, not a
reopening of fixed A13-AR-005 statistics or A13-AR-006 scene-depth precision.
The older A12 full-resolution crop cannot rule out this phased-path failure.

Architecture must separate opaque receiver/occlusion validity from stochastic
cloud-distance estimator uncertainty before assigning a change. The design
must explain exact-stationary behavior as well as moving-camera behavior:
fixed camera/material/cloud/light state must not interpret a changed noise
sample as changed geometry, while genuine disocclusion, cloud-layer changes,
finite/clear edges and camera cuts still reject history. Any moving tolerance
must derive from sampling/reconstruction support rather than an arbitrary
larger metre constant. Keep current-domain distance publication and shadow
length semantics independent of color reconstruction.

The recommended order is to correct the measured temporal rejection first,
then assess residual grain before proposing additional spatial denoising.
Do not increase march counts, blur the final scene, alter material parameters,
raise 0.9/0.82 weights or remove depth safeguards as a substitute. A future
assignment needs a real stochastic estimator witness alongside the existing
occlusion/cut regression and one bounded quality/cost observation; nominal
history diagnostics or merely different output are insufficient.

This section is a diagnosis/design handoff, not permission to implement a
new compatibility policy. ADR-0048 remains unchanged in force. Execution
holds; no product/Spec/Test edits, tests, owner acceptance, commit or next
phase are assigned. Architecture will return a concrete bounded proposal.

## Current assignment: A13-AR-007 cloud-depth support

Current disposition: independently code-approved; the assignment is closed.
See the [live review](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-independent-review-and-live-observation)
for effective-history recovery, visible static improvement and bounded cost.
Rotation first frames remain grainier; code closure does not certify motion
quality or sustained/all-view 60 FPS. Execution holds with no additional work.
Owner quality/performance and the phase checkpoint remain pending.

The owner approves correction and supplies a local UE5.2 reference. Architecture
has completed the [source audit](../discussions/2026-09-04-a13g-globe-performance-source-discovery.md#local-ue52-source-audit-and-a13-ar-007-decision)
and specifies the exact model in
[ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md#a13-stochastic-cloud-depth-support-a13-ar-007).
This supersedes the hold after A13-AR-006, not its accepted code or precision
guards. Branch/base remain `feature/atmosphere-clouds-effects` /
`8aa5508e132a192ce0eecb80e27559b3f71734c0`; preserve the shared dirty candidate.

Execution implements the ADR's five steps only in the existing phased-medium
resolve: separate qualified mean/front support intervals, producer-derived
jitter radius, current-ray longitudinal comparison, selected-previous-ray mean
alignment and strict historical cloud foreground/unchanged scene checks.
Use existing fetches and scalar/vector accumulators; no second neighborhood
gather or local sample array. Nonphased behavior and independent shadow-length
selection stay unchanged. This is not UE source transplantation or an assignment
to investigate additional denoisers.

### Executable and record boundary

- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`.
- Amend only the existing
  `reconstructs phased Globe medium clouds across depth and camera transitions`
  fixture in `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`.
- Records: extension README/roadmap, this plan, A13 review/discussion, ADR-0048.

No producer/renderer/controller/Test change, extra texture lookup, uniform,
resource, pass, command, history or GPU byte. No API/default/tier/step/phase/STBN,
material/lighting, Beer, high/low/Planar, upstream/generated or SGP change.
Do not copy UE source/assets, relax opaque-depth tolerances, raise history
weights/gamma or add a final-scene blur. Preserve all prior dirty paths.

### Bounded automated evidence

1. In the one phased fixture, exercise a fixed nonuniform cloud volume with
   the compiled product march and fixed jitter values `1/8, 3/8, 5/8, 7/8`
   within the existing two-step interval. Keep its density/support/light inputs
   fixed. Existing Spec-only controlled textures/source substitutions may
   provide an analytic volume; do not change product code or replace the
   actual progressive march/front/opacity-weighted mean estimator with a
   hand-authored distance sequence. Publish its actual encoded mean/front
   into the resolve witness. No search/retry/convergence sequence is assigned.
2. Use controlled nonuniform current/history color with an independent known
   target to prove noise-error reduction and the exact clipped 0.9 blend,
   not just a nonzero/different output. This controlled color oracle does not
   claim the native volume's physical color is ground truth. Assert jittered
   cloud distances exceed the old precision-only bound while scene agrees;
   restoring only the old cloud point gate must lose the measured benefit.
   Include unit-count zero-tent support and exclude invalid/geometry-rejected
   distance samples from the new intervals without changing spatial output.
3. Retain existing two bounded camera/advection transitions, the discriminating
   same-UV mutation, current xyz identity, finite HDR, odd-size/four-phase,
   log-depth/sloped receiver, invalid/clear/no-support and shadow independence
   assertions. Add a controlled history anchor outside the derived cloud
   support, and one behind the finite current receiver but within a cloud
   interval: both must reject color history. These guard against widening
   support being used to bypass layer/occlusion changes. Keep first/cut output
   complete; retain the existing native over-bound camera-cut witness.

Run sequentially:

```sh
npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"
npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"
```

Then scoped Spec ESLint, changed GLSL/Spec/record Prettier, six-record
Markdownlint and `git diff --check`. Reuse unchanged lifecycle evidence; no
aggregate, package, type, generator or browser/performance run is assigned.
If the fixed witness contradicts the prescribed model, return its exact
failure to Architecture rather than adjusting radii, parameters or assertions
until it passes. Return `review_ready` with command outcomes, deviations,
lookup/resource/ownership audit and unresolved visual risk; then stop.

Architecture owns subsequent corrected-source code review and one bounded
current-view effective-history/quality/cost check with a short motion witness.
No claim of UE parity, sustained/all-view 60 FPS or no ghosting is authorized
from the controlled fixture. The owner must still judge the result. No commit,
push, checkpoint, owner-gate preparation or next-phase/Planar work is assigned.

### A13-AR-007 execution handoff

The prescribed support/projection checks are implemented only in phased resolve.
The existing fixture's fixed product-march jitter estimates produce known-color
error reduction and the expected clipped 0.9 blend; old point gating loses the
benefit. Zero-tent eligibility and unsupported/occluded history are distinguished,
and prior movement/depth/packing checks remain. See
[execution results](../reviews/2026-09-04-a13g-globe-performance.md#a13-ar-007-execution-result--2026-09-04)
for exact checks and audit. No extra fetch/resource or browser/performance work;
Architecture review and owner acceptance remain pending.
