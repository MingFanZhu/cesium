# R25 review: Regional curved rivers and lakes

- Type: technical review; date: 2026-10-21
- Target: feature/curved-water, R25 implementation and qualification
- Reviewer/implementation owner: current task, source-based architecture self-review
- Parent: [R25 phase plan](../plans/2026-10-21-r25-curved-water.md)
- ADR: ADR-0179; existing SGP-0017 reused unchanged
- Disposition: technical checks pass; owner visual acceptance pending

## Scope and integration

Explicit WaterSurface ellipsoid mode accepts ECEF PolygonHierarchy and fixed or
interpolated ellipsoid heights. Default local/ordinary water stays intact. A private
quadtree follows ellipsoid curvature, clips concavity/holes, conforms mixed LOD edges,
uses per-tile relative positions and shares the existing caller-owned FFT. Curved mode
rejects Planar World, nonidentity transforms and mismatched ellipsoids. The same water
capture/lighting/opaque/depth/pick path is retained; no additional full-screen pass.

All changed paths are SceneGIS-owned. Upstream-owned files changed: **none**.
No SGP manifest changes; no generated output is included. The local Xuanwu example's
MSAA setting changes to 1 plus FXAA because the current deferred renderer rejects 4.

## Evidence

- Seven SceneGISEllipsoidWater Specs pass in development and release with WebGL validation:
  coordinates/validation, several-hundred-kilometer ellipsoid placement and bounds,
  date-line/per-position height, concavity/holes, mixed-resolution edge vertex sets,
  rendering/pick/pickPosition, frozen/moving FFT and destruction, Planar rejection.
- Five existing WindWaves Specs and 17 WaterSurface Specs pass with WebGL validation,
  including independent CPU Fourier reference, both-world physics/optics and ownership.
- Two curved E2E cases pass: lake and river, near/low/high cameras, 25 continuous
  height/pitch samples each, visible tile budget/cache ceiling and complete destruction.
  Two retained Xuanwu E2E cases pass in Globe and Planar with wind/view/pause/cleanup.
- Visual inspection of lake overview/island, near/low/high views and river near/low
  captures finds continuous water coverage and wave appearance without visible block
  cracks in these views. This is implementation inspection, not owner acceptance.
- BuildRelease, buildTs and tsc pass. New readonly geometry/statistics and numeric LOD
  properties appear correctly in generated types; the private backend remains hidden.
  Existing upstream JSDoc warnings remain. Changed-file lint/format and document checks pass.
  The required full AgentDocs Prettier check reports 562 unchanged files with formatting
  issues; those unrelated documents are not reformatted. Full AgentDocs markdownlint passes.
- An exploratory broad `includeName Water` run also included native
  `Scene/Globe renders with showWaterEffect set to false`: its hidden-Globe assertion
  expects black but receives the default advanced environment background. That case
  creates no SceneGISWaterSurface. It was not changed or counted as a passing regression;
  no baseline rerun is claimed. Focused water suites above are fully passing.

## Construction, runtime and storage

Windows, RTX 3060 Ti / ANGLE D3D11, Playwright Chromium 151.0.7922.34, 1185×800,
HDR, MSAA 1 plus FXAA, physical sky/SSR, no height fog/clouds, 128² two-band FFT,
1 m minimum spacing and 512 leaf budget. Karma uses installed Chrome Headless 155.
Measurements qualify these deterministic examples only, not arbitrary coastline complexity.

| View            | Visible tiles | Triangles | Cold full-frame CPU | Warm full-frame CPU median |
| --------------- | ------------: | --------: | ------------------: | -------------------------: |
| Lake high       |             4 |       923 |              7.9 ms |                     3.0 ms |
| Lake low angle  |           379 |    191150 |            255.6 ms |                     8.7 ms |
| Lake near       |           347 |    178311 |            195.4 ms |                     8.7 ms |
| River low angle |            71 |     22337 |             58.5 ms |                     4.9 ms |
| River near      |           377 |    187889 |            265.2 ms |                     9.4 ms |

The first-view table freezes time, stops the automatic render loop, renders the new
camera explicitly and measures 12 subsequent frames. It includes the whole scene's CPU
work, not just water. Constructors cost 1.4–1.6 ms for these simple rings; this is not
the cost of building GPU geometry. Warm geometryBuilds is zero. Lake tour retained
13.3 MiB total mesh storage, with 7.3 MiB inactive; inactive storage ceiling is 16 MiB.

A separate bounded GPU measurement advances simulation by 1/60 s per frame, 12 queries
per condition, disjoint=false. High view water on/off full-frame GPU medians are
5.842 / 4.179 ms; near view 10.772 / 2.714 ms. Corresponding CPU medians are
4.0 / 1.9 ms and 8.9 / 2.4 ms. This includes water capture, optics and animated FFT;
it is not a pure FFT timer or a sustained frame-rate guarantee. No product GPU readback.

## Findings and disposition

1. **P1, fixed — mixed edge coverage:** using one finest spacing for an entire coarse
   side over-split portions touching coarser neighbors. Share exact coordinates only
   over touching intervals. The Spec compares complete interior edge vertex sets and
   ECEF positions for mixed-resolution pairs, rather than only common vertices.
2. **P2, fixed — foam phase:** periodic reduction is valid for FFT but not procedural
   shoreline noise. Restore chart offsets for foam; keep small periodic FFT coordinates.
3. **P2, fixed — measurement state:** waiting for zero builds after a GUI camera switch
   could read the previous frame. Stop the loop and explicitly render the new view before
   collecting costs and screenshots. Corrected E2E passes.
4. **P2, fixed — public type emission:** inline JSDoc tags incorrectly emitted a global
   geometryMode and untyped LOD fields. Separate tags; rebuild/types/tsc and declaration
   inspection confirm readonly instance properties and hidden private backend.
5. **P2, open limitation — first-visit cost:** synchronous detailed construction causes
   roughly 0.2–0.27 s full-frame pauses on these examples. Owner judges acceptability at
   the visual gate; if insufficient, reopen this phase for a separately designed bounded
   construction scheduler/Worker path. No fallback geometry or asynchronous readiness
   semantics are implied by this implementation.

## Remaining boundaries and next gate

Owner visual acceptance is pending. Regional chart distortion, piecewise boundary-height
interpolation and local osculating-sphere optical approximation remain explicit. This is
above-water regional rendering, without geoid conversion, hydraulic current, global ocean
coverage or a globally continuous FFT field. Tile budget can prevent target SSE; statistics
reports this. Offscreen show=true may still update FFT as in R22. Older R22 owner findings
remain in their original review and are not closed by this implementation.

No next phase is authorized. Continue R25 only for owner findings or explicit changes to
the cold-build requirement; otherwise await the lake/river example visual gate.
