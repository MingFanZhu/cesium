# Phase R28: Directional environment specular occlusion

## Metadata

- Type: phase; status: completed, owner visually accepted; date: 2026-10-22.
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md).
- Entry: owner approves the [assessment](../reviews/2026-10-22-directional-occlusion-assessment.md).
- Predecessors: R27 checkpoint `0d4b58b8a4`; imagery/audit checkpoint `b31f09bdff`.
- Architecture / execution / review: current task, source-based self-review.
- Decision: ADR-0184; upstream integration: SGP-0014.
- Branch: `feature/directional-environment-occlusion`.

## Contract

Add optional `ambientOcclusion.uniforms.directionalOcclusion`, default false,
supporting the existing uniform callback convention. It requires AO enabled and
affects opaque/MASK native PBR environment specular only. Keep scalar diffuse AO,
direct light, emission, authored IBL and BRDF/normal semantics. Do not change sky
irradiance, planar geometry, transparency, TAA, sample count or defaults.

## Current source and implementation

1. Extend existing horizon estimate with the analytic first moment. Preserve
   geometry-normal/visibility RGBA8 and add an RGBA8 direction moment output;
   filter both with the original geometry/depth weights into RGBA8 visibility /
   normalized bent direction. Default scalar layout stays 5 B/pixel; optional
   layout is 12 B/pixel. Keep two full-screen passes and no additional depth taps.
2. Compute once from published deferred opaque depth before lighting; skip the
   later duplicate estimator. Existing full-view multi-frustum depth is already
   complete at this call. Inverse translucent classification uses a separate
   working set and remains outside screen direction reception.
3. Derive only qualified PBR lighting commands with an owned source/helper. Query
   the visibility cone against the native base/clearcoat reflection directions,
   including anisotropy. Convert native perceptual roughness to the reference's
   alpha convention. Preserve open surfaces and smoothly suppress the unreliable
   near-mirror cone approximation as in the reference; no view-angle threshold.
4. In this variant multiply diffuse by the same filtered scalar before native
   layering; record no already-occluded PBR energy in the later AO correction.
   Other lighting families retain the existing scalar path. Record occluded
   environment but unoccluded BRDF weights for SSR. Its replacement delta is not
   multiplied by scalar AO again. Preserve SSIL and radiance-source composition.
5. Release directional targets/programs on disable/layout replacement/destroy;
   share only borrowed depth. Reuse native shader cache, without per-frame source
   transformation. Add same-view scalar/directional controls to the PBR fixture.

## Verification

- GPU mathematical fixtures: open and one-sided visibility, direction and cone
  behavior, roughness zero, alpha convention, scalar filter equivalence.
- Native PBR integration: diffuse/direct/emission, base and coat, explicit IBL,
  SSR replacement, mask/clipping, log/multiple frusta, no extra geometry, reuse,
  resize/disable/destroy; bounded existing AO/SSR/deferred regressions.
- Both-world matched images and continuous camera changes, plus isolated AO GPU
  timers and actual texture bytes. Extra 0.5 ms at 1280×800 on the recorded GPU is
  an investigation target, not a promised result or a reason to change lighting.
- Development/release shader outputs, full build/types, scoped lint, SGP audit.
- Record review, remaining screen-space/visual limitations and independent local
  checkpoint. Owner picture acceptance remains explicit; no next phase activation.

## Delivery

Technical implementation, bounded tests and self-review are complete; see the
[review](../reviews/2026-10-22-r28-directional-occlusion.md) for evidence and remaining
performance/visual findings. The end-to-end 0.5 ms target is not met; estimator-only
cost is not a substitute. Default remains off. Owner visual gate is pending; no
next phase is activated. A local checkpoint retains code, Specs, ADR/SGP and docs.

Owner accepted the improved detail on 2026-10-22 and requests cost optimization.
R28 is preserved at `023016e69c`; follow-up is [R29](2026-10-22-r29-directional-occlusion-cost.md).
