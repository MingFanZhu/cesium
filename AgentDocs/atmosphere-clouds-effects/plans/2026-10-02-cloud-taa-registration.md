# 云与 TAA 渲染投影配准

- Type: standalone plan
- Status: completed for checkpoint; owner approved commit; known validation limits retained
- Author: implementation / architecture self-review
- Updated: 2026-10-08
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Related: [A15 diagnosis](../discussions/2026-09-11-globe-cloud-edge-temporal-stability.md)
- ADR: ADR-0048, ADR-0094
- Review: [registration self-review](../reviews/2026-10-02-cloud-taa-registration.md)
- SGP: none planned; SceneGIS-owned changes only

## Confirmed failure and scope

TAA applies render-only projection jitter through UniformState. The environment
renderer instead builds `u_frustum` from the unmodified public Camera. Cloud rays
therefore disagree with depth reconstruction, and TAA resamples an unjittered sky
as though it were jittered. The cloud history already snapshots `u_frustum`.

The initial correction put cloud rays into the render-jittered grid. The owner
reported increased flicker, so it is superseded by the independent cloud grid
below. Keep Camera, picking, cloud trace budgets, semantic qualification and
0.9/0.82 weights unchanged. No new history, attachment, pass or public API.

## Execution and acceptance

1. Add a regression using real render commands with clouds and TAA, covering
   Globe/Planar, perspective/orthographic, the jitter sequence and TAA disable.
   Check actual cloud ray registration against the render projection, history
   frustum continuity, camera invariance and stable resource ownership.
2. Observe failure before the fix, then correct shared environment frustum
   construction and run the focused regression plus related temporal Specs.
3. Build and inspect real cloud frames with TAA, camera motion and foreground
   edges. Report remaining grain separately from coordinate registration.
4. Record bounded cost/lifecycle evidence, ADR clarification and self-review.
   Owner visual acceptance remains separate from automated correctness.

## Risks

Cloud sampling noise and opaque-depth-based final TAA are independent residual
quality limits. This correction does not implement cloud motion vectors or a
new denoiser. Existing cloud semantic depth gates must not be relaxed to hide
registration errors.

## Owner-reported residual flicker — 2026-10-03

The owner rejects the stability of the combined result. On the current paused
Globe medium view, 64-frame diagnostic runs show adjacent-frame RGB change of
0.622 without TAA versus 1.576 with TAA. Qualified cloud pixels failing the
longitudinal distance gate rise from about 0.5% to 3.5%; scene and lateral-ray
gates are not the dominant rejection. Current nearest-texel history selection
also quantizes the subpixel reprojection introduced by TAA.

The first follow-up candidate kept the render projection and replaced phased-cloud nearest color
history reconstruction with a bilinear footprint whose taps independently pass
the existing scene/cloud-distance checks. Do not interpolate encoded semantic
depths or packed validity/shadow data. Renormalize eligible color taps and reduce
history contribution by their supported footprint weight. Keep current depth
publication, variance clipping, camera cuts and the original nonphased path.
No public options, cloud trace samples, attachment or pass changes; at most six
additional history texture reads per phased pixel need bounded GPU-cost review.

Verify fractional history translation, foreground/clear-depth separation and
no supported-history behavior with a focused GPU fixture. Compare TAA on/off
under the same view and Clock, plus camera motion. Existing strict-validation
fixture failures remain tracked separately, not assumed to pass. Update ADR-0048
and ADR-0094 only after the measured candidate is accepted technically.

## Selected correction — independent cloud sampling grid

The qualified bilinear history candidate reduced TAA-on temporal variation only
from 1.576 to 1.293 and raised cloud resolve GPU time from 0.715 ms to 0.909 ms.
It was discarded. It did not sufficiently address the owner-reported failure.

