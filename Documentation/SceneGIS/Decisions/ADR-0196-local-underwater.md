# ADR-0196: Finite local underwater rendering

> Current qualification (2026-10-29): Fixed bathymetry, persistent shore transport and fixed caustics are superseded by ADR-0202. Original underwater geometry and the shared foam material remain.

- Status: accepted; 2026-10-28.
- Related: ADR-0087, ADR-0194, ADR-0195; SGP-0017 remains unchanged.

`SceneGISWaterSurface.underwaterDepth` defaults to zero (disabled), is mutable and
uses local meters below the mean water plane. A positive value opts a local-mode
polygon into a finite extruded volume. It supports Planar and Globe ENU placement,
concave outlines and nested holes; at most 256 total boundary segments. Regional
ellipsoid and river geometry originally rejected this option in R33.
[ADR-0199](ADR-0199-globe-underwater.md) subsequently extends the same API to
constant-height regional ellipsoid water; varying-height rivers remain unsupported.
Author the cap to match the intended pool depth; actual opaque
bottom geometry terminates visible rays earlier. The camera must be inside the
volume. Water bodies must not overlap.

One immutable RGBA32F edge texture stores the copied polygon. Lazy resources
belong to the surface and are released on primitive destruction. A fullscreen draw
runs only for an immersed camera at the nearest frustum, using captured opaque
HDR color and linear depth. Each ray ends at the first polygon edge, cap, surface
or opaque hit. This includes down-facing views with no visible surface command.
There is no additional full-resolution framebuffer or CPU readback. Pick passes
do not execute the medium resolve. Transparent submerged objects are outside the
opaque capture contract and are not fogged by this pass.

The underside uses water-to-air Fresnel including total internal reflection,
screen-space reflected opaque geometry and sky refraction on misses. Homogeneous
single scattering reuses absorption/scattering, with both source and view-path
attenuation. Legacy waterColor remains usable. The volume boundary and camera
immersion use mean water height: displaced-wave meniscus, wave-exact immersion,
curved-water volumes, layered water and refraction through translucent geometry
are not qualified by this stage.

