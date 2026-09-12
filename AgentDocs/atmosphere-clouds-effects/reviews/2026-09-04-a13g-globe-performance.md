# Review: A13-G Globe Performance

## Metadata

- Type: `review`
- Status: `approved; A13-AR-001..007 fixed; owner quality/performance gate passed`
- Author role: Architecture Agent
- Created / updated: `2026-09-04`
- Branch: `feature/atmosphere-clouds-effects`
- Product predecessor: `fd868387d4c38d6faf67a9395434cc9fccc6384c`
- Target: candidate-3 medium phased tracing; candidates 1/2 retained
- Plan: [A13-G](../plans/2026-09-04-phase-a13g-globe-performance.md)
- Discussion: [source and initial baseline](../discussions/2026-09-04-a13g-globe-performance-source-discovery.md)
- Owner visual gate: `passed on 2026-09-04; corrected result accepted`

## Final owner acceptance and checkpoint scope

The owner accepts the corrected result on 2026-09-04. This closes the quality
and performance gate following independent code approval of A13-AR-001..007.
No stronger claim about sustained/all-view 60 FPS or zero motion grain is made.
The retained 17-path candidate contains the accepted optimizations, native FPS
sample assembly, focused Specs and architecture/role records. It changes no
upstream-owned or generated path and introduces no SGP; SGP-0008/0009 stay
frozen. Architecture prepares its isolated local checkpoint without push.
The cloud/Cesium-clock issue reported alongside acceptance is a new follow-up,
not an unresolved A13 finding or permission to mix clock code into this commit.
No product tests or browser measurements are repeated for acceptance writeback.

## Entry review

A12 is independently committed with owner acceptance and no unresolved code
finding. Architecture owns the initial A13 diagnosis and records. Current short frame
and CPU observations are supplied in the discussion; they do not establish a
unique GPU bottleneck. At diagnostic entry no product optimization was
approved; the later candidate-1 authorization is recorded below. No reduction
in accepted quality is approved.

## Required diagnostic review evidence

- Actual call/command/pixel/sample/resource cost map from the current source.
- Existing cache, termination, noise phase and temporal dependencies retained.
- At most three proposals ranked by evidence, benefit confidence and risk.
- Smallest discriminating next measurement and correctness/lifecycle witness.
- Explicit boundary audit: product executable/upstream/generated/new SGP/API/
  resource changes all zero; the native FPS Test exception is reviewed below.

There are no implementation findings to close yet. The owner explicitly
assigned diagnosis, performance measurement, reference analysis and design to
Architecture; the initial Execution diagnostic assignment was withdrawn.
Execution confirmed no changes and remains stopped until a concrete coding
and validation assignment arrives. Architecture will record its conclusions
and records-only validation here. Subtle grain is an accepted visual
limitation, not a new optimization defect.

## Native FPS display implementation — 2026-09-04

Execution added only `viewer.scene.debugShowFramesPerSecond = true` after
native environment/error configuration in `Test/AdvancedEnvironment/globe.js`.
Cesium owns the display and its destruction; no custom timer, GUI, CSS,
statistics, quality or render-loop change. Architecture owns live visibility
verification; Execution performed no browser operation or performance analysis.

- `npx eslint Test/AdvancedEnvironment/globe.js`: exit 0.
- `npx prettier --check --ignore-path .gitignore Test/AdvancedEnvironment/globe.js`:
  passed.

No GPU/controller/build/package/type test was run. Product, Specs, upstream,
generated, new SGP, public API and SceneGIS resource deltas are zero; Planar
is unchanged. Existing Architecture edits are preserved. Uncommitted/unpushed.

## Architecture conclusion — 2026-09-04

The exact one-line Test diff is approved. Architecture enabled the same public
property in the existing live Viewer without reloading the owner's scene and
verified the native display is visible at the top right. Its DOM showed both
MS and FPS; the element was not hidden behind the GUI. The saved source now
enables it on future page initialization. All diagnostic effect switches were
restored, with the native FPS flag left enabled, ready/HDR and zero errors.

The discussion records one same-session baseline/three-isolation/restored
baseline comparison. Cloud-dependent work is the leading cost family;
Bloom/lens removal produced no clear benefit. This is not GPU pass timing or
an implemented speedup. Source/reference inspection supports exactly two
ranked candidates: exact-zero weather material early return first, then
positive-only occupancy-query bypass with a resource-proven invariant.

The first candidate preserves sample positions, positive densities and the
accepted texture filtering; the second cannot assume every custom shape
resource is positive-only. Existing raw body BSM sampling, light/time caches,
depth clipping and temporal evolution were explicitly checked. No lower tier,
longer empty-weather step, cached atlas cadence or quality reduction is approved.
Execution remains stopped after the FPS task pending a concrete optimization
assignment. A13 is not complete and no owner visual gate is requested.

Scoped Prettier and Markdownlint passed for the five active extension records
and both changed role records. `git diff --check` passed with retained LF/CRLF
warnings only. The eight changed paths are seven SceneGIS-owned Markdown
records plus the single Test file; upstream-owned files, SGP manifests,
generated files, product source and Specs are unchanged. No new SGP, commit
or push was made.

## Owner-approved implementation — 2026-09-04

The owner approved candidate 1, exact-zero weather early return, after the
Architecture diagnosis. This authorizes only the function/Spec work and
validation in the phase plan's formal assignment; it does not accept an unseen
implementation or authorize candidate 2. The exact base remains
`8aa5508e132a192ce0eecb80e27559b3f71734c0` with the existing dirty FPS/records
preserved. Execution reports code and focused automated evidence; Architecture
independently reviews equivalence, resource boundaries, same-workload cost and
visual behavior afterward. Product findings, measured gain, owner gate and
checkpoint remain pending. No new review finding is invented before a diff.

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

## Independent Architecture review — 2026-09-04

Verdict: candidate-1 code and focused automated evidence approved. The complete
product diff is exactly the five-line strict-zero branch; all positive-path
expressions and other product files are unchanged. The same-file fixture
removes only that branch for its full-evaluation oracle, checks mixed adjacent
empty/positive pixels and both normal/shadow entry points, and retains a
formula-derived `2^-14` positive density. Its temporary textures and programs
are destroyed. Existing Planar/coverage/MRT checks are retained. No actionable
code finding was identified and no duplicate suite was rerun by Architecture.

Architecture independently inspected the old and new live compiled source,
restored the owner's scene across reload, checked the actual image and measured
both tiers. The discussion records exact windows and limitations: high in the
same owner view was 50.62 to 60.04 FPS; medium was 59.98 to 59.91 FPS. The
accepted cloud form, internal shading and visible terrain/buildings remained
present without an obvious new broad artifact in the bounded inspection.

The owner's new medium-at-60 objective is not satisfied for the cloud-heavier
look-up: one fixed 30° upward camera rotation measured 32.61 FPS on candidate
medium. This is an open performance objective, not evidence that the equivalent
early return is incorrect. No claim of universal 60 FPS, owner acceptance or
completed A13 is made. The original camera/high tier, public parameters and
time were restored. Final state is ready/HDR, native FPS on, default loop on,
zero page errors; the discarded diagnostic-global error is documented in the
discussion rather than attributed to product code.

Current delta remains two SceneGIS-owned product/Spec paths plus the retained
Test FPS line and records. Upstream-owned files, generated tracked files and
new SGP are zero; SGP-0008/0009 are unchanged. There is no public API, resource,
history, atlas, tier or Planar modification. No commit/push or successor phase.
Execution should remain stopped; Architecture owns the next medium-focused
diagnosis and must define any further coding assignment separately.

## Industry comparison review — 2026-09-04

Architecture verified the pinned reference's actual 4x4 phased trace target,
full-size history/resolve, default enablement and medium lighting reductions.
The discussion distinguishes these from our full-resolution primary rays and
existing A12 denoising. Guerrilla/Epic primary sources support reduced tracing,
reconstruction and conservative skipping as mature techniques; no external
performance figure is transferred to this browser or GPU.

Candidate 2 remains a resource-proven equivalent-work proposal. Candidate 3,
medium 2x2 phased tracing/reconstruction, is a larger unapproved design requiring
depth/distance/history/resource review, not permission to lower quality or copy
the reference's approximate shadow-length reprojection. Candidate 1 approval
is unchanged; no new product finding or owner acceptance is inferred.

The one attempted follow-up measurement was excluded: native cadence was
already approximately one second before setup, and its window contained one
frame. No shadow/ray isolation was executed, no repeated sampling sought a
favorable result, and saved camera/parameters/time were restored. Product and
Spec diffs are unchanged. This continuation changes only the five existing
Architecture records; upstream/generated/new SGP/resource/API deltas are zero.
Execution remains stopped, A13 uncommitted/unpushed and incomplete.

Records-only validation: explicit Prettier check passed for the five active
records; Markdownlint reported zero issues; `git diff --check` passed with
retained LF/CRLF warnings. No product, GPU, controller, package or build suite
was rerun for this diagnosis-only continuation.

## Owner authorization and candidate-2 assignment — 2026-09-04

The owner approved both occupancy-query removal and medium 2x2 phased tracing.
Architecture reviewed the first step's exact R8/max-mip proof, shader branch
placement, current-resource uniform and candidate-first publication. Its formal
assignment allows only the renderer, shared volumetric cloud GLSL and existing
Spec, with two focused occupancy/failure fixtures. ADR-0046 records the bounded
decision. No implementation finding or measured gain is claimed before a diff.

Candidate 2 is the current Execution task. Candidate 3 is authorized in
direction but remains Architecture design, with its own temporal/depth/resource
amendment and coding assignment after candidate-2 review. These are sequential
steps within A13, not two phases or an accepted result. Preserve the existing
candidate-1, Test FPS and role-record changes. No upstream/new SGP, commit,
push or owner-page operation is assigned. Architecture does not poll Execution.

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

## Independent candidate-2 closure — 2026-09-04

Verdict: code and focused evidence approved, no actionable finding. Architecture
read the complete renderer/shared-GLSL diff and both amended fixtures. The proof
uses copied R8 bytes, travels with the candidate resource, and cannot replace
the current proof before successful publication. The shader returns only after
active-layer/height overlap. Zero-containing input and Planar keep their
algorithms; query-only offset work is omitted on the positive path. Texture/mip
contents, samplers, resource destruction and candidate 1 are unchanged.

The compiled byte-1/inside/outside oracle and weather-failure injection directly
exercise equivalence and last-good ownership. The two Execution runs passed
1/1 each; Architecture did not duplicate them. GLSL Prettier is unsupported by
the repository configuration, not a product failure. Existing GLSL style,
actual compilation and diff whitespace are the applicable checks; do not add a
formatter dependency solely to satisfy the earlier overbroad command.

