# Discussion: Globe Cloud Edge Temporal Stability

## Metadata

- Type: `discussion`
- Status: `resolved design; implementation and quality gate tracked by A15`
- Author: Architecture Agent
- Created / updated: `2026-09-11`
- Branch: `feature/atmosphere-clouds-effects`
- Base / accepted A14 checkpoint: `6e488bc50eb95535e39bcd2bb0c59268acbb9f7b`
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Applicable policy: [ADR-0048](../../../Documentation/SceneGIS/Decisions/ADR-0048-globe-temporal-stabilization-performance-policy.md)
- Successor: [active A15-G phase](../plans/2026-09-11-phase-a15g-cloud-edge-stability.md)
- Investigation-only product / upstream / generated / new SGP changes: `0`

## Owner report and reproduction

After accepting A14, the owner reports visible cloud-edge jitter and contrasts
it with their UE experience. The supplied crop shows a fragmented thin fringe.
The existing Globe page reproduces that appearance with its Clock paused and
cloudTime zero; the new Clock linkage is not required to produce the defect.

Observed state is medium/mixed, coverage 0.26, density 0.5, cloud radiance 3,
cloud base 750 m, thickness 4500 m, multiplier 1 and a 1900x1150 drawing buffer.
The native loop remains enabled. History reports
`exact-stationary-temporal`, valid, with nominal weight 0.9.
Reproduction camera, in the sample's ECEF world:

- Position: `(4352718.611383878, 1172503.216307295, 4499428.49916814)`.
- Direction: `(-0.7318278397167598, -0.530056436642452, 0.4283318654844709)`.
- Up: `(0.4886694349979277, 0.02992969896508624, 0.8719555013982454)`.

## Current source mechanism

Graph discovery maps the renderer and UE reconstruction functions. Current
SceneGIS graph snippet offsets are stale, so the exact mapped source files
and unindexed GLSL were read directly.

1. `_SceneGISEnvironmentEffectsRenderer.js` keys Globe STBN to native rendered
   frame number. Medium also uses the existing 2x2 trace phase. Pausing Clock
   therefore fixes the volume while its sampling pattern continues to change.
2. `SceneGISVolumetricClouds.glsl` starts its progressive march within a
   two-step jitter span. A ray with no front hit or accumulated weight at most
   1e-6 publishes the initialized transparent color and no-cloud validity.
   Sparse fringe samples can consequently alternate between a cloud hit and
   a transparent estimate of the same fixed volume.
3. `SceneGISEnvironmentEffectsCloudResolveFS.glsl` interpolates current RGBA
   from eligible medium samples. Color history requires both `currentValid`
   and `previousValid`, plus distance, transmittance and radiance compatibility.
   A valid transparent estimate does not qualify as cloud-color history.
4. A13's sampling-support intervals help when both estimates contain clouds;
   they do not repair this hit/miss continuity boundary. The additional fixed
   transmittance difference limit of 0.08 can also reject history in the
   transition band, even after neighborhood clipping.

The immediate mechanism is stochastic current coverage combined with hard
history rejection at the very fringe that needs temporal filtering. Raising
the nominal 0.9 weight cannot help pixels whose actual weight is zero.

## Bounded GPU evidence

A temporary shader copy reuses the actual native resolve program's bound
uniform values and textures. Its private RGBA8 target reports gate bits and
current-spatial/previous-resolved opacity; it never replaces the page output
or writes to product history. A retained four-consecutive-frame sample covers
all four medium phases while camera and simulation time stay fixed.

Thin band means max(current spatial opacity, previous resolved opacity) is
greater than 2/255 and at most 25/255, with either estimate cloud-valid. Dense
band means the same maximum exceeds 191/255. These bands describe coverage,
not a segmentation of every visible edge. Counts are over the full drawing
buffer; they are not a universal reuse or image-quality score.

| Native frame | Thin-band pixels | Thin history reused | Thin hit/miss disagreement | Dense history reused |
| ------------ | ---------------- | ------------------- | -------------------------- | -------------------- |
| 61552        | 94893            | 46.52%              | 52.70%                     | 97.05%               |
| 61553        | 96540            | 42.20%              | 57.16%                     | 96.93%               |
| 61554        | 94908            | 45.82%              | 53.45%                     | 97.03%               |
| 61555        | 96642            | 41.78%              | 57.58%                     | 96.94%               |

