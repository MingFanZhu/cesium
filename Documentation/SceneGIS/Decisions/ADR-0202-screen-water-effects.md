# ADR-0202: Screen-space water effects without authored depth grids

- Status: accepted and implemented; 2026-10-29.
- Supersedes: ADR-0196 fixed bathymetry/shore transport and ADR-0201 regional fields.
- Retains: ADR-0195 FFT whitecaps, ADR-0199/0200 source-geometry underwater volumes.
- Phase: [R37](../../../AgentDocs/rendering-quality/plans/2026-10-29-r37-screen-water-effects.md).
- Upstream: none; SGP-0017 unchanged.

The owner chooses lower configuration cost and visible-scene effects. Remove
Bathymetry, depth grids, persistent shore-foam transport, fixed caustic maps and
their regional preparation. Remove artistic currentFoamIntensity. Keep the shared
foamWidth/foamIntensity, opt-in causticsIntensity and finite underwaterDepth.
Remove the old options directly, without compatibility code or migration errors.

Contact foam uses the current opaque depth under the water surface in every World
and river mode. Its source is independent of current-wave crests. Existing FFT
compression-generated whitecaps and their simulation-time half-life remain.
The shared licensed foam texture controls appearance, not source generation.

Approximate caustics evaluate visible opaque receivers directly in the existing
water/underwater fragment pass. Reconstruct receiver position/normal, intersect
backward mean refracted sunlight with the known local water tangent plane, and
sample actual analytic/wind/current waves with stable source coordinates. Compare
mean/displaced ray-footprint areas on the receiver's local tangent plane. Sample four neighboring source points at a metric
step bounded below by the represented wave texel spacing. Refract mean and actual
wave rays to the same local receiver plane and compare their central-difference
footprint areas. Direct screen differentiation of half-float/bilinear wave normals
was visually rejected because it exposed source texel cells. Screen derivatives
now provide receiver normal and sampling footprint only; they do not create a
water depth field. Clamp focusing and attenuate depth, grazing incidence and low light.
This is a local single-branch approximation without photon accumulation or
off-screen refractive shadow transport. See the rendering-space tradeoffs in
[GPU Gems chapter 2](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics).

Underwater membership and path clipping still use original water boundaries,
holes and interpolated source levels, independent of camera visibility and LOD.
The same retained profile BVH provides river flow/speed: river leaves use seven
RGBA32F texels (original four plus three source-current records), other profiles
remain four. Surface owns this lazy geometry texture; Underwater borrows it.
No depth grid, effect framebuffer, persistent shore history or CPU field readback.
Underwater retains at most two program variants for the current lighting mode,
with/without caustics, so disabling the optional effect removes its shader work.
Changing lighting invalidates both; destruction releases both.

Captured depth only represents the visible opaque scene. Missing/hidden/unloaded
receivers receive no invented geometry. Source/receiver tangent and derivative
approximations may lose detail or confidence at depth discontinuities and grazing
views. Paused time is stable for an unchanged view; camera changes reevaluate
visible receivers. SDK supplies water geometry and wave/style controls only.
