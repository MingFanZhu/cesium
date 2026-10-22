# ADR-0161: One opaque deferred pipeline

- Status: accepted; P4e committed, P4f native CustomShader technically and visually qualified
- Date: 2026-10-13
- Parent: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md)
- Plan: [P4c](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p4c-globe-integration.md)
- Integration: SGP-0046; SGP-0051 adds the explicit GlobeFS material hook and reserves Fabric samplers in GlobeSurfaceTileProvider

## Decision

### P4d approved entry scope and display color

On 2026-10-14 the owner selects option A: this branch targets WebGL2 / SCENE3D
with single-sample opaque materials. WebGL1, 2D, Columbus View and WebVR are
outside the supported entry profile; do not add a complete forward fallback for
them. The intended Scene default is one sample. WebGPU is outside this work.
The automatic Scene entry and removal of the private experiment switch remain
P4d work until their integration and consumer audit are qualified.

`Scene.highDynamicRange = false` must not disable deferred rendering. Keep material
storage, surface lighting, atmosphere and transparent composition in the same
linear floating-point domain. At the native display-conversion slot, clamp RGB
to [0, 1] and apply `1 / scene.gamma`, retaining alpha. Do not apply exposure,
white balance or a tone curve in this LDR mode. HDR display retains the existing
tone mapper and controls. This deliberately defines one display contract rather
than recreating the old family-dependent forward LDR transforms. HDR-only optional
effects keep their explicit public capability checks; disabling display HDR does
not silently disable them or reduce G-buffer precision.

SGP-0046 separates the public display choice from Scene's internal linear-storage
flag and passes it to PostProcessStageCollection. An owned helper configures the
existing tone-mapping slot as a gamma-only display stage in LDR mode. No additional
geometry or display pass is added relative to the existing deferred HDR pipeline.
Changing the public flag requests a frame, rebuilds only the display variant and
retains material targets, lighting programs and native linear color storage.
Shader modules continue through the native GLSL generator. Recheck Scene's HDR
derivation, post-processing order and display-stage lifecycle on upstream updates.

### P4d Planar material boundary

The owner confirms that Planar keeps receiving light; only geometry-stage lighting
moves to the deferred pass. Preserve `enableLighting`, Lambert controls, physical
Sun/sky and cloud shadows, imagery/Fabric composition, clipping edges and surface
opacity. This supersedes treating Planar's already-lit color as a passthrough.

Use group -5 in the existing four RGBA16F material attachments: composed RGB and
surface opacity, lighting normal, lighting mode/Lambert parameters/group, and
geometric normal/shadow visibility. Modes distinguish unlit, basic Lambert,
physical lighting and unlit clipping edges. The full-screen group borrows the
surface's frame-local environment uniforms;
weather and local lights run there once. Smooth and geometric terrain both publish
eye position during material capture. Keep shared source for dedicated passes,
with an explicit capture return before lighting and background composition.

Following visual feedback, the owner explicitly approves true Planar transparency:
opacity below one uses the existing translucent/OIT pass, including its dedicated
lighting, and does not write opaque scene depth. This reveals objects and other
terrain layers behind it. Opacity one retains deferred material capture and
lighting. The old pre-surface background snapshot and blending are removed.
Zero opacity discards; terrain queries remain available, while scene depth picking
follows its translucent-depth option. See the ADR-0073 amendment. No additional
material attachment is allocated. Internal Planar sky and water inputs still follow
the linear-storage flag even when public HDR display is disabled.

Unlit Planar retains its native generic shadow reception, including clipping edges;
lit modes attenuate direct illumination only. Mode 4 marks lit clipping edges and
mode 5 marks unlit clipping edges. This preserves existing shadow behavior without
evaluating illumination during opaque material capture. Relates to ADR-0012 and
ADR-0055; implementation remains in owned source paths.

### P4d approved extended material storage

On 2026-10-14 the owner approves preserving native specular, clearcoat, anisotropy,
Model clipping, silhouettes, primitive outlines and point-cloud styling before the
P4d checkpoint. Allocate optional RGBA16F fields from the visible material union:
specularWeight (1 scalar), clearcoat factor/roughness/normal (5), anisotropic T/B
and strength (7). Preserve both tangent vectors and CustomShader values without
extra directional quantization. Primitive outline coverage uses existing style
alpha when available, otherwise one field. Lit point sprites retain the fragment-to-center pixel offset x/y (2 fields),
because per-fragment reconstruction changes their native view direction. The
offset is bounded by sprite size and avoids half-float overflow at distant eye
coordinates. Reconstruct the center using this offset and the existing eye-depth
target. Unlit points require no
position fields. The full union fits 16 scalars / four additional RGBA16F targets:
32 bytes/pixel, or 31.25 MiB at 1280 by 800. Release unused targets and detach
borrowed scene depth before resize or destruction.