Architecture reloaded the actual owner page and verified the live shader and
resource proof. At 1433x1150, restored medium/mixed parameters and the same 30°
look-up, the old window was 72 frames / 2007.7 ms = 35.86 FPS; the new window was
73 / 2014.5 ms = 36.24 FPS. These two short windows include ordinary frame work,
are not GPU timers, and do not establish a meaningful speedup. The 60 FPS
objective remains open. No further sample was selected to seek a better result.
The final image retained cloud structure, terrain and buildings without an
obvious new broad artifact. Every saved effect parameter, camera vector and
clock value was restored; Bing Aerial, ellipsoid, OSM Buildings, native Moon,
native FPS and default render loop remain enabled, ready/HDR, page errors zero.

Candidate 2 is closed for code review, not owner acceptance or A13 completion.
Its upstream/generated/new-SGP/resource/API deltas are zero. The owner-approved
candidate 3 now has the separate design/assignment in the phase plan and the
A13 amendment to ADR-0048. Execution must preserve candidates 1/2 and implement
only that new bounded assignment. No commit or push is authorized.

## Candidate 3 execution blocker — 2026-09-04

Status: implementation retained for Architecture direction, not review-ready.
Candidates 1/2 remain frozen. The five assigned executable paths contain the
medium phased raster, shared four-offset mapping, full-sample depth/ray work,
depth-eligible spatial reconstruction and quantized full-history coordinates.
The new fixture and bounded lifecycle extensions are present but not qualified.
No owner page, service, index, staged state, commit or push was changed.

The sole command run in this candidate is
`npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`.
Four development invocations each reported `0/1 FAILED` despite shell exit 0:
initial Context setup lacked its ellipsoid; the second exposed flipped test
texture rows, incorrect Orthographic/log input encoding and the product's
low-viewport/full-pixel eye reconstruction; the third retained the history
failure and an incorrectly prepared cut/temporary-texture assertion. Those
setup/coordinate corrections stay in the assigned paths. The fourth result
on Chrome 152 (52.662 s Spec) leaves only the history-rejection failure:
pixels 32, 35, 40 and 43 have RGB `NaN`, alpha `0.75`, instead of finite current
spatial RGB. The camera-cut assertion now passes with a fixed published time,
one established frame and one 26,001 m move; it reads the owned history target.

This is not an ULP discrepancy. The controlled input replaces history distance
with 50 km mean / 40 km front against approximately 1 km / 0.8 km current
clouds. Rejection must return finite spatial color. The unchanged A12 helper
clips history before the position gate and final `mix`; multiplying a NaN by
zero cannot reject it. Its moment-derived lower/upper intersection is a
specific inspection point, but the originating arithmetic has not yet been
isolated. Execution has not changed that frozen helper, substituted a fallback,
weakened the exact assertion, or claimed the intermediate motion comparisons
as successful finite-history evidence. Architecture must determine the bounded
correction before further qualification.

After the last run, the assigned medium empty-support branch was completed to
publish exact neutral distance/validity/length, and producer eye reconstruction
was expressed as one selected builtin call rather than two evaluations. These
last edits are not GPU-qualified. The other three assigned fixture commands
have not run; no aggregate, browser, package, generator, type or release matrix
was started. The candidate cannot be delivered as passing.

Current executable scope remains the private renderer, shared volumetric
library, CloudFS, CloudResolveFS and existing Spec. No additional persistent
CPU buffer/phase state, GPU resource/category or history lookup; one private
Globe-medium boolean and existing slice reuse. Intended current MRT bytes are
`16*ceil(W/2)*ceil(H/2)` with unchanged `32*W*H` history bytes, not a measured
performance improvement. Upstream-owned/generated/new SGP/API/Planar deltas
are zero; SGP-0008/0009 and retained Test/role/Architecture changes are untouched.

Static checks on the retained candidate: `npx eslint` on the renderer/Spec,
`npx prettier --check --ignore-path .gitignore` on those two JS files and the
six records, `npx markdownlint` on those six records, and `git diff --check`
all exit 0 (retained line-ending warnings only). GLSL has no configured
Prettier parser. These checks do not close the failed GPU fixture.

## A13-AR-001 — inverted finite variance interval

- Severity: `P1`
- Status: `fixed; independently confirmed by Architecture`
- Diagnosis / review owner: Architecture Agent
- Implementation owner: Execution Agent
- Target: `sceneGISCloudVarianceClip` in the existing CloudResolveFS and the
  new phased-medium fixture, within the retained candidate-3 allowlist.

Architecture independently isolated the first nonfinite publication with a
temporary Spec-only GPU probe. The error already appears in the stationary
phase-1 resolve, before camera motion or the rejected-distance scenario.
Pixels 35 and 43 have finite current and history colors, with constant green
`0.199951171875`, blue `0.300048828125` and transmittance `0.75`. Their weighted
sample count is `3.75`. The measured green/blue `upper - lower` values are
`-2^-26` and `-2^-25`, while both corresponding `historyColor - center` values
are exactly zero. The probe scales these small differences by `2^20` before
half-float readback, yielding `-0.015625` and `-0.03125` exactly.

Rounded moment division places the mean slightly outside the constant sampled
extrema. The one-sided `max(minimumColor, mean - sigma)` and
`min(maximumColor, mean + sigma)` intersection then inverts its bounds.
Negative extent makes the RGB fraction branch evaluate negative extent divided
by zero. Nonfinite clipped RGB reaches the final arithmetic `mix`, even when
compatibility later makes its weight zero. The first poisoned history then
reprojects into pixels 32 and 40; the second transition/rejection contains all
four failures. This is not missing terrain depth, inadequate sampling count,
an insufficient history tolerance or an error originating only at rejection.

The exact fixture was run twice for this Architecture diagnosis on Chrome 152:
the first reproduced `0/1 FAILED` (59.159 s Spec), but the runner suppressed
console probe output; the second exposed the probe through assertion context
and remained `0/1 FAILED` (58.938 s). Shell exit 0 is not success. No parameter
or product source changed. All temporary probe code and calls were removed
after capture; no diagnostic framework or product fallback is retained.

### Bounded correction and evidence

Authorize the narrow A12 arithmetic exception in ADR-0048: clamp **both**
`mean - sigma` and `mean + sigma` to `[minimumColor, maximumColor]` before
computing center/extent. Keep the existing moment formula, gamma 1, common RGB
trajectory, strict extent comparison and separate transmittance bound. For
finite inputs and positive sample count, monotone clamping makes the interval
ordered, including an exactly zero-width constant channel. No epsilon,
variance floor, independent RGB clamp, alternate blend, NaN replacement or
rejection-only early return is approved. Shared Globe clipping receives only
this numerical correction; high/low sampling and Planar remain unchanged.

Amend the existing new fixture, not its scenarios: assert finite bounded RGBA
for all pixels of the stationary, first moved, second moved and rejected
publications. Keep the exact rejection-to-spatial identity and existing depth,
packing, phase, cut and lifecycle assertions. Each moved-history witness must
show a numerically positive, bounded color contribution against its finite
spatial baseline; whole-array inequality alone is not evidence of reuse.
The existing odd-size phase-1 case directly covers the constant-channel,
fractional-count degeneration, so no standalone test or matrix is needed.

Then run the four previously assigned fixture names sequentially on final
source, followed by the assigned scoped static checks. If the fixed finite
motion case does not reuse history, report that separate concrete blocker;
do not tune the camera, thresholds or source data to find a passing sample.
Candidates 1/2, all other A12 policy, resource budgets and accepted visual
parameters stay frozen. Architecture will review the correction before any
owner-browser or performance observation. Upstream-owned/generated/new-SGP
delta is zero; SGP-0008/0009 remain untouched. No commit, push or next phase.

Architecture writeback validation: scoped six-record Prettier and Markdownlint
pass; `git diff --check` reports only retained LF/CRLF warnings. The official
baseline audit finds zero upstream-owned or generated paths among the 17
retained modified paths. Temporary Spec probes are absent. These are record
and scope checks, not qualification of the still-failing product candidate.

### A13-AR-001 execution correction — 2026-09-04

Disposition: execution-fixed; independent Architecture review pending.
Both variance endpoints now use the exact authorized monotone clamp to the
sampled extrema. One English comment explains interval ordering. Moments,
gamma 1, coherent RGB fraction, strict extent comparison, separate alpha
clamp and call ordering are unchanged. No epsilon, replacement, rejection-only
return, tuning or scenario change was introduced.

The same phased fixture checks every color/distance RGBA channel of stationary,
first moved, second moved, rejected and their spatial baselines for finiteness
and absolute storage bound 65504. At fixed center pixel 22, each moved output
has strictly positive red contribution over its finite spatial baseline and
is at most 0.25, the maximum of its existing contributing source columns 3/5.
Current xyz remains exact spatial xyz. The rejected-distance publication
matches spatial color exactly at every pixel, including former NaN pixels
32/35/40/43. The same odd-size fractional-count scenario, phase/depth/ray,
packing, mutation and cut assertions are retained. No additional Spec or camera
configuration was introduced.

This correction changes only CloudResolveFS and assertions in the existing
Spec; the retained renderer/producer/shared-library candidate-3 work is not
reworked. Correction resource/API/lookup/uniform/upstream/generated/new-SGP
delta is zero. Shared high/low Globe callers receive the authorized ordered
interval arithmetic, not a different sampling policy; Planar is unchanged.
Candidate-3 current MRT remains `16*ceil(W/2)*ceil(H/2)`, histories `32*W*H`,
with unchanged resource/category counts. The 1433x1150 saving of 19,770,800
bytes is a dimension calculation, not an FPS or visual-acceptance claim.

An initial correction run passed `1/1 SUCCESS` (54.210 s). Before final
qualification, the assertions were completed for alpha as well as RGB and
distance, since the pre-existing `expectFiniteHdrStorage` helper checks only
RGB. The final four-command sequence and static results are recorded below.
Historical failed runs and Architecture diagnosis above remain unchanged.

#### Final focused command results

Sequential final-source runs, Chrome 152; actual runner outcomes take authority
over shell exit 0 (all four commands returned that exit code):

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`:
  `1/1 SUCCESS`, 54.137 s Spec, including complete RGBA finite/bounds assertions.
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`:
  `1/1 SUCCESS`, 45.050 s Spec; retained high/Planar assertions unchanged.
