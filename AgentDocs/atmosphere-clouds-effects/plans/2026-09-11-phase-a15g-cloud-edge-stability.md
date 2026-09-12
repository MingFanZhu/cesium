# Phase Plan: A15-G Cloud Edge Temporal Stability

## Metadata

- Type: `phase`; status: `completed`
- Owner roles: Architecture Agent / Execution Agent
- Created / updated: `2026-09-11`
- Architecture design: `confirmed`; owner authorizes implementation
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Diagnosis: [edge temporal stability](../discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
- Policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md#a15-g-amendment--continuous-medium-cloud-coverage)
- Base: A14 `6e488bc50eb95535e39bcd2bb0c59268acbb9f7b`
- Branch: `feature/atmosphere-clouds-effects`; new upstream / SGP: none
- Review: [second correction verified; owner confirms improvement](../reviews/2026-09-11-a15g-cloud-edge-stability.md)

## Source facts and scope

The paused medium owner view alternates hit/miss samples at its thin fringe.
The resolve excludes those estimates from temporal color and additionally
rejects clipped transmittance differences above 0.08. Aerial composition also
discards any cloud color whose packed distance validity is false. Therefore
changing only the final mix cannot repair missing current coverage.

Only the SceneGIS-owned `SceneGISEnvironmentEffectsCloudResolveFS.glsl` and
its existing `SceneGISEnvironmentEffectsSpec.js` GPU fixture need product/test
changes. The renderer already supplies global history cuts, 0.9/0.82 weights,
camera/advection uniforms and ping-pong resources. Producer sampling, A14,
public APIs, high/low, Planar and opaque depth remain unchanged.

The renderer's `executeCloudPass` / `executeCloudResolve` consumes the GLSL
through generated shader JS; only GLSL is edited. `npm run test` routes to
`gulp test`, which builds shaders/Specs and runs actual Chrome WebGL fixtures.
No manual change to shader JS, barrels or Build outputs is allowed.

## Initial design and sequence

The second correction below amends steps 3 and 4 after the owner's residual
edge report; the earlier design is retained for traceability.

1. Within the existing geometrically qualified 3x3 loop, accumulate projected
   mean/front anchors over cloud-hit neighbors, independently of tent weight.
   When positive tent samples are transparent, use that current neighborhood
   mean as the distance anchor. Keep spatial RGBA exactly the existing tent
   estimate; publish supported validity so aerial composition can consume a
   subsequently filtered nonzero color. No previous-frame distance is copied.
2. Preserve current-hit distances unchanged. No positive tent support still
   returns immediately. No qualified cloud neighbor leaves the current
   publication transparent/invalid, removing stale cloud color immediately.
3. For medium only, an available transparent previous estimate can participate
   with matching scene depth. Cloud-bearing history still requires A13 mean
   ray alignment, both longitudinal support intervals and strict foreground
   checks. Keep bounds, camera/material/light cuts and gamma-1 clipping.
4. Medium transmittance confidence follows the same qualified neighborhood
   clipping instead of a second fixed 0.08 cutoff. Keep the radiance gate and
   current weights. Shadow length remains independently decoded/filtered.
5. Extend the actual GPU fixture with alternating hit/miss coverage, a
   transparent-history-to-hit case, disappearing local support and wrong
   opaque scene depth. Exercise a moving/advection anchor and retain the
   existing foreground, wrong-UV, first/cut and nonphased witnesses.
6. Inspect the native owner view at its saved camera/time/parameters; compare
   a bounded same-view cadence and temporal output, check motion and cleanup.
   Write review findings and actual evidence back here before the owner gate.

## Validation and exit

- Focused phased reconstruction GPU test: new behavior plus existing depth,
  phase, logarithmic-depth, camera/advection and camera-cut regressions.
- Existing nonphased/radiance-history and cloud MRT lifecycle tests protect
  scope and resource ownership; no resource/pass/category changes are planned.
- Relevant ESLint/format and mandatory AgentDocs Markdown checks. Existing
  unrelated formatting failures are reported rather than reformatted.
- Native same-view visual/cadence check, followed by owner visual acceptance.
  Numerical filtering alone cannot pass that gate. All temporary resources
  and listeners are released and the original view/pause restored.

The existing local support can still fluctuate when every nearby trace misses;
some sampling grain may remain. Neighborhood anchors can associate adjacent
volume surfaces, so moved edges and disappearing support are explicit risks.
No larger spatial filter, stronger history weight or frozen STBN is authorized
by this design. A15 stays active until review and owner acceptance; its local
checkpoint must precede any successor phase.

## Initial execution and handoff (superseded)

The owner rejects the first candidate because near and horizon edges still
jump. The follow-up below is active; the first candidate's evidence remains
historical and does not approve the corrected candidate or visual quality.

The first implementation and bounded verification completed. The three focused GPU
selections pass (159.848 / 51.711 / 38.843 s); Spec ESLint/Prettier and AgentDocs
markdownlint pass. Full AgentDocs Prettier retains 16 unrelated existing failures.
The long fixture now yields between synchronous GPU batches and has a 300 s
async deadline after observed harness timeouts; no settling render is added.
This is the only execution adjustment to the design.

The original-view paired sample reduces thin-band frame-to-frame opacity
variation by 78.39%. Twelve paired resolve GPU timings show median
1.992 -> 2.029 ms. The separate native cadence windows are not a qualified
same-workload comparison because later cloud parameter changes are observed.
The 60-frame
camera/wind check stays continuously reprojected without sample errors. The
original camera, exact TAI time, pause and viewport are restored. Final cloud
coverage/density/radiance are 0.3/1/2.8; these subsequent interface changes are
preserved. All diagnostic resources are released. Scope and limitations are
recorded in the review; these measurements do not close owner visual judgment.

Upstream-owned files changed: none; new / modified SGP: none. Final whitespace
and baseline ownership checks pass. Product changes are limited to the resolve
GLSL; the matching Spec and formal/collaboration records are the other changes.
No generated file is part of the candidate. The phase stays active and
uncommitted pending A15-AR-002 owner acceptance, then an isolated checkpoint.

## Owner-reported residual flashes: second correction

An eight-frame native gate probe finds 96.4-97.1% overall reuse, yet most large
remaining opacity transitions occur at rejected pixels. The fixed RGB
compatibility threshold rejects clipped HDR history; it was not addressed by
the first alpha-only correction. Camera/time are exactly stationary, but
stochastic mean/front distances also leave the A13 neighborhood interval.
Opaque-depth rejection is zero in both observed bands.

The source-based correction stays within the same resolve shader and Spec:

1. Medium uses qualified gamma-1 clipping for RGB as well as transmittance,
   with no second fixed RGB difference cutoff. Keep global radiance/material/
   light cuts, current local support, scene depth and previous-UV constraints.
2. Under the existing exact-stationary flag, identical integration rays do
   not require their stochastic cloud mean/front estimates to remain within
   one another's current sample interval. This relaxes only the longitudinal
   interval check. Nonnegative and foreground checks, opaque scene compatibility
   and ray alignment remain mandatory. Continuous camera/wind frames retain
   the A13 interval check. Current-domain distance publication stays unchanged.
3. Add actual-GPU witnesses for clipped HDR history beyond the former RGB
   threshold, fixed-ray stochastic distance changes, and rejection of that
   same unsupported distance during motion. Keep the finite-foreground witness
   explicitly stationary; exercise zero-tent support during real advection.
4. Run the changed phased fixture and nonphased/radiance-cut regression. The
   earlier resource lifecycle result is reusable: no resource code changes.
   Compare native near/horizon brightness changes using the exact candidate,
   then inspect the refreshed page. Do not alter the owner's current controls.

Initial same-input experiments identify both effects: disabling only the RGB
cutoff reduces large compressed-luminance changes by 72.2%; additionally
relaxing stationary cloud-distance matching reduces them by 85.7%, relative
to the first A15 candidate. These are diagnostic selection results, not owner
acceptance or proof of zero flicker. ADR-0048 records the narrower final policy,
which explicitly preserves static foreground rejection.

## Current handoff — 2026-09-11

The second correction is implemented and code review is complete. The focused
phased GPU fixture passes (169.118 s), including HDR and stationary/moving
negative controls. The nonphased/radiance-cut fixture passes (53.320 s) on an
unchanged-source isolated rerun after an initial resource-publication poll
timeout. The existing lifecycle pass is reused; no resource code changed.
Spec lint/format, changed-record format, AgentDocs markdownlint and whitespace
checks pass. Full AgentDocs Prettier retains its 16 unrelated existing failures.

The final same-input 16-frame comparison reduces large compressed-luminance
changes by 85.62% relative to the first A15 candidate at the second owner view.
Twelve paired GPU timings show resolve median 2.033 -> 1.741 ms with no disjoint
event; this does not establish sustained FPS. Motion yields one initial cut and
59 continuous-reprojected frames without sample errors. All temporary resources
are released; the native page retains the corrected shader and restored view.

The owner responds “已经好很多了” after inspecting the corrected page. Retain this
version and record substantial visual improvement, without interpreting the
feedback as a claim of zero sampling grain or acceptance of every moving view.
A15-AR-001/003/004 are fixed; A15-AR-002 remains the formal phase acceptance
item owned by the owner with Architecture Agent. No additional tuning or
successor work is assigned. A15 remains active, uncommitted and unpushed.
Upstream-owned changes and new/modified SGP remain none.

## Architecture closure — 2026-09-11

After confirming substantial improvement, the owner moves to the model-lighting
issue and authorizes its implementation. Architecture closes A15 with the
existing GPU, motion and cost evidence; no zero-grain guarantee is inferred.
A15-AR-002 is accepted with the recorded residual quality limits. Earlier
pending-gate statements are superseded. This record and the nine-path A15
candidate form an isolated local checkpoint before successor implementation;
the separate model diagnosis is excluded from that checkpoint. No push.