The inverse-classification material working set owns an independent optional set
with the same maximum; it is reused across frusta, not duplicated per frustum. Its
existing saved color/depth layers remain unchanged. Classified material merging
copies the matching fields; unclassified transparency shades its own working set.
When all attachments fit, the original material submission writes them together.
Otherwise, only commands needing extension fields add one material-only draw at
EQUAL depth with depth writes disabled. It repeats native coverage and material
evaluation, never BRDF or a second complete opaque color pipeline.

Clearcoat SSR can require seven screen outputs; AO and SSIL add three more. If the
combined output exceeds attachment capacity, split reflection and indirect outputs
into two screen-lighting draws, sharing all existing effect textures and material
inputs. This increases screen BRDF work but adds neither effect textures nor geometry.
Report material-extension and screen-lighting draws separately from base material
draws; do not claim universal savings from removing the old fallback.

Clipping edges and opaque silhouettes record native unlit color into the existing
passthrough group through SGP-0045. Transparent silhouettes keep the dedicated
transparent path. Primitive outline coverage composes after deferred lighting and
scales indirect responses. Point style gamma correction remains after native PBR
and before feature/model/outline/classification color. Shared linear screen deltas
are transformed through that same gamma and affine color response in an additional
screen correction for each visible lit styled-point group, using the existing MRT
color snapshot. Fixed-color channels have zero response. No correction texture or
geometry replay is added. SGP-0045 captures point-center coordinates and native
post-lighting coverage; owned modules implement storage, lighting and composition.

This implements the approved budget, not the final P4d visual gate. Validation and
remaining qualification are tracked in the
[P4d review](../../../AgentDocs/webgl-deferred-renderer/reviews/2026-10-14-p4d-entry-audit.md).

### Unified opaque direction

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

## Independent native annotations

2026-10-14 负责人批准按需标注深度、实心 / 半透明覆盖拆分，以及标注不参与水面
折射。原先保留混色写深度的方案在视觉验收中造成背景矩形遮挡透明物，已被本决定
取代；完整讨论与成本选择见 P4d 标注讨论。2026-10-14 修正后的负责人视觉验收通过。

BillboardCollection 的实心覆盖（包括普通 Label）从物理 G-buffer 排除，在每段水面 /
透明之前的独立无光照 pass 绘制。SGP-0046 在 native culling / derived commands 前
通过 owned helper，将旧 Pass.OPAQUE 混色批次按原生 alpha cutoff 0.995 拆成互斥
实心与透明命令；默认已拆分的 OPAQUE_AND_TRANSLUCENT 直接复用。半透明背景与
字体边缘不写深度，使用现有 OIT 或调用方已选择的排序透明。pick / depth picking
保留原生路径；不新增公共开关或完整不透明前向管线。

旧单次混色批次最多 1→2 次提交，当前验收页 glyph/background 共 2→4 次；普通物理
几何不增加提交。按需深度单段 R32F（4 bytes/pixel），多段 RG32F（8 bytes/pixel），
1280×800 分别 3.90625 / 7.8125 MiB；无实心标注命令时释放，包含普通无背景 Label
在内的该家族可激活分配。每帧仅初始化复制物理深度一次，实心标注提交同时通过
无混色 MRT 写入标注深度和已有 TAA / water final-depth；删除旧每段全屏深度复制。
因此无需 EXT_float_blend，不新增颜色目标或硬件 depth-stencil。负 frustum tag
标识不应随底层 Globe 清除的标注覆盖，多段派生拒绝更近表面占据的像素。

AO/SSR/SSIL 与水面折射继续使用物理表面 color/depth；不将标注颜色刷新到水面
折射输入。前方水面完整遮挡标注，后方水面可透过半透明背景显示。原物理物体
折射保持不变；标注深度仅供后续遮挡恢复、环境和最终 TAA 深度使用。资源由
deferred 控制器管理，借用主颜色、硬件深度和最终深度附件，不转移其所有权。

### 2026-10-16: Vector annotations on opaque worlds

