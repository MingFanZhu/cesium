# R24 review: HDR color grading

- Type: `review`; date: `2026-10-12`
- Status: `approved; owner visually accepted`
- Architecture / execution: current task, source-based self-review
- Target: [R24 phase](../plans/2026-10-12-r24-color-grading.md)
- Decision: ADR-0154; seam: SGP-0044; no next phase activated

## Findings and disposition

- **P2, fixed / replacement lifetime:** destroying and recreating an enabled controller
  before rendering must rebuild the stage even when enabled remains true. Track bound
  controller identity. The GPU lifecycle test covers this exact sequence.
- **P2, resolved / color space:** grade exposed linear HDR before compression and inverse
  gamma. An HDR input desaturates to its expected linear luminance; alpha and all five
  native neutral outputs are verified on GPU. No source replacement or copied mapper.
- **P2, resolved / exposure:** grading follows metering and TAA. Locked gain remains
  unchanged across grading and curve changes. Sliders only change uniforms; they do not
  invalidate TAA/SSR histories or rebuild shaders.
- **P3, accepted / white temperature:** daylight camera setting, 4000–25000 K, neutral
  6500 K, not lamp temperature or automatic white balance. Positive tint corrects toward
  magenta. Global grading cannot neutralize mixed sun/sky illumination independently.
- **P3, resolved / presets:** neutral/clear/soft-film change grading and tone mapper only.
  Camera, Clock, atmosphere, IBL, shadows and auto-exposure settings remain unchanged.
  Manual edits mark custom; reset restores neutral. Export records actual values.
  Shared Sponza behavior is unchanged and has no new controller.

## Verification

- Nine strict GPU Specs pass in development and release: defaults/validation, five-curve
  neutral equality/alpha, temperature/tint direction, known daylight white neutralization,
  contrast black/pivot, pre-compression saturation, warm shader/target reuse, automatic
  exposure independence, disable/rebind and Scene destruction.
- Forty native collection and eleven auto-exposure GPU regressions pass.
- Both Bistro E2E cases pass (Planar 41.9 s, Globe 49.0 s), including presets/custom/reset,
  preserved scene state, clock/navigation/export and teardown.
- Development/release builds, type generation and tsc pass. Existing unrelated JSDoc
  warnings remain. Generated declarations include the new controller.
- Scoped ESLint and patch audit pass: six delivery upstream paths, complete markers,
  no generated delivery files. AgentDocs Markdown lint passes; global Prettier retains
  398 historical warnings. Changed plan/index/review are formatted separately.
- The owner's page reloads with original camera/time/light/auto-exposure settings and
  clear preset selected. Ready is true, current resource failures and error text empty.
  An earlier reload during build replacement encountered temporary asset 404s; the
  complete development rebuild and reload resolve that tooling state.

## Performance and appearance

Chrome 155 / ANGLE D3D11, existing local GPU, 1219x826 Bistro restaurant view, TAA/AO/SSR,
fixed camera/time and locked exposure. One 36-query sample per state/scope, no disjoint:
native tone-stage median 0.017408 ms off/on; P95 1.486/3.208 ms shows scheduling noise.
Whole-frame medians 15.703/14.498 ms, P95 17.127/17.469 ms, do not establish a speedup.
Both retain 1591 scene commands and zero user-added postprocess stages. The controller
owns CPU matrix/vector settings only; no new texture, FBO, draw or history is introduced.

Same-exposure neutral/clear/film screenshots were inspected. Clear gently warms and
increases contrast; film changes highlight rolloff and saturation. A separate 11000 K
check demonstrates stronger warming, including sunlit surfaces, so it is not the default.
This does not establish corrected sky visibility or eliminate mixed illumination.
Ignored screenshots: `Build/Specs/color-grading-review/`.

## Complete upstream-owned change list

All six paths use SGP-0044:

- `packages/engine/Source/Scene/PostProcessStageCollection.js`
- `packages/engine/Source/Shaders/PostProcessStages/PbrNeutralTonemapping.glsl`
- `packages/engine/Source/Shaders/PostProcessStages/AcesTonemappingStage.glsl`
- `packages/engine/Source/Shaders/PostProcessStages/FilmicTonemapping.glsl`
- `packages/engine/Source/Shaders/PostProcessStages/ModifiedReinhardTonemapping.glsl`
- `packages/engine/Source/Shaders/PostProcessStages/ReinhardTonemapping.glsl`

Collection variant rebuilding is shared with SGP-0027 exposure preparation; its algorithm
is unchanged. Algorithms/API/Specs/examples/docs are owned. No other upstream path or
generated output enters delivery.

## Handoff

Technical gate confirmed. On 2026-10-12 the owner accepts the three presets and picture
controls and authorizes the independent local phase checkpoint. No further phase is
active. Older visual findings, missing geometric sky occlusion and deferred WebGPU/GI
work retain their existing status.