- `npm run test -- --includeName "executes one lazy cloud MRT and resizes only for quality"`:
  `0/1 FAILED`, 35.567 s Spec. The added Globe setup does not select medium.
  The accepted constructor default is high, so it correctly allocates 9x5,
  returns phased=false, and later assigning high again does not invalidate
  history. Its expected 5x3/phased=true/invalidation assertions therefore fail.
  An explicit medium selection is needed in that fixture, not a product-default
  change. The new GPU fixture overrides phased=true for its direct draws; its
  final renderer cut currently also uses the default high tier.
- `npm run test -- --includeName "retains the last-good cloud MRT when a quality resize fails"`:
  `0/1 FAILED`, 34.440 s Spec: `globeGood.isDestroyed is not a function`.
  `FramebufferManager` has no such method; both added manager-level calls are
  invalid. Last-good liveness must use its existing attachment/framebuffer
  authority and candidate cleanup its destroy spy/cleared owned attachments.

These are two specific retained Spec setup/API errors, not a remaining NaN
failure or a new product-default decision. They are outside A13-AR-001's
authorized new-fixture-assertion correction and are left unchanged for bounded
Architecture direction. No assertion was removed or tolerance widened. Overall
candidate qualification is **not passed**: two commands pass and two fail.
No additional tests or browser observations were run.

Post-writeback static checks pass: renderer/Spec ESLint, supported-file
Prettier on those JS files plus the six records, six-record Markdownlint and
`git diff --check` all exit 0 (retained line-ending warnings only). GLSL uses
the existing style and compiled GPU witness; no formatter dependency was added.
The shared tree remains uncommitted/unpushed; owner page and service untouched.

## Independent A13-AR-001 closure

Architecture reviewed the current helper and fixed-scenario assertions against
the authorized correction. Only the two endpoint clamps and their explanation
change the clipping algorithm. Both moved witnesses now check a positive red
contribution at the fixed center, bounded by its current contributing maximum
0.25; all main publications and baselines check finite bounded color/distance
RGBA. Exact rejection identity remains. The final phased and retained
high/Planar history fixtures pass 1/1 each, as recorded above. These direct
results are sufficient for this finding; Architecture did not duplicate them.
A13-AR-001 is closed, not acceptance of the whole candidate or its performance.

## A13-AR-002 — explicit medium qualification setup

- Severity: `P2`
- Status: `fixed; independently confirmed by Architecture`
- Owner: Execution Agent; diagnosis/review: Architecture Agent
- Target: Globe additions in `executes one lazy cloud MRT and resizes only for
quality`, and the real-renderer cut in the new phased fixture.

The current constructor selects high on Globe and medium on Planar.
`connectControlledCloudMode("globe")` does not override that default. The lazy
resource fixture therefore runs high while asserting medium 5x3/phased=true;
assigning high again is a documented no-op. The direct phased shader draws
override the boolean and their passing evidence is valid, but the final real
renderer cut still tests high, not the required medium path.

Use the existing `beforeFirstUpdate` callback to set `effects.cloudQuality =
"medium"` in these two specific Globe connections. Do not change the shared
helper, constructor defaults, quality profiles or unrelated tests. Retain the
lazy fixture's medium-to-high transition and exact resource/command assertions.
At the existing fixed-time, single 26,001 m cut, assert the actual renderer
reports phased=true, its current MRT is 5x3 and both histories are 9x5. Keep the
camera/time and two-render sequence. The published full-size current result
must remain finite in all RGBA channels, not just the helper's RGB check.
No extra motion, settling frame or setup search is needed.

## A13-AR-003 — use actual framebuffer ownership APIs

- Severity: `P2`
- Status: `fixed; independently confirmed by Architecture`
- Owner: Execution Agent; diagnosis/review: Architecture Agent
- Target: the Globe addition in `retains the last-good cloud MRT when a quality
resize fails`.

Independent source inspection confirms `FramebufferManager` is a reusable
wrapper without `isDestroyed()`. Its `destroy()` destroys/clears owned texture
attachments and its framebuffer; Texture and Framebuffer own the liveness
methods. The renderer calls candidate.destroy in the failed update catch and
publishes the new manager only after success. The two manager-level test calls
are invalid and prevent the remainder of this oracle from executing.

Before the existing failure, retain the last-good framebuffer and its two
color textures. After the failure, require the same published manager,
framebuffer and attachments with their actual `isDestroyed() === false`;
retain both history identities. Keep the existing prototype destroy spy:
exactly one destroyed candidate, distinct from last-good, with undefined
framebuffer and both color attachments afterward. Do not add a method or
mutate any manager prototype implementation. Keep the current failure point
and exception identity; because the injected update throws before allocation,
this proves the failed candidate was cleaned, not destruction of newly
allocated GPU attachments. Do not broaden it into a second failure matrix.

## Current Spec-only follow-up assignment

Only `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
may change for A13-AR-002/003, limited to the three affected fixtures above.
All product JS/GLSL, A13-AR-001 arithmetic, candidates 1/2, shared helper
defaults, original Planar assertions and the passing legacy history fixture
are frozen. This adds no public API, runtime/resource/lookup/uniform, upstream,
generated or SGP change. No owner browser, service, index or staging operation.

Run these three affected names sequentially on final Spec source: the new
phased fixture, `executes one lazy cloud MRT and resizes only for quality`,
and `retains the last-good cloud MRT when a quality resize fails`. Reuse the
unchanged legacy history fixture's 1/1 result above; do not rerun it or any
aggregate/package/type/full matrix. Then scoped Spec ESLint/Prettier,
touched-record Prettier/Markdownlint and diff whitespace checks. Report actual
test counts, preserve failed-run history, and return proactive `review_ready`.
If a product failure appears after these setup/API corrections, report its
exact dependency instead of expanding implementation scope. Candidate 3 still
requires full Architecture closure and later performance/owner judgment.
No commit, push, checkpoint or next-phase action.

## A13-AR-002/003 execution correction — 2026-09-04

Disposition: A13-AR-002 execution-fixed; A13-AR-003 remains unqualified.
Independent Architecture review/direction pending.
Only the three authorized fixtures in the existing Spec change. The lazy
Globe setup and phased fixture now choose medium in their own existing
`beforeFirstUpdate` callbacks; the shared connection helper and all defaults
are unchanged. Direct GPU sources, camera/time, fixed motion and mutation
scenarios, original Planar assertions and accepted legacy history are retained.

The existing two-render, 26,001 m cut now asserts actual phased=true, current
5x3 MRT, both attachments of both full 9x5 histories, camera-translation reason,
camera-cut-spatial-only mode and zero history weight. Both published full
attachments check all RGBA channels for finite absolute values at most 65504.
No added render, settling, search or runtime change.

The failure fixture snapshots the last-good Framebuffer and both Textures before
the existing high-to-medium update failure. It checks identity and their actual
`isDestroyed() === false`, retains both history identities, and checks exactly
one distinct candidate destroy call, requiring its framebuffer and both color
slots to be undefined after cleanup. No nonexistent manager method remains.
The last-good assertions pass, but the candidate-cleanup assertion does not;
see the exact result below. This injection precedes allocation and cannot
establish destruction of newly allocated GPU textures.

Product JS/GLSL, A13-AR-001, candidates 1/2 and all other executable paths
are frozen. Correction runtime/resource/API/lookup/uniform/upstream/generated/
new-SGP deltas are zero; SGP-0008/0009 remain consume-only. Candidate 3 retains
the previously assigned medium byte reduction, not an added resource. Owner
page, service, index and staging are untouched; no commit, push or next phase.

### Spec-only follow-up results

Final Spec source, three sequential commands on Chrome 152; all return shell
exit 0, with actual runner outcomes below:

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`:
  `1/1 SUCCESS`, 55.602 s Spec. The actual cut now covers medium, with phased=true,
  current 5x3, two full 9x5 histories, finite complete RGBA, exact cut reason/mode
  and zero history weight. Existing direct-draw assertions remain.
- `npm run test -- --includeName "executes one lazy cloud MRT and resizes only for quality"`:
  `1/1 SUCCESS`, 35.331 s Spec. Original Planar checks and Globe resource sizes,
  warm identities, command counts and medium-to-high invalidation pass.
- `npm run test -- --includeName "retains the last-good cloud MRT when a quality resize fails"`:
  `0/1 FAILED`, 34.204 s Spec. All last-good manager/framebuffer/texture identity
  and actual liveness assertions pass, as do history identities. The prototype
  destroy spy records zero calls, not one; accessing its nonexistent first call
  then fails. Candidate cleanup is not qualified.

The failure injection still replaces every `FramebufferManager.update`, as
assigned. Therefore an exception with the expected identity does not establish
that it reached the cloud candidate update; an earlier manager update may
throw first. The exact intercepted caller is not isolated in this turn.
Execution preserves the failure point and assertions rather than narrowing the
injection or weakening cleanup without Architecture direction. No product
failure is claimed from this result. A13-AR-003 remains open, and overall
candidate qualification is not passed.

The unchanged legacy history fixture's prior `1/1 SUCCESS`, 45.050 s, is reused
without rerun. No additional fixture, aggregate, browser, performance, package,
type or release run. Historical failures remain above.

Scoped Spec ESLint, Spec/six-record Prettier, six-record Markdownlint and
`git diff --check` pass after writeback (exit 0; retained line-ending warnings).
These static checks do not close the remaining cleanup assertion failure.

## Independent A13-AR-002 closure

Architecture reviewed the two local before-first-update medium selections and
the existing fixed-time cut assertions. Actual medium 5x3 tracing, both full
9x5 history attachments, cut reason/mode/zero weight and full finite RGBA are
covered. The passing phased and lazy-resource results above are sufficient;
no duplicate run is needed. Shared helper/defaults and original Planar checks
remain unchanged. A13-AR-002 is closed; A13-AR-003 is still open.

## A13-AR-003 targeted injection continuation

Architecture independently ran the single failing resource fixture with a
temporary Spec-only caller probe. It remained `0/1 FAILED` on Chrome 152,
34.193 s Spec, shell exit 0. The first intercepted call is
`Scene.updateAndClearFramebuffers -> GlobeDepth.update -> _outputFramebuffer.update`:
9x5, one color attachment, depth=false, depthStencil=true. It is not the new
5x3, two-color, no-depth cloud candidate. The exception occurs before
`ensureCloudFramebuffer`, so zero cloud-candidate destroy calls is expected.
The current failure does not demonstrate a product cleanup defect. The probe
and its assertion context were removed after capture; no product or owner-page
change was made.

The previously retained global injection is too broad for the Globe path.
Authorize the following narrow change, superseding only that injection-scope
constraint and the global destroy-call count:

