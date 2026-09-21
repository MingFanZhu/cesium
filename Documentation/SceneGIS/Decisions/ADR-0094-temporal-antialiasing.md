# ADR-0094: Optional scene temporal antialiasing

- Status: accepted for implementation; date: 2026-09-20
- Owner: current task; phase: [R4](../../../AgentDocs/rendering-quality/plans/2026-09-20-r4-temporal-antialiasing.md)
- Related patch: SGP-0022; depends on ADR-0091/0093

## Decision

`SceneGISTemporalAntialiasing` explicitly binds one controller to a Scene. It is disabled by
default. Enable requires HDR, SCENE3D, WebGL2 float/depth textures and two draw buffers; stereo
is excluded. Both Worlds use the same API. The caller selects `scene.msaaSamples = 1` and disables
native FXAA to measure TAA as an alternative. The effect does not silently change those settings.

Render-only Halton jitter changes UniformState projection, infinite projection and frustum planes
after shadow rendering. Camera, CPU culling and input remain unchanged. Scene restores UniformState
before overlays and on failures. Per-frustum fullscreen depth conversion copies existing main
depth to a unified R32F surface; no geometry is redrawn. Separate RGBA16F color/R32F depth histories
preserve HDR, alpha and world-scale depth. History composition is after advanced environment HDR
and before native bloom/tone mapping. Current-to-previous eye transforms use CPU doubles to avoid
ECEF cancellation in GLSL. A 3x3 Lanczos-2 reconstruction removes the current sample's
projection offset before publication, including rejected/first-frame samples. Covered pixels
retain their own depth; only uncovered silhouette support borrows a neighbor's depth and sample
position to estimate displacement. Depth rejection includes the locally continuous depth footprint
so grazing surfaces do not invalidate static history solely because of jitter. Five-tap Catmull-Rom
history filtering with deringing avoids repeated bilinear blur. Cross/full neighborhood bounds,
five-sample variance and history-to-current segment clipping bound history reuse. Reconstruct and
clip in linear RGB, compress HDR only for blending and then expand. Background outside one-pixel
silhouette support uses current color. Explicit `reset`, projection/log-depth
changes, resize and re-enable discard history. Request-render scheduling is unchanged.

Cloud history is never borrowed or modified. This is a separately requested full-scene AA feature;
ADR-0048's prohibition on introducing scene jitter merely to improve cloud reconstruction remains.
Object motion vectors, temporal upscaling and dynamic resolution are outside this first phase.
Moving/translucent content can retain ghosting or lose temporal stability; camera-only reprojection
must not be described as complete motion-vector TAA. Native screen overlays execute after resolve.

## Ownership and validation

Scene owns the attached controller; early destruction detaches it. Disabled controllers allocate
nothing and release existing targets. Resize destroys/recreates only owned textures. ShaderCache
owns program caching; no raw browser GL interception or renderer replacement. Three narrow upstream
seams in Scene, Picking and UniformState are tracked by SGP-0022. Specs verify coverage and rejection,
camera/pick invariance, resource lifetime, both Worlds, projections and zero extra geometry.
Independent visual examples and the real Viewer compare quality and paired frame times with MSAA.

## References

Algorithmic background: [Karis, High Quality Temporal Supersampling](https://www.advances.realtimerendering.com/s2014/index.html)
and [Salvi, Temporal Supersampling](https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf).

Amendment, 2026-09-21: resolve filtering and clipping are adapted from
[Google Filament taa.mat](https://github.com/google/filament/blob/062360c80946af6ec5ec1f479eb046f72a622b3b/filament/src/materials/antiAliasing/taa/taa.mat),
pinned to `062360c80946af6ec5ec1f479eb046f72a622b3b` (Apache-2.0). This replaces the original
independent Mitchell/bilinear/component-clamp resolve after owner-reported zoom instability.
Cesium-specific differences are linear merged depth, CPU double-precision eye transforms,
depth rejection, silhouette support and preservation of current alpha. No upscaling or optional
Filament sharpening, YCoCg or flicker heuristics are introduced. Relative to the previous resolve,
history sampling adds four texture fetches; pass count, textures and geometry submission are unchanged.

License, source pin, modifications and original algorithm credits ship in
`packages/engine/Source/Assets/SceneGIS/Antialiasing/`, under the existing ADR-0041 asset-copy
boundary. The JSON manifest declares text format and a 16 KiB total budget; these files have no
runtime fetch or GPU allocation. When updating Filament, review the pinned filter, clipping,
jitter conventions and HDR ordering together, retain provenance, and rerun motion/static GPU
regressions. Do not import Filament's renderer or material compiler.
