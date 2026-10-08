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

## 2026-09-28: Depth registration and subpixel flicker

Color history is unjittered; depth history deliberately preserves the original jittered
surface samples. Retain the previous clip-space jitter with the previous view/projection.
Depth validation projects the actual current sample into the previous jittered grid,
and accepts a matching positive depth in its 2x2 reconstruction footprint. It never
interpolates foreground/background depths or substitutes a neighbor for a covered pixel's
current depth. Existing continuous-slope tolerance and color clipping remain in force.
This corrects repeated false disocclusion of stationary subpixel railings.

Also adapt the pinned Filament/Lottes luminance-difference weighting after history clipping,
before HDR blending. The public historyWeight name, default, range and zero-history behavior
remain unchanged; its documented meaning becomes the base contribution, since inconsistent
current luminance may increase retention of already validated/clipped history. This supersedes
the earlier exclusion of Filament's optional flicker suppression. No new public control,
target, pass or geometry submission is added. Three extra depth fetches replace the single
nearest-depth test. Independently animated/translucent content remains a documented limitation.

See the [Bistro follow-up review](../../../AgentDocs/rendering-quality/reviews/2026-09-28-r4-bistro-flicker.md)
for the failing-old/passing-new regression, visual qualification and GPU measurement.

## 2026-10-03: Environment ray registration and cloud history isolation

The shared environment ray frustum consumes the existing render-only clip jitter.
Shift its left/right and bottom/top by minus half the respective span times the
NDC jitter, in both perspective and orthographic projections. This agrees with
geometry/depth while leaving the public Camera unmodified. Background, aerial
composition and procedural stars use this render sampling domain.

Cloud history belongs exclusively to the cloud renderer and uses stable Camera
rays. The earlier jittered-cloud implementation was rejected for increased
flicker. Explicit UV translation now maps cloud samples to scene depth and cloud
radiance back to the render grid. Cloud composition filters optical values only
after per-tap visibility qualification; final TAA removes the scene jitter once.
Scene jitter alone no longer switches cloud history into the moving-ray path.
Actual motion retains the existing reprojection/gates. No velocity/depth
attachment, additional pass or cloud trace budget is introduced. The conditional
four-tap composite costs six extra reads. See ADR-0048 and the
[registration plan](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-10-02-cloud-taa-registration.md).
This consumes the existing SGP-0022 seam without changing any upstream file.

The 2026-10-04 ADR-0048 correction also retains the previous cloud depth-sampling
offset. Stable cloud history validates finite receiver distance against the
continuous surface footprint of the actual scene-jitter displacement. This
prevents terrain-backed clouds from repeatedly losing history while sky-backed
clouds remain stable. Scene TAA itself, its weights and its depth history are
unchanged; the correction belongs to cloud history qualification.