Opaque Globe / Planar buildings and symbols use the dedicated `Pass.SCENEGIS_VECTOR`.
Ground fills and strokes retain their surface-classification integration. The vector
material stage follows external opaque objects in each frustum and shares their G-buffer
and single lighting resolve. Symbols remain cartographic colors outside material capture,
preserving glyphs extending beyond the terrain silhouette. Terrain tests the anchor;
external Models / 3D Tiles retain physical occlusion. Within one vector map, buildings
and symbols follow style order. Buildings retain their own physical depth relationships.
The otherwise unused vector material specular RGB stores a frame-local 24-bit map/style
identity as three exact bytes; this identity is not a public layer ID or lighting input.

Vector map ordering includes fractional alpha. Reusing native OIT split commands changes
ordered source-over colors, so each vector batch draws its original premultiplied color
once, then writes only alpha >= 0.995 coverage into the existing annotation depth target
and hardware / final depth. This is two submissions per batch per occupied frustum,
with one borrowed framebuffer view and the existing conditional R32F / RG32F annotation
target. Translucent buildings use their original forward shader in the same ordered tail.
Style is outside the frustum loop, so fractional composition is independent of segment
order. Native transparency and water follow this stage. No ordinary material replay is added.
Native Billboard / Label splitting stays unchanged. Atlas, geometry and derived programs
remain cached; removing the last annotation releases its conditional depth and views.

When symbols, opaque map buildings and external objects coexist, retain one R32F external
depth snapshot (4 bytes/pixel, one screen copy per frustum) before vector material capture.
This preserves an external occluder hidden behind a map building without redrawing it.
Multi-frustum terrain-anchored symbols also retain terrain in one conditional R32F target
at the terrain boundary (4 bytes/pixel, one screen copy per frustum). Both targets are
reused while needed and released when absent; no per-map color target is added.

Color picking submits buildings once in their vector material stage and symbols after
all external frusta. During the original pick draws, conditional external R32F and
building RG32F outputs retain current-pick depth and style identity (4 + 8 bytes/pixel
when both are needed). Borrow native pick color/depth attachments, preserve native
terrain-anchor visibility, alpha/discard, and log depth; do not borrow color-frame model
depth. No geometry replay is used. Native depth/snapping/metadata paths remain separate.
Transparent Globe / Planar retain their existing map composition contract.
SGP-0046 covers the minimal Scene schedule and Pass enum changes. See the
[repair plan](../../../AgentDocs/vector-tiles/plans/2026-10-16-low-angle-rendering.md).

## Native fill, edges and transparent volumes

Bentley planar fill retains its feature-ID pre-pass and proportional depth bias.
SGP-0045 initializes explicit fragment depth for the non-logarithmic fill variant
in ModelFS before either pass, and owned capture preserves its final biased depth.
Native edge metadata and EDGES_ONLY passes remain dedicated. Surface edge color
is recorded as the existing unlit overlay; redirected color outputs avoid native
edge MRT conflicts with material attachments. EdgeDetectionStageFS reconstructs
packed raster depth using the active projection, including orthographic views.
These changes add no geometry replay or attachment.

The owner approved the voxel/water contract and conditional budget on 2026-10-14.
Voxel color remains native premultiplied-alpha ray marching without hardware depth
writes, after water and temporal depth capture. SGP-0046 keeps native picking and
provides a narrow IntersectDepth hook: color truncates its original eye-space ray
against final opaque, annotation and water linear depth. The volume in front of
water remains visible; the portion behind water is occluded and does not enter
physical underwater refraction. The native depthTest=false override is retained.

Reuse active TAA final depth or the existing water final-depth target. When both
visible water and voxels require a target and neither is available, activate the
same R32F water final-depth resource, including single-frustum scenes: 4 bytes per
pixel (3.90625 MiB at 1280×800), with one initialization copy per frame. Existing
water draws publish depth through their MRT; no added geometry submission, volume
color copy or separate volume framebuffer is needed. Release the conditional target
when either family disappears, on resize or when TAA supplies the borrowed target.
The native closest-frustum volume submission and shader-cache ownership remain.

Pixel, lifecycle and browser evidence is recorded in the P4d review. Native-channel
visual acceptance and the final P4d matrix remain separate gates; this decision does
not claim the phase is complete. Related patches: SGP-0045 and SGP-0046.

## Coplanar fill precision under temporal sampling