1. Save the original manager update function before creating the existing
   update spy. Keep the original Planar scenario/injection/assertions unchanged.
2. For the Globe high-to-medium scenario only, use the existing spy with a
   regular-function callFake. Throw the same expectedError before allocation
   only for the new cloud candidate: requested width/height 5x3, numSamples 1,
   HALF_FLOAT/RGBA, two color attachments, no depth or depth-stencil, and not
   any retained cloud/history manager. These properties follow the existing
   `ensureCloudFramebuffer` call and fixed test viewport, not call order or
   stack-string matching. Delegate every other update to the saved original
   function with its actual receiver and arguments.
3. Capture that exact candidate receiver at injection. Assert it was selected
   and its update was intercepted exactly once. Count destroy calls by that
   captured identity and require exactly one. Do not count unrelated native,
   shadow or other manager work as candidate cleanup; legitimate updates are
   now allowed to run. Keep candidate framebuffer/color-slot emptiness and all
   last-good framebuffer/texture liveness, publication and history identities.
   The exception still precedes candidate GPU allocation, not a new failure mode.

Only the existing failure fixture in the same Spec may change, including its
pre-spy original-function capture. No product, API, prototype implementation,
shared helper, scene parameters, camera, failure threshold or other fixture
change. No fallback, retry, new test, renderer hook or stack-dependent gate.
The renderer's existing cloud-pass catch rethrows the same error after clearing
published transient state; its failure behavior remains untouched.

Rerun only `retains the last-good cloud MRT when a quality resize fails` on
final source, then scoped Spec ESLint/Prettier, touched-record formatting/lint
and diff whitespace. Reuse the three unchanged passing history/phased/lifecycle
results; no aggregate or browser/performance run. Record exact target identity
and cleanup evidence without raw call stacks, return `review_ready`, and stop
uncommitted/unpushed. Runtime/resource/API/upstream/generated/new-SGP deltas are
zero; SGP-0008/0009 remain frozen. Candidate-wide code, performance and owner
gates are still pending; no next phase is authorized.

### A13-AR-003 targeted execution result — 2026-09-04

Disposition: execution-fixed, independent Architecture review pending.
Only the existing failure fixture changes. The real update is captured before
the original spy; original Planar injection/assertions remain unchanged. The
Globe regular-function strategy matches the requested 5x3, single-sample,
HALF_FLOAT/RGBA, two-color/no-depth/no-depth-stencil new candidate, excluding
the last-good and both history managers. Other updates call the saved original
with their real receiver and arguments; no call-order/stack matching or product
hook. The same error is thrown before candidate allocation.

The selected candidate is captured exactly once. Exactly one destroy call
belongs to that identity, and its framebuffer and both color slots are then
undefined. The last-good manager, framebuffer and two textures retain identity;
the actual framebuffer/textures remain live. Both history identities and exact
exception identity pass. This proves failed-candidate cleanup, not destruction
of allocated candidate textures. No prototype implementation was changed.

Only command run:
`npm run test -- --includeName "retains the last-good cloud MRT when a quality resize fails"`
reports `1/1 SUCCESS` on Chrome 152, 34.493 s Spec, exit 0. The unchanged phased
fixture `1/1 SUCCESS` (55.602 s), lazy resource fixture `1/1 SUCCESS` (35.331 s)
and legacy history `1/1 SUCCESS` (45.050 s) are reused without rerun. All assigned
focused qualification now has passing evidence; historical failed attempts
remain recorded above. Independent candidate review and performance/visual
judgment are still pending, not inferred from these tests.

Executable correction path:
`packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js` only.
Product JS/GLSL, A13-AR-001/002, candidates 1/2, Test, assets and unrelated
fixtures are untouched. Runtime/resource/API/lookup/uniform/upstream-owned/
generated/new-SGP deltas are zero; SGP-0008/0009 stay consume-only. No owner-page,
service, index, staging, browser/performance, aggregate/package/type/full run,
commit, push, checkpoint or next-phase action.

Targeted follow-up static checks: Spec ESLint, Spec/six-record Prettier,
six-record Markdownlint and `git diff --check` all exit 0 after writeback;
only retained line-ending warnings remain. No other validation was run.

## Independent A13-AR-003 closure and candidate inspection

Architecture confirms the targeted receiver predicate, delegation of other
manager updates, exactly one identity-matched cleanup and actual last-good
Framebuffer/Texture liveness. The final `1/1 SUCCESS`, 34.493 s, and the three
unchanged successes above close A13-AR-003; no duplicate run is needed.
The complete candidate product diff and resolve were independently inspected.
Subsequent live visual validation reveals A13-AR-004 below, so candidate 3 is
not code/quality-approved as a whole despite passing the four focused fixtures.

### Current-view medium performance witness

The live page still contained pre-candidate-3 code, allowing one same-state
old/new comparison across reload. Each side used one two-second postRender
cadence observation, not GPU timers: old 64 frames / 2007.1 ms = 31.89 FPS;
new 120 frames / 2006.8 ms = 59.80 FPS, approximately 1.88x. This is a bounded
current-view result, not sustained/all-scenes 60 FPS or accepted quality.
The earlier 35.86/36.24 FPS observation used a different view and is not this
comparison's baseline.

Both sides used a 1433x1150 drawing buffer, medium/mixed, coverage 0.35,
density 0.5, base 750 m, thickness 4500 m, cloudTime 0, frozen clock and Sun
elevation 41.457 degrees; Bing Maps Aerial with WGS84 Ellipsoid, no Buildings.
All effect/radiance parameters were restored before the new observation.
Camera restoration differed by at most 4.03e-16 in a direction/up component.
Current MRT changed from 1433x1150 to 717x575; both histories remain full size.
The new private phased flag was true, with valid stationary temporal history
and weight 0.9; browser/render errors remained zero.

Visual inspection nevertheless shows regular horizontal transparent rows
through otherwise structured clouds. The final high control has no such comb.
Further motion/performance sweeps were stopped once this blocking defect was
identified. The original high quality, all parameters, camera/time, Moon,
imagery/terrain, collapsed GUI and active default render loop were restored;
the latest source stays loaded. No product, Test, service or viewport change
was made by Architecture. The temporary GPU readback wrappers were destroyed
without destroying their borrowed textures.

## A13-AR-004 — continuous sloped receivers rejected as depth edges

- Severity: `P1`
- Status: `fixed; independently confirmed by Architecture`
- Owner: Execution Agent; diagnosis/design and final review: Architecture Agent
- Target: phased-medium spatial branch in `SceneGISEnvironmentEffectsCloudResolveFS.glsl`

The finite-source gate compares the distance between two actual receiver
positions against an equal-ray-distance angular footprint plus storage/16 m
tolerance. That footprint does not include the legitimate range gradient of
an obliquely viewed continuous surface. It therefore rejects neighboring
samples over an ordinary sloped receiver, even when their cloud bodies lie
well in front of both endpoints. At untraced rows all tent-weighted candidates
are rejected, and the no-support branch publishes RGB=0, T=1 and invalid cloud
with zero length. History cannot fill these rows because that branch returns
before history sampling. Advancing the phase moves the missing-row pattern.

Architecture read one fixed live column at phase 3, x=400, y=701..713. All
seven current traced samples have valid nonzero cloud radiance and T between
0.00405 and 0.24585, with cloud front/mean approximately 4.3/4.6..5.3 km.
Every intervening resolved row is exactly RGB=0/T=1 and invalid/zero length,
while the traced rows retain the current cloud. This distinguishes a
reconstruction hole from ordinary STBN grain or missing material samples.
For the first pair, half-float-decoded receiver ranges are 13412.48 and
13473.51 m. Their camera-space endpoint separation is about 61.91 m but the
equal-distance angular footprint is only 10.42 m: even adding the 16 m floor
cannot admit this continuous surface. These rounded readbacks illustrate the
already identified geometric error; they are not a new pixel quality gate.

### Bounded correction assignment

Replace only the phased-medium finite spatial receiver test with a local
receiver-plane residual. In the existing translation-free ray domain let
`P = targetOrigin + targetDirection * sceneDistanceMeters`. Compute
`N = cross(dFdx(P), dFdy(P))` in uniform fragment control flow before the
neighbor loop and any per-pixel early return. For a finite candidate with
`Q = sourceOrigin + sourceDirection * decodedSourceSceneDistance`, admit its
receiver when `N` has finite positive magnitude and:

```text
abs(dot(N, Q - P)) <= length(N) * existingStoragePositionTolerance
```

Use the existing binary16 source/target distance radius and 16 m reconstruction
floor; do not increase either or add an artistic slope threshold. This tests
displacement away from the local surface rather than distance along it. No
new normal texture, depth fetch, framebuffer, history, program or CPU uniform
is needed. Derivatives must not be evaluated inside the varying finite/clear
branch or neighbor acceptance branch. Only the phased finite path consumes
this metric; nonfinite/degenerate planes provide no qualified finite support,
without a fallback or normalization division.

Keep raw finite/clear classification, finite color/distance checks, target
mean/front cloud occlusion rejection, independent shadow-length weighting,
tent weights, current-domain publication and no-eligible-support behavior.
Do not replace terrain with an ellipsoid normal: models/terrain must use the
actual resolved receiver. Keep temporal compatibility/weights, A13-AR-001,
all phase/sample budgets, candidates 1/2, high/low and Planar unchanged.
The plane estimate is local; silhouette behavior remains a required check,
not an assumption that all neighboring geometry is coplanar.

Allowed executable paths are the resolve GLSL and the existing environment
Spec only. Amend the single phased GPU fixture with one analytically defined
oblique finite plane and known visible cloud samples. Its untraced pixels
must have current nonzero cloud support immediately with history disabled,
and the old equal-distance-footprint mutation must fail under the same data.
Retain the existing finite/clear and foreground-occluder rejection assertions,
meaningful two-transition history, cut, finite-RGBA and odd-size checks. Do not
add another test, image threshold, convergence loop or parameter search.

Run the amended phased fixture and retained legacy history fixture sequentially,
then scoped Spec ESLint/Prettier, touched-record Prettier/Markdownlint and diff
whitespace checks. Reuse the unchanged lazy-resource and failure-cleanup
results; no aggregate, package, type, browser or performance run by Execution.
If the assigned plane metric contradicts the retained occlusion contract,
report that exact failure instead of loosening gates or expanding the design.

