# A12-G Globe Cloud Noise Reduction Review

## Status

- State: `approved; owner visual gate passed; phase completed`
- Reviewer: Architecture Agent
- Date: `2026-09-04`
- Phase: `A12-G`
- Frozen product base: `53465cf9bc8f3af1e935b3225c81364e380ea528`
- Plan: [A12-G](../plans/2026-09-04-phase-a12g-globe-cloud-noise-reduction.md)
- Open findings: `none; A12-AR-001/002 fixed; A12-AR-003 accepted under revised owner criterion`
- Owner visual gate: `passed; current grain strength explicitly accepted`

## Required review

Review the adaptation of the pinned reference variance clipping, finite
premultiplied color/transmittance moments, uniform identity and silhouette
preservation; confirm that the old extrema-only mutation fails a known-error
criterion. Existing current-domain distances, reprojection, cloud/scene-edge
rejection, packed shadow semantics and Planar execution must remain intact.
Resource/lookup/sample budgets and all A11 accepted product behavior are frozen.

One representative live crop did not show broad distance-history rejection;
this is not authority to loosen the distance gate or to claim all image grain
is explained. Final cloud detail/noise quality and motion stability remain
explicit project-owner judgments.

## Execution handoff — 2026-09-04

Candidate base is `52c21d616c7fa2a3d93e9c562264a16ee92e34dc`; no commit or
push. Only CloudResolve GLSL and the existing history fixture changed in
executable source. The GLSL carries the pinned reference path/commit and MIT
notice, accumulates finite moments in the existing nine reads, intersects
gamma-1 variance bounds with extrema, and uses one RGBA AABB fraction. No
independent color-channel clamp, variance floor or additional texture read is
introduced. All original compatibility, spatial/temporal weights, current
distance publication, packed-shadow and Planar formulas remain intact.

The fixture uses eight clean RGBA samples and one outlier. Actual compiled
clipping matches the independent endpoint `C+(N-C)*(1+sqrt(8))/9` within
`0.0005`, and the integrated red-channel clean-color error is lower than the
exact old extrema-only mutation. Uniform resolved attachments are unchanged;
a real cloud/clear boundary rejects incompatible history and retains the
clear-side spatial RGB/transmittance. Existing two-transition movement,
Orthographic reprojection, scene-edge, shadow and cut assertions remain.

Initial focused attempts exposed two fixture issues: an outlier alpha beyond
the frozen compatibility gate made the comparison invalid, and the directly
connected controller retained its initial celestial time while Scene alone
received the fixed test time. The outlier now stays within the existing gate,
and reset explicitly updates the controller at the same fixed time. No product
threshold changed. A literal clear alpha assertion also encountered existing
spatial binary16 rounding (`0.99951171875`); the final check requires exact
spatial-baseline identity and exact zero RGB instead of changing that kernel.

Final isolated command:
`npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`
passed `1/1 SUCCESS` on Chrome 152. The one final controller command,
`npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`,
did **not pass**: the history fixture passed within it, but three other existing
fixtures reported failures before Chrome crashed at 09:56:53. Execution then
interrupted the runner (exit 1), without retry; there is no complete aggregate
count. The reported failures were:

- `marches controlled cloud density into the bounded Beer atlas on the actual GPU`:
  history availability, rotated ECEF history, receiver texel movement and
  uniform/no-offset mutation assertions;
- `uses one camera-independent Globe primary light and owns Moon shadow state`:
  phase `0.9325904340582147` versus `0.9326044744950956`, and rejected mixed-frame
  value `0.29079706696821833` versus `0.29384491398532053`;
- `adds fixed Globe readable-night irradiance only to ambient domains on the actual GPU`:
  expected distinct night/native-shadow outputs were equal.

Those fixture bodies and their product paths are frozen and unchanged by A12.
No cause or baseline-pass claim is inferred; they require Architecture triage.
No A1/package/generator/type/standalone build/SGP/full matrix was run.

### Direct owner-view observation

The original tab was initially unavailable, then the owner reopened it.
Execution saved camera, parameters, raw JulianDate and the before image before
one reload. It restored high/mixed, coverage `0.3`, density `1`, cloudTime `0`,
scales `1/4/1/10`, and the exact saved camera/time. A temporary UTC-versus-TAI
restore discrepancy was corrected by exact JulianDate cloning before the
comparison; the final Sun label is `67.484 degrees`. Runtime source inspection
confirmed the new variance helper is compiled. No product/Test path was added.

