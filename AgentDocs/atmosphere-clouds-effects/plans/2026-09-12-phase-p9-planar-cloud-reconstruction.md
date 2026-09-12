# P9 Planar Cloud Reconstruction

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P8 `f19b7a271c`
- Decisions: ADR-0048 and ADR-0052
- Upstream/SGP delta budget: zero

## Confirmed problem and design

The owner rejects P8's retained grain. The current low-Sun medium camera
reproduces large square cloud edges. Planar still fixes STBN to cloudTime and
disables stationary history, whereas Globe medium traces four full-pixel phases
and accumulates qualified history. The old spatial filter also offsets its
kernel discontinuously and weights empty samples at 0.05; a live same-view
tent-filter comparison removes the large blocks but exposes remaining noise.

Share the accepted medium phase/tent/variance reconstruction with Planar.
Advance STBN by rendered frame, independently of cloud wind time. Reuse the
existing ping-pong targets for stationary temporal accumulation. Preserve CPU
double-precision camera deltas, direct-Z geometry, native shadow controls,
P6 integration, P7 solar sampling and P8 material. Planar phased depth must
reconstruct the selected full pixel, including log depth and orthographic rays.
Keep Globe's accepted behavior. No new resource, pass, quality option, timer,
automatic tier switch or requested settling frame.

## Verification and exit

- Actual GPU phase reconstruction: subpixel edges, transparent support,
  variance bounds, receiver rejection, metric camera/wind reprojection.
- Existing discontinuity/lifetime tests and Globe phase regression.
- Same user camera before/after plus motion, daylight and above-cloud checks;
  bounded command timing and unchanged allocation evidence.
- Scoped lint/build, relevant Specs, ownership audit and documentation checks.
  Record review and local checkpoint; restore user camera and settings.

## Completed handoff

Eight relevant cases, delegated visual review, build/lint and the ownership
check pass. The [review](../reviews/2026-09-12-p9-planar-cloud-reconstruction.md)
records fixture corrections, unchanged resources and the 0.731 ms median
cloud-plus-resolve increase. This commit is the independent local checkpoint.
Ground bounce, rays and directional Moon remain separate successors.