Write back these results to this review, plan, index, discussion, roadmap and
ADR-0048. Return proactive `review_ready` and stop uncommitted/unpushed.
Architecture will then check the corrected same-view medium output and cost,
followed by bounded motion and owner judgment. No phase gate/checkpoint or
next phase is authorized. This correction has zero resource/API/upstream/
generated/new-SGP delta; SGP-0008/0009 remain frozen. The retained 17-path
candidate is unchanged by this diagnosis except for these six records.

### A13-AR-004 execution result — 2026-09-04

Disposition: execution-fixed; independent Architecture review pending.
CloudResolveFS computes translation-free target receiver position and its
cross-product screen derivatives in uniform control flow before the neighbor
loop. Only phased-medium finite acceptance consumes the resulting plane:
normal magnitude must be finite and positive, and the absolute unnormalized
point-to-plane residual must fit that magnitude times the unchanged binary16/
16 m storage tolerance. No normal division, ellipsoid assumption, added lookup,
fallback, slope threshold or increased tolerance. Existing finite/clear,
foreground cloud, shadow weighting, tent, no-support, publication and history
rules are unchanged, including A13-AR-001 and high/low/Planar policies.

The existing phased fixture adds one fixed analytic receiver
`z + 6*y + 6000 = 0`, using ray-plane intersection to generate depth and
source scene distances; visible clouds retain the existing z=-1000/-800 m
planes. With phase 0 and history disabled, every untraced pixel has positive
current cloud radiance, transmittance below one and valid cloud output; all
color/distance RGBA values remain finite and storage-bounded. Restoring only
the former equal-range-footprint gate under identical data produces exact
RGB=0/T=1/invalid at fixed pixel (4,1), while the product retains positive cloud
support. No camera/source sweep, new Spec or visual acceptance threshold.
All original odd-size, depth/occluder, history, packing and cut assertions stay.

Executable changes are limited to CloudResolveFS and this one existing Spec.
Renderer, resources, producer/shared cloud library, physical shaders, public
defaults, Test and unrelated dirty paths are preserved. Resource/API/lookup/
uniform/upstream-owned/generated/new-SGP deltas are zero; SGP-0008/0009 remain
consume-only. No owner-page/service/index/staging action, commit, push or next
phase. The prior Architecture cadence result does not qualify this corrected
source; Architecture still owns live cost, geometry-edge/motion and owner review.

Final-source sequential commands, each run once on Chrome 152:

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`:
  `1/1 SUCCESS`, 58.763 s Spec, exit 0. New plane/mutation and retained
  finite/clear, foreground-occluder, finite RGBA, motion and cut checks pass.
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`:
  `1/1 SUCCESS`, 45.793 s Spec, exit 0. Existing high/Planar assertions unchanged.

Unchanged lazy-resource `1/1 SUCCESS` (35.331 s) and targeted failure cleanup
`1/1 SUCCESS` (34.493 s) are reused without rerun. No other GPU fixture,
aggregate, package, type, browser or performance validation was run.

Post-writeback scoped Spec ESLint, Spec/six-record Prettier, six-record
Markdownlint and `git diff --check` all exit 0; retained line-ending warnings
only. GLSL follows existing style and passed actual compilation; no formatter
dependency or extra validation was added.

## Independent candidate-3 closure and owner handoff

Architecture confirms A13-AR-004 fixed. The derivatives are evaluated before
divergent neighbor acceptance, the finite positive plane magnitude is checked,
and only the phased finite metric changes. The analytic ray-plane oracle,
untraced positive current support with history disabled, old-rule mutation and
retained occluder/history assertions directly address the diagnosed defect.
The two final-source successes above and the two unchanged resource successes
are sufficient; Architecture did not rerun them. All four A13 findings are
closed, and candidates 1/2/3 now have independent code approval.

Architecture reloaded the existing page, restored the prior comparison state
and verified the compiled resolve contains the receiver-plane correction.
At the same 1433x1150 buffer, camera, frozen time, medium/mixed parameters,
Bing imagery and ellipsoid receiver documented above, one two-second cadence
observation gives 120 frames / 2001.5 ms = 59.96 FPS. Against the retained
pre-candidate-3 31.89 FPS baseline, this is approximately 1.88x. Both full-size
histories remain unchanged and current tracing is 717x575. No FPS sweep,
best-run selection or GPU-timer claim; this short same-view result does not
guarantee sustained 60 FPS across all viewports, hardware and scenes.

The corrected stationary image retains cloud bodies, shading and visible
terrain without the previous regular horizontal transparent rows. One native
middle-button vertical drag, 64 CSS pixels in eight input moves, changes the
view; release/stopped images remain complete without the comb or an obvious
viewport-wide trail/slab. Near-view grain remains visible. One-shot diagnostic
samples during the gesture reported stationary history, so they do not prove
the continuous-reprojected mode; meaningful moved-history qualification is
provided by the GPU fixture, not inferred from those timing-sensitive samples.
The live receiver was an ellipsoid, not a new World Terrain/Buildings test.
Subtle interactive edge ghosting and complex-geometry appearance remain owner
judgments, not certified by the bounded screenshots.

The original high setting, camera, clock, all parameters, Moon, Bing/ellipsoid,
collapsed GUI and active default render loop are restored. Parameter differences
are empty; maximum camera-component roundoff is 1.70e-15. Browser/render errors
remain zero. Latest source remains loaded and native FPS stays visible.
No further product/Test/service/viewport mutation was made by Architecture.

Owner handoff: select medium in the existing Cloud quality control and judge
cloud appearance, a normal rotation/stop and performance on the intended view.
No new coding task, preset, observation control, matrix or next phase is
authorized. Execution should hold the retained uncommitted/unpushed candidate.
A13 phase acceptance/checkpoint still requires explicit owner approval.
This correction and review add no upstream-owned/generated/new-SGP changes;
SGP-0008/0009 remain frozen. Persistent resources/API remain within the accepted
candidate-3 dimension-only reduction.

## A13-AR-005 — interpolation support collapses history statistics

The owner confirms medium's frame-rate improvement but reports increased cloud
shimmer, then approves Architecture's reconstruction-first correction. This is
not A13 visual acceptance. Findings A13-AR-001..004 remain fixed; candidate 3
returns to changes-requested. Retain the shared candidate on
`8aa5508e132a192ce0eecb80e27559b3f71734c0`, without commit or push.

### Confirmed mechanism and evidence limit

In the phased branch of `SceneGISEnvironmentEffectsCloudResolveFS.glsl`, the
`weight <= 0.0` rejection also excludes samples from color extrema and first/
second moments. Those moments additionally use the current interpolation tent
weight. For an interior target pixel, the four phases have respectively
1, 4, 2 and 2 positive-weight samples. When the phase directly traces that
pixel, only its own sample remains: minimum equals maximum equals current.
Variance clipping therefore returns current color even for compatible history,
and nominal history weight 0.9 cannot preserve any historical difference.

This is a source/algebra proof of periodically ineffective denoising, not a
GPU measurement attributing all owner-visible shimmer to this cause. The local
three-geospatial `packages/clouds/src/shaders/varianceClipping.glsl` uses a
separate unweighted 5/9-sample statistical neighborhood. Its epsilon and other
policies are not adopted. Actual per-pixel semantic-history rejection and the
shared four-phase/STBN indexing remain secondary Architecture investigations,
not established defects or permission to alter them in this correction.

### Exact implementation assignment

Change only the Globe phased branch in the existing resolve GLSL and amend
the existing phased GPU fixture in `SceneGISEnvironmentEffectsSpec.js`.

1. Separate geometric/statistical qualification from positive tent weight.
   Reuse the existing clamped 3x3 fetched samples. A statistical sample must
   retain finite color/distance checks, exact raw finite/clear class, the
   A13-AR-004 receiver-plane check for finite geometry, and the existing
   valid-cloud mean/front foreground check. Tent weight zero alone must not
   discard an otherwise qualified statistical sample.
2. Accumulate extrema and first/second color moments with unit weight/count
   for those qualified samples. This changes clipping support, not current
   spatial filtering. At real geometry edges, a small or even single-sample
   qualified neighborhood remains legitimate; do not force a variance floor.
3. Preserve all current color, mean/front distance and independently decoded
   shadow-length sums with their original positive tent weights. In particular,
   shadow-length accumulation remains before valid-cloud foreground rejection,
   while cloud color/statistics remain after it. Zero-weight samples contribute
   to neither current sums nor current validity. Statistical support alone must
   not create a cloud or bypass the no-current-support immediate output.
4. Keep `sceneGISCloudVarianceClip` unchanged, including A13-AR-001 ordered
   intervals, gamma 1, coherent RGB clipping and separate transmittance bounds.
   Keep nominal stationary/moving weights, semantic history rejection,
   reprojected coordinates, current-domain xyz and packed-alpha semantics.
5. Keep medium dimensions, primary/fine/lighting budgets, phase/STBN schedule,
   ray footprint, renderer/resources, high/low, Planar and candidates 1/2 frozen.
   No new texture fetch, pass, uniform, manager, CPU state, public API, tolerance,
   epsilon, retry, settling-frame scheme or global history bypass is authorized.
   Reusing zero-tent neighbors adds qualification ALU; Architecture must check
   its live cost rather than promise the prior FPS result remains unchanged.

### Minimum discriminating evidence and handoff

Amend the existing `reconstructs phased Globe medium clouds across depth and
camera transitions` fixture with one fixed nonuniform, geometrically compatible
neighborhood and compatible history across the four semantic phases. Show
nonzero actual historical color contribution, including the directly traced
phase, while bounded by the qualified neighborhood. A deterministic mutation
that restores only the former statistical tent support/weighting must fail
that aligned-phase witness. With history disabled, product and that mutation
must retain identical spatial color/distance publication. Do not change the
camera/phase/sampling model to make the witness pass.

Retain finite/clear, foreground occlusion, sloped receiver, packing, odd-size,
moving-history and camera-cut assertions. Include a bounded check that a
zero-tent geometrically rejected neighbor cannot enter clipping statistics;
reuse existing edge data where possible. No new standalone Spec, convergence
replay, performance proxy or combinatorial matrix is needed.

