# Phase P2: native primitive and continuous surface

- Type: phase; Status: completed; Created / Updated: 2026-10-23
- Parent: [extension](2026-10-23-native-fluid.md); prerequisite: P1 `e2fb6a0dee`
- Owner / review: current task, architecture self-review
- ADR: ADR-0187; SGP: none expected (reuse existing WaterFrame seam)

## Current source facts

WaterFrame captures opaque HDR color / linear eye depth, classifies owned water commands and
draws them after opaque geometry per frustum. Its final-depth derived shader reads v_positionEC.
WaterSurface borrows world sky/direct irradiance and SSR ray tracing; both are owned reusable code.
FramebufferManager supports persistent floating targets/depth attachments. Existing primitive
update can execute simulation quad commands; picking must not advance the solver.

## Design

- SceneGISFluidPrimitive owns immutable solver layout and local box; rigid modelMatrix moves all
  existing particles, supporting ENU or planar meters. Public emission, pause, reset and destruction.
- Fixed 1/60 s default timestep, bounded catch-up, fractional births; duplicate time does not advance,
  backwards time resets. Hidden/paused time is discarded. Explicit capacity / context ownership.
- Instanced sphere impostors produce nearest linear depth and additive half-float thickness.
  Separable bilateral depth smoothing reconstructs a continuous surface; finite differences recover
  normals. Final surface writes true fragment depth and rejects opaque foregrounds.
- Owned WaterFrame adds an optional pre-draw preparation hook for fluid screen targets. No upstream
  edits. Borrow the same opaque inputs, sky, physical lighting and SSR; extract dielectric optical
  helpers shared with existing WaterSurface instead of cloning its complete shader.
- Screen-space front layer only; camera outside fluid, no recursive transparent refraction. Closed
  axis-aligned local box is the first simple container. No arbitrary terrain/mesh collision claim.

## Validation / exit

Primitive scheduling, controls, validation and ownership Specs; actual framebuffer checks for
connected surface, thickness, foreground occlusion and both coordinate systems; disposal and resize.
Local deterministic preview with visible pool / fountain; capture image and actual GPU total cost.
Existing WaterSurface regression Specs after shared optics extraction. Full build/release/types,
focused strict WebGL Specs and scoped lint. Review and independent checkpoint before SDK P3.

## Result

Implemented native API, conservative bounds, fixed-step controls, screen-space sphere depth and
volume-normalized thickness, bilateral depth, valid-neighbor normals, shared optics and true depth.
5/5 primitive Specs, 4/4 solver Specs, 17/17 water regression; release fluid suite 9/9. Builds and
generated types passed. Globe/Planar preview and bounded hardware profiling recorded in ADR-0187.
[Self-review](../reviews/2026-10-23-p2.md) resolved. No upstream file changes. P2 checkpoint `fc0cbc030e`.
The project owner subsequently excluded SDK changes; P3 is not activated in this task.
