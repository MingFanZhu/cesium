# P7 Planar Cloud Solar Sampling Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-12`
- Reviewer: current Architecture role under owner visual delegation
- Plan: [P7](../plans/2026-09-12-phase-p7-planar-cloud-solar-filtering.md)
- Predecessor: P6 `2ebce1700f`; upstream/SGP delta: zero

## Findings and final design

- Fixed, high: the legacy Planar Sun march uses kilometre integration length
  as material LOD. Real mipmapped thin density cells are averaged below the
  authored threshold and stop casting internal extinction. The controlled GPU
  witness rejects that rule and retains filtering for genuinely large pixels.
- Fixed, high: changing only LOD exposes stripes under low Sun because the old
  three full-segment samples undersample the restored density. That candidate
  was visually rejected despite passing its initial equation tests. The final
  design uses the same 2/3/4 sample counts over short consecutive doubling
  intervals, then the existing current-frame Beer atlas for remaining depth.
- Fixed, medium: the new Planar body receiver needs shadow-origin coordinates,
  not camera-local or absolute large XY. It borrows the existing CPU relative
  camera vector through one private vec3 callback, adds XY only and keeps Z
  absolute. Atlas reconstruction excludes the complete clipped local distance.

Cloud-shadow off/outside-cascade cases keep local self-shadowing, matching
Globe's division of work. Existing shadow switches, history reset on a warm
toggle, atlas generation/filtering and resource lifetimes stay intact. JSDoc
now states that the existing cloud-shadow setting also supplies distant cloud
self-shadowing. Native geometry shadows remain caller-controlled.

## Final validation

Seven relevant GPU cases pass: real thin material and local top clipping;
origin-relative Beer remainder and the actual CloudFS RGB consumer; retained
P6 near-thin/full-300-km quadrature; P2 real surface/large-XY/atlas lifetime;
both-world raw radiance-scale isolation; controlled material/incident validity;
and immutable Planar final composition. The last fixture initially failed
because its manually assembled source omitted the now-used shared shadow
library; its two source lists now match production assembly and the single
targeted rerun passes. Product assembly already included that library.

The real local column integrates tau approximately 0.2333 over 233.333 m.
Local coverage clips to 50 m at the layer top and zero for no intersection.
The Beer fixture reconstructs tau 3.0, then 2.6 after removing 200 m; missing
relative XY or adding camera Z would fail. Out-of-cascade/UV points return zero.
Actual CloudFS receives lower intrinsic RGB while transmittance and cloud
distances remain exact. The private callback borrows the existing vector.

Same-view day and low-Sun images are compared against P6. The rejected candidate
creates horizontal internal stripes; the final local/Beer split removes them
and restores underside structure without changing cloud support. The inherited
macro material is still soft/coarse and distant hue variation remains open.

Six interleaved GPU elapsed pairs at the saved medium ground view use frozen
actual custom uniforms/depth, 862 x 575 Cloud MRT and 1724 x 1150 resolved output.
Before: 3.360, 4.811, 4.505, 4.785, 4.545, 4.779 ms. Final: 3.257, 6.004, 5.854,
5.944, 6.269, 5.446 ms. Medians are 4.662 -> 5.899 ms (+1.237 ms). This is a
bounded cloud-pass cost, not FPS or a cross-phase cumulative timing claim.
One existing atlas sampler becomes active; no texture, FBO, command, pass,
history or persistent GPU-byte allocation is added. Initial filtering-only
timings do not qualify the final design and are superseded.

Full build, build-ts, tsc and scoped ESLint/Prettier pass. Full AgentDocs
markdownlint passes; full AgentDocs Prettier retains the same 16 unrelated
historical failures. The 100 m camera translation observation retains current
cloud support, and the original camera/lighting/effects are restored on the
formal P7 page with zero reported errors. No generated file, asset or upstream
file changes. The phase handoff records the independent local checkpoint.

## Remaining work

The owner's coarse-cloud issue is still open at the material topology level.
Architecture should adapt authored material/detail and evaluate radiometric
parity next, before rays and Moon. These fixes address two verified integration
and lighting defects; they do not claim full Globe cloud appearance parity.
No owner visual approval is pending. SGP-0008 remains consume-only.
