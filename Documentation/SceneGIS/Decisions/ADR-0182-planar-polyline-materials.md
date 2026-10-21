# ADR-0182: Planar polyline Fabric materials

- Status: accepted for implementation; date: 2026-10-21.
- Plan: [M4](../../../AgentDocs/planar-materials/plans/2026-10-21-m4-polyline-materials.md).
- Predecessor: ADR-0178. Upstream files / SGP: none expected.

## Decision

Extend the existing planar line geometries, primitives and PolylineGraphics adapter.
Reuse native Material, MaterialProperty, PolylineMaterialAppearance, Primitive and
BatchTable. Width remains in pixels. No SDK renderer or polygon approximation.

For ordinary lines, s is cumulative source XYZ length divided by total length;
for ground lines, s uses source XY length because authored Z is discarded by clamp.
It progresses from 0 at the first endpoint to 1 at the last, continuously across
segments. Repeating the first point closes the line with a miter join and a single
UV seam (1 / 0); periodic custom patterns should agree at the seam. Nonperiodic
Arrow ends there. Each batch instance has independent [0, 1] coordinates. Geometry
or position changes recompute length; camera and terrain LOD changes do not. Instance
transforms do not reparameterize source-length UV. t is 0 on the right and 1 on the
left looking along the line, with 0.5 at its center. Ordinary t uses native screen
expansion; ground t uses XY width projected onto the actual surface.

Ordinary s is interpolated across the native screen-expanded triangles; around
miters it is not an exact per-fragment world-arc-length projection. The vertex
parameterization stays metric and shared joins remain continuous. Native Dash
screen-phase behavior is intentionally separate from this s contract.

Ground UV uses depth-reconstructed actual surface points and existing miter planes.
Distances to the start/end planes are normalized by their centerline projection,
then interpolated over each segment's cumulative interval. This preserves centerline
metric progress and continuity across the miter cross-section. Native Dash retains
its pixel-based screen phase and quantized angle convention; it does not use s as
a metric dash period. Arrow and Fabric using st and uniforms are supported. Other
external varyings or arbitrary outer appearance shaders are not added to the ground
contract. No implicit clock uniform is invented; custom MaterialProperty supplies
seconds using JulianDate.secondsDifference or an explicitly chosen external clock.

Ordinary blending follows native Material.isTranslucent on an internal appearance
with blending disabled in its base render state. Ground lines keep their existing
premultiplied blended classification draw. Unlike areas, they do not perform stencil
cleanup and may evaluate native Dash discard. Picking uses the same material coverage
(transparent/discarded pixels are not hits), matching ordinary native polyline semantics.
Area footprint picking and its no-discard rule remain unchanged.

Primitive borrows Material. Entity creates and owns derived Material, updates uniforms
each normal visualizer update even when time is unchanged, and rebuilds only for a
changed geometry/layout or material type. Removal, destruction and failed replacement
release derived resources after primitives; caller-owned properties remain alive.

The ordinary internal appearance reads native PolylineMaterialAppearance's raw
`_vertexShaderSource`, rather than caching its getter's material-dependent Dash
define. This narrow private dependency is on Cesium 1.144 at baseline
`6d5d8b1f0725b6f831b336463f4b11c98023427b`; recheck raw-source/getter behavior on
upstream upgrades. No native implementation is copied or modified.

## Verification and limits

Check GPU pixels and pick coverage, dynamic alpha and material swaps, geometry and
batch identity, closed seams, frozen-clock callbacks and ownership. Verify both
generated shader builds and the real Viewer on local terrain. Preserve native globe
behavior, terrain scheduling and existing line joins/culling constraints. This phase
does not claim arbitrary Fabric tangent-space lighting or a world-meter Dash API.
