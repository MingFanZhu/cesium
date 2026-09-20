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
ECEF cancellation in GLSL. A 3x3 Mitchell-Netravali reconstruction removes the current sample's
projection offset before publication, including rejected/first-frame samples. Depth rejection
includes the local depth footprint so grazing surfaces do not invalidate static history solely
because of jitter. Neighborhood/variance clipping and radiance reactivity
bound history reuse; background outside one-pixel silhouette support uses current color. Explicit `reset`, projection/log-depth
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
No implementation source is copied.