Run sequentially, once on final source:

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`
- Spec ESLint; Spec and six active records Prettier; six-record Markdownlint;
  `git diff --check`. GLSL has no configured Prettier parser; verify its real
  compilation through the assigned GPU fixture, not a new formatter dependency.

Reuse unchanged lazy-resource and candidate-failure results. No aggregate,
package/type/full matrix, owner-page/service interaction or performance
measurement is assigned to Execution. Write concise implementation/evidence
and deviations into these six current records, then return `review_ready`.
Stop without staging, commit, push, owner acceptance or next-phase/Planar work.
Architecture retains independent code review, live cost/visual verification,
any subsequent history/STBN diagnosis and the owner gate. This assignment
supersedes the prior hold only within the stated correction boundary.

Architecture assignment preparation changed only the six active records.
Their scoped Prettier and Markdownlint checks and `git diff --check` pass;
retained line-ending warnings only. No product, Spec, browser, performance or
GPU change/run was made in this preparation. Upstream-owned/generated/new-SGP
deltas are zero, with SGP-0008/0009 unchanged. The structural diagnosis awaits
the assigned actual-GPU witness and later live quality/cost review.

### A13-AR-005 execution result — 2026-09-04

The phased resolve now qualifies the existing 3x3 samples geometrically before
collecting unit-count extrema and moments, independently of positive tent
support. Current color/distance sums retain positive tent weights; decoded
shadow length retains its positive-weight accumulation before foreground
rejection. Zero-weight neighbors cannot create current support or bypass the
neutral immediate output. The clipping helper and all history policies remain
unchanged.

The existing phased GPU fixture uses one fixed nonuniform neighborhood across
all four phases. Each phase retains positive historical red contribution and
matches independently evaluated unit-count clipping within binary16 tolerance.
Restoring only the old statistical tent support/weight collapses the aligned
phase to current color. With history disabled, product/mutation color and
distance publications are exactly equal. A zero-tent finite/clear-incompatible
outlier leaves the selected result unchanged. Existing motion, occlusion,
sloped receiver, packing, odd-size and cut assertions remain. The motion
oracle's upper red bound follows the newly qualified column 7 (binary16 0.29),
rather than only interpolating columns 3/5 (0.25); camera inputs and actual
positive-history assertions were not weakened or retuned.

This correction touches only `SceneGISEnvironmentEffectsCloudResolveFS.glsl`,
the existing phased Spec and the six authorized records. Additional geometric
qualification ALU is expected; texture fetch/uniform/CPU-state/resource/pass/
command/API deltas are zero. Upstream-owned/generated/new-SGP deltas are zero;
SGP-0008/0009, renderer, other tiers, Planar and prior candidates stay unchanged.
No owner-page/service operation or performance measurement was performed.
Full shimmer removal and retained FPS remain Architecture/owner questions,
not conclusions from this structural witness. The shared tree is uncommitted
and unpushed.

Final-source A13-AR-005 validation (Chrome 152, sequential):

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`
  — 1/1 SUCCESS, 78.451 s fixture time.
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`
  — 1/1 SUCCESS, 57.060 s fixture time.
- `npx eslint packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
  — exit 0. The initial run found `no-loop-func` in the new statistical oracle;
  a per-iteration constant replaces its mutable `phase` capture without changing
  values. Both focused fixtures above were rerun sequentially after that edit.
- `npx prettier --check --ignore-path .gitignore` for the Spec and six active
  records — pass; `npx markdownlint` for those six records — exit 0.
- `git diff --check` — exit 0, retained LF/CRLF warnings only.

The earlier pre-lint GPU runs also passed (70.964/48.043 s); they are not used
instead of final-source evidence. Unchanged lazy-resource/candidate-failure
successes are reused, with no aggregate, browser, package or type matrix.
Status: `review_ready`; independent Architecture quality/cost review pending.

### A13-AR-005 independent review and bounded live observation

Architecture confirms A13-AR-005 fixed for code. The phased path retains all
geometric qualifications, accumulates current values only at positive tent
weight, preserves shadow-before-foreground ordering, and collects unit-count
statistics only after cloud foreground qualification. The clipping helper,
no-current-support return and legacy branch are unchanged. The four-phase
fixture independently evaluates quantized statistical values; the aligned
mutation, exact history-off publications and incompatible outlier directly
discriminate the assigned defect. The moved upper bound of binary16 0.29 is
derived from the additional qualified column, not a reduced positive-history
requirement. No new actionable code finding was identified. Reuse the two
final-source GPU successes and unchanged lifecycle evidence without rerun.

No existing browser tab was available to the browser tool. Architecture opened
a fresh local Test page instead of claiming to retain the owner's interactive
state. Both loaded resolve programs contain the actual unit-count branch;
shader comments are stripped, so a comment-string check was not source proof.
The fresh page uses Natural Earth II/WGS84 Ellipsoid, no Buildings, fixed high
Sun 67.484 degrees, medium/mixed, coverage 0.35, density 0.5, base 750 m,
thickness 4500 m and cloudTime 0. Native Moon visibility stays at this fresh
page's false value; Moon lighting/shadows and the other effects remain enabled.
The drawing buffer is 1600x900 (reported devicePixelRatio approximately 0.8),
current cloud MRT 800x450 and each existing history 1600x900.

One two-second post-render cadence observation records 108 frames / 2011.3 ms
= 53.70 FPS. This differs in viewport, camera/lighting and imagery from the
prior 1433x1150, lower-Sun Bing comparison. It is neither a measured regression
from 59.96 FPS nor proof that added qualification ALU is free, and it does not
satisfy a claim of sustained medium 60 FPS. No source A/B, repeated best-run
selection, timer-query experiment or new performance gate was added.

The stationary and released-view screenshots retain complete structured clouds
without the former horizontal transparent rows or an obvious viewport-wide
trail/slab. Fine grain remains visible. One native middle-button vertical
gesture uses eight 8-CSS-pixel moves and changes the camera. Post-render
diagnostics still report stationary history; those timing-sensitive samples
do not qualify live continuous reprojection or per-pixel effective history.
Moved-history evidence remains the actual-GPU fixture. Screenshots do not
establish that the owner's dynamic shimmer is eliminated.

The new page's ground camera is restored; the page is retained for inspection
with medium, coverage 0.35, density 0.5, collapsed GUI and active default render
loop. Browser/render error state and console error/warning log are empty.
Architecture made no product/Spec/Test-file or service change, and did not
modify an existing owner tab. Six current records receive this review.
The complete 17-path candidate has no staged paths, upstream-owned changes,
generated changes or new SGP; SGP-0008/0009 remain frozen.

Conclusion: code-approved, not phase/visual accepted. Architecture retains
further live cost attribution, actual draw-time history/noise diagnosis and
owner quality/performance review. Execution holds without another coding,
browser or validation assignment. No checkpoint, commit, push or next phase.

## A13-AR-006 — Lossy log-depth round trip erases medium clouds

- Severity: `P1`
- Status: `fixed; independently confirmed by Architecture`
- Diagnosis/design/reviewer: Architecture Agent
- Implementation owner: Execution Agent
- Target: Globe medium phased producer and spatial resolve, not cloud material
  or the independently fixed A13-AR-005 statistical support.
- Base: `8aa5508e132a192ce0eecb80e27559b3f71734c0`; shared candidate retained.

The owner reports horizontal cloud strips during rotation and explicitly says
only medium is affected. Architecture reproduces the same failure class on
the accessible page with unchanged medium/mixed, coverage 0.35, density 0.5,
base 750 m, thickness 4500 m, cloudTime 0, high Sun, Natural Earth II and WGS84
Ellipsoid. This is a controlled diagnostic camera, not a claim to recover the
owner screenshot's exact camera: 15E/45N, altitude 9000 m, heading 0, pitch
-0.3 rad, drawing buffer 1600x900. Four preliminary steeper-view phase captures
did not reproduce the strips; the oblique view does.

### Current-frame evidence and root cause

The failing frame reports `camera-cut-spatial-only`, weight 0. In a fixed
400x300 full-resolution rectangle, 16,641 directly traced low samples have
valid cloud opacity; 13,336 corresponding traced full pixels become exact
`RGB=0, T=1`. At full pixel (601,301), low scene distance z is
0.0233154296875 while resolved current z is 0.0231475830078125: a 167.84668 m
disagreement under the 1,000,000 m encoding. Original cloud RGB/T are finite
and nonneutral; the error is introduced during reconstruction, not by absent
cloud density or old history. The neutral no-support path then exposes ground
and shadows as horizontal gaps.

Draw-time inspection confirms identical raw depth texture, NEAREST sampler,
native projection/inverse projection and native frustum in the low/full passes;
their intended viewports are 800x450 and 1600x900. Native near/far are
0.1 / 708391.926050005 m. The producer uses
`czm_screenToEyeCoordinates(vec4(..., czm_readDepth(...), 1))`; resolve uses
the corresponding `czm_windowToEyeCoordinates(vec4(...))`. This reconstructs
near-one perspective depth from log depth before an ill-conditioned inverse
projection. Floating-point loss makes the two current endpoints disagree,
and strict finite-receiver qualification erases valid cloud support.

Cesium's existing
`Source/Shaders/Builtin/Functions/windowToEyeCoordinates.glsl` explicitly
provides a more accurate `(vec2, rawDepth)` overload. Its log branch sets
homogeneous w directly from decoded camera distance, avoiding that cancellation.
The current phased fixture instead uses near=100 m/far=20 km for Perspective,
so it does not witness this real small-near/long-range failure.

### Bounded GPU counterfactual

Architecture temporarily replaces only the two depth expressions with the
raw-depth overloads, keeping the product vertex shader/attribute layout,
uniforms, textures, camera, cloud parameters, geometry tolerance and history
weight 0. Both instance command substitutions and temporary programs are
removed after the single render. The corrected draw shows complete cloud
bodies rather than horizontal holes. In the same rectangle, all 16,595 valid
direct samples survive (zero transparent losses); at (601,300), producer and
resolve both publish scene z=0.0230255126953125. This draw is phase 2 and the
original witness is phase 1: counts are per-frame diagnostics, not a paired
noise image, performance result or new acceptance metric.

Two initial diagnostic setups were invalid and excluded: replacing the only
native builtin dependency caused a compile error, and a generic viewport
vertex program did not match the product vertex attributes. The valid
counterfactual preserves the original vertex source and native window builtin
dependency. These are diagnostic setup failures, not additional product fixes.
The page was subsequently reloaded to discard temporary state/error UI, and
its saved camera, exact JulianDate fields, medium parameters and visible
controls were restored. Input and default render loop are active; page errors
are empty. No source, Spec, Test executable or service was changed by diagnosis.

### Disposition and validation gap