Cloud bodies and cavities remain recognizable, but visible fine grain remains
obvious and a clear visual improvement is **not established**. One ordinary
drag/stop showed no obvious large screen-space trail. The page stays ready/HDR,
with zero browser/render errors and its default loop active; it is left at the
post-drag view. This is not owner acceptance. No further algorithm/coefficient
search was attempted.

### Audit and remaining decision

Upstream-owned changed `0`, generated tracked changed `0`, new SGP `0`;
SGP-0008/0009 consume-only. Resource bytes, texture/FBO/attachment/history,
program/command/pass categories, shader lookup count, primary/secondary sample
budgets, API/default/range and Planar deltas are all `0`. The only runtime cost
is fixed moment/AABB ALU in the existing Globe resolve. Architecture must judge
the bounded candidate and the unresolved visual-noise result before any further
work; no next phase or owner gate has been requested.

### Focused static validation

- `npx eslint packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`:
  exit `0`.
- `npx prettier --check --ignore-path .gitignore` with the changed Spec and six
  changed Markdown paths: pass. GLSL has no configured Prettier parser and is
  compiled by the isolated GPU fixture instead.
- `npx markdownlint` with those six explicit Markdown paths: exit `0`.
- `git diff --check`: exit `0`, retained LF/CRLF warnings only.

The six Markdown paths are this review, the A12 phase plan and source
discussion, extension README and extension plan, and ADR-0048. All document
changes append execution records without replacing Architecture findings.

## Architecture review — 2026-09-04

Target is the complete shared candidate over
`52c21d616c7fa2a3d93e9c562264a16ee92e34dc`. The diff stays within the two
authorized executable paths and six records. Reference provenance, the
existing finite-neighborhood reads, unchanged gates/publications and zero
resource/upstream/generated deltas were verified. Verdict: `changes-requested`.

### A12-AR-001 — P2 — Alpha-only differences collapse in-bounds RGB history

- Owner: Execution Agent; state: `fixed; Architecture confirmed 2026-09-04`.
- Target: `SceneGISEnvironmentEffectsCloudResolveFS.glsl`,
  `sceneGISCloudVarianceClip`, four-channel fraction loop.
- Evidence: the pinned reference `varianceClipping.glsl::clipAABB` computes
  its fraction from RGB only. The candidate adds alpha as a limiting
  dimension. For nine RGB values formed by repeating `0.125/0.25/0.375`
  three times, all with transmittance `0.75`, the RGB mean/sigma are
  `0.25/0.1020620726` and alpha sigma is exactly zero. History RGB `0.3125`
  is inside every RGB interval; history alpha `0.75048828125` differs by
  one binary16 ULP. Nevertheless the candidate returns fraction `0` and RGB
  `0.25`, erasing the usable color history. This is an analytic reproduction
  of the source, not a GPU or owner-visible measurement.
- Impact: small opacity-storage differences can replace temporal color
  accumulation with the current local mean; the exact-equal uniform fixture
  misses this failure. It can undermine the intended noise reduction.
- Required correction: use a coherent RGB-derived fraction and separately
  bound transmittance. Add this case to the existing actual-GPU fixture and
  prove in-bounds RGB history survives while alpha stays bounded. Keep all
  existing gates/weights and the uniform/outlier/edge evidence.

### A12-AR-002 — P1 validation blocker — Controller qualification is incomplete

- Owner: Execution Agent; state: `fixed; Architecture confirmed 2026-09-04`.
- The aggregate failed and its browser crashed. Independent Architecture
  isolation produced the following assertion results on the unchanged
  candidate, Chrome 152:
  - Moon-primary lifecycle: `1/1 SUCCESS` (0.018 s Spec).
  - Beer atlas: `0/1`, four failures (51.477 s Spec): history availability,
    rotated ECEF history, receiver texel movement and the legacy structured
    march mutation.
  - Readable-night: `0/1`, two failures (24.194 s Spec): mixed-direction
    mutation output equals its reference, and underside comparison energies
    are equal. Thus this failure is not limited to the aggregate run.
- The last two commands returned shell exit `0` despite their explicit
  Jasmine failures. Neither is a pass. No aggregate rerun was performed.
