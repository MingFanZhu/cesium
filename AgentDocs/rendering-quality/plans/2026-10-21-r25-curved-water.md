# Phase R25: Regional ellipsoid water

- Type: phase; status: active, technical gate passed, owner visual gate pending; created: 2026-10-21
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner/reviewer: current task, implementation and architecture self-review
- Architecture review: confirmed from R8/R22 source and ownership boundaries
- Decision: ADR-0179; reuse SGP-0017 without changing upstream files
- Review: [R25 technical review](../reviews/2026-10-21-r25-curved-water.md)

## Contract and source facts

The owner authorizes regional curved rivers/lakes, automatic mesh LOD and existing FFT.
Retain ordinary local-plane water. Global oceans, ocean masks, new spectra, geoid models,
flow solvers and underwater cameras are excluded. R22's older visual gate stays recorded.
WaterSurface currently triangulates local XY, creates fixed 128 m tiles, and assumes
one +Z normal in displacement, transmission and reflected-bottom rejection.

Add explicit `geometryMode: "ellipsoid"` to WaterSurface, with ECEF PolygonHierarchy,
an ellipsoid and an explicit constant ellipsoid height or per-position boundary heights.
Require FFT and identity modelMatrix in this mode. The normal-centered regional chart
must fit one tangent hemisphere; its fixed coordinates preserve phase across tiles,
camera movement and the date line. No automatic conversion of existing local XY input.
Planar keeps its existing flat contract; curved water rejects a Planar World.

## Implementation

1. Build a private ellipsoid mesh backend. Triangulate outlines/holes once in a fixed
   regional chart. Clip triangle coverage into a lazy quadtree, generate only selected
   grids, and retain boundary heights during clipping. Use per-tile relative positions.
2. Select by projected cell size and curvature error, with a public tile budget and
   minimum spacing. Conform shared edges to the finest adjacent grid; no water skirts.
   Keep wave filtering continuous in camera distance/pixel footprint. Bound inactive
   GPU mesh cache and prune unused CPU branches; report selection/budget statistics.
3. Reuse the same FFT textures and water pass. Supply curved tangent frames and base
   positions to optics and update reflected-bottom rejection. Preserve picking,
   physical lighting, Clock, normal/pick ordering and borrowed-resource ownership.
4. Add a deterministic large-water example with concavity, an island, a sloping river,
   near/shore/high views and controls. Keep the existing Planar example for regression.

## Verification and exit

- CPU: constant/per-position ellipsoid height, holes/concavity, shared edge equality,
  date-line chart, valid bounds, near/far selection and bounded cache.
- Strict GPU: curved rendering/depth/picking, frozen/moving FFT, Planar rejection,
  physical lighting and resource destruction; regress existing WaterSurface/WindWaves.
- Browser: continuous camera height/pitch, shoreline/island and high overview; record
  geometry/cache counts and bounded timing on this machine. Owner visual gate is separate.
- Build/release/types, focused lint/format, review and independent local checkpoint.

## Risks

Regional FFT coordinates have projection distortion; this remains visual wind synthesis.
Boundary heights are interpolated in the chart, not a hydraulic river profile solver.
Mesh generation is synchronous and bounded by selected coverage, but complex coastlines
can dominate construction; measure representative large extents before qualification.
Screen-space reflection/transmission and above-water limitations from R8 remain.

## Implementation and verification handoff

All four implementation steps are complete. The private mesh uses exact ellipsoid vertex
placement, 16-cell leaf grids and shared edge coordinates; local depth optics use a
camera-relative osculating sphere, explicitly documented as an approximation. Selection
uses drawing-buffer pixels consistently with wave filtering. Procedural foam retains
global chart coordinates while periodic FFT coordinates are reduced per tile.

The new lake/river example and the retained local-water example use MSAA 1 plus FXAA,
matching the current deferred renderer's supported configuration. No renderer MSAA
contract or upstream source is changed. GPU mesh construction remains synchronous;
measured cold full frames reach 195–265 ms for new detailed views. This limitation is
visible in the review and user handoff, not hidden by density changes or settling logic.

Seven dev/release feature Specs and 22 related strict GPU regressions pass. Lake/river
E2E covers 25 continuous height/pitch samples each; both-world local-water E2E passes.
BuildRelease, buildTs, tsc and changed-file lint/format pass. Runtime, resources and the
unrelated native Globe black-background assertion are recorded in the review.

Next owner action: visually inspect `Test/Rendering/曲面河湖.html` for lake/river,
near/low/high views and animated waves, and judge whether first-visit construction cost
is acceptable for representative data. No new rendering phase or global-ocean work is active.
