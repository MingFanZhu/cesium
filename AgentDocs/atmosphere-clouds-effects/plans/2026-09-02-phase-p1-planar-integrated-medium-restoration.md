# Phase Plan: P1 Planar Integrated-medium Restoration

## Metadata

- Plan type: `phase`
- Status: `completed; delegated Architecture visual acceptance`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [A17 far cloud depth](2026-09-11-phase-a17g-far-cloud-depth.md)
- Frozen predecessor checkpoint:
  A17-G=`3cdd2958d1`; the initial A10 activation is historical
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-09-02`
- Updated: `2026-09-11`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [P1 Planar integrated-medium source discovery](../discussions/2026-09-02-p1-planar-integrated-medium-source-discovery.md)
- Decision:
  [ADR-0052](../../../Documentation/SceneGIS/Decisions/ADR-0052-planar-integrated-medium-restoration.md)
- Upstream patch: active `SGP-0008` consume-only; P1 upstream delta must be zero
- Open review findings: `none blocking; P1-AR-002 accepted foundation limit; P1-AR-001/003 fixed`
- Visual gate: `passed by Architecture under owner delegation`
- Current handoff: the owner confirms global metric Planar use, multiple/custom
  CRS and fixed-Z geometry in the
  [spatial-model discussion](../discussions/2026-09-11-planar-atmosphere-space-model.md)
  under ADR-0040/0042. The ADR-0040 height clarification fixes height directly
  to world Z without an environment base-height offset. EPSG:3857 is only the sample CRS. Adaptation
  implementation is authorized and active; retain the current
  candidate and evidence. Implementation does not imply visual acceptance,
  a checkpoint or successor implementation.

## Implementation assignment — 2026-09-11

The owner authorizes implementation after confirming global metric/custom CRS,
fixed +Z and direct world-Z height. Architecture extends this still-unaccepted
P1 candidate to correct its observed foundational quality limits before its
first checkpoint. This assignment supersedes the earlier same-UV/far-visibility
freeze below; it does not activate a successor phase.

1. Publish direct Planar Z and zero reference-ground Z in the private frame;
   preserve Globe state and existing public cloud-height controls.
2. Keep the current flat LUT and cloud assets, units, resource counts and
   quality sample budgets. Remove the 60–100 km camera-distance density fade;
   retain the explicit 300 km in-medium budget after slab entry. Filter Planar
   cloud detail using projected pixel footprint rather than integration length.
3. Adapt the existing cloud-history projection and variance clipping to Planar.
   Use a CPU-computed camera delta for previous-frame-relative positions,
   compensate wind, retain receiver/disocclusion checks, and reset on cuts,
   projection/material/time/light changes. No new history attachment or wait.
4. Add focused GPU evidence for high-outside slab visibility and Planar history
   translation/clipping/receiver rejection, plus direct-Z custom-CRS frame and
   existing MRT/lifecycle/Globe regression checks. Preserve the current P1
   composition evidence and inspect ground/above-cloud/high views on the page.

Executable paths additionally include the private atmosphere reference frame
and its existing private Spec. Cloud material assets, public API, upstream,
surface/cloud-shadow lighting, rays and HDR/celestial effects remain outside
this first foundation checkpoint. Their later roadmap entries remain deferred.

## Retained restoration goal

Restore and requalify the existing Planar atmosphere, aerial perspective,
exponential height fog and volumetric-cloud composition on the frozen A17
source. Establish the first direct actual-GPU final-composition authority, fix
only a currently reproduced Planar defect, and leave the deterministic direct
sample ready for project-owner judgment.

## Source baseline

- Planar already owns independent flat-slab LUTs, fixed-Z fog integration,
  Planar cloud assets/scheduler and same-UV cloud history.
- Current renderer order is Cloud MRT/Resolve followed by one full-resolution
  aerial/fog/cloud composite.
- The old 2026-08-27 white-fill screenshot is valid rejection history but is not
  a proven present-day root cause.
- The current direct page's plane and boxes are intentional baseline geometry;
  effects must be evaluated as a delta from that same input.

## Required execution

### Final-composition witness first

In `SceneGISEnvironmentEffectsSpec.js`, add or amend one focused actual-GPU
witness in the existing Spec file. It must run the real Planar programs against
immutable resolved HDR color/depth and cover, from the same inputs:

1. all A2/A3/A4 medium components disabled;
2. aerial perspective only;
3. height fog only;
4. clouds only;
5. aerial perspective + height fog + clouds.

Include exact-clear and finite-depth samples. Assert finite RGBA16F output,
unchanged alpha, component-off identity, foreground geometry preservation and a
nonuniform bounded cloud contribution. The witness must expose the first
divergent product value; source-string assertions or screenshot-only evidence
are insufficient.

### Product correction only after reproduction

If the current final source fails, trace the divergence through cloud selection,
mean/front/scene distance, Planar fog segment and final premultiplied composite.
Patch only the first confirmed product owner and add one compiled mutation of
the rejected formula/coordinate/depth authority. Do not tune public or private
intensities to make the witness pass.

If the current source already satisfies the contract, do not manufacture a
runtime change. Retain the focused final-composition evidence and proceed to
direct qualification.

### Direct Planar qualification

Update `Test/AdvancedEnvironment/planar.js` from retained/deferred wording to a
P1 direct observation surface. Keep the existing local plane, boxes, cameras,
lighting and lil-gui controls. Provide fixed actions or a clearly recorded
manual sequence for baseline, aerial, fog, cloud and combined states without
changing camera/geometry between them. Record ready/HDR and browser/render
errors; no retry, sweep, hash, convergence or automatic visual acceptance gate
is added.

## Authorized executable paths

Primary product surface, only after a reproduced failure:

- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`

