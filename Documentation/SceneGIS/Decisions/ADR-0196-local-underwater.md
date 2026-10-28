# ADR-0196: Finite local underwater rendering

- Status: accepted; 2026-10-28.
- Related: ADR-0087, ADR-0194, ADR-0195; SGP-0017 remains unchanged.

`SceneGISWaterSurface.underwaterDepth` defaults to zero (disabled), is mutable and
uses local meters below the mean water plane. A positive value opts a local-mode
polygon into a finite extruded volume. It supports Planar and Globe ENU placement,
concave outlines and nested holes; at most 256 total boundary segments. Regional
ellipsoid and river geometry reject this option rather than silently tinting an
incorrect volume. Author the cap to match the intended pool depth; actual opaque
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

`causticsIntensity` defaults to zero, is mutable in [0, 2], requires bathymetry and
applies to local water. The accepted algorithm replaces an unaccepted independent
procedural slope draft: project a 128-by-128 grid along actual refracted wave
normals onto bathymetry; compute reference/refracted triangle area ratios using
screen derivatives; add overlapping contributions into a filtered fixed local
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

Per surface with bathymetry, the field owns one RGBA32F depth/mask texture, two
RGBA16F foam targets and one mipmapped RGBA16F caustic target. Output size is the
larger input dimension, capped at 512. It adds one foam draw and, while caustics
are enabled, one mesh draw plus clear/mipmap generation on changed simulation or
lighting state. Camera movement alone does not update these fields. A frozen
simulation does not consume settling frames. All resources are primitive-owned.