Cloud trace, resolve and history now use the unjittered Camera frustum. Background
and aerial rays retain the render projection. Explicit UV offsets map stable
cloud pixels to jittered scene depth and resolved cloud radiance back to the
scene grid. Static physical rays use the existing stationary history path even
with TAA active. Composite filtering qualifies foreground visibility per tap,
interpolates premultiplied optical values and decodes semantic distances before
weighting. Packed distance alpha remains nearest-sampled. No additional pass,
attachment, trace samples or public API is introduced.

The earlier proposed bilinear history tests are replaced by stable-ray/depth
registration tests and a focused composite resampling/foreground regression.
Visual comparison and bounded GPU timing cover the selected correction.
A further Catmull-Rom composite trial raised temporal variation to 0.888 and
was discarded; the selected four-tap composite measures 0.863 versus 1.576 before
this follow-up, with TAA-off remaining 0.622. This diagnostic is not visual
acceptance or a zero-flicker claim. Remaining grain/resampling is documented.

## Finite-depth background noise — 2026-10-04

The owner identifies a noise layer in clouds backed by terrain, while clouds
backed by clear sky remain cleaner. GPU gate diagnostics on this view confirm
that scene-distance history rejection rises from 0% without TAA to about 15.4%
with TAA in the finite-depth crop. The stable cloud ray still reads the nearest
jittered geometry sample: its terrain endpoint moves along the receiver slope.
The existing radial/half-float tolerance does not account for that displacement.

Retain previous depth UV jitter in the cloud snapshot. For identical cloud rays,
account for the actual inter-frame jitter displacement using the locally
continuous depth slope, independently on each screen axis. Exclude clear-depth
neighbors and foreground/background jumps using the continuous side of each
axis. Keep original clear/finite classification, cloud foreground checks,
moving-ray gates and history weights. No cloud history bypass or global
tolerance increase is allowed. Verify a sloped receiver under jitter, genuine
foreground changes, zero jitter, and the owner's near-cloud finite/clear view.

Implemented and verified: receiver-distance false rejection falls from 15.4%
to zero in the identified crop, matching the clear-sky stability behavior without
changing that path. Five focused GPU/render regressions pass; same-view resolve
cost increases by about 0.02 ms. See the updated review for scope and evidence.

## Horizon reconstruction gap — 2026-10-07

The owner reports a thin terrain line through foreground clouds, also visible
with TAA disabled. GPU diagnostics identify a finite-depth horizon pixel whose
spatial support becomes zero on two of the four medium sampling phases: six
neighbors fail clear/finite classification and the other three fail the receiver
plane check. Globe currently derives that plane using screen derivatives across
the sky/terrain discontinuity. Planar already reconstructs the continuous side
from explicit depth neighbors.

Share that discontinuity-aware eye-space receiver derivative between both worlds
and transform its normal into the cloud world frame. Keep depth classes, plane
tolerance, foreground clipping, history and sample budgets unchanged. Verify a
synthetic finite/clear horizon across all four phases, a true foreground blocker, and
the owner's current view with TAA off/on. Measure the added neighbor depth reads;
do not retain stale cloud history or fill missing samples with unrelated sky.

A second GPU diagnostic confirms a separate composite leak at the same edge:
resolved cloud transmittance is zero, but `fwidth(sceneDistance - cloudFront)`
turns it into approximately 0.43 at the finite pixel adjacent to clear sky.
Restrict this reconstruction footprint to cloud-front variation. Opaque-depth
discontinuities must not soften an unrelated foreground cloud. Add an actual
GPU composite regression spanning a finite/clear boundary plus a near blocker.

Both corrections are implemented. The focused GPU regressions distinguish the
old expressions, retain near-foreground rejection and cover both world modes.
The owner's restored view no longer shows the terrain line with TAA off or on;
the diagnosed composite pixel now retains zero transmittance. No new pass,
attachment, trace sample or upstream patch. See the review for bounded GPU cost
and remaining visual-acceptance limits.

## Motion grain — 2026-10-07

