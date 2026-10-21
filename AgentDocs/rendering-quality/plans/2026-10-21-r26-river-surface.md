# Phase R26: Directed river surfaces

- Type: phase; status: visual correction implemented, owner gate pending; created: 2026-10-21
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner/reviewer: current task, implementation and architecture self-review
- Architecture review: confirmed from R8/R22/R25 source and water scheduling
- Decision: ADR-0180; existing SGP-0017 unchanged
- Predecessor: R25 checkpoint d2ef77d1cd; its visual/cold-build follow-up remains recorded

## Authorized scope

Add SceneGISRiverSurface for a single ordered, continuous river in Globe and Planar.
The owner explicitly excludes confluences, branches, waterfalls, hydraulic simulation
and global oceans. Retain WaterSurface APIs and regional ellipsoid lakes. River heights
and velocities are authored independently; no terrain query or automatic hydrology.

## Current source facts and design

WaterSurface owns optics/shaders/picking and borrows the Scene's WaterFrame capture.
EllipsoidWaterMesh owns the R25 quadtree/cache; local WaterMesh provides clipped grids.
Existing flowSpeed is normal-wave phase/shore-foam drift, not a river velocity field.
Water shaders assume a horizontal or ellipsoid mean surface and require a dedicated
river branch for sloped base normals and advected details. Public JS/GLSL/Specs use the
existing automatic build discovery; generated wrappers/barrels are excluded from Git.

1. Introduce a private shared chart for exact ellipsoid placement or direct planar XYZ.
   Prepare ordered centerline cross-sections with widths, positions/heights and speeds.
   Triangulated strips carry station, transverse coordinate and velocity through clipping.
   Optional PolygonHierarchy clips the authored corridor, including holes. Reject folded
   or self-intersecting corridors; never assign another reach by nearest-point guessing.
2. Reuse the R25 quadtree and clipped-grid/cache machinery for prepared river coverage.
   Generalize only the coordinate adapter and interpolated river attributes. Keep shared
   LOD edges, culling/bounds, inactive cache limit and pick-pass command replay.
3. RiverSurface composes a WaterSurface through an explicit private prepared-mesh seam.
   Bind the exact live World before GPU work; expose independent current speed scaling,
   current ripples/foam and optional borrowed FFT wind waves. Keep public pick owner.
4. Add bounded two-phase procedural flow advection in river coordinates; support zero
   speed and Clock pause/reverse. Base slope participates in normals and local optical
   tests. Existing material/capture/lighting/depth passes remain shared; no flow solver.
5. Add deterministic two-world examples for bends, varying width/elevation/speed, optional
   bank mask/island and wind independent of current. Record first-build and warm costs.

## Verification and exit

- CPU: height/station/speed interpolation, bend topology, width/corridor validity, hole
  clipping, date-line chart, direct planar coordinates, and mesh seams under LOD.
- GPU: both-world pixels/depth/pick, zero/moving/frozen flow, optional FFT, strict World
  mismatch, hide/reuse/destruction and unchanged existing water paths.
- Browser: both worlds, near/overview/low views, speed/wind controls and continuous camera.
- Focused regressions, release/types/tsc, owned-path audit, docs and technical review.
- Independent local checkpoint before another phase; owner visual judgment remains explicit.

## Risks and boundaries

This is authored visual flow, not mass/energy conservation. Corridor turns must stay
non-overlapping; exact bank masks clip but do not extend the authored width envelope.
Regional chart distortion, screen-space optics, above-water limitation and R25 synchronous
first-visit mesh costs remain. No unrequested Worker/scheduler or fallback is added.

## Implementation and verification handoff

All five steps are implemented. Geometry uses the shared private chart and existing
regional quadtree; clipped source triangles preserve the river attributes across LOD.
The prepared-mesh composer keeps the public pick owner and exact World binding.
Current flow has independent bounded phases and pixel filtering; optional FFT remains
borrowed and unaffected by current controls. No upstream-owned file was changed.

Eight feature Specs pass in development/release, plus 29 existing water regressions.
Both-world E2E passes the near/low/high and 19-sample continuous camera sweep; resource
reuse, picks, bounds and destruction pass. Release/types/tsc, source lint and patch audit
pass. Full AgentDocs markdownlint passes. The required full AgentDocs Prettier check
reports 562 unchanged files; all modified documents pass scoped formatting and unrelated
formatting is left intact. [Technical review](../reviews/2026-10-21-r26-river-surface.md) records implementation
findings, their fixes, CPU/GPU costs and inherited synchronous first-visit limitations.

Next owner action: inspect `Test/Rendering/河流水面.html` in Globe and Planar, especially
bends, changing flow speed, zero current, water-level adjustment and optional wind.
The technical checkpoint does not claim visual acceptance. No next phase is active.

## Owner feedback: white streaks and directed waves

The owner rejected the broad regular white stripes and weak regular normal ripples.
At the reported near-water Globe view, setting currentFoamIntensity from 0.2 to zero
removes the broad white stripes; the remaining narrow highlights are water lighting.
The current river branch only perturbs fragment normals, so current waves have no
geometric height despite the existing mesh LOD. Reopen R26 from checkpoint 0adb7fe888.

Correction: disable artistic current foam by default. Share a bounded, multiband
river-coordinate height field between vertex displacement and fragment normals;
positive station advection follows bends and authored speeds. Retain the independent
optional FFT wind source and two-phase advection for bounded distortion with varying
speed. Use continuous position-dependent mesh/pixel filtering, shore fade, and include
the maximum authored current amplitude in culling, draw and public bounds. No extra
render pass, texture, simulation state, mesh rebuild or upstream integration is needed.
Expose amplitude and wavelength in the example, with a near-water view for acceptance.

Validation targets actual GPU displacement, downstream phase motion, zero amplitude
and speed, clock continuity/reversal, LOD edges, both-world near/low/high views, optional
FFT and resource reuse. Measure the extra warm CPU/GPU cost against zero amplitude;
retain the existing synchronous cold-build finding. Update ADR/API semantics and rerun
focused Specs, release/type checks and technical review before the visual handoff.

Correction implemented: shared four-band vertex/normal height field, 32-second smooth
phase blending, continuous filtering, displacement-aware bounds, opt-in artistic foam,
and example amplitude/wavelength controls. Nine feature Specs pass in development and
release, including measured downstream GPU vertex motion; both-world E2E passes.
Release/types/tsc pass. The [review](../reviews/2026-10-21-r26-river-surface.md) records
the corrected findings and a focused alternating GPU/CPU measurement at the owner's
original camera. Owner visual acceptance and the inherited cold-build limit remain open.
