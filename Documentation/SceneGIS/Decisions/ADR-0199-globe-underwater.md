# ADR-0199: Regional Globe underwater volumes

- Status: accepted, implemented; owner visual gate pending; 2026-10-29.
- Related: ADR-0179, ADR-0194, ADR-0196; SGP-0017 unchanged.
- Phase: [R34](../../../AgentDocs/rendering-quality/plans/2026-10-29-r34-globe-underwater.md).

Extend `SceneGISWaterSurface.underwaterDepth` to constant-height
`geometryMode: "ellipsoid"` water. Existing local XY / Globe ENU behavior remains.
The source is the mesh's construction-time geodetic-normal chart and polygon,
including concavity and nested holes, limited to 256 boundary segments. CPU camera
membership uses actual geodetic height on the configured Globe ellipsoid; cameras
outside the chart hemisphere are simply outside the finite water body.

For GPU integration, construct a camera-relative ENU frame at the mean water
height. Reuse R25's local sphere approximation with radius equal to the mesh's
curvature radius plus water height. Solve ray intersections with its top and
finite bottom shell using cancellation-resistant quadratic roots. Project ray
directions into the existing gnomonic chart to clip at the first actual polygon
edge, including holes. Start chart coordinates from the double-precision CPU
camera projection to retain shoreline precision. The shell approximation is exact
for a spherical Globe; on an oblate ellipsoid it is a local optical approximation,
not an exact global offset-surface or geoid solution. Recenter it each frame; never
place the entire lake in the chart origin's tangent plane.

The owned WaterFrame continues to capture opaque inputs for immersed cameras and
resolve once at the nearest frustum, before translucency. No additional framebuffer,
render pass, native patch, scene scan or per-frame GPU readback. Existing physical
optics, underside Fresnel/TIR and reflected opaque inputs are shared. Curved SSR
accepts hits in the incident medium, preserving above-water rejection while allowing
submerged receivers when viewed from below. Normal and pick passes do not advance
additional simulation work.

The caller authors a finite depth; opaque bottom geometry can truncate it earlier.
Bathymetry and caustics remain local-only. Varying per-position heights and
RiverSurface volumes are explicit unsupported inputs; constant per-position levels
may use the same volume. The bottom must remain above the curvature center.
Wave-exact immersion, overlapping layers and translucent underwater objects retain
ADR-0196's limits. Edge texture and shader belong to the water primitive and are
released with it; shared opaque inputs and borrowed wind simulation keep their
existing owners. Disabled defaults allocate no volume resources.

## Subsequent profile qualification

[ADR-0200](ADR-0200-profile-underwater.md) subsequently extends the same option to
varying per-position ellipsoid surfaces and directed Globe/Planar RiverSurface.
The original constant-height path remains; curved bathymetry/caustics follow in a
separate stage. The exclusions above describe the R34 checkpoint, not a permanent
prohibition of the later profile extension.