Use the precise native overload only in Globe phased tracing/resolve; keep
nonphased/Planar formulas, raw-clear classification, receiver-plane bound,
foreground rejection, history policy and sampling/resource budgets unchanged.
Do not raise near, enlarge 16 m/storage tolerance, erase a gate, change noise
or revert to full-resolution medium to hide the failure. The
[bounded assignment](../plans/2026-09-04-phase-a13g-globe-performance.md#current-correction-a13-ar-006-precise-phased-depth)
adds a fixed small-near Perspective log-depth producer/resolve regression to
the existing GPU fixture, with an independent analytic endpoint and rejected
old-depth mutation. Correct the artificial Orthographic/log fixture to native
Orthographic linear depth; `Scene.js` disables log depth for that projection.

A13-AR-001..005 remain fixed; candidate 3 is changes-requested and owner quality/
performance is not accepted. Only the two shaders, existing Spec and six
active records are authorized. Architecture made records-only repository edits;
upstream-owned/generated/new-SGP deltas are zero and SGP-0008/0009 stay frozen.
No commit, push, checkpoint or next phase. Architecture retains independent
review and corrected-source live rotation/cost checks after Execution reports.

Assignment preparation: scoped Prettier and Markdownlint pass for the six
updated records, and `git diff --check` passes. The complete retained candidate
still has 17 changed paths, zero staged paths and zero upstream/generated
paths against the official baseline. No product Spec or performance suite was
run during this Architecture diagnosis; Execution's focused regression is
pending. Temporary GPU draws are diagnostic evidence only.

### A13-AR-006 execution result — 2026-09-04

Only the phased Globe depth expressions change: CloudFS calls
`czm_screenToEyeCoordinates(cloudCoordinates, rawDepth)` and CloudResolveFS
calls `czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth)`. The explicit
window builtin dependency remains. Nonphased Globe and Planar retain their
existing expressions; raw-clear gating and native encoding/program selection
are unchanged. This follows ADR-0043's raw-depth/native-encoding authority,
without changing that historical record or implementing a custom log inverse.

The existing phased fixture now uses one fixed Perspective near/far of
0.1 / 708391.926050005 m and receiver plane `z + 2*y + 24000 = 0`. CPU ray/plane
intersections independently supply expected distances and raw log encoding.
Across the existing four phases, compiled producer depth feeds the controlled
cloud resolve. Producer and resolved scene endpoints match the analytic oracle
within the existing binary16 assertion; every full-resolution pixel immediately
retains nonneutral valid clouds with history disabled. Restoring only the two
old reverse-log/vec4 expressions violates the analytic endpoint bound and
changes the resolved distance publication. This mutation result is not a
claim of a live pixel-for-pixel visual comparison or an added tolerance.

The unreachable Orthographic/log fixture is replaced by Orthographic linear
depth, keeping its endpoint and one-pixel coordinate assertions. All existing
statistics, motion, foreground/finite/clear, sloped receiver, no-support,
packing and odd-size checks remain. No fixed witness parameter search or
implementation deviation was needed.

Executable changes are limited to CloudFS, CloudResolveFS and this existing
Spec. The six authorized records receive this append. Added resource/texture/
FBO/pass/command/persistent-byte/API deltas are zero; upstream-owned/generated/
new-SGP deltas are zero. SGP-0008/0009, renderer, Test, materials, phase/STBN,
sampling tiers, tolerances, statistics and history policies remain unchanged.
No owner-browser/service or performance operation occurred. Actual corrected
rotation quality and cost remain Architecture-owned; no owner pass is inferred.

Final-source checks, sequential on Chrome 152:

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`
  — 1/1 SUCCESS, 76.027 s fixture time.
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`
  — 1/1 SUCCESS, 48.416 s fixture time.
- `npx eslint packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
  — exit 0.
- `npx prettier --check --ignore-path .gitignore` for the Spec and six active
  records — pass; `npx markdownlint` for the six records — exit 0.
- `git diff --check` — exit 0, retained LF/CRLF warnings only.

Unchanged lifecycle evidence is reused. No aggregate/controller/package/type/
asset/full matrix was run. Status: `review_ready`, shared tree unstaged,
uncommitted and unpushed; independent Architecture review pending.

### A13-AR-006 independent review and corrected-source observation

Architecture confirms the two precise overloads are limited to Globe phased
branches. Nonphased/Planar expressions and native builtin discovery remain
intact; clear classification, receiver/foreground bounds, history/statistics,
phase/STBN and resource policies do not change. The fixed Perspective fixture
uses independent CPU plane intersection and raw log encoding; actual product
producer depth feeds the controlled resolve in all four phases. Both producer
and full output match the independent endpoint, while history-off cloud color
stays nonneutral throughout the full output. The former-expression mutation
violates the endpoint bound, not merely an arbitrary image hash. Orthographic
coverage now uses its actual native linear encoding. No further actionable
finding or implementation deviation was identified. Reuse the two final-source
GPU successes and unchanged lifecycle evidence without another test run.

The existing owner page is reloaded once to load final source. Inspection of
the actual compiled Cloud/Resolve log programs confirms both precise depth
calls are present. At the diagnosed 15E/45N, 9000 m, -0.3 rad oblique view,
the corrected product retains complete cloud bodies rather than horizontal
transparent gaps. One native middle-button gesture from CSS (800,450) to
(800,458) captures the first changed post-render frame and temporarily pauses
the default loop for inspection. That frame is phase 2,
`continuous-reprojected`, history valid, weight 0.82, with no page errors;
cloud bodies remain complete. This is actual movement evidence, not a later
stationary diagnostic relabeled as rotation. It does not prove every pixel
uses history or exclude subtle shimmer under every possible gesture.

The original world-space camera, exact JulianDate fields, medium/mixed,
coverage 0.35, density 0.5, base 750 m, thickness 4500 m, cloudTime 0, other
effect values and visible GUI controls are restored. Input and default render
loop are active, GUI collapsed, page retained, errors empty. At that restored
1600x900, high-Sun Natural Earth II/WGS84 view, one two-second post-render
window records 120 frame intervals / 2001.3 ms = 59.9610 FPS. Counting begins
at the first callback, excluding the diagnostic pause interval. No repeated
best-run selection, GPU timer or source A/B was performed. This representative
cadence is not a sustained/all-view 60 FPS certification or proof of zero
added shader cost; the prior 53.70 FPS observation is not a controlled pair.

A13-AR-006 is fixed and candidate 3 code-approved. Owner visual/performance
acceptance remains open; fine grain and untested motion conditions remain
explicit limitations. Architecture updates only the six records. The retained
17-path tree is unstaged/uncommitted/unpushed, with upstream-owned/generated/
new-SGP deltas zero and SGP-0008/0009 frozen. Scoped record Prettier/Markdownlint
and `git diff --check` pass. Execution holds without further coding, browser,
validation, checkpoint or next-phase work until a new concrete assignment.

## A13-AR-007 — Stochastic cloud depth rejects stationary history

- Severity: P2, current medium cloud-noise quality issue.
- Status: `fixed; independently code-approved; owner quality/performance pending`.
- Diagnosis/design/review owner: Architecture Agent. The bounded
  [assignment](../plans/2026-09-04-phase-a13g-globe-performance.md#current-assignment-a13-ar-007-cloud-depth-support)
  is closed; Execution holds.
- Target: current Globe phased cloud color-history acceptance, not the
  already-fixed spatial strip defect, cloud shape, Moon or fixed-world shadows.

The owner supplies UE and current cloud images. The visible difference is
broad smooth internal shading versus fine pervasive grain; the UE image does
not establish its engine version, render mode, sample budget, post-processing
or a camera-matched performance baseline.

Architecture inspects the actual corrected source and the current owner
page without changing parameters or camera. State: medium/mixed, coverage
0.3, density 1, base 750 m, thickness 4500 m, cloudTime 0, high Sun 67.484
degrees, Natural Earth II/WGS84 ellipsoid, 1433x1150 drawing buffer. The fixed
ECEF camera is approximately (4362507.722, 1157786.737, 4494302.192), direction
(-0.825980816, 0.563487366, 0.015416892). The product reports
`exact-stationary-temporal`, history valid, nominal weight 0.9.

A temporary shader copy preserves the real resolve program, vertex layout,
uniforms, current low-MRT and previous product history. It executes after each
original resolve into separate diagnostic attachments; product attachments
are never replaced by diagnostic data. Exactly four consecutive phases are
observed, with one fixed bottom-origin crop x=200, y=100, width=800, height=800.
Temporary readback reports the actual late per-pixel flags and final weight:

| Phase | Current valid | Current + previous valid | Color history reused | Rejected only by cloud mean/front distance |
| ----- | ------------: | -----------------------: | -------------------: | -----------------------------------------: |
| 0     |        596489 |                   592389 |               260003 |                                     314522 |
| 1     |        596832 |                   592102 |               246162 |                                     327346 |
| 2     |        596441 |                   592560 |               262584 |                                     312274 |
| 3     |        596760 |                   592058 |               245939 |                                     327492 |

Color reuse is only 41.2-44.0% of current-valid pixels. Among pixels valid in
both frames, 52.7-55.3% fail only mean/front checks while scene, transmittance
and radiance checks pass. Scene-distance failures and early-return pixels are
zero in this crop. Front-distance error's 90th percentile is 3.41-3.56 times
the existing tolerance; mean-distance error is 2.46-2.56 times. These are
dimensionless ratios, not an authorization to multiply the thresholds.
Transmittance rejection is approximately 2.9-3.1% and radiance rejection below
0.02% of the both-valid population; categories can overlap.

Source causality: the producer starts its progressive march with frame-STBN
jitter over twice the initial step; that step is at least 50 m for medium and
grows with entry distance. Front distance is the first positive sampled
density, and mean distance is an opacity-weighted estimate. Phased spatial
reconstruction also changes which rays contribute to each target. The history
gate nevertheless requires both estimated cloud anchors to agree within
binary16/16 m reconstruction error plus a pixel radius. That bound addresses
coordinate/storage precision, not estimator variance. With stationary
camera/cloud/material/light state, this gate rejects different estimates of
the same volume as if they represented changed hard geometry. Raising nominal
history weight cannot repair a weight already multiplied by zero.

This confirms a material obstacle to noise accumulation in this view, not
the complete cause of every grain pixel or proof that a proposed fix reaches
UE quality. No counterfactual multi-frame denoiser, parameter sweep, extra
Spec, FPS/GPU-time claim or product change was made. The prior A12 crop used
the old full-resolution path and different view; its narrower finding must
not be generalized to this phased case. Other tiers were not measured here.

All borrowed framebuffer wrappers, temporary textures/program/framebuffer and
the command-instance wrapper were removed in finally cleanup. Default loop
and camera inputs are restored, original parameters/camera preserved, current
page reports no render/controller errors. An initial diagnostic expression
failed JavaScript parsing before execution and is excluded; after the old
browser connection disappeared, Architecture reattached the existing live
page and inspected its new current state instead of restoring stale state.

Follow-up: Architecture designs cloud-estimator-aware compatibility while
preserving real receiver/disocclusion, finite/clear, camera-cut, current-domain
publication and shadow semantics. See the
[phase follow-up](../plans/2026-09-04-phase-a13g-globe-performance.md#architecture-follow-up-a13-ar-007-no-coding-assignment).
Execution receives no coding assignment in this turn. Record-only changes;
product/upstream/generated/new-SGP/resource/API deltas are zero. No commit,
push, owner gate or phase advance.

Validation: scoped Prettier and Markdownlint pass for the five touched
records; `git diff --check` passes and the index remains empty. No product
tests are rerun for this diagnostic/record-only work. Browser cleanup leaves
the live page enabled, inputs/default loop active and error log empty.

### A13-AR-007 source-backed assignment — 2026-09-04

The owner approves the proposal and supplies local UE5.2 source. Architecture
completes the [audit](../discussions/2026-09-04-a13g-globe-performance-source-discovery.md#local-ue52-source-audit-and-a13-ar-007-decision)
and amends ADR-0048: phased-medium cloud mean/front use sampling-derived
longitudinal support, while selected-ray alignment, cloud foreground, opaque
scene classification/position and all existing cuts remain separate guards.
The initial no-assignment paragraph above records the previous turn only;
the current phase assignment supersedes it without closing this finding.

Execution may change only resolve GLSL, the existing phased fixture and six
current records. A real stochastic product-distance witness, known-error
color blend and old-point-gate mutation must distinguish the repair; existing
motion/scene/packing regressions stay mandatory. No producer budget, API,
resource/lookup, upstream/SGP, Planar or browser change is assigned. Execution
returns `review_ready` and stops; Architecture owns live quality/cost review.
No new product test, browser result, owner pass, commit or checkpoint is claimed
by this architecture-record-only update. Residual volume ghosting/grain and
medium performance remain open pending implementation and review.

Assignment-record checks: six-record Prettier and Markdownlint pass (zero
issues); `git diff --check` passes with retained LF/CRLF warnings. The index
is empty. Current-turn executable/upstream/generated/new-SGP/resource delta
is zero; no product test or browser action was performed.

### A13-AR-007 execution result — 2026-09-04

The phased resolve accumulates separate qualified mean/front longitudinal
intervals with the shared producer min/max/scale constants and projected
two-step jitter radius. Only cloud-valid, geometrically qualified samples enter,
including zero-tent samples. Current interpolation, statistics and independent
shadow ordering remain unchanged. Historical anchors are projected back into
the current ray domain; the selected previous ray has the original mean lateral
precision check. Historical cloud foreground and scene compatibility retain
their original precision bounds, without the sampling radius. Nonphased rules,
weights, clipping and current xyz publication are unchanged.

The single phased fixture now runs the actual product progressive march,
first-positive-density front and opacity-weighted mean for fixed jitter
`1/8, 3/8, 5/8, 7/8`. Spec-only substitutions define a radial support of
1000–3000 m, nonuniform density `0.2 + 0.8*sin(distance/90)^2`, occupied bounds
and cloud density 0.002; lighting inputs remain fixed. No distance estimator or
producer source file is replaced. Actual encoded distances feed resolve. The
controlled nonuniform color oracle uses known red 0.27, independent unit-count
clipping and the exact 0.9 blend within existing binary16 precision; error falls
in all four phases. Restoring only the old point gate discards that aligned-phase
benefit, despite exact matching clear scene classification. The fixed front
shift exceeds 80 m and the old precision gate; no radius or camera was tuned.

Additional checks in the same fixture establish qualified zero-tent distance
support, invalid/geometry-rejected exclusion, rejection outside cloud support,
and rejection of historical cloud depth 2120 m behind a finite 2000 m receiver
even though the qualified cloud interval includes it. These boundary cases
are controlled support probes, not fabricated stochastic distance evidence.
The two moved/advection transitions, same-UV mutation, xyz identity, raw-log
precision, slope, odd-size/phases, no-support, packing and cut checks remain.

Only CloudResolveFS, the existing phased Spec and the six authorized records
change in this correction. Added texture lookup/uniform/renderer-state/resource/
pass/command/history/GPU-byte/API deltas are zero. Upstream-owned/generated/new
SGP deltas are zero; SGP-0008/0009 and all prior candidate edits remain frozen.
The added work is bounded support/projection ALU, not a second gather. No UE
code/assets were copied, and no browser/service/performance work was performed.
Residual stale volume color, motion smear, grain and live cost remain for
Architecture/owner review. No implementation deviation or fixed-witness blocker.

Final-source validation, sequential on Chrome 152:

- `npm run test -- --includeName "reconstructs phased Globe medium clouds across depth and camera transitions"`
  — 1/1 SUCCESS, 145.944 s fixture time.
- `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`
  — 1/1 SUCCESS, 48.981 s fixture time.
- `npx eslint packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
  — exit 0.
- `npx prettier --check --ignore-path .gitignore` for the Spec and six active
  records — pass. The repository has no configured GLSL Prettier parser;
  changed GLSL is compiled by the assigned GPU fixture, with no added formatter.
- `npx markdownlint` for the six records — exit 0; `git diff --check` — exit 0,
  retained LF/CRLF warnings only.

Lifecycle results are reused unchanged. No aggregate/package/type/generator
or browser/performance matrix. Status: `review_ready`, unstaged/uncommitted/
unpushed, awaiting independent Architecture review rather than owner acceptance.

### A13-AR-007 independent review and live observation

Architecture confirms the ADR implementation: independent qualified cloud
mean/front intervals, shared producer step constants, current-ray projection,
selected-ray mean alignment and unchanged receiver precision. The correction
adds 33 resolve lines and 203 lines inside the existing phased fixture; other
executable diff counts are unchanged from the prior reviewed candidate. The
test's analytic density/support substitutions retain the actual product march
and encoded front/mean estimator. Controlled color is an explicit separate
oracle, not claimed physical radiance ground truth. Old-point-gate, zero-tent,
invalid/geometric exclusion, out-of-support and finite-foreground witnesses
are discriminating; previous motion/packing/depth assertions remain. Both
reported final-source GPU successes are reused without another test matrix.
Disposition: **A13-AR-007 fixed / code-approved**, no new code finding.

The existing owner tab initially still has the old resolve loaded. Architecture
saves its camera/parameters/time, reloads once to load the corrected product,
restores those inputs, and confirms the actual native log-depth program contains
the new support logic. State remains medium/mixed, coverage 0.3, density 1,
base 750 m, thickness 4500 m, cloudTime 0, Sun 67.484 degrees, Natural Earth II
and WGS84 ellipsoid, 1433x1150 buffer, same ECEF camera as the original diagnosis.
No alternate quality, material, light or camera preset is tried.

One temporary diagnostic copy of that real program runs after each original
resolve, into separate two-attachment targets with the original vertex layout,
defines, uniform map and current/previous product inputs. Four consecutive
native phases are observed in the same x=200/y=100/800x800 crop. The original
command still writes product history. Diagnostic output also evaluates the old
point gate on those same inputs; it is not a second historical render sequence.

| Phase | Current valid | Both valid | Actual color reuse | Old gate would reuse | New cloud-only rejection |
| ----- | ------------: | ---------: | -----------------: | -------------------: | -----------------------: |
| 0     |        596442 |     592420 |             574256 |               262334 |                     1182 |
| 1     |        597077 |     592171 |             573674 |               245191 |                     1140 |
| 2     |        596686 |     592810 |             574871 |               261734 |                     1132 |
| 3     |        596567 |     592168 |             573506 |               245653 |                     1125 |

Frames are 12844-12847. Actual reuse is 96.08-96.34% of current-valid pixels,
versus 41.07-43.98% for the old gate on the same inputs. Remaining cloud-only
rejection is about 0.19-0.20% of both-valid pixels. Scene failures and early
returns are zero in this crop; transmittance rejects 16806-17534 and radiance
52-117 both-valid pixels per phase, with possible overlap. Final product Cloud
RGB maxima in this crop are 0.721191/0.916992/1.036133; nonfinite components and
transmittance outside [0,1] are zero. This supports recovery of useful temporal
history, not a complete explanation of every residual noise pixel.

The matched stationary appearance has visibly less fine grain while retaining
cloud structure/internal shading. A normal-loop two-second cadence observation
before reload is 120 frames / 2008.6 ms = 59.74 FPS; after corrected-source
inspection and complete diagnostic cleanup it is 120 / 2002.3 ms = 59.93 FPS.
These exclude paused/readback/compile intervals and are not per-pass GPU timing,
sustained performance, a statistically significant speedup or an all-view gate.

Native middle-button vertical input starts at the observed canvas center:
40 CSS pixels produce 11.0817 degrees / 878.52 m motion and the frozen
`camera-cut-spatial-only` path, weight 0. One additional 10-pixel gesture from
the restored initial camera exercises the otherwise-unobserved continuous
path: 2.7704 degrees / 219.95 m, `continuous-reprojected`, nominal 0.82. Each
first changed frame is captured before further rendering; this is two bounded
classification witnesses, not a parameter search. Both cloud images remain
complete without horizontal strips, but look grainier than the stationary
result. No per-pixel moving-history attribution was measured, and these first
frames cannot exclude subtle trails or qualify sustained dragging. Motion
quality therefore remains an explicit owner gate, not inferred from mode 0.82.

Finally, all diagnostic textures/FBO/programs, borrowed readback wrappers,
command-instance override and motion listener/property are removed. Original
camera position is exact; direction delta is 2.33e-15. Parameter differences
are empty; time, dimensions, enabled HDR, default loop and input state are
restored. Browser/controller error and warning logs are empty. A preliminary
restoration expression referenced a nonexistent global Cesium before any
assignment; it was corrected to the existing instances' APIs, with no product
effect. A tool-call syntax error also executed no action. Browser handle IDs
were rediscovered after session reset; no replacement page was created.

Architecture changes only the six records. Upstream-owned/generated/new-SGP,
lookup/uniform/resource/API deltas remain zero; SGP-0008/0009 are frozen. No
commit, push, checkpoint or next phase. Execution holds; any further motion
noise diagnosis is Architecture-owned. Owner judgment remains required before
phase closure. Scoped record checks and ownership audit accompany this review.

Six-record Prettier and Markdownlint pass; `git diff --check` passes with the
retained line-ending warnings. The complete 17-path candidate has zero paths
present in the official upstream baseline, zero generated candidate paths and
an empty index. No product tests are repeated during this independent review.
