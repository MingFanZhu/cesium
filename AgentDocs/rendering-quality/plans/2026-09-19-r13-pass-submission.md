# Phase R13: Depth and Shadow Submission Cost

- Type: `phase`; status: `completed`; date: `2026-09-19`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / architecture reviewer: Current task, architecture and execution
- Architecture review: `confirmed`
- Previous checkpoint: R12 `3df2db9e84`
- Decision: ADR-0092; seams: SGP-0013, SGP-0014, SGP-0021

## Source facts and scope

The owner requests continued AO, cascade and draw-submission optimization. R12 MRT is active in
the unchanged real Viewer: 1701 commands, 1574 main opaque draws, four shadow passes of 1579 draws.
Native Model3DTileContent sets `cull=false` because camera traversal already culled the tile;
Scene reuses that flag for light volumes, so no cascade rejects these commands. Direct bounding
volume checks give 480, 1209, 1554 and 1579 casters in the same light volumes.

Native floating uniform arrays compare JS doubles against cached Float32 components. Nonexact
fractions therefore upload again even when their GPU representation is unchanged. A three-frame
probe records 3149 cloud matrix, 2904 spherical harmonic, 1574 cascade matrix and 1574 cascade split
uploads per frame. Native AO depth derivation retains ModelFS because its source contains discard
and explicit depth writes; this retains the lighting stage and its expensive uniforms.

## Implementation

1. Keep native uniform packing and validation, adding an owned exact packed-bit upload cache at
   the seven floating array upload sites. No sampler cache, callback suppression or epsilon.
2. Derive AO depth variants with an explicit define that skips only native Model lighting. Keep
   material/custom shader evaluation, alpha, clipping, styling and depth writes. AO sampling,
   resolution, current-frame geometry and indirect-light composition stay unchanged.
3. For tile model commands whose camera culling was delegated, test their existing world bounding
   volume independently against every cascade. Preserve native standalone command culling and
   point/single-pass lights. Do not assume the owned cascade volumes are nested.

## Verification and exit

Add regressions for exact float-array reuse and in-place updates, AO depth/cutout equivalence and
removed lighting uniforms, and tile caster membership/camera movement. Run relevant strict WebGL
AO, shadow, SSR and native uniform/shadow regressions; complete build/types and patch audit because
the renderer integration changes. Compare unchanged real pixels, submission counts and paired
natural-loop timing. Preserve settings and restore any diagnostic hooks. Technical review and an
independent local checkpoint precede further phases; owner visual review remains explicit.

## Boundaries and risks

This phase removes verified redundant work without temporal shadow caching, stale depth, automatic
resolution changes, WebGPU or indirect-light reconstruction. AO still submits geometry once, but
its native Model prepass does not need PBR shading. Tile command bounds retain the native contract
for custom vertex motion; clipped and cutout coverage must remain identical. Float upload state is
owned per uniform and expires with its ShaderProgram, including relink/rebuild.

## Completion

Implementation and technical self-review are complete; [review](../reviews/2026-09-19-r13-pass-submission.md)
records exact GPU coverage tests, unchanged public settings, native compatibility failure reproduced
on the previous checkpoint and paired real-scene measurements. Frame time falls from 165–168 ms to
53–54 ms in the paired experiment. Owner visual review remains pending. Save the independent R13
checkpoint before considering further pass sharing or batching; no subsequent phase is activated.