The planar-fill capture reuses the native feature-ID pre-pass depth attachment to
resolve depth ties caused by separate triangles snapping to the raster subpixel
grid. When a valid feature occupies the pixel and the natural depth difference is
within two subpixel slope-error bounds plus two depth24 quantization steps, use
the same reference depth before native planar pull and same-feature behind push.
The subpixel spacing comes from WebGL SUBPIXEL_BITS, queried once on first use;
the slope is computed in the current depth encoding. Actual separation outside
that precision range keeps its depth. TAA projection and history are unchanged.

The SGP-0045 ModelFS hook is active only for deferred planar-fill material capture.
Owned capture adds one sampler of an existing pre-pass attachment, no texture or
geometry draw. The pre-pass itself never samples its attached depth. This preserves
the extension's coplanar ordering contract under all eight TAA samples, including
logarithmic and orthographic projection; evidence and visual status stay in P4d.
The [extension specification](https://github.com/CesiumGS/glTF/tree/vendor-extensions/extensions/2.0/Vendor/BENTLEY_materials_planar_fill)
leaves coplanarity detection to implementations and scopes behind to the same
logical object. This correction does not introduce a new cross-object priority API.

## Voxel picking against visible surfaces

Voxel picking retains native nonzero-alpha hit and metadata behavior, but its pass
must follow opaque pick IDs because it does not write hardware depth. SGP-0046
refreshes the existing packed depth after opaque commands only for pick frusta
containing voxels, then submits the original voxel pick command. The ray is clipped
against this pick's surface depth, including water, before returning a volume ID.
Do not borrow the preceding color frame's temporal depth. This adds no texture or
color-frame draw; one scissored depth copy is added per affected pick frustum.

## Advanced environment is the default visual authority

Owner-approved on 2026-10-14. In the WebGL deferred profile, SGP-0046 gates native SkyAtmosphere, SkyBox, Sun / Sun bloom, visual Fog, Globe ground atmosphere and legacy Globe daylight preparation. Public objects remain available; Fog tile culling and the advanced Globe Moon / ephemeris and shadow-light infrastructure remain. Disabling advanced effects never restores those legacy visuals. P4g verifies the same rule for explicitly registered PlanarEnvironment: PlanarWorld gates its legacy atmosphere and celestial draws on the deferred profile, independent of the advanced controller's enabled state. Its explicit light authority remains available; this owned gate adds no upstream patch or rendering resources.

Owned deferred Globe shaders do not duplicate native atmosphere or legacy daylight evaluation. Their former atmosphere helper, capture flags and screen-light branches are removed; material ocean response, clipping and display overlays retain their separate contracts. Shared Cesium native shader implementations remain behind the effective gates.

The read-only scene.environmentEffects returns an explicitly registered SceneGISEnvironmentEffects (even disabled), or a lazy Scene-owned default for a Globe / Planar world. No world means no inferred environment. The default enables physical atmosphere, aerial perspective and height fog; clouds, cloud shadows, crepuscular rays, bloom and lens flare default off. Getter access starts no network / GPU work. The first enabled normal frame activates resources. Explicit controllers take over before their update; the default disconnects and releases its GPU resources without losing its settings or enabled state. Removing the explicit controller restores the same default within that world. Scene releases only its defaults before world destruction or replacement; caller-owned controllers retain their existing removal obligation.

Planar reuses registered light authority, or a Scene-owned fixed-Z Sun / Moon direction when none exists. Explicit planar light authority replaces the automatic authority without duplicate ownership. No geographic origin is guessed. Internal linear floating-point computation is independent of the public display HDR flag; default activation does not change that flag.

The initial automatic instance used surfaceRadianceScale=1 for LDR while explicit
construction retained 10. This asymmetric calibration is superseded by the
2026-10-16 neutral-radiance amendment in ADR-0044: both creation paths and worlds
default surfaceRadianceScale and backgroundRadianceScale to 1, with aerial and
cloud relative scales also 1. Display HDR does not change these values. While the
advanced pipeline is active, Planar skips its older lightweight sky preparation
and drawing without changing caller settings.

Owner-approved custom primary lighting supersedes the scene.light conflict in ADR-0053 for Globe and the unconditional automatic-light assignment on Planar. A caller-installed DirectionalLight retains its identity, direction, color, intensity and ownership. Both worlds yield automatic scene.light assignment while that light is present. Installing a SunLight resumes the automatic Sun/Moon light and captures that new object for conditional restoration. Disable, disconnect and controller takeover restore only a light still held by the releasing owner; they never overwrite a replacement caller light.

The shared physical primary record uses the normalized opposite of DirectionalLight.direction and linear color times intensity. Its scale is that RGB irradiance divided component-wise by the existing solar spectrum, so terrain, physical models and clouds apply the same source before their existing atmospheric transmission and BRDF. Native geometry shadows use the same scene.light; cloud shadows use the shared direction. Sky, aerial solar scattering, celestial bodies and night sky remain tied to the original Sun/Moon state. No new resource, light pass or public option is added. Existing direction/energy history checks remain responsible for cloud and cloud-shadow invalidation.

The cloud-free generation downloads only the three atmosphere LUTs. Cloud textures, ray-march / reconstruction shaders and shadow atlases require explicit cloud activation; upgrading does not replace the atmosphere LUTs. Turning clouds off retains warm cloud resources until environment disconnection or destruction, preserving existing warm-toggle semantics. Fetch / allocation failures retain the existing generation error latch without retries or a native fallback. This overrides the caller-created-only and native-flag-conflict restrictions in ADR-0040 / ADR-0041 for this deferred profile. Evidence, full cost accounting and owner visual gate are tracked in P4d.

## Ordered vector material lighting

P4e retains the vector extension's existing surface, style and alpha contracts.
Opaque extrusion uses group -6 in the existing material attachments. Geometry
publishes pattern-composed albedo and its lighting normal; the screen family
evaluates the existing basic or physical vector lighting and shared indirect
response. Transparent extrusion retains its dedicated forward lighting.

The owner-approved opaque map budget adds one conditional RGBA16F target
(7.8125 MiB at 1280 by 800), reused across frusta. The existing classification
target accumulates unlit colors; the new target accumulates lit albedo with the
same per-layer blending. Both contributions retain attenuation from intervening
layers, including circles and symbols. One additive screen lighting draw resolves
the lit contribution, or at most two when the existing shared-effect sampler
split is required. When MRT capacity is full, at most two screen clears per
frustum replace simultaneous material-target clearing. No map or ordinary
geometry is resubmitted. Release the target when no opaque lit map is visible.
See the [approved budget](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-14-vector-overlay-budget.md).

Transparent Globe overlays continue to borrow native first-surface peel depth.
Their direct composition stage bypasses opaque classification capture even in
the single-frustum schedule, where it precedes opaque lighting.

On 2026-10-15 the owner separately approved transparent Planar's conditional
DEPTH24_STENCIL8 target (3.90625 MiB at 1280 by 800) and at most one depth-only
submission per visible terrain tile per frustum, including picking. The implementation
captures the nearest terrain once for the whole view, reducing that ceiling to one
submission per visible tile per view. It reuses the original geometry and clipping,
with no imagery, material or lighting evaluation. A tight logarithmic interval over
visible terrain keeps one independent depth encoding across native log/linear frusta.
SGP-0046 supplies explicit Scene preparation, classification and transparency hooks;
the implementation and derived shaders remain in an owned helper.

The approved RGBA16F map target is mutually exclusive with the opaque map target.
Ordered transparent map colors are composed with the nearest terrain in its existing
OIT or sorted-transparent draw, retaining independent World and layer alpha even at
World opacity zero. The first-surface comparison includes eight DEPTH24 steps for
the reproduced float interpolation difference between full-view and clipped-frustum
rasterization; it does not change the stored depth format or ordinary object depth.
Map geometry is submitted once per original frustum occurrence. The same MRT draw
sends marker pixels outside the terrain directly to scene color, testing existing
opaque depth. Pick variants write actual terrain depth with enabled ALWAYS testing
to retain map layer order and occlusion by later ordinary objects. The helper releases
both targets when this combination is absent; no additional screen lighting is added.
This preserves the existing current-surface contract, not arbitrary subsurface
transparent sorting. See the [approved Planar budget](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-14-planar-vector-transparent-depth.md)
and [ADR-0073](ADR-0073-planar-surface-opacity.md).

The vector audit also exposed a multi-frustum position-picking regression.
SGP-0046 replaces the existing pick-depth copy through one explicit Scene hook:
combine the current tagged opaque linear depth with final hardware depth into the
native PickDepth framebuffer. Do not sample a packed Globe texture left by a
different frustum. Preserve picking's opaque near offset, render-only jitter,
annotation depth and nearer final surface depths. This adds no texture or draw;
the owned shader is released with the deferred renderer.

## Shared Gaussian renderer lifetime

GaussianSplat3DTileContent creates a shared GaussianSplatPrimitive on its tileset; single-tile unload must not destroy that shared renderer. SGP-0054 makes tileset destruction invoke the existing primitive destroy before clearing its ownership reference, including collection removal and Scene teardown. Already destroyed private primitives remain removable without a second destroy. This repairs the existing deterministic resource-release contract; it adds no rendering pass, resource budget, API or alternate opaque pipeline.

## Native CustomShader material contract

P4f qualifies the existing Model / Cesium3DTileset CustomShader API. Both
MODIFY_MATERIAL and REPLACE_MATERIAL run before the existing SGP-0045 material
capture. Native vertex callbacks, varyings, uniforms, texture updates, discard
and feature inputs remain in the native model pipeline. Opaque / MASK lighting
stays deferred; TRANSLUCENT uses forward shading and existing OIT or native
sorted-transparency dispatch. Alpha alone does not reclassify an OPAQUE command.
Replacing a CustomShader preserves caller ownership and native shader rebuilds.

This qualification adds no runtime branch, attachment or geometry submission.
Seven new GPU cases verify the bounded contract, including OIT composition,
opaque occlusion, picking and resource lifetime; native sorted transparency is
not a new algorithm introduced by this phase. Weighted blended OIT approximates
transparent composition; it neither guarantees exact layered refraction nor
creates additional subsurface vector-map coverage. The vector current-surface
contract remains separate from ordinary transparent model rendering.

See the [usage guide](../CustomShaderGuide.md) and
[P4f review](../../../AgentDocs/webgl-deferred-renderer/reviews/2026-10-15-p4f-custom-shader.md).
Existing SGP-0045 / 0046 provide the material and Scene integration seams;
this amendment modifies no upstream-owned source.

## Diagnostic and auxiliary commands in the unified schedule

P4g qualifies every direct DrawCommand producer and its delegated entry points.
ClearCommand carries stencil ownership and must not enter ordinary material
validation. In translucent inverse classification, skip-LOD stencil clears execute
on the independent Tiles material framebuffer. SGP-0046 supplies this narrow
Scene hook. Native vector-tile classification wireframe is a dedicated unlit
per-frustum tail, preserving its original single draw and depth policy; Model
classification wireframe remains a depth-writing material command.

Command, frustum and shadow-cascade diagnostics tint completed lighting and shared
indirect responses before classification blending. The owner-approved debug budget
permits one unlit tint draw per visible opaque command. Actual storage is eight
bytes per pixel, plus four bytes for the inverse-classification mask when active;
normal rendering allocates neither. Ordinary lighting consumes the tint directly,
with no additional screen draw; inverse classification adds one screen merge.
Transparent and dedicated color commands apply tint within their original draw,
before OIT weighting. Preserve alpha, clipping, discard, shadow and pick behavior.
See the [approved budget](../../../AgentDocs/webgl-deferred-renderer/discussions/2026-10-15-debug-tint-budget.md)
and ADR-0160 / SGP-0059 for the unchanged-budget array storage that frees sampler
capacity. SGP-0046 retains routing instead of invoking the old lit opaque debug draw.

Recursive post-process preparation must carry displayHdr independently of the
linear storage flag, including its first update after readiness. SGP-0046 preserves
this input so LDR starts with gamma-only output rather than accidental tone mapping.
Disabling the advanced environment does not restore native Planar sky or celestial
geometry; the existing explicit primary-light authority remains available.

Reused terrain commands can change vertex-normal availability without changing
the material shader. SGP-0013 invalidates the native shadow-receive variant on this
layout change. Preserve terrain self-shadowing, filter settings and resource budget.
The current owner defers explicit local reflection probes and transparent-object
water SSR reflections; neither is claimed as qualified by P4g.

## Model lighting group reuse

R29 selects a model/lighting-key group once per frame. A later primitive with a
different native material uniformMap must not invalidate that selected group:
per-primitive material inputs are already captured in the G-buffer, while the
lighting pipeline generates model-level uniforms. Material capture resolves the
same selected group ID for every matching primitive. This removes unused
full-screen lighting commands and repeated shader construction/cache queries.

At the next frame, retain invalidation for a changed representative uniformMap,
extension layout, EDL and lighting defines. In particular, preserve the paired
native IBL shader/uniform generation needed when asynchronous environment data
becomes ready. Do not freeze live Model lighting values or merge distinct models.
No upstream seam or shader algorithm changes in this amendment. See the
[R29 review](../../../AgentDocs/rendering-quality/reviews/2026-10-22-r29-directional-occlusion-cost.md).