The owner accepts the horizon correction but reports strong grain during camera
rotation and zoom. At the restored medium view, 24-frame GPU gate diagnostics
show about 64% finite-receiver history rejection during 20 m/frame forward
translation, versus zero while stationary. Rotation retains about 98% history;
its remaining grain therefore needs reconstruction analysis, not indiscriminate
gate removal. Global history is valid throughout both motion sequences.

Cloud-anchored reprojection observes different points on the same background
surface under translation. Comparing those receiver points for equality rejects
valid cloud history. For moving phased clouds, qualify receiver continuity by
distance to the current discontinuity-aware receiver plane instead. Preserve
clear/finite classes, original precision tolerance, cloud-front occlusion,
supported cloud-depth intervals, cuts and current-domain depth publication.
Stationary and nonphased paths retain their current behavior.

Evaluate subpixel history reconstruction for moving phased clouds: each bilinear
tap must independently pass receiver/cloud qualification before contributing
premultiplied color, and packed metadata must remain unfiltered. Keep stationary
history, weights, trace budgets and resources unchanged. Retain only if a fixed
motion path demonstrates improvement at bounded GPU cost. Add targeted actual
GPU tests for parallax on one receiver plane, real receiver changes, fractional
history translation and foreground rejection. Record the design in ADR-0048.
UE's separate tracing/reconstruction/upsampling is a design reference, not a
claim of equivalent settings or quality.

Implemented the plane continuity correction and qualified bilinear motion
history. Fixed-path rotation/translation screenshots show lower visible grain;
GPU resolve cost increases by about 0.50 ms on the measured device. Six distinct
focused regressions pass across the bounded runs, including both worlds,
foreground rejection and the existing Planar receiver-range case. The original
horizon correction was accepted by the owner; motion quality still requires
owner acceptance. See the updated review for evidence and residual limits.

## Accelerated playback — 2026-10-08

At the owner's 60x playback setting, 55 of 96 observed frames discard cloud
history solely because simulation time advances by more than one second.
Frame deltas range from 0.942 to 1.068 seconds: ordinary render timing crosses
this fixed threshold even though wind advection is only about 20 m per frame.
The same time-only cutoff exists in Globe cloud-shadow history.

Replace both cutoffs with a shared physical-advection continuity check, using
the existing 25 km translation budget. Check both unwrapped wind travel and
published cloud-offset displacement, so large seeks and the 200 km modulo
boundary still invalidate history. Keep caller-owned time, sun/material/camera
gates, per-pixel support, history weights, trace samples and resources unchanged.
Verify forward/reverse steps over one second, zero wind, large travel, modulo
wraps and resource reuse through the actual render pipeline. Recheck the owner's
60x playback and record visual evidence. This maintenance supersedes the earlier
one-second continuity policy; it does not clamp or slow the supplied clock.

Implemented for both cloud-body and cloud-shadow history. At 60x, all 96 live
frames retain history; frame-interval median is 16.7 ms and p90 is 17.7 ms on the
owner's device. A fixed 48-frame, 1.2-second-step replay improves from no temporal
frames to 47, with only the initial seek resetting. Both new strict-WebGL Specs
pass. The older warm-discontinuity fixture passes normally but still reports a
background draw error under strict validation; it is not counted as a strict
pass. See the review for evidence, resource checks and remaining limits.

## Checkpoint handoff — 2026-10-08

The owner approved committing the current result and intends to begin a new
major stage in a separate conversation. Close this standalone maintenance at
the present quality level; do not claim noise-free rendering or a complete
strict-validation pass. The review retains the unresolved background-draw
fixture errors and finite-sampling limits. No next feature or phase is activated
by this checkpoint. Code checkpoint `1d894f6f5f` and the preceding 49 commits were
subsequently fast-forwarded from `codex/gpu-particles` into local
`scenegis/develop` at the owner's request. The next conversation will create its
new stage branch from this updated develop; no new branch is created here.
