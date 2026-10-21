# ADR-0180: Directed river surfaces sharing water rendering

- Date: 2026-10-21; status: accepted, implemented; owner visual follow-up pending
- Phase: [R26](../../../AgentDocs/rendering-quality/plans/2026-10-21-r26-river-surface.md)
- Existing integration: ADR-0087 / SGP-0017, unchanged

## Decision and coordinate contract

Add SceneGISRiverSurface as a distinct public primitive. It composes the existing water
renderer and reuses the regional mesh selector/cache; it does not duplicate water passes,
capture, optics, physical lighting or FFT simulation. Keep WaterSurface compatible.

Require the exact live Globe or SceneGISPlanarWorld instance. Ordered centerline positions
are ECEF with ellipsoid height for Globe, and direct meter XYZ for Planar. No projection,
terrain sampling or implicit local-to-world transform. Per-control-point positive widths
and nonnegative speeds define cross-sections and authored current along increasing station.
The position height defines the water profile independently of velocity. Inputs are copied. Width/speed may be uniform scalars or arrays matching the control points.
Globe widths use the local chart metric and stations use ellipsoid geodesic distances;
regional projection distortion still applies.

Prepare a simple mitered corridor in a fixed regional chart; centerline sampling defines
the bend shape. Reject reversals, inverted strips and overlapping nonadjacent reaches.
Optional polygonHierarchy clips the corridor with exact supplied shorelines/holes; it does
not supply water elevations or enlarge the width envelope. Topological station/transverse
attributes remain attached to source triangles through clipping, avoiding nearest-reach
ambiguity in hairpins. Retain regional tangent-hemisphere limits for Globe only.

## Rendering and ownership

River attributes use the same lazy grid LOD, conformed boundaries and tile-relative
coordinates as R25. A narrow SceneGIS-owned prepared-mesh seam composes WaterSurface,
while pick IDs report the public RiverSurface. Mean-surface slope affects the tangent
frame and contact/refraction/reflection tests. Planar uses direct XYZ and a flat-world
curvature term; Globe follows its actual ellipsoid with local optical approximation.

Use bounded two-phase procedural ripple/foam advection in river coordinates, driven by
authored local speed and simulation time. This avoids indefinitely stretching a pattern
under varying velocity. Filter the two phases independently before blending so an
invisible wrapping phase cannot change the active pattern. Current phase is a direct
function of Scene time (8-second cycle); current parameter changes reevaluate that phase. Optional existing SceneGISWindWaves adds independent wind waves;
current controls must never overwrite wind direction or wind speed. Caller owns the FFT;
the river owns its composed surface/mesh. Scene retains ownership of shared captures.

No new upstream file, SGP, framebuffer, global registration, Worker or asset is required.
Source, GLSL and Specs follow existing build discovery; full release/types qualify the API.

## Alternatives and limits

Adding one global direction to WaterSurface cannot express changing direction around a
bend. Arbitrary boundary-height triangulation cannot preserve longitudinal river semantics.
Separate per-reach primitives would complicate ownership and create seams; one river uses
one profile and a bounded set of shared-backend mesh commands instead.

This is single-reach above-water visual rendering. Confluences, branches, waterfalls,
hydrodynamics, terrain excavation, global oceans and geoid conversion are excluded.
Runtime profile editing requires replacement; material/current scale controls are warm
uniform edits. Synchronous mesh construction and screen-space optical limits remain.
