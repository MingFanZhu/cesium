# R35: Profile-aware underwater volumes

- Type: phase plan; status: completed technical gate; 2026-10-29.
- Owner / architecture reviewer: current engine task, source-based self-review confirmed.
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md).
- Entry checkpoint: R34 `f15b53ade7`.
- ADR: [0200](../../../Documentation/SceneGIS/Decisions/ADR-0200-profile-underwater.md).
- Upstream / SGP: no upstream change; existing SGP-0017 unchanged.

## Source facts and design

The regional mesh retains original chart-space convex source polygons with
interpolated height (and directed river attributes); selected LOD is not the
authoritative profile. RiverGeometry retains the full corridor and clipping-mask
shore segments, not a single PolygonHierarchy. XOR of those two boundaries would
misclassify their intersection. R34's constant-height sphere cannot represent
slopes, and the facade does not expose underwaterDepth.

Build a bounded, immutable prepared-triangle domain, independent of view LOD.
Use a stackless 2D BVH for CPU height queries and a shared lazy RGBA32F GPU table.
The surface owns this domain; underwater borrows it. Preserve the constant local
and constant ellipsoid fast paths. Profile water supports up to 1024 prepared
triangles and 256 source shore segments; failures are explicit, not degraded.

CPU immersion queries the actual containing triangle and subtracts its interpolated
height from geodetic height (Globe) or World Z (Planar). GPU chart rays clip the
source polygon/mask edges and traverse only intersected BVH leaves. Planar mean
surface/cap intersections are analytic. Curved rays reuse R34's sphere model;
combining affine triangle height with rational gnomonic coordinates gives a
quartic. Isolate roots by derivative critical points, then bounded bisection;
include tangencies and choose the nearest positive top/cap/shore or opaque hit.
This avoids camera-dependent ray-march skips at bends or height gradients.

Expose underwaterDepth on RiverSurface as a facade over the composed water surface.
Share slope-aware mean normals with per-position ellipsoid water; preserve river
wave transport, all existing captures and exactly-once nearest-frustum composition.
No bathymetry/caustic change is made before this stage's checkpoint.

## Validation and exit

- Independent planar/sloped and curved analytic ray references, root tangencies,
  shared triangle edges, corridor intersections, masks/holes and LOD-independent heights.
- Globe and Planar river down/up views, runtime disable, frozen time, picking,
  source copies, domain/texture ownership and destruction; retain R34 regressions.
- Build/release/types, scoped lint/format, phase review and an independent local commit.
- R36 remains pending until that checkpoint exists; prior owner visual gates remain open.

## Risks

Curved optical transport remains a local sphere approximation, not exact global
ellipsoid transport. Native source geometry may contain many clipped triangles,
so opt-in budgets and measured representative draw cost matter. A finite vertical
depth is authored rather than inferred from the scene. Boundaries/levels are static;
editing them requires replacing the primitive.

## Completion

Implemented as designed; no upstream/SGP or SDK change. Six new GPU cases and
65 related development cases pass; six new release cases, full build/release/types
and six browser cases pass. See the [review](../reviews/2026-10-29-r35-profile-underwater.md).
The channel resolves once per frame, 0.657–0.663 ms on the recorded RTX 3060 Ti
view; its immutable source-domain/edge tables use 832 bytes. Directed river
domain tables use 16224 bytes in either World. Source geometry and all lazy GPU
resources are destroyed on removal. Owner visual acceptance remains pending.
