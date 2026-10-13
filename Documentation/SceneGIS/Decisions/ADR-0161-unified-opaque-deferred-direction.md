# ADR-0161: One opaque deferred pipeline

- Status: accepted direction; Globe implementation is not yet qualified
- Date: 2026-10-13
- Parent: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md)
- Plan: [P4c](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p4c-globe-integration.md)
- Integration: SGP-0046; SGP-0051 adds the explicit GlobeFS material hook and reserves Fabric samplers in GlobeSurfaceTileProvider

## Decision

The owner explicitly removes ongoing compatibility with the complete opaque
forward renderer as a goal of this experimental branch. Build one opaque/MASK
material and deferred-lighting pipeline for Globe, Model and qualified Primitive
families. Do not build a temporary Globe-forward/deferred-object scheduler solely
to reproduce the old pass ordering. Reference rendering may remain available during
qualification; it does not establish a supported dual-renderer product contract.

Implementation order is Globe first, then an explicit cleanup of Entity/Primitive,
glTF Model and 3D Tiles integration. After Globe qualification, remove branches,
duplicate submissions and resources retained solely for opaque forward compatibility.
Do not preserve this redundancy simply because the earlier families were implemented
before the unified direction was confirmed. Qualify each cleanup before its checkpoint.

Preserve public scene/content/material/light APIs, geometry preparation, terrain
LOD, imagery residency, material evaluation and resource ownership where applicable.
Reusing those facilities does not require keeping their old lighting schedule.
Transparent drawing, shadow maps, picking, sky and post-processing retain dedicated
passes appropriate to their purpose; they are not a second opaque renderer.

Compose Globe imagery into surface material before deferred lighting. Material
draws must not bind the local-light parameter table or compute illumination. A
tile whose imagery exceeds the available material samplers may still require
multiple submissions. Blend the intended surface color without blending unrelated
normal, depth or material-identity fields. Lighting consumes the completed surface
data independently of imagery layer count. Exact formats and the supported Globe
material branches require source-backed implementation and GPU qualification.

Native forward images remain useful diagnostics, but preserving every old draw,
per-pass lighting operation and floating-point result is not an acceptance gate.
Verify material meaning, depth/visibility, light transport components, feature
controls, temporal stability and owner-approved appearance instead. This does not
authorize silently removing imagery, fog, classification, picking or user-facing
depth behavior. Propose any concrete API, capability, resource-budget or visible
semantic change separately before adopting it.

For native visual effects already covered by the advanced environment, stop
expanding duplicate compatibility work and qualify the advanced replacement in
the new pipeline. Native fog also drives terrain culling/SSE; its density is not
interchangeable with advanced atmospheric transmittance. Keep shared terrain/LOD
facilities, and do not restore fog culling without a matching visibility contract.
The advanced environment already requires native Fog to be disabled. This scope
decision does not silently remove public setters: record their retirement or
migration explicitly when the redundant paths are cleaned up.

The owner subsequently approves an optional RGBA16F classification-overlay target.
Preserve native premultiplied color/alpha composition after surface lighting; do not
reinterpret classification as albedo. Allocate it only while classification commands
or native Globe vector overlays are present. Native material draws clear the overlay where a later surface replaces
the classified one, and native shadow-volume/stencil passes populate it. No opaque
geometry replay or second opaque renderer is introduced. The material pass requires
five attachments, or six when feature styling is also present, adding 8 bytes per
pixel (about 15.82 MiB at 1920 by 1080). Reject insufficient capability explicitly.
Invert-classification and multiple frustums still require separate qualification.

Globe Fabric retains its existing diffuse/alpha surface-color semantics. Without reflective ocean, apply it
once on the final imagery batch for each tile, using straight-alpha source-over
before native imagery blending. Do not repeat the material overlay for each batch.
Preserve native material inputs, updates and caller ownership; do not reinterpret
unused Fabric specular or emission fields as new Globe material capabilities.
The tile-provider hook reserves samplers for the material and its submaterials
after their native update, before choosing imagery batches. It allocates no textures,
adds no draws or attachments, and rejects an insufficient sampler budget explicitly.
The native requirement for terrain normals remains in effect. Fabric water masks
also affect surface-weather exclusion and use the optional ocean data described below.

The owner approves the ocean attachment proposal: allocate RGBA16F for the wave
normal and water mask only when required. When reflective ocean and Fabric coexist,
preserve Fabric RGBA separately, sharing the feature-style attachment by material
family. Capture these values in the first imagery batch, then evaluate ocean,
Fabric composition, surface weather and lighting in the screen pass. No terrain
replay or repeated Fabric evaluation is introduced. At most two extra RGBA16F
targets are required; the combined layout with feature styling and classification
uses seven attachments. Each target costs 8 bytes per pixel (15.82 MiB at 1080p).
Preserve the existing four-target path when neither optional field is needed.
Reject insufficient attachment capability explicitly, and qualify the actual GPU
layout and combinations before removing the experimental checks. The ocean increment
qualifies these layouts, native water-mask terrain, waves, Fabric ordering and
weather exclusion; this does not qualify the remaining Globe branches or phase.