- Source leads, not final root-cause claims: the Beer fixture sets a fixed
  `scene.frameState.time` but calls `scene.renderForSpecs()` without that time;
  `renderForSpecs` forwards its argument to `Scene.render`. The Moon fixture
  hardcodes two phase goldens although
  `computeIcrfToCentralBodyFixedMatrix` selects loaded ICRF data or its TEME
  fallback. Its isolated success versus aggregate mismatch warrants checking
  data-readiness dependence. A12 does not change either product path.
- Required disposition: triage these three existing fixture contracts;
  narrowly correct only a confirmed setup/oracle error in the same Spec.
  Do not weaken or remove assertions, assume baseline failure, or modify
  frozen product behavior without returning the cause to Architecture.
  Once corrected isolated evidence is sound, run the required aggregate once.

### A12-AR-003 — P2 quality blocker — Visible grain reduction is unproven

- Owner: Execution Agent for evidence, Architecture Agent for scope;
  state: `accepted under revised owner criterion; explicit manual gate passed`.
- The controlled outlier fixture proves a numerical clipping benefit for its
  chosen input. Execution's preserved-view observation explicitly reports
  that obvious grain remains and no clear visible improvement is established.
  The two statements are compatible; the synthetic result cannot close the
  owner's requested image-quality goal.
- After A12-AR-001, repeat only one state-preserving comparison and ordinary
  drag/stop observation. Keep small cloud shapes, accepted lighting/shadows
  and all owner parameters fixed. If benefit remains unproven, stop and
  return the result for architecture reconsideration; no coefficient sweep,
  wider denoiser, new resources or owner-gate request is authorized.

The correction assignment is in the active phase plan. Architecture changed
only these records, not executable source. No commit/push/checkpoint or next
phase. A11 acceptance remains intact; A12 manual acceptance is not inferred.

## A12 correction execution — 2026-09-04

A12-AR-001 now uses RGB alone for the coherent clipping fraction and clamps
transmittance independently. The existing actual-GPU history fixture retains
the outlier/uniform/edge/motion checks and proves the recorded alpha-only ULP
case returns RGB `0.3125` and alpha `0.75`, not RGB `0.25`.

A12-AR-002 setup/oracle corrections stay in the existing Spec. The Beer
fixture now passes the same fixed time to controller update and Scene render.
The Moon oracle uses rotation-invariant inertial-frame phase instead of
ICRF-readiness-dependent epoch goldens, retaining the mixed-frame mutation
and existing tolerances. The readable-night probe now distinguishes local
`+Z` from its virtual Globe point's `+X` zenith; its controlled surface atlas
uses density `0.0001` so the 6 km zenith path has OD about `0.6`, rather than
OD `60` erasing both direction witnesses in half-float output. Product
lighting/shadow code is unchanged.

All four corrected isolated fixtures passed sequentially on Chrome 152.
A12-AR-003 remains unproven: this correction turn's browser discovery returns
no accessible tab. No replacement page was opened and no refresh, camera,
parameter or live-state mutation was performed. The earlier grain observation
is not superseded by a new visual claim. Resource, lookup, API, upstream,
generated and SGP deltas remain zero; the candidate stays uncommitted/unpushed.

### Correction validation and stop disposition

All commands ran sequentially; the following are Jasmine results, not inferred
from shell status:

| Command                                                                                                                | Result                            |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `npm run test -- --includeName "isolates cloud radiance scale transitions from temporal history"`                      | 1/1 SUCCESS                       |
| `npm run test -- --includeName "marches controlled cloud density into the bounded Beer atlas on the actual GPU"`       | 1/1 SUCCESS                       |
| `npm run test -- --includeName "adds fixed Globe readable-night irradiance only to ambient domains on the actual GPU"` | 1/1 SUCCESS                       |
| `npm run test -- --includeName "uses one camera-independent Globe primary light and owns Moon shadow state"`           | 1/1 SUCCESS                       |
| `npm run test -- --includeName "SceneGIS/Scene/SceneGISEnvironmentEffects"`                                            | 78 SUCCESS, 1 FAILED; 79 executed |

