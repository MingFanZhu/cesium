# ADR-0092: Exact Depth and Shadow Submission Reduction

- Date: `2026-09-19`; status: `accepted; implemented and technically verified`
- Phase: [R13](../../../AgentDocs/rendering-quality/plans/2026-09-19-r13-pass-submission.md)
- SGP: `SGP-0013`, `SGP-0014`, `SGP-0021`

## Decision

Reduce confirmed redundant work while preserving frame-local rendering and existing controls.

Native floating uniform arrays keep their current packing, validation and callback evaluation.
Before a native upload, compare packed Float32 bits to the uniform's last submitted bits. This
avoids the native double-versus-Float32 false change without approximate comparison, sampler state
tracking, prototype patches or assumptions about caller object identity. Owned cache storage is
per uniform, not per draw or global GL state. SGP-0021 is limited to the seven floating-array upload
sites and an import in `Renderer/createUniformArray.js`.

AO retains current-frame depth geometry and native discard/depth semantics. Its derived shader
defines `SCENEGIS_DEPTH_ONLY`; the narrow ModelFS seam skips native lighting, which does not modify
alpha or depth. Materials, custom shaders, styling, alpha masking, clipping and explicit depth
writes still execute. The compiler can discard unused radiance inputs. No full-color AO overlay or
previous-frame prepass reuse is introduced. This extends SGP-0014 and ADR-0084.

Model3DTileContent delegates camera culling to tile traversal and sets command culling false.
That does not prove intersection with every directional cascade. For these tile-owned commands,
test their existing world-space bounds independently against each cascade before submission.
Do not reuse the native nested-volume early exit: owned stable cascade spheres may not be nested.
Ordinary command culling semantics and point/single-pass light paths remain native. This extends
SGP-0013 and ADR-0088; no shadow history, atlas format, bias, PCF or split change is involved.

## Upgrade and qualification

Recheck ModelFS alpha/depth dependencies, Model3DTileContent ownership and bounding volumes, native
uniform allocation/relink and the seven floating array sites on upgrades. Strict tests cover GPU
values, in-place changes, preserved depth coverage, tile culling, native shadows and MRT interaction.
Record real scene draw/upload reductions, timing and picture comparison before owner visual review.

## Outcome

Strict tests preserve native values, in-place changes, AO cutout/clipping coverage and tile shadow
pixels. The unchanged real scene submits 4822 rather than 6316 cascade draws. Four high-frequency
floating uniform groups fall from 9201 uploads per static frame to zero; dynamic updates still upload.
Paired natural-loop frame time falls by about 68%. This adds CPU-side packed-array cache storage
and derived programs, with no extra render target or automatic quality change. AO depth geometry,
remaining visible shadow casters and full-resolution effect processing still cost time. See the
[R13 review](../../../AgentDocs/rendering-quality/reviews/2026-09-19-r13-pass-submission.md) for limits.

R14 amendment: [ADR-0093](ADR-0093-main-pass-ambient-occlusion.md) eliminates AO geometry on the
qualified main-MRT path. This ADR's depth-only lighting optimization remains for compatibility
prepasses; packed uniform caching and cascade culling are unchanged.
