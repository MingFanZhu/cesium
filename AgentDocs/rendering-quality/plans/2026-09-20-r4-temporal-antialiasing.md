# Phase R4: Temporal Antialiasing

- Type: `phase`; status: `completed`; updated: `2026-09-21`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture: confirmed; previous checkpoint: R14 `31ba432cc8`, owner accepted
- Decision: ADR-0094; integration seam: SGP-0022

## Source facts and design

The accepted shared lighting MRT retains native MSAA. The real scene has five floating-point
outputs at four samples. TAA can remove multisample storage when the caller selects one sample,
but introduces history storage and fullscreen work; compare these configurations on the same view.

Add an explicit Scene-owned `SceneGISTemporalAntialiasing`, disabled by default, sharing Globe
and Planar API. Initial qualification is HDR, SCENE3D, WebGL2, float textures, two draw buffers,
and a single viewport. Keep native MSAA/FXAA settings caller-owned. Eight Halton samples affect
only render UniformState projection, after shadow submission; never mutate Camera or culling.
Restore projection even on failure, before native overlays and picking.

Copy current opaque/water depth per frustum into one linear R32F target, without geometry replay.
Resolve HDR after environment composition and before native bloom/tone mapping. Ping-pong color
RGBA16F and R32F depth. Reproject static geometry with CPU double-precision current-to-previous
eye transform; reconstruct current 3x3 samples at the unjittered pixel center, reject incompatible
depth with a local slope footprint, sample history with Catmull-Rom and segment-clip it to current
cross/full color and variance bounds. Background outside one-pixel silhouette support uses current color. No object motion
vectors are introduced; animated geometry, translucent objects, labels and animated shading need
explicit visual qualification and retain a documented residual ghosting limitation. Cloud history
remains independent. Resize/projection/log-depth changes and explicit reset invalidate history.
Request-render scenes accumulate only on requested frames, with no hidden convergence loop.

## Steps and acceptance

1. Register SGP/ADR; implement owned controller, buffers and shaders with narrow Scene/UniformState
   hooks. Preserve alpha and native resource ownership; release buffers on disable/destroy.
2. Specs cover real subpixel coverage, camera invariance/picking, motion/disocclusion, multi-frustum,
   orthographic and both Worlds, toggle/reset/resize/destruction, no additional geometry and MRT AO.
3. Add a separate Chinese example with MSAA/FXAA/TAA comparison and motion controls.
4. Run strict relevant GPU Specs, full release/types, scoped lint/format and patch audit.
5. Measure unchanged Viewer scene at 4x MSAA, one sample and TAA plus one sample; inspect motion
   and images, restore diagnostics, document limits and create an independent local checkpoint.

## Risks

Without motion vectors, color/depth rejection cannot perfectly track moving objects. Fine alpha
details can soften. Multi-frustum and clear-terrain-depth semantics require actual pixel evidence.
Performance depends on resolution, attachment layout and driver; no universal FPS gain promised.

## Completion and handoff

The zoom/reference correction is technically complete; owner visual re-acceptance is pending.
[Follow-up review](../reviews/2026-09-21-r4-temporal-reference-adaptation.md) records the mature
reference adaptation, both failing-old/passing-new regressions, 12 strict dev/release passes,
full release build and isolated GPU cost of about 0.01 ms at the reference resolution. API,
storage, pass counts and upstream seams are unchanged. Original camera/settings are restored.
Create an independent local correction checkpoint; do not start another phase.

### Reopened scope and prior checkpoint history

Checkpoint `9255216681` is reopened for owner-reported wave-like distortion during wheel zoom.
The reference tileset is a single fixed mesh with no child LODs. The resolve uses neighborhood
minimum depth for every pixel and then treats it as that pixel's surface; investigate camera-motion
reprojection at sloped surfaces and occlusion boundaries. Preserve static accumulation and the
public API, establish a moving-camera pixel regression, rebuild and visually compare the same
reference camera path before handing back for owner review. This remains R4, not a new phase.

The owner requests mature implementation references. Adapt Google Filament `taa.mat` at
`062360c80946af6ec5ec1f479eb046f72a622b3b`: linear-color Lanczos reconstruction, five-tap
Catmull-Rom history with deringing, cross/full neighborhood plus variance bounds, segment
clipping and HDR compression only before blending. Remove the experimental motion-length
weight adjustment. Preserve Cesium's CPU eye transform, per-frustum linear depth and lifecycle;
covered pixels keep their own depth. Document these adaptations in ADR-0094 and ship Apache-2.0
license/attribution with the assets. Changes stay in owned resolve/Specs/docs/assets, with no
additional geometry, pass or target. Validate motion against spatial ground truth as well as
static stability; a difference from zero-history output alone is not an image-quality oracle.

Owner review reopened static-image stability before the phase checkpoint. The reference scene
rejects 18–27% of history in a stationary building ROI because jitter changes sloped-surface depth;
the resolve also published unfiltered jittered samples when rejecting history. Current-frame
reconstruction and slope-aware depth rejection now correct this. The new static textured-surface
regression fails on the earlier release (5.242 byte levels/frame) and passes on the correction
(below 0.5). The same reference ROI drops from 1.225 to 0.162 byte levels/frame. API and integration
seams stay unchanged; review records the remaining moving-content limit.

Implementation and technical review are complete. [Review](../reviews/2026-09-20-r4-temporal-antialiasing.md)
records 45 passing strict feature/regression Specs, full build/types, both-world examples, real-scene
inspection and paired measurements. Native AutomaticUniforms has 87 passes and one pre-existing
overlay constant mismatch (14 versus 13), verified directly at R14 HEAD. No material FPS gain
was measured; TAA remains optional. Owner visual acceptance is pending. Create this phase checkpoint
before starting another phase.