Fill highlighting and opaque underground color remain display overlays. Preserve
their native order around ground atmosphere, existing Globe settings and distance
fade. Store per-pixel qualification in exact half-float flag bits; compute the
overlay on screen and attenuate the surface indirect-light response accordingly.
These branches require no additional attachment or geometry submission. The current
combined flag value is at most 2047; further flags must respect half-float precision.

Opaque inverse classification reuses the classification target. Native ignore-show
stencil identifies unclassified Tiles pixels; negative target alpha selects an RGB
multiplier instead of a premultiplied overlay. Preserve the ordinary classification
order, later-surface replacement and indirect/reflection response scaling. This adds
no material replay or texture, and bypasses the native invert color-copy framebuffer.
For translucent inverse classification, the owner approves an on-demand Tiles
material cache. Capture Tiles geometry once, merge classified opaque pixels into
the main G-buffer and evaluate unclassified pixels through the same deferred light
programs before native transparency/OIT composition. Preserve the background
surface and the complete main G-buffer. The design resource ceiling is 60 bytes
per pixel (118.65 MiB at 1920 by 1080): four RGBA16F material targets, optional
RGBA16F feature styling, R32F depth, RGBA16F lit color, native RGBA8 classification
mask and DEPTH24_STENCIL8. Release the optional resources when no longer needed.
The simultaneous material attachment limit remains within the approved seven.
The single-frustum implementation now qualifies the native sorted/OIT paths,
background and foreground depth, feature styling, seven-target composition and
picking. This does not approve a separate multi-frustum layout. The cache's own
byte count excludes existing native GlobeDepth and OIT resources. Before releasing
or resizing its depth, explicitly detach the GlobeDepth copy target through the
SGP-0046 ownership hook; retain ownership of the main scene depth in Cesium.
The small unclassified color/depth composition and stencil render-state contract
come from `Scene/InvertClassification.js` at upstream base
`6d5d8b1f0725b6f831b336463f4b11c98023427b`; recheck them whenever that native path
changes. Keep cached lit color in RGBA16F instead of the native RGBA8 intermediate
to preserve the approved HDR precision, rather than reproducing its clamping.

Native Globe vector polygons and polylines share this overlay target. Evaluate
their existing coverage and premultiplied composition in the first terrain material
batch, then apply it after Globe lighting, atmosphere and underground color. Native
terrain classification composites over that value in its existing order. Later
imagery batches modify only albedo, so vectors are not repeatedly composited or lit.
Reserve VectorCommon's eight samplers alongside Fabric before imagery batching;
additional imagery batches may be required without additional lighting passes or
a terrain replay. The previously approved seven-target maximum remains unchanged.
This native vector path does not qualify the separate SceneGISVectorTileLayer.

Native Globe translucency keeps its dedicated front/back-face shaders and depth
peel. Only color-writing opaque Globe faces enter material capture. Depth-only
Globe commands are excluded from material qualification, and commands targeting
the native translucent-classification framebuffer execute there without MRT
redirection. This reuses native buffers and introduces no new deferred attachment.
Registered direct surface overlays that move translucent Globe drawing earlier
remain explicitly unqualified until the independent vector adaptation handles them.

For multiple segments, split the native Globe classification operation through an
explicit optional internal stage argument (SGP-0046). The material schedule runs
opaque classification only; the transparent schedule clears and reuses the existing
classification framebuffer for each segment's depth peel and translucent face
classification. The default call retains native scheduling. Do not retain a
per-segment classification texture or replay opaque terrain for this operation.

Reserve native translucent-light samplers before imagery batching as well: the
local-light table uses one slot and active physical Globe lighting uses three
(transmittance, irradiance and cloud shadows). LocalLights.prepare publishes a
frame-local zero-or-one texture count before world command preparation, resetting
it even when the collection is absent or hidden. The existing tile-provider
SGP-0051 hook passes FrameState to the owned budget helper. Opaque deferred material
does not reserve these lighting slots, since illumination uses a separate program.

### Approved multi-frustum resource boundary

The owner separately approves option A for multiple frusta: write eye depth and a
frustum tag into an on-demand RG32F material attachment. The combined layout may
require eight color attachments. Replacing the shared R32F depth adds 4 bytes per
pixel (7.91 MiB at 1920 by 1080); retain the existing single-frustum budget.
Preserve material precision and reject insufficient device capability explicitly.

For translucent inverse classification, reuse the Tiles material cache across
frusta and retain each Tiles-bearing segment's unclassified HDR color and depth
for its later transparency pass. Each additional such segment requires RGBA16F
plus R32F, or 12 bytes per pixel (23.73 MiB at 1920 by 1080). Fold classification
coverage into the saved color instead of retaining another per-segment mask.
Release excess layers when the segment count decreases or the feature is disabled.
These figures exclude existing native OIT, GlobeDepth and pick resources. The
approved budget is not evidence of completed scheduling or GPU qualification.
Reuse SGP-0046 for the narrow Scene/depth integration and SGP-0051 for Globe capture.