The sole final failure is `loads exact Globe assets and publishes the
height/time/projection render matrix`, at the unchanged assertion
`expect(matrixSunDirections[0]).not.toEqual(matrixSunDirections[1])`.
Both directions are
`(-0.8045541851616237, 0.5804529033998069, 0.12556667580871203)`.
The directly connected controller is initialized/updated before that loop;
inside it only `scene.renderForSpecs(time)` receives the two selected times.
This is direct setup evidence consistent with the fixed-time issue, not
proof of a newly introduced product regression. That fourth fixture is
outside the three-fixture correction authorization and was not edited or
rerun. The runner again returned exit 0 despite Jasmine failure. A12-AR-002
therefore remains a validation blocker; no aggregate retry or broader matrix.

A12-AR-003 also remains open because no accessible original browser tab was
available for this turn's one permitted comparison. No owner acceptance is
requested. Architecture must decide the bounded follow-up.

## Architecture focused re-review — 2026-09-04

The complete executable diff was reviewed on the same base. A12-AR-001 is
fixed: only RGB limits the common fraction and transmittance is independently
bounded. The exact one-ULP case exercises both compiled clipping and integrated
history reuse. Existing outlier, uniform, edge, distance and movement assertions
remain intact. The reported isolated history pass and its aggregate pass are
consistent with this correction; Architecture did not duplicate those runs.

The three A12-AR-002 Spec repairs are accepted. Fixed controller/Scene time
corrects the Beer fixture setup without altering intentional later celestial
transitions. The lunar phase uses the same geometric law in an independently
rotated inertial observer frame, preserving both product and mixed-frame
comparisons without readiness-dependent goldens. The lunar lighting probe
correctly separates its virtual Globe `+X` zenith from local `+Z`; its macro
is enabled only by this existing lunar probe. Reducing controlled atlas OD
from saturation restores a meaningful direction mutation without changing
any product coefficient or test tolerance.

The sole final aggregate failure remains open under A12-AR-002. Source tracing
confirms its cause: `SceneGISEnvironmentEffects.update(scene, time)` publishes
explicit celestial time through `prepareGlobeLighting`; background rendering
calls `updateFrame` without a new time and intentionally retains that published
time. The direct-connect time-matrix fixture never updates the controller
inside its loop. Supplying time only to `scene.renderForSpecs(time)` therefore
cannot change the stored Sun direction. No production authority change is
required. The phase plan authorizes the two small update sites in this fourth
existing fixture, then its exact isolated test only. The observed aggregate
remains `78 SUCCESS / 1 FAILED`; no unrun `79/79` claim is permitted.

A12-AR-003 remains open: no new accessible owner-view evidence exists. The
absence of a browser comparison does not reject the source correction, but
it prevents claiming the requested grain reduction. The overall review stays
`changes-requested` pending the Spec follow-up and visual evidence. This
re-review changed records only, with no product/upstream/SGP/resource delta,
commit, push, checkpoint or next phase.

## A12-AR-002 final Spec follow-up execution — 2026-09-04

Added only the two authorized `effects.update` calls before the existing
selected-time and final Orthographic renders. No assertion, parameter or
product change. Exact command
`npm run test -- --includeName "loads exact Globe assets and publishes the height/time/projection render matrix"`
passed `1/1 SUCCESS` on Chrome 152 (36.942 s Spec). The previous aggregate
remains `78 SUCCESS / 1 FAILED`; no new aggregate or other fixture was run.

A12-AR-003 remains open: original-tab discovery still returns zero accessible
tabs. No replacement page, reload or live-state mutation; no visual benefit
is claimed. New executable delta is only these two Spec lines.
Upstream/generated/new SGP/API/resource/Planar deltas are zero. Shared
candidate remains uncommitted/unpushed and returns for Architecture review.

## Architecture automated qualification closure — 2026-09-04

The final Spec diff contains exactly the two authorized explicit-time updates;
all previous product/fixture changes and existing assertions remain as reviewed.
The reported exact `1/1 SUCCESS` (36.942 s Spec, Chrome 152) closes the sole
remaining time-matrix failure. A12-AR-002 is fixed on that focused evidence
plus the other 78 passes from the preceding aggregate. No duplicate GPU run
or unobserved `79/79` aggregate is claimed. A12-AR-001 remains fixed.

Architecture also made one independent read-only browser inventory: the
in-app browser is present but its accessible tab list is empty. This confirms
the current observation blocker; no navigation, refresh or parameter change
was made. A12-AR-003 remains open because improved grain quality has not been
demonstrated in the original view. The overall review remains
`changes-requested` for this quality evidence only, not for another code fix.
Once access returns, only the already assigned state-preserving comparison
and ordinary drag/stop are permitted before further Architecture review.

