# W2: Static geometry and boundaries

- Type: phase; status: completed; created/updated: 2026-10-28; owner: current task.
- Parent: [extension](2026-10-28-urban-wind.md); phase: W2.
- Entry: W1 checkpoint `1b915bd940`; architecture review: confirmed (self-review).
- ADR: 0193; SGP: none; implementation review: [approved](../reviews/2026-10-28-w2-boundaries.md).

## Source facts and design

W1 owns three GPU draws/step, x-fastest mask upload and half-way solid bounce-back, but all domain
faces wrap. Extend the owned lattice/collision functions, no Scene/Renderer hook. A paired-face
periodic option retains numerical reference cases. Default horizontal faces classify as inlet/outlet
from prescribed wind vector's signed normal component; tangential faces are slip. Ground is wall,
top slip. Wind direction is radians counterclockwise from local +X, flow-towards, not meteorological.

Use non-equilibrium extrapolation on inlet boundary nodes and first-order explicit convective
distribution update at outlet nodes. Intersecting inflows use inward diagonal neighbor; inlet wins
mixed inlet/outlet corners. Open faces lie at outer cell centers; walls lie at domain faces or
fluid/solid half-links. Convective speed is prescribed normal wind, not a clamped local backflow.
No claim of exact nonreflection; outlet must be downstream of recirculation, assessed by buffer checks.
Optional constant local acceleration (m/s²) implements a pressure-gradient drive with MRT Guo forcing;
it enables a physical Poiseuille reference and is not a random turbulence source.

Public SceneGISWindObstacleMask.fromExtrudedPolygons accepts explicit Cartesian2 outer rings,
base/top heights and per-building rigid geometry-to-simulation transforms. Validate simple rings;
fill cell centers inside the transformed closed prism, union overlaps. No holes/meshes/scene extraction
in this first geometry adapter; callers may supply any already voxelized mask. Thin obstacles may
be missed and require grid refinement. Physical settings and geometry remain construction snapshots.

## Steps and acceptance

1. Validate face pairing, wind units/direction, acceleration and explicit extruded polygon geometry.
2. GPU inlet/outlet/slip/wall paths; constant force with correct half-step momentum convention.
3. Periodic forced channel against Poiseuille at two spacings; mask impermeability/zero solid velocity.
4. Uniform axial/oblique inflow and static block wake; finite-density/low-Mach checks; bounded outlet
   buffer comparison to expose reflection rather than promising absorbing behavior.
5. Scoped Core/GPU Specs, release/types, self-review and separate W2 checkpoint before W3.

## Results / risks

Pending. Center-sampled stairs, no viscous wall model, constant Cs, uniform inlet and first-order
open boundaries limit quantitative accuracy. Geometry adapter is synchronous bounded preprocessing.