The implementation reuses the original color/depth pair for the first Tiles-bearing
range and allocates pairs only for additional ranges containing Tiles commands.
Reuse one material/depth-stencil/mask working set, clearing it before each range.
Merge classified material together with its linear depth/tag into the main surface,
then shade the cached unclassified pixels before reusing the working set. The
lighting variant discards classified pixels, leaving their saved alpha at zero.
This removes the need for a retained per-range mask or a second geometry submission.
Main surface lighting still executes after all ranges have completed.

During transparency, select the saved pair for the current range, or no inverse
command for a range without Tiles. Convert saved eye depth with the current native
logarithmic/projection convention and reject opaque near-plane overlap. Restore
packed Globe depth from the selected pair where needed instead of reading the last
material cache. Reuse native sorting/OIT, and preserve borrowed main depth when
shrinking the layer list, resizing, disabling inverse classification or unloading.

The first implementation collects material groups from every segment and writes
linear eye depth with its segment tag during material submission. Lighting-MRT
effects own the shared RG32F target when active; otherwise Deferred owns it.
Imagery blending modifies albedo alone. Complete all opaque segments before one
lighting/response resolve, then reuse native per-segment water/transparency/pick
submission. Reconstruct each segment's hardware depth from the shared surface;
nearer opaque surfaces occlude farther transparency, while same-segment Globe
depth obeys the existing terrain-depth setting. Return to R32F and the original
attachment layout for a single segment. Native log/projection conversion uses
the builtins and conventions in windowToEyeCoordinates.glsl and writeLogDepth.glsl.

The Scene integration wraps its existing material body and retains the dedicated
transparent tail instead of copying a second Scene renderer. Changes to the
body's indentation are required by that control-flow boundary; existing unrelated
patch purposes retain their own non-nested SGP markers. Translucent Globe retains
native dedicated passes, with classification explicitly separated into opaque and
transparent stages through SGP-0046 in GlobeTranslucencyState. Clear and reuse its
classification framebuffer for each transparent range; do not retain extra opaque
geometry or classification color copies.

Advanced atmosphere consumes the complete linear surface depth instead of the last
segment's native hardware depth. Reconstruct eye coordinates from full-camera
perspective/orthographic planes, including scene jitter; cloud tracing retains its
stable grid and explicit depth UV offset. Use the same convention for aerial fog,
cloud receiver reconstruction and lens occlusion: zero denotes clear linear depth,
while one metre is a valid surface. When TAA has captured the final water depth,
borrow its existing R32F without transferring ownership. Single-segment water can
still use its complete native depth. The owner approves option A for a separate
R32F final target when multiple segments, visible water and advanced depth consumers
are active without TAA: 4 bytes per pixel (7.91 MiB at 1920 by 1080). WaterFrame owns
this target and reuses the existing temporal water MRT variant. Copy opaque depth
once, then write water depth during its original color draw; do not replay geometry
or overwrite refraction inputs. Release the target when these conditions cease,
including switching to TAA's borrowed target. Content and lifetime are qualified
by the P4c terrain/water GPU tests; cross-range inverse layers have separate
classification, occlusion, pick and resource tests. Phase visual acceptance remains
tracked in the P4c review instead of being implied by this design decision.

## Consequences

Owner visual review found missing ground classification at dense logarithmic
frustum boundaries in both native and deferred schedules. SGP-0053 fixes the
shared DerivedCommand integration: automatic log-depth writes for source shaders
calling `czm_writeDepthClamp` clamp the argument to the current near/far range.
Ordinary geometry retains out-of-range discard; explicit log-depth writers and
read-only depth programs retain their existing ownership. The classification
volume must stay closed for z-fail stencil and picking, independent of lighting.
This correction adds no draw, attachment, vertex change or public API. Remove it
when upstream logarithmic derivation preserves equivalent depth-clamp semantics.

The multi-frustum resource audit reproduces a native RG framebuffer validation
gap. PixelFormat already validates RG, counts its two components and maps it to
RG8/RG16F/RG32F, but isColorFormat omits RG. SGP-0052 corrects that classification
and qualifies real mixed RG32F/RGBA16F rendering. This allocates no scene resource
and does not approve a multi-frustum attachment layout or a larger device budget.

The proposed transitional mixed-Globe scheduler is superseded before implementation.
The previously reproduced forward imagery/local-light sampler overflow remains a
recorded defect, but repairing that old path is not a prerequisite to replacing
Globe lighting. Verify the separate material/light sampler budgets in the new path.

Multi-frustum precision, terrain-depth behavior, ground classification and transparent
composition still need explicit deferred contracts. They represent scene semantics
and hardware constraints, not merely forward compatibility. Existing AO/SSR replay
does not imply SSIL replay: current SSIL explicitly requires the shared main MRT and
rejects unsupported layouts. New consumers should use qualified shared surface data;
do not add speculative replay or silently disable an effect.

Keep experimental checks for material families and combinations that have not been
qualified. P4c removes only the restrictions covered by its code, tests and review;
the independent vector-tile direct overlay and redundant opaque forward cleanup
remain subsequent work. The stable worktree is outside this change.