Evidence and direct sample:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/AdvancedEnvironment/planar.js`
- `Test/高级环境-平面.html` and the existing Planar navigation label in
  `Test/高级环境.html`; page assembly only

Persistent records may update the active extension README, this phase plan,
P1 review/source discovery, ADR-0052 and Architecture summary. No other
executable path is authorized without Architecture review.

## Frozen boundaries

- Globe A1–A17 product output, shaders, defaults and tests; only the direct
  sample's Planar navigation label may change.
- Public `SceneGISEnvironmentEffects` API/defaults/ranges and mode-specific
  calibrations.
- Planar LUT/cloud assets, package delivery, quality table, resource counts,
  history allocation and same-UV history policy.
- A5 Beer atlas/surface lighting/rays, A6 Globe reprojection, A7 bloom/lens,
  A9 readable night and A10 Moon.
- Upstream-owned paths, SGP-0008, SGP-0009, generated modules and Build outputs.

## Validation

- Run the focused new/amended Planar final-composition witness first.
- If product source changes, run only the existing focused Planar fog/cloud
  geometry/MRT fixtures directly affected, followed by the exact controller
  aggregate and private pipeline aggregate needed to catch scheduling/resource
  regressions.
- Run focused ESLint for changed JS/Test, Prettier for every changed executable
  and record, Markdownlint for active records, and `git diff --check`.
- Audit exact program/command/texture/FBO/history/GPU-byte deltas, public API,
  upstream-owned paths, generated files and SGP count.
- After automated evidence passes, perform one fixed direct Planar sequence and
  return review-ready. Do not infer Architecture or owner acceptance.

## Resource and ownership budget

P1 target delta is zero programs, commands, textures, FBOs, attachments,
histories, assets, requests, readbacks, dependencies and GPU bytes. Existing
Planar resources remain owned by the same controller/pipeline and retain their
failure-atomic lifecycle. Public API/default/range delta, upstream-owned delta,
generated delta and new SGP count are all zero.

## Stop conditions

Stop and return to Architecture if the reproduced failure requires a new GPU
resource/pass/history, a public property/default/range change, a Globe product
change, an upstream-owned path/SGP, an asset replacement, Planar shadows/rays,
Globe-style reprojection, a hidden world multiplier, spherical geometry,
Test-only runtime branch or change outside the authorized paths.

## Completion criteria

- Architecture independently closes all implementation findings.
- The final source has one direct actual-GPU Planar integrated-composition
  authority and no unproven product workaround.
- Architecture accepts the fixed direct Planar medium result under the owner's
  September 11 delegation of remaining Planar visual gates.
- Architecture creates one isolated local P1 checkpoint before activating any
  later Planar phase.

## Resumption design — 2026-09-11

The owner now requests the Planar sky/atmosphere/volumetric-cloud track after
accepting A17. Architecture confirms the original P1 boundary against current
source: `executeHdr` still runs Cloud MRT/resolve and one aerial/fog/cloud
composite; Planar keeps separate LUTs, fixed-Z geometry and same-UV history.
Globe A13/A15/A17 depth/temporal corrections remain macro- or mode-gated.
The graph's function locations are stale, so exact current source was inspected
after graph search and tracing returned insufficient results.

The preserved P1 stash contains only a Spec and page candidate plus old records;
it is not accepted output. Selectively recover the two executable hunks, review
them against current source and leave the stash intact. Strengthen combined
composition evidence with explicit optical ordering and foreground checks.
Use source HTML for labels instead of rewriting static markup through runtime
DOM traversal. Comparison buttons keep camera, lighting and geometry fixed;
manual effect changes must not leave a stale preset label.

The current page initializes with ready/HDR and zero reported errors. Its
visible cloud deck is coarse and horizontally strong; that is a remaining
quality question, not a confirmed depth/fog formula defect. Run the focused
composition fixture, then inspect fixed default/cloud-only and elevated views.
Only a reproduced product divergence permits a narrow correction in P1.
Resource code is unchanged unless such evidence proves otherwise; do not
rerun a broad controller matrix for a qualification-only candidate.

### Confirmed depth correction

The native page spans near `0.1 m` to approximately `28.8 million m`. A compiled
production Aerial depth block with the native `LOG_DEPTH` and
`LOG_DEPTH_READ_ONLY` pair reconstructs a 200 km forward receiver with
9.7–10.6 km radial error. The same lossy vec4 path remains in Planar cloud
producer/resolve; the producer also passes full-resolution pixels to its
low-resolution viewport. Correct only these three Planar branches using native
raw-depth overloads, with the producer's own viewport pixel coordinate.
Keep Globe code and all optical/material/resource policy unchanged. The focused
fixture must cover all three depth blocks, half-size producer coordinates and
the old Aerial expression as a compiled failing mutation. Reuse existing
linear/Orthographic and cloud MRT evidence with targeted current-source runs.

## Pre-amendment implementation and handoff — 2026-09-11

Three Planar-only depth expressions are corrected. The recovered composition
Spec uses the current 1,000,000 m distance encoding, verifies sequential
atmosphere-then-fog composition, explicit premultiplied cloud blending and
opaque foreground identity, and exposes all three actual product depth blocks.
Its half-size producer and old-expression mutation distinguish the correction.
Final focused composition, native opaque linear/log/Orthographic and cloud MRT
quality/lifecycle selections all pass. Final-composite GPU median is
0.139264 -> 0.113152 ms in one bounded eight-pair observation; no total-frame
or sustained-performance claim is made. Detailed evidence is in the review.

The page retains original geometry/cameras/parameters and provides Chinese
same-view comparison controls. Architecture code review is complete; P1 stays
active pending owner judgment of this basic integrated-medium result.
The retained cloud material remains coarse and the existing 60–100 km
camera-distance visibility fade removes clouds at the 120 km preset. These
are disclosed cloud-quality/visibility limits for subsequent adaptation,
not hidden by changing defaults, assets, camera or density here. No checkpoint,
push or next-phase implementation accompanies this handoff; the old stash is
preserved intact.

## Authorized amendment handoff — 2026-09-11

The implementation assignment at the top of this plan is complete as a
reviewable candidate: direct metric Z, far-cloud density visibility, pixel
footprint filtering and Planar camera/wind history projection with clipping
and receiver rejection. All 13 distinct targeted checks pass, including real
GPU Planar composition/120 km visibility/reprojection and Globe phased
regression. Resource lifecycle and scope audits pass; no upstream, public API,
asset, sample-budget or GPU allocation change. Current absolute GPU costs and
exact verification boundaries are in the amended P1 review.

The updated page was checked at ground/above-cloud/high presets and restored
to the user's prior camera, with ready/HDR and zero errors. Coarse cloud shape
and distant detail remain disclosed under P1-AR-002. Absolute weather sampling
still uses GPU floats; only the temporal camera delta gains CPU precision.
The owner has been asked to review this concrete first-stage result. P1 stays
active pending that judgment; no checkpoint or successor stage is activated.

## Delegated acceptance and checkpoint — 2026-09-11

The owner explicitly delegates visual acceptance to the agent and authorizes
continuing after each verified stage. Architecture closes P1 using the
existing 13 focused checks, exact ground/above-cloud/high observations and
recorded cost/lifecycle evidence; no redundant rerun is needed. P1-AR-002 is
accepted as a foundational cloud-material limitation, with remaining morphology
quality in the extension roadmap. This is agent acceptance, not a claim of
additional owner visual feedback. The commit containing this record is the
required isolated checkpoint before successor source discovery/implementation.
