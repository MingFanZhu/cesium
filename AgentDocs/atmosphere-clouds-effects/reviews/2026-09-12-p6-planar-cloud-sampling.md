# P6 Planar Cloud Sampling Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-12`
- Reviewer: current Architecture role under owner visual delegation
- Plan: [P6](../plans/2026-09-12-phase-p6-planar-cloud-sampling.md)
- Predecessor: P5 `b2c7655872`; upstream delta: zero

## Findings

- Fixed, high: Planar uniform primary intervals can exceed the nearby material
  scale by several times on horizontal rays. The near 200 m analytic GPU witness
  is completely missed by the old 300 km / 256 sampling schedule. Consecutive
  progressive intervals match analytic transmittance within 0.012; the old
  scheduler differs by more than 0.15. This is an integration defect independent
  of authored density or display exposure.
- Open follow-up, medium: cloud material remains coarse and over-soft, with
  bright flat regions and some distant hue variation. The same-view high-tier
  raster comparison and above-cloud images confirm that primary sampling alone
  does not establish Globe material/lighting parity. Architecture owns the next
  material/lighting adaptation in the extension roadmap; no owner gate is needed.

## Validation

Seven focused actual-GPU cases pass in Chrome 152: the new thin/complete-segment
fixture, conservative occupancy and exhaustive-density equivalence, both-world
four-preset sample ceilings, Planar camera/wind history and foreground rejection,
both frusta with linear/log cloud depth, immutable final medium composition,
and P2 Beer/surface lighting plus exact atlas lifetime.

The independent constant-density witness covers 125 m, 20,333 m, 300 km and a
600 km input clipped to 300 km. No endpoint tail is omitted; all transmittance
errors are below 0.001. Low still visits 32 intervals. Globe retains its existing
500-interval policy and passes the shared real-material/occupancy checks.

At the saved ground view, 1724 x 1150 resolved and 862 x 575 Cloud MRT, six
interleaved GPU elapsed pairs use the same frozen actual custom uniforms and
depth texture. Before: 3.752, 3.805, 3.642, 3.695, 3.649, 3.699 ms. After: 4.933,
4.569, 4.582, 4.949, 4.572, 4.555 ms. Medians are 3.697 and 4.577 ms: +0.880 ms
for the cloud primary pass, not full-frame/FPS data. The increase is accepted
for reduced near-path aliasing; maximum detailed samples rise from 256 to 512.
Texture, program category, command, FBO, history and GPU-byte increments are zero.

Delegated visual comparison covers the saved medium ground view, a 10 km cloud
view and 120 km high view, plus high-tier night. Ground horizon grain decreases;
cloud support, gaps and shadows remain. Above-cloud material changes little,
confirming the separate material limitation. No globe-space geometry or new
shadow control enters Planar. Original camera, lighting and controls are restored.

Build and scoped ESLint pass. Final documentation, ownership audit and local
checkpoint results are recorded in the phase handoff.

## Acceptance

Architecture accepts this bounded primary sampling repair, not complete closure
of cloud coarseness. Continue material/detail/lighting before treating that
user-visible issue as resolved. Rays and Moon remain later extension work.
No upstream-owned file changed; SGP-0008 is consume-only. No new SGP or generated
source is included. The commit containing this record is the separate checkpoint.
