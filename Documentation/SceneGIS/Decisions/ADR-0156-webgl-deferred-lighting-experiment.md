# ADR-0156: Private WebGL deferred lighting experiment

- Date: `2026-10-13`
- Status: accepted; bounded P2 technical and owner visual qualification passed
- Plan: [P2](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-13-p2-deferred-lighting.md)
- Upstream integration: SGP-0046; depends on ADR-0155 / SGP-0045

## Decision and boundary

A private Scene-bound experiment replaces qualified opaque Model color draws with material
submission and subsequent screen lighting. It is not a public backend switch or a replacement
of the stable branch. Native loading, geometry/material stages, command selection, caster,
picking and transparent drawing retain their existing ownership and API.

The owner selects single-sample G-buffer with existing TAA / FXAA. Reject multisample scene
settings explicitly in this experiment; never silently change them. Averaged MSAA material
values are not valid substitutes for separately shaded samples. HDR, WebGL2, floating-point
targets, a single 3D frustum and full viewport remain required. Initial material exclusions
from ADR-0155 remain explicit; this does not qualify arbitrary CustomShader or all GIS content.

Reuse native IBL / lighting stage assembly and BRDF functions with each Model's live inputs.
Do not substitute scene-wide lighting for authored Model lightColor, SH, cubemaps or factors.
Group screen commands by Model and lighting variant, not individual material textures.
The native shadow receiver still queries visibility in the material pass with its original
interpolated geometry normal and filtering; record that scalar for direct-only screen lighting.
This avoids replacing geometric shadow bias with a normal-mapped surface normal. It is not a
claim that all shadow sampling has become deferred.

Four half-float material outputs carry diffuse/occlusion, normal/roughness, F0/group and
emission/shadow visibility. Ordinary non-Model opaque content retains its forward color and
indirect response through an explicit passthrough representation. Zero group is background.
The private group encoding has an explicit representable capacity check. Borrow main depth,
copy linear eye depth before sampling it, and preserve native opaque ordering and discard.
Never sample a depth image while it remains attached to the active draw framebuffer.

Screen lighting emits linear HDR plus the existing material-weighted AO/SSR/SSIL responses.
Reuse the shared MRT and existing estimators/compositors before water and transparency, followed
by environment, TAA, exposure and tone mapping. This narrowly amends ADR-0091/0093/0099's
forward-only producer for the experimental profile; their radiometric contracts and public
controls remain unchanged. Retaining response targets is deliberate until P3 qualifies shared
consumer changes. Material/lighting separation alone promises neither a speedup nor better images.

## Ownership, integration and alternatives

Owned modules manage material textures, borrowed-depth framebuffer views and screen programs.
Native geometry, textures, shadow atlas, context quad and main depth remain borrowed. Disabled
initial state allocates no targets; disable/resize/destroy release owned resources. Model unload
must remove its lighting groups and release their programs. Empty frames cannot retain published
surface results. Shader derivations remain managed by native ShaderCache.

SGP-0046 adds narrow Scene preparation/draw/lighting/destruction calls and explicit material-only
and lighting-library branches in LightingStageFS. No copy of the full native render loop or PBR
implementation, no prototype interception, and no generated source edits. Existing owned MRT
helpers are reused. More upstream paths require a source-backed update to the patch manifest.

Rejected alternatives: relighting final scene color, recomputing materials during fullscreen
lighting, changing authored IBL to one global context, averaging MSAA materials, or disabling
street AO/SSR to present a faster but different comparison.

## Validation and upgrade

GPU tests must compare material lighting, independent Model inputs, shadows, MASK, ordinary
occlusion, transparency and consumer combinations. Check log/orthographic depth, TAA/picking,
resize/unload/empty/destroy, unsupported AA and no duplicate opaque geometry. Qualify Bistro at
the same camera, UTC, resolution and effect quality, reporting actual group count, GPU time and
storage. Full dev/release/types, relevant regressions, patch audit and owner visual acceptance
precede a phase checkpoint. Review native stage ordering, shadow wrappers, shared MRT layout,
framebuffer ownership and group invalidation on upstream upgrades.

P3b amendment: [ADR-0158](ADR-0158-shared-deferred-depth.md) shares the existing lighting-MRT
linear-depth target and eliminates its duplicate conversion in the deferred experiment.

P4a amendment: [ADR-0159](ADR-0159-deferred-feature-styling.md) qualifies native Model.color
and mesh feature styling. Ordinary material targets remain four; selected-feature opaque
Models use an optional fifth RGBA16F for the native post-lighting multiplier (SGP-0048).

P4b amendment: [ADR-0160](ADR-0160-deferred-primitive-materials.md) qualifies ordinary
native Phong appearances and their Entity geometry batches using the existing four
targets and one shared lighting group (SGP-0049); SGP-0050 corrects dynamic Entity
opaque base-state initialization without changing alpha behavior.

Direction amendment: [ADR-0161](ADR-0161-unified-opaque-deferred-direction.md) targets
one opaque deferred pipeline and removes full forward-renderer compatibility as
a future acceptance goal. Existing bounded qualifications remain unchanged until
their replacements are implemented and verified.
