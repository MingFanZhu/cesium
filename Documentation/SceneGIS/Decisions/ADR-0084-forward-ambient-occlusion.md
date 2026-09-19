# ADR-0084: Current-frame Ambient Occlusion Before Lighting

- Date: `2026-09-18`; status: `accepted; implemented and owner accepted 2026-09-19`
- Phase: [R2](../../../AgentDocs/rendering-quality/plans/2026-09-18-r2-ambient-occlusion.md)
- SGP: `SGP-0014`

## Decision

High-quality screen-space AO must attenuate ambient/IBL contributions at surface shading, not resolved
scene color. Reuse the public native ambientOcclusion stage control and uniforms. Its native composite
provides pass-through/debug output; owned state produces current-frame AO before opaque shading.

Replay existing opaque depth-only commands using each native frustum, preserving clipping, alpha mask
and log depth. Merge depth ranges into a full-resolution linear eye-depth texture. Estimate the visibility
integral using horizon samples in hemisphere slices and apply a spatial depth/normal-aware filter. Then
derive native receiver commands with explicit shader defines/uniforms for indirect-light sampling.

Direct light and emissive remain independent. Sky, fog and aerial composition stay in their existing
order and receive no AO overlay. No previous-frame geometry/depth dependency is introduced. Native
shadow controls remain caller-owned and independent. A small number of fixed, reusable framebuffer
resources belong to the AO state, released before Scene Context destruction and replaced on resize.

WebGL2 and floating-point color attachments are required. Opaque models/3D Tiles, lit primitives,
Planar terrain and Globe surface are the initial receivers; translucent, ground classification, vector
coverage and labels do not automatically gain receiver status. Unknown custom materials remain unlit
by AO unless they use the qualified native lighting terms.

## Upstream seams and upgrade checks

SGP-0014 covers Scene lifecycle/command execution, PostProcessStageCollection stage construction,
and indirect terms in native Phong, Model lighting and Globe surface GLSL. New code lives under
SceneGIS-owned JS and GLSL roots, using existing generation, bundling and Specs entry points.
On upgrades recheck per-frustum command ordering, derived log/HDR/shadow commands, resource ownership,
native lighting decomposition and postprocess HDR format. No monkey patch or copied shadow/render engine.

R13 amendment: [ADR-0092](ADR-0092-depth-shadow-submission.md) skips only native Model lighting in
AO's derived depth variants, preserving material/discard/depth semantics and the current-frame prepass.

## References

- [GTAO research](https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf)
- [Intel XeGTAO](https://github.com/GameTechDev/XeGTAO): horizon integration and spatial denoising reference;
  this implementation uses Cesium/WebGL2 fragment passes rather than copying the HLSL compute pipeline.