Internal reflections use the shared perspective-correct SSR traversal. At a coarse
step budget, signed depth-gap crossings supplement the depth-interval test so that
a sloped pool bottom cannot be skipped between samples. Binary refinement follows
the starting gap sign, including crossings in the reverse direction. This retains
the existing sampling budget and thickness acceptance; it does not fill offscreen
geometry. See [McGuire and Mara's traversal/refinement method](https://jcgt.org/published/0003/04/04/).

`bathymetry` is an optional immutable copied descriptor: local BoundingRectangle,
width/height in [2, 1024], and row-major Float32Array signed depths. Grid vertices
span the rectangle edges, increasing local Y by row. Positive depth is wet; zero
is the shoreline and negative depth is land. Polygon holes remain masked. Data
comes from the caller's terrain/model/authoring source, without an implicit scene
readback. The example samples its authored bank planes and box tops once. GPU
float texture filtering is required. Dynamic bathymetry replacement is not exposed.

This stable depth field drives shallow-foam generation with semi-Lagrangian local
advection and exponential source/decay integration. Pause reuses targets, rewind
clears history, and zero foam intensity disables output. It follows Crest's
depth-driven persistent foam structure, without claiming a shallow-water solver.
Without bathymetry the existing screen-depth contact approximation remains.

The R33 visual follow-up adds a metric signed shoreline distance in the unused
bathymetry alpha channel. A separable squared Euclidean transform is evaluated
once for wet and dry samples, following
[Felzenszwalb and Huttenlocher](https://cs.brown.edu/people/pfelzens/papers/dt-final.pdf).
Wet classification uses this distance rather than interpolated height across a
tall wall. Foam generation uses both shallow depth and horizontal shore proximity,
with `foamWidth` setting the range in meters. This prevents missing wall sides when
no shallow-depth samples exist. The boundary remains limited by supplied grid
spacing; it does not infer subgrid obstacles or solve impact/obstacle flow.
Surface detail follows the field's transport offset. The later material correction
replaces procedural holes with density-thresholded texture films and relief shading,
as described below; the generation/transport field remains unchanged.

## Foam material and packaged resource

The R33 material follow-up uses the unmodified `Foam2.png` from Crest revision
`db0658ff0b2e93e4a9e28cc2867509658b0ecc00`, under MIT (Wave Harmonic and contributors).
The 450-square, 8-bit grayscale PNG is a linear density map, not sRGB albedo.
`Assets/SceneGIS/Water/Foam/` contains it, its complete license and a machine-readable
provenance manifest with fixed revision/path, dimensions, sizes and SHA-256 hashes.
Existing `copyEngineAssets` carries all three files into development/release,
root Source and engine/root npm packages. No runtime external URL is used.

Rendering follows the separation in [Crest foam](https://docs.crest.waveharmonic.com/Manual/Appearance/Foam.html)
and its [pinned OceanFoam shader](https://github.com/wave-harmonic/crest/blob/db0658ff0b2e93e4a9e28cc2867509658b0ecc00/crest/Assets/Crest/Crest/Shaders/OceanFoam.hlsl):
concentration selects texture coverage, transported texture coordinates define
films, and texture height differences perturb the foam normal. SceneGIS uses a
one-meter fine tile and a rotated coarse modulation; explicit gradients, trilinear
mips and up to 8x anisotropy retain grazing detail. A 3 mm relief scale feeds existing
physical diffuse lighting and a separate rough GGX lobe (roughness 0.65). The
material replaces the wet-interface color/highlight by coverage. These constants
are internal material choices, not a physical bubble-size or fluid-solver contract.
GLSL is independently written; the bitmap is the attributed third-party asset.

The Scene-owned WaterFrame lazily holds one shared RGBA8 mipmapped texture, about
1.03 MiB, regardless of the number of water surfaces. Disabled contact/crest/river
foam does not start a load. Loading retains the visible water geometry without
foam detail; `ready` continues to describe geometry readiness. Completion requests
a render; upload occurs in the next normal update. Fetch failure raises a rendering
error, without silent procedural fallback or retry. Destroying one surface does
not release the shared material; Scene destruction does, including closing an image
that arrives after destruction. This adds one sampler and six filtered texture
lookups at foam-covered fragments, with no new draw, framebuffer or CPU readback.

This follow-up does not change the shallow source into an impact solver. Continuous
near-wall generation can still form a band. Subsurface bubbles, breaking waves,
spray and foam-driven volumetric scattering remain outside this material change.

## Caustics

`causticsIntensity` defaults to zero, is mutable in [0, 2], requires bathymetry and
applies to local water. The accepted algorithm replaces an unaccepted independent
procedural slope draft: project a grid along actual refracted wave
normals onto bathymetry; compute reference/refracted area ratios from central
differences of the mapping at vertices and interpolate; add overlapping contributions into a filtered fixed local
map. FFT mode samples the existing three-band displacement/normal fields with a
grid-footprint mip level. Analytic mode shares the surface slope function. This
follows [Evan Wallace's demonstrated area-ratio method](https://madebyevan.com/webgl-water/)
([primary implementation](https://github.com/evanw/webgl-water/blob/master/renderer.js));
the implementation here is independently written for SceneGIS ownership and data.

The map modulates captured opaque radiance in both above/below views. Receiver
normal, depth and light elevation bound its contribution. Resolution, focusing
clamp, three height-field projection iterations and opaque-color modulation are
explicit approximations; this does not solve refractive object shadows, recursive
photon transport or exact caustics on vertical walls. The map is generated on the
authored bed, so tall objects use an approximate projection of the same field.

Per surface with bathymetry, the field owns one RGBA32F depth/mask/distance texture
and two RGBA16F foam targets. Foam size is the larger input dimension, capped at 512.
The caustic target and mesh are allocated only on first use: a mipmapped RGBA16F map
twice the foam size, clamped to [256, 512], and a grid with half that many cells per
axis. Vertex Jacobians avoid constant-per-triangle intensity; magnified samples use
[four-tap cubic B-spline reconstruction](https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering),
transitioning to ordinary mip filtering at a one-texel footprint. At a 256-square
input the textures/mesh total about 6.67 MiB, or 2 MiB before caustics are enabled.
It adds one foam draw and, while caustics
are enabled, one mesh draw plus clear/mipmap generation on changed simulation or
lighting state. Camera movement alone does not update these fields. A frozen
simulation does not consume settling frames. All resources are primitive-owned.

ADR-0201 subsequently extends this field to regional ellipsoid water and directed
rivers using an explicit upright authoring frame and original-profile sampling.
The local descriptor and ownership remain unchanged.
