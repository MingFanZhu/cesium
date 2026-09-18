# Phase Plan: R2 High-quality Ambient Occlusion

## Metadata

- Type: `phase`; status: `completed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Created / updated: `2026-09-18`
- Previous checkpoint: R1 `4ea24b89ef`, explicitly accepted by owner
- ADR: `ADR-0084`; SGP: `SGP-0014`
- Related discussion: None; [review](../reviews/2026-09-18-r2-ambient-occlusion.md)

## Source facts and decision

Native AO estimates from final depth and multiplies final scene color. It cannot distinguish sky,
direct light, emissive or already-composited atmosphere. Native opaque commands already provide
cached depth-only derivatives, log-depth variants, and per-frustum command lists. SceneGIS owns
the Planar and advanced Globe lighting source functions; native model PBR and Phong expose
separate indirect terms. A postprocess-only replacement cannot satisfy the lighting contract.

Reuse `scene.postProcessStages.ambientOcclusion.enabled` and its existing uniforms. Keep a native
PostProcessStageComposite as the control/debug object. SceneGIS-owned code performs a current-frame
opaque depth prepass over the existing frustum lists, converts each range to common eye-space depth,
then runs hemisphere-slice horizon integration (GTAO family) and a depth/normal-aware spatial filter.
No history, settling frames, camera jitter, asynchronous quality changes or final-color darkening.

Native command execution derives an AO receiver variant which samples the resulting texture only
at ambient/IBL lighting terms. Direct light, emissive, unlit content, sky and later aerial/fog remain
unchanged. Ground/vector/transparent receivers are outside the initial qualification; opaque models,
ordinary lit primitives, Planar terrain and Globe surface are qualified. Clipping and alpha masking
must remain in the depth prepass. WebGL2 floating-point color/depth support is required explicitly.

## Steps and boundaries

1. Add owned stage/state, prepass/receiver helper and GLSL estimator/filter/depth/debug sources.
2. Register minimal Scene lifecycle/execution and PostProcessStageCollection construction seams.
3. Integrate indirect terms in native Phong/model/Globe shaders and owned surface lighting.
4. Add deterministic Planar/Globe scene tests and a local visual example, including AO-only controls.
5. Verify contact/corner occlusion, flat/sky conservation, direct/emissive protection, both projections,
   log/multi-frustum depth, movement, native shadows, clipping, enable/resize/destroy and warm resources.
6. Run scoped native regressions, full build/release/types, audit and a bounded GPU timing comparison.

Existing parameters retain their names; `lengthCap` is a world-space radius. Existing direction/step
counts and intensity/bias remain adjustable. Random texture is retained as an accepted native uniform,
but stable spatial sampling needs no random texture allocation. No new public enable switch.

## Risks and gate

The additional opaque prepass costs geometry submissions. Screen-space occlusion cannot recover
hidden/offscreen geometry; very thin features and finite sampling retain limits. No specular bent-normal
transport or temporal accumulation is promised. Reject unsupported context/modes rather than silently
falling back to final-color SSAO. Technical review and owner visual acceptance precede phase completion.

## Results

Implemented owned prepass, GTAO integration, spatial filter and indirect-only receivers. 72 focused GPU Specs pass; performance and delivery checks are recorded in the review. New defaults are intensity 1.5, cosine bias 0.03, radius 1 meter, 8 directions and 8 samples per ray. Models without normals retain their existing fallback shading. Owner accepted by continuing to R3 on 2026-09-19. R2 is complete.
