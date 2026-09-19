# Review: Main-pass Ambient Occlusion MRT

- Type: `review`; status: `completed`; updated: `2026-09-19`
- Reviewer / owner: Current task, architecture and execution self-review
- Target: [R14](../plans/2026-09-19-r14-main-pass-ao.md), after R13 `6b472fa2e4`
- Decision: ADR-0093; seams: SGP-0014/0016

## Findings and disposition

- P1, fixed: AO repeats opaque geometry solely for depth. Shared lighting MRT now records the
  material-weighted indirect contribution during main drawing and borrows native main depth.
  Qualified AO runs fullscreen estimate/filter/composition, without any depth-only geometry.
- P1, fixed: Whole-color AO would darken direct/emissive light. Model/Phong/Globe/Planar hooks
  record only indirect energy, including clearcoat layering and model/feature styling. Signed
  composition preserves native alpha and direct energy. Planar clipping-edge replacement clears
  indirect response; opacity scales it. Native model clipping retains the established path.
- P1, fixed: SSR and water require corrected source radiance. The opaque snapshot applies AO
  before mip generation; SSR replacement uses the same visibility. AO-only water borrows this
  snapshot without enabling SSR or replaying geometry.
- P2, fixed: Shared SSR resolution releases standalone/compatibility AO depth targets. AO disable
  releases standalone MRT. Resize/destruction retain native attachment ownership. Existing
  estimator/filter and uniform behavior are preserved. No public API or quality setting changes.
- P2, retained scope: Nonlinear LDR, multi-frustum, classification, cleared Globe depth,
  unsupported post-lighting branches and insufficient attachments retain the existing prepass.
  Their contracts need a separately entered phase under the extension roadmap; no feature is
  silently disabled, and these paths are not reported as optimized here.

## Upstream-owned changes

- `packages/engine/Source/Scene/Scene.js`: SGP-0014/0016, shared/standalone scheduling before water.
- `packages/engine/Source/Shaders/Builtin/Functions/phong.glsl`: SGP-0014, ambient capture.
- `packages/engine/Source/Shaders/GlobeFS.glsl`: SGP-0014, native ambient-floor capture.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: SGP-0014, base/clearcoat capture.
- `packages/engine/Source/Shaders/Model/CPUStylingStageFS.glsl`: SGP-0014, feature response.
- `packages/engine/Source/Shaders/Model/ModelColorStageFS.glsl`: SGP-0014, model-color response.

The owned reflection manager becomes `_SceneGISLightingMrt`; no upstream renderer is copied.
AO alone uses two outputs, base SSR + AO five, clearcoat SSR + AO eight. Weighted energy is
resolved at the native sample count. AO reconstructs normals from depth without another target.

## Verification

- Strict development WebGL: 14 AO, 9 SSR and 12 Water tests pass. Final strict release: the same
  35 tests pass after resource changes. Covers both Worlds, zero extra geometry, whole-image
  prepass agreement at one sample, four-sample lifecycle, current-frame discard/motion,
  clearcoat/style, light separation, HDR/LDR and special-path transitions, picking and water.
- Full release, declarations and full `tsc` pass. Scoped ESLint and patch audit pass; six upstream
  delivery files, no generated file changes. Scoped formatting, diff check and AgentDocs-wide
  markdownlint pass. Required AgentDocs-wide Prettier retains 316 pre-existing formatting failures;
  the changed documents pass their scoped check. R13's native unsupported-depth-texture failure is unchanged
  and is not rerun in this bounded phase.
- Real Globe Viewer preserves saved JSON and rendering settings with no console error. Fixed
  near view: 1701 scene commands, 1574 main draws, 1097 x 822, 4x MSAA, all effects enabled.
  Buildings, trees, roads, shadows and sky remain visually intact; owner acceptance is pending.

## Real-scene tradeoff

RTX 3060 Ti / ANGLE D3D11. A same-page diagnostic alternates the old AO prepass before
reflection-only MRT with the new indirect MRT path. The private dispatch is restored in `finally`.
Each sample has 32 natural frame intervals after four transition intervals, with unchanged view,
settings and geometry, no draw instrumentation, and no overlapping build/type/GPU Spec run.

| Path       | AO geometry/frame | Mean     | Median   | FPS   |
| ---------- | ----------------- | -------- | -------- | ----- |
| Prepass 1  | 1574              | 67.47 ms | 68.90 ms | 14.82 |
| Main MRT 1 | 0                 | 55.55 ms | 55.40 ms | 18.00 |
| Prepass 2  | 1574              | 70.75 ms | 70.90 ms | 14.13 |
| Main MRT 2 | 0                 | 57.53 ms | 59.90 ms | 17.38 |

Paired mean frame time falls about 18%. Absolute FPS from separate sessions is not a controlled
comparison; the pre-reload 83.4 ms sample is not used to establish gain. Shadow membership stays
`[480, 1209, 1554, 1579]`; SSR capture stays zero. Shared AO releases its raw depth target.

At four samples, indirect output adds 8 bytes/pixel resolved and 32 bytes/pixel multisampled.
Sharing SSR depth removes 4-byte raw depth and 4-byte linear depth: estimated net 32 bytes/pixel,
about 27.5 MiB at 1097 x 822, excluding driver padding. AO estimate/filter targets are unchanged.
AO-only storage and optional water snapshots differ. This trades memory/bandwidth for fewer draws.

## Gate and remaining risks

Technical review is complete; preserve an independent R14 checkpoint before further phases.
Owner visual review remains pending. Main shading, shadows, full-resolution effects and submission
still cost time; overall performance is not declared accepted. MSAA-resolved depth can differ at
sample edges from the old single-sample prepass, so exact edge pixel identity is not promised.
Retain R7 night and Viewer startup-camera follow-ups. No further phase is activated.
