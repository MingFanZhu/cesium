# R17 local environment probe review

- Type: `review`; status: `completed`; date: `2026-09-28`
- Author / reviewer: current task, architecture and execution self-review
- Target: [R17 plan](../plans/2026-09-28-r17-local-probes.md)
- Parent: [extension](../plans/2026-09-18-rendering-quality-extension.md)
- Decision / seam: ADR-0096 / SGP-0024

## Findings and disposition

- P1, fixed, execution: real physical-light records are immutable. Capture initially
  attempted to change the Planar origin. It now temporarily publishes a capture-local
  record and restores the original reference in finally. Frozen-record GPU tests and
  actual Planar/Bistro captures pass; no primary-camera mutation is required.
- P1, fixed, execution: diffuse visibility must remain active when the model's specular
  IBL factor is zero. Bind probes in physical PBR processing rather than the specular-only
  stage. GPU checks isolate sky diffuse, authored SH, direct light and emission.
- P2, fixed, execution: a legacy local-light SSR test required a replay draw even when
  R12 already captured in the main MRT pass. It now counts either qualified source path;
  existing pixel and detach assertions remain. No SSR product behavior changed.
- P2, accepted, architecture: directional visibility is measured at the capture center,
  not per receiver. A box crossing walls can leak light or over-darken unrelated surfaces.
  Box reprojection also cannot reproduce exact planar mirrors. This is an explicit first
  stage boundary, not a dense visibility field or diffuse GI implementation. Owner visual
  acceptance and placement tuning remain pending.

## Verification

- Five new strict GPU Specs cover immutable placement/ownership, Planar and Globe at
  large coordinates, offscreen geometry, roughness filtering, masked openings, diffuse
  visibility with zero specular factor, authored SH, direct/emission separation, clean-map
  reuse, retained publication on failure and resource release. They pass in dev/release.
- Thirty-nine dev GPU Specs pass across probes, sky reflection, physical Model lighting,
  GTAO, SSR and native IBL pipeline. Fifteen release local-light regressions pass after
  correcting the stale replay-only assertion; five probe release Specs also pass.
- Both-world Playwright checks pass on Windows ANGLE D3D11: explicit update after moving
  an offscreen wall, unchanged capture generation before updating, GTAO/SSR coexistence,
  camera/navigation preservation and no render errors. Globe basis comparison tolerates
  native normalization at machine precision; position/direction remain unchanged.
- Full release, declaration generation and TypeScript checking pass. New API properties
  and capture Promise are present in generated declarations. Existing upstream JSDoc
  warnings remain; generated files are not edited or committed.
- Changed-source ESLint, formatting, global AgentDocs markdownlint and upstream patch
  audit pass. Global AgentDocs Prettier retains the same 316 pre-existing failures.
- Browser inspection includes the independent example and the real Bistro with TAA,
  GTAO, SSR, physical sky and shadows. Existing user tabs/camera/settings are preserved;
  the independent example is retained for visual acceptance.
- The repository's forced Windows OpenGL E2E backend fails native BrdfLutGenerator
  compilation with an empty driver log. The existing sky-reflection page reproduces the
  failure without local probes. Qualification uses D3D11, matching the current browser;
  the existing OpenGL driver/backend issue remains outside this phase.

## Cost evidence

RTX 3060 Ti, Windows ANGLE D3D11, 1185 × 667, prepared Bistro with about 2.83 million
triangles, 128-pixel faces and a 1024-pixel capture-only directional shadow map:

- 1,884 color submissions and 1,476 shadow submissions per explicit capture.
- First capture CPU submission, including shader creation: approximately 1,051 ms.
- Warm update: 124 ms CPU submission; 157.8 ms wall time including synchronization;
  32.78 ms GPU for the complete capture frame. These are separate measurements.
- Clean frames issue no probe capture submissions. An alternating cached on/off sample
  spans 9–15 ms for the whole GPU frame with other scene effects enabled; noise prevents
  claiming a reliable incremental sampling time from that short sample.
- Two probes require four material samplers. Radiance uses RGBA16F GGX mips and visibility
  uses an 8-pixel cube. No full-resolution G-buffer attachment or geometry prepass is added.

## Gate and remaining boundaries

Architecture/code review is complete. Create one local R17 checkpoint, then await owner
visual acceptance. Do not activate diffuse GI or streaming capture automatically.

Capture sources are complete standalone Models directly in scene.primitives. Transparent
surfaces, water, terrain, 3D Tiles streaming, cloud geometry, recursive reflections and
automatic invalidation are excluded. Updates can stall a frame; source/light changes require
another explicit capture. Receiver integration preserves authored IBL and native BRDF/SSR
ordering. Capture sources retain direct/sky lighting without diffuse bounce or local feedback.

## Upstream inventory

All three files use paired SGP-0024 markers:

- `packages/engine/Source/Scene/Scene.js`: prepare, explicit capture and destruction hooks.
- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`: environment sources.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: clearcoat position/ray arguments.

Implementation, Specs, examples and documentation otherwise stay in owned paths.
