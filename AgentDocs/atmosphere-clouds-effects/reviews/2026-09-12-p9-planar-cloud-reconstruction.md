# P9 Planar Cloud Reconstruction Review

## Metadata

- Type: `review`; status: `approved`; created/updated: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P9 plan](../plans/2026-09-12-phase-p9-planar-cloud-reconstruction.md)
- Predecessor: P8 `f19b7a271c`; upstream-owned files: none; SGP delta: none

## Findings and disposition

- Fixed, high: Planar's fixed cloudTime slice and stationary spatial-only
  publication retained stochastic noise. View sampling now advances per rendered
  frame and uses the existing history pair at stationary weight 0.9. Wind time
  remains caller-owned; no extra frame, timer or rendering loop is requested.
- Fixed, high: the old spatial kernel changed its center discontinuously and
  privileged occupied samples over empty samples. A same-view temporary tent
  comparison removed square blocks but exposed unresolved noise. Planar medium
  now shares Globe's four full-pixel phases, unbiased tent interpolation and
  geometrically qualified variance clipping. Low/high use a correctly centered
  unbiased tent without changing Globe's nonphased path.
- Fixed, high: producer ray/depth/STBN use the selected full pixel. Raw log
  depth and orthographic depth retain precision. Planar history continues to
  consume CPU double-precision camera delta and metric horizontal wind, with
  absolute Z, foreground rejection and current cloud support during motion.
- Fixed, medium: view STBN was also bound by the Beer producer. A distinct
  private shadow binding preserves the accepted Planar cloudTime-based atlas
  phase and Globe frame-based atlas phase. Cloud density, solar integration,
  shadow switches and all resource formats remain unchanged.

## Validation record

Same user camera, medium/cumulus, coverage 0.28, density/radiance 1, time 0,
low Sun: the full candidate removes the reported square outlines and leaves
cloud shape and internal shading visible. Daylight, cloud-top high quality and
continuous camera/wind movement also reviewed. View buffer remains 862 by 575
for a 1724 by 1150 full target. Subsequent rendered frames report no WebGL or
page errors. No new texture, framebuffer, pass or program category.

Eight distinct relevant cases pass across the bounded runs:

- Planar P9 and Globe phased reconstruction: four raster phases, both frusta,
  raw/log depth, stochastic depth, independent variance/coverage recurrence,
  transparent support, motion, foreground rejection and camera cuts.
- Planar P1 metric camera/wind history at large XY.
- Runtime discontinuity/reset, stationary phase advance and existing ping-pong reuse.
- Lazy allocation, quality resize, exact destruction and physical day/night input.
- Cloud-radiance history isolation and nonphased off-center MRT regression.
- Planar P2 surface Beer shadows, large XY and atlas lifetime.

Development build, scoped ESLint/Prettier and upstream audit pass. Full
AgentDocs markdownlint passes; full AgentDocs Prettier still reports the same
16 pre-existing unrelated files, while all changed documents pass. The final
directed pair explicitly reports two successful cases after the fixture
corrections; temporary reporter diagnostics are removed. The shared actual-GPU fixture runs
both world adapters, retaining independent ray/depth, variance and temporal
coverage oracles. Lighting-isolation fixtures fix their sampling phase so
Sun changes are compared on the same ray; frame advancement is verified
separately by the runtime invalidation/lifetime fixture. The legacy daytime
constant LUT also included direct sunlight at night, which P8's physical
subtraction reclassified as sky; the lifecycle fixture now supplies its
corresponding zero-solar night LUT. The old nonphased segment oracle explicitly
selects its original grid; P9's independent oracle covers phased geometry.
The negative Globe point-gate comparison remains Globe-only: Planar's shorter
stochastic front spread can already lie within its old neighborhood support.
No product tolerance or illumination was weakened to satisfy these fixtures.

### Bounded GPU cost

RTX 3060 Ti / ANGLE D3D11, same recorded low-Sun owner camera and medium
settings. Six interleaved pairs measure cloud plus resolve commands only,
with frozen source uniforms and no concurrent sample/test render loop:

- P8 source / stationary spatial resolve: 4.525, 6.953, 7.379, 6.513, 7.075,
  6.197 ms; median 6.733 ms.
- P9 phased source / temporal resolve: 7.480, 7.447, 7.077, 7.926, 7.319,
  7.852 ms; median 7.463 ms.

The measured median increase is 0.731 ms (10.9%) for these two commands,
with unchanged buffer sizes, textures and pass count. This is not a frame-rate
claim. An initial completed measurement lost its response to the CDP timeout;
the recorded asynchronous measurement avoids that transport limit. All query
objects and temporary programs are destroyed and instance bindings restored.

## Remaining limits

The first frame after a cut uses current spatial data; request-render callers
only accumulate on frames they actually render. Finite sampling can still
produce fine grain during motion or in the low tier. This phase removes the
reported reconstruction blocks, not all noise at arbitrary resolutions.
Ground bounce, rays and directional Moon remain separate successors.

## Gate and handoff

Architecture approves the P9 source, visual and bounded-cost result. Restore the
owner camera, cloud settings and surface brightness, remove temporary live
programs and resume the sample render loop. The containing commit is the
independent local checkpoint; no owner visual gate or upstream patch is pending.