Opaque scene-depth rejection is zero in these bands in this observation.
In the next opacity band, 25/255 through 64/255, the transmittance gate rejects
29.63-31.53% of candidates. Gate counters can overlap; their percentages must
not be added. The current-spatial versus previous-resolved opacity difference
is an estimator difference, not a measured final-frame flicker amplitude.

The first diagnostic draw attempted to use renderer callbacks after the
pipeline had cleared transient texture fields and failed on an undefined
sampler. Its listener/resources were released. Reading the actual native
program's last bound uniforms fixes that diagnostic timing issue without any
product change. Reported results come from the corrected diagnostic.

All diagnostic callbacks, shaders and framebuffer attachments are released.
A temporary public high-tier comparison was restored to medium; its different
material path and reset state are not used as causal or performance evidence.
Final state retains the original position, parameters, time and pause, with
direction roundoff below 2e-16, normal input/render loop, ready HDR and no
sample/browser-render errors. No benchmark or all-view claim accompanies this
investigation.

## UE comparison

The local reference identifies itself as UE 5.2.0 and has no available Git
commit. Source anchors relative to that reference root are:

- `Engine/Source/Runtime/Renderer/Private/VolumetricRenderTarget.cpp`,
  `ReconstructVolumetricRenderTarget`: reconstruction permutations and history
  resources are explicit; modes 1/3 skip this particular reconstruction pass.
- `Engine/Shaders/Private/VolumetricRenderTarget.usf`,
  `ReconstructVolumetricRenderTargetPS`: the traced subpixel publishes its new
  sample, while other subpixels can retain reprojected RGBA, including
  transmittance. Opaque-depth disagreement and previous-UV validity are
  evaluated independently. It has no equivalent unconditional requirement
  that both estimates contain a cloud before any RGBA history can be reused.
- The same file's `ComposeVolumetricRTOverScenePS` provides depth-aware
  upsampling. Optional reprojection-box constraints are permutation-dependent,
  not universally enabled. SceneGIS does not inherit UE's downstream TAA or
  its additional reconstruction/resource stages.

Epic's [Volumetric Cloud documentation](https://dev.epicgames.com/documentation/unreal-engine/volumetric-cloud-component-in-unreal-engine)
also describes separate tracing, reconstruction and full-screen upsampling
quality modes. Current public documentation is not an exact pass map for this
local 5.2 source or evidence of the owner's unknown UE project settings.
No UE source or asset is copied into SceneGIS.

## Proposed A15 direction and unresolved decisions

The evidence supports a dedicated edge-stability correction. A15 should
distinguish a valid transparent volume estimate from unavailable history and
reconstruct continuous RGB/transmittance across sampling hit/miss changes.
It must retain strict scene occlusion, previous-UV checks, current foreground
qualification, immediate camera-cut output and current-domain distance data.

Before implementation, define a coherent reconstruction anchor/confidence
when a current subpixel misses the cloud but its neighborhood supports volume
coverage. Check the 0.08 transmittance cutoff against this same estimator
model. Simply deleting validity/depth checks or unconditionally retaining old
clouds is not the design: either can turn sparkle into trails or occlusion
leaks. Any policy change belongs in an explicit ADR-0048 amendment and active
phase plan after this design is resolved.

Start with the existing medium trace/history resources. Do not increase
global history weights, freeze STBN, blur the complete image, add settling
frames, reduce wind/detail or alter the accepted A14 time contract. If an
additional spatial reconstruction stage proves necessary, establish its
budget and edge-preservation behavior before adding it. High/low and Planar
are outside the initial medium diagnosis.

Minimum qualification should discriminate alternating hit/miss estimates of
a fixed thin volume, test wind/camera motion and disappearing clouds, preserve
opaque foreground rejection and first/cut completeness, and check resource
release. Reuse this owner view for visual acceptance and one bounded same-view
cost comparison. No proxy metric alone passes visual quality.

Expected outcome is a substantial reduction of visible edge boiling at the
accepted workload. Complete imperceptibility at all distances, motion speeds
and budgets is not established. Implementation, automated regression evidence,
motion/ghosting qualification and owner acceptance remain open; this document
records diagnosis and a proposed direction, not a completed fix.

## Implementation decision

The owner authorizes the correction on 2026-09-11. The active A15 phase and
ADR-0048 amendment resolve the design: use current qualified neighborhood
anchors for tent misses, permit available transparent history independently
of opaque depth, and use qualified alpha clipping instead of the fixed medium
cutoff. Previous cloud-bearing color retains A13 cloud-distance gates.
No implementation/visual acceptance is implied by this design resolution.
