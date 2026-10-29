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

RiverSurface owns a deterministic two-band 128-square FFT simulation through a private
spectrum factory in the existing WindWaves backend. The generic wind spectrum and public
WindWaves API remain unchanged. Broad angular spectra replace the rejected coherent sine
bands: agitation has a reference wavelength of 12 m, ripples 2 m. Each band is normalized
to unit variance; a smooth h/sqrt(1+h*h) mapping and convex weights retain the configured
maximum vertical displacement. This is an authored visual spectrum, not a wind estimate.

Interpolated downstream vectors stay attached to source triangles through clipping and
LOD. Sample adjacent fixed directions in eight angular sectors, following the design
of [HDRP currents](https://anisb.github.io/2026/09/26/currents-in-hdrps-water-system/).
This implementation is written independently, without copying upstream source. Use
regional metric chart coordinates rather than width-scaled UVs or continuously rotating
the chart about its origin. Two staggered bounded advections transport these coordinates
at authored local speed. Filter each phase/sector independently; differentiate advected
coordinates before fixed rotation, not the discrete sector index. Sector and phase blends
can attenuate variance; they do not assert energy conservation. Stochastic aperiodic tiling
is deferred until repetition is established as a visual limitation.

The same field drives vertical vertices and fragment height gradients. Continuous
mesh/pixel footprints filter geometry, while fragments retain resolved fine ripples.
Shore fade pins banks and holes; public, selection and command bounds include the maximum
amplitude. Geometry does not introduce horizontal choppy displacement in this correction.
Artistic foam remains opt-in and follows random crests, separate from contact/wind foam.

FFT dispersion evolves on Scene time independently from current transport. Zero current
stops advection, not wave evolution. Clock pause/reverse affects both. Changing dominant
wavelength scales sampling and dispersion time by square-root wavelength similarity;
controls reevaluate phase, rather than integrate hydraulic state. Default amplitude and
wavelength remain 0.12 m / 12 m. The original 32-second bounded transport cycle remains.

Optional existing SceneGISWindWaves remains independently borrowed; current controls
never overwrite its wind settings. River owns its composed surface/mesh and current FFT;
Scene owns shared captures. Hidden rivers and pick passes do not advance FFT. Lazy GPU
resources are released with RiverSurface. At 128-square resolution, the reused backend
adds 32 small simulation draws per time change and about 2.17 MiB of textures per river,
including mipmaps. No per-vertex CPU update or GPU readback is used in the product.

No new upstream file, SGP, scene-wide pass, global registration, Worker or asset is required.
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

[ADR-0200](ADR-0200-profile-underwater.md) adds opt-in finite underwater viewing via
`underwaterDepth`, following the original interpolated profile in either World.
This extends the initial above-water qualification without changing hydraulic or
geometry-editing scope.
