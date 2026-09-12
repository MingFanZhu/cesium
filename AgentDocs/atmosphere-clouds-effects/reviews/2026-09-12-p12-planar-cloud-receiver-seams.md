# P12 Planar Cloud Receiver Seams Review

## Metadata

- Type: `review`; status: `accepted`; created: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P12 plan](../plans/2026-09-12-phase-p12-planar-cloud-receiver-seams.md)
- Predecessor: P11 `39c440237c`; decision: ADR-0052 P12 amendment
- Upstream-owned files: none; SGP delta: none

## Findings and disposition

- Fixed P1: the current receiver was reconstructed from the packed cloud MRT
  scene distance, which saturates at 1,000 km. Near the horizon this position
  no longer belongs to the actual ground plane, so spatial qualification rejects
  cloud-bearing neighbors and publishes an invalid transparent pixel. Planar now
  reconstructs the source receiver from already available current raw depth.
- Fixed P1: quad derivatives cross distinct surfaces at silhouettes. Their
  cross product describes neither receiver plane, rejecting valid same-surface
  cloud samples. Planar now chooses the adjacent side closest in eye depth for
  each derivative, excluding clear and clamped out-of-viewport neighbors.
- Verified: the change is confined to Planar current spatial geometry. Existing
  clear/finite compatibility, receiver tolerance, projected cloud-front tests,
  packed distance/history, temporal weights, raymarch and materials remain.
  Globe retains the old code behind its existing compile-time branch.
- No renderer/API/resource/pass change. Four extra depth reads occur only for
  finite Planar receivers. New helpers stay in the existing owned shader module.

## Evidence

The original owner view is at approximately (85460, -143881, 1897), facing
(0.407886, 0.898953, -0.159725), medium/cumulus with coverage 0.24 and density 1.
Readback at a horizon row shows RGBA (0,0,0,1) and invalid distance, surrounded
by cloud pixels with transmittance below 0.004; receiver encoding saturates there.
Raw receiver reconstruction makes that row valid in all four phases. A separate
one-sided-normal experiment removes the box-silhouette rejection. An isolated
final-composite derivative experiment did not fix the seam and is not delivered.

The new actual GPU case uses the product resolve, linear HDR attachments and
log depth. It covers receivers at 2,000 km, a finite/finite/sky silhouette,
foreground occlusion, four medium phases and nonphased Planar reconstruction.
Compiled old packed-receiver and quad-normal mutations each reproduce holes.
The fixed implementation preserves known RGBA and foreground exclusion.

Five distinct actual GPU cases pass: the new P12 case, existing Planar P9 phased
cloud/transparent-edge reconstruction, Globe phased depth/camera transitions,
Planar camera/wind history with foreground rejection, and off-center cloud MRT
through both frusta/depth variants. P12's old-normal mutation evaluates quad
derivatives uniformly, matching the old code. P9's old-log-depth mutation now
matches multiline raw-depth calls as well; its original pattern affected only
Globe's target call, and its indirect Planar packed-receiver effect is no longer
an appropriate failure discriminator after P12. The corrected target-depth
mutation fails as expected; the production assertions are unchanged.

Full build, scoped ESLint, diff whitespace and ownership audit pass. All changed
paths are SceneGIS-owned; no generated output is staged. Changed-document
formatting and full AgentDocs Markdown lint pass. The mandatory full AgentDocs
Prettier scan reports the same 16 unrelated baseline files as P11, none changed.

## Visual, resource and performance evidence

The rebuilt live page at the original diagnosis pose no longer shows the thin
blue line or dashed box edge. The previously invalid horizon pixel now contains
cloud color, with transmittance approximately 0.000627 in final readback. The
latest owner pose at approximately (85239, -143464, 1984) also remains continuous
after restoration; sample/render errors are empty and the render loop is active.

RTX 3060 Ti / ANGLE D3D11, full resolve 1724 by 1150, cloud 862 by 575:
six alternating blocks comparing the P11 and P12 resolve programs with identical
camera/settings, 18 measured frames per state, no concurrent test renderer.
GPU command medians are 1.408 ms before and 1.323 ms after. Timer disjoint is
false and framebuffer identities/dimensions remain unchanged. The small median
difference does not establish a speedup or a hardware-independent budget; this
sample shows no resolved regression. Timer queries, temporary programs and the
per-instance execute binding are all released/restored after measurement.

## Limits and handoff

Packed mean/front/history ranges and the existing spatial sampling limits are
unchanged. Subpixel geometry without a same-surface neighbor remains subject to
the existing conservative receiver qualification. No new pass, resource, public
setting or relaxed occlusion gate is introduced. No unresolved finding blocks
P12. This is a self-review with owner-delegated visual acceptance, not an
independent-agent review. Architecture accepts the phase; the containing commit
is its independent local checkpoint. No push or successor activation is included.