No further implementation or automated rerun is assigned. Original-view
access is the next external dependency; no owner acceptance, phase completion,
checkpoint, commit or push is inferred. Architecture changed records only;
upstream/generated/new SGP/resource/API/Planar deltas remain zero.

## Original-page access restored — 2026-09-04

After the owner reopened the browser, Architecture independently selected the
successfully loaded original page. Its visible state is ready/HDR, high/mixed,
coverage `0.3`, density `1`, cloudTime `0`, cloud/background/aerial/surface
scales `1/4/1/10`, and zero browser/render errors. The current Sun label is
`66.913 degrees`; this live state must be preserved rather than reset to an
older recorded time. No refresh or parameter/camera change was made.

Execution may now resume only the previously assigned A12-AR-003 evidence:
preserve exact current camera/time/parameters before any necessary reload,
one valid same-state comparison and one ordinary drag/stop. Check the loaded
shader version so two frames of the same candidate are not presented as a
before/after pair. If a valid comparison cannot be established, report that
limitation without changing shader code or searching for another state.
No implementation, automated rerun, owner acceptance or phase completion is
authorized by restored browser access.

## A12-AR-003 execution access limitation — 2026-09-04

After Architecture reported successful access to the original tab, Execution
performed the required single read-only inventory. Its own browser surface
still returned `tabs=[]`. Thus Architecture's successful access does not
currently extend to this execution context. No tab was selected, opened,
refreshed or polled again; no camera, time, parameter, loop or shader changed.
Current-state capture, loaded-shader verification and a valid same-state
comparison/drag observation could not be performed. A12-AR-003 remains open,
with no visual benefit or acceptance claimed. A12-AR-001/002 stay frozen.
This update changes records only; no tests, product edits, commit or push.

## Owner criterion revision and final visual review — 2026-09-04

The owner explicitly removes mandatory same-view comparison and accepts that
fine grain can remain in close-range volumetric clouds. The earlier demand
for demonstrable matched-view improvement is therefore superseded, not
silently claimed as met. Normal-distance grain strength, preserved shape and
internal shading, and objectionable motion flicker/trails are the applicable
manual criteria. No zero-grain target or stronger filtering is authorized.

Architecture used its accessible original tab to inspect the loaded program;
the initial page still lacked `sceneGISCloudVarianceClip`. After saving public
settings, camera/frustum, raw JulianDate and loop state, it reloaded exactly
once and restored the scene. The final program then contained the variance
helper, RGB-only fraction and independent transmittance clamp. Public controls
needed no change; saved time and parameters were verified unchanged. This was
version correction and scene preservation, not a matching-view gate.

Direct final appearance retains cloud lobes, cavities, underside shading and
edge structure, with visible fine grain in nearby bodies. One ordinary
middle-button vertical drag and stopped capture did not show an obvious broad
screen-space trail. Limited captures do not establish absence of subtle
interactive shimmer, nor do they prove a numerical relative improvement.
The camera was returned to its saved position after observation. Final state:
high/mixed, coverage `0.3`, density `1`, cloudTime `0`, scales `1/4/1/10`,
Sun label `66.913 degrees`, ready/HDR, default loop active and zero errors.

A12-AR-003 is accepted as a residual quality risk under the revised owner
criterion and the completed bounded inspection; it is not an owner pass.
Architecture review is now `approved` for the explicit manual gate. No
further code, tuning, sample increase or automated rerun is assigned. No
product/upstream/generated/SGP/API/resource/Planar change occurred in this
review, and no commit, push, checkpoint or next phase was performed.

## Project-owner acceptance and phase closure — 2026-09-04

The project owner explicitly accepted the current grain strength and asked
to investigate performance next. A12-G is complete: Architecture approved,
A12-AR-001/002 fixed, A12-AR-003 accepted under the revised criterion, and the
manual gate passed. The retained validation is the preceding 78 aggregate
passes plus the corrected final fixture's isolated `1/1`; no unrun aggregate
result or quantitative visual improvement is claimed.

The local phase checkpoint contains only the reviewed resolve shader, existing
Spec and six records. Upstream-owned/generated/new SGP/resource/API/Planar
deltas are zero. Near-view fine grain and device-dependent subtle shimmer
remain accepted visual limitations. The requested performance investigation
is a separate follow-up after this checkpoint, not additional A12 code.
