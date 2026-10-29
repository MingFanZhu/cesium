# ADR-0200: Prepared-profile underwater volumes

> Current shore qualification (2026-10-29): ADR-0204 replaces the historical 256-edge ceiling with indexed original-edge queries and a byte budget; the profile triangle budget remains independent.
>
> Current qualification (2026-10-29): ADR-0202 retains this volume geometry and extends river nodes from four to seven texels for source current records; fixed bathymetry is removed.

- Status: accepted and implemented; 2026-10-29.
- Related: ADR-0180, ADR-0196, ADR-0199; SGP-0017 unchanged.
- Phase: [R35](../../../AgentDocs/rendering-quality/plans/2026-10-29-r35-profile-underwater.md).

Extend underwaterDepth to varying per-position ellipsoid water and directed
SceneGISRiverSurface in Globe and Planar. Depth is a vertical/geodetic-height
offset below the original interpolated mean profile. RiverSurface delegates the
property to its composed WaterSurface; mean-wave immersion and opaque-only,
nonoverlapping media retain the previous contract.

The source of truth is the original prepared chart polygons, not currently
selected/rendered triangles. Fan-triangulate their convex polygons and retain
anchored affine height planes. A deterministic stackless 2D BVH serves CPU
membership/height queries and GPU traversal. The surface owns one lazy RGBA32F
table (four texels per BVH node, at most 2047 nodes for 1024 triangles); underwater
borrows it. Heights are stored relative to a fixed profile reference. The
256-segment source-shore ceiling remains explicit. Corridor and optional mask
are combined by triangle membership, not XOR of their independently closed rings.

For Planar rays, intersect triangle halfplanes and its top/bottom height planes
analytically. For curved rays use ADR-0199's camera-relative sphere and rational
chart projection. Within a triangle, let C(t)=c0+c1*t be the positive chart
denominator and S(t)=s0+s1*t be the surface-height numerator relative to the camera
anchor. The shell equation is `(R^2 + N(t))*C(t)^2 - (R*C(t)+S(t))^2 = 0`, where
N is quadratic. Expand the rationalized form `N*C^2 - 2*R*S*C - S^2`; it is a
quartic without subtracting two Earth-sized squared radii. Normalize each finite
triangle interval to [0,1]. Isolate derivative critical points, bracket monotone
intervals and bisect at most 24 times, including zero/tangent endpoints. The
nearest positive top/cap/source-shore intersection bounds the water path; captured
opaque depth can shorten it. No random perturbation, unconstrained ray marching,
GPU readback or view-dependent resampling is introduced.

Shared profile normals include the authored slope for per-position ellipsoid
water as well as directed rivers. Underwater optical depth uses the profile at
the ray endpoints. Constant local and constant ellipsoid paths remain inexpensive.
The existing WaterFrame capture, frustum schedule and physical optics are reused;
no native file or new full-resolution target/pass is required. Destruction releases
the domain only after its borrowers, preserving the caller-owned wind simulation.

Curved bathymetry and actual-wave caustics follow in a separate phase. Static
geometry, local curvature approximation, finite resource ceilings and the previous
wave-meniscus/translucent/multilayer limits remain explicit.

The subsequent field contract and implementation are recorded in ADR-0201.
