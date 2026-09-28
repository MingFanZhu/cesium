# R21 Technical Review: Global Auto Exposure

- Type: `review`; date: `2026-09-28`; status: `completed`
- Target: API, metering/adaptation, native tone mapping, lifecycle and examples
- Architecture reviewer / execution owner: Current task, source-based self-review
- Technical gate: `confirmed`; owner visual acceptance: `pending`
- Plan: [R21](../plans/2026-09-28-r21-auto-exposure.md)
- Decision: ADR-0100; seam: SGP-0027; no next phase active

## Findings and disposition

- **Fixed / integration:** prepare resources in collection update before native
  tone-mapping uniforms and framebuffer dependencies. Shader selection changes
  only with the active mode or the native tone mapper. The owned histogram runs
  before native bloom/tone mapping; source radiance never includes prior exposure.
- **Fixed / numerical contract:** retained percentile span is at least 0.0001.
  Narrower double-precision values can become equal in GPU float uniforms and
  produce an empty weighted interval. Validation rejects this explicit failure
  mode; the GPU does not substitute an arbitrary luminance. Black is represented
  by the documented finite log range [-16,16].
- **Fixed / tests:** private-module deep imports created a second renderer identity
  in the Specs bundle. Test through the real exported collection, with a controlled
  wall clock. Resource checks respect native deferred shader-cache destruction.
  E2E counts opaque submissions, excluding transient IBL compute commands.
- **Fixed / fixture:** CustomShader uses the actual material specular field, not a
  nonexistent metallic member. Both-world example compilation and interactions pass.
- **Accepted / sampling:** four log samples per grid cell approximate the input;
  filtered samples near an extreme pixel can spread into neighboring cells.
  The outlier test uses a known sub-percentile footprint. Partial-bin mean log
  luminance avoids replacing every sample by a quantized bin center.
- **Accepted / UI:** Bistro remains manual by default to retain its fixed exposure
  reference. One shared auto-exposure folder applies to both comparison modes.
  The independent example enables it by default. Exported configuration includes
  the settings; Cycles calibration explicitly requires manual exposure.
- **Accepted / scope:** global adaptation cannot recover lost/clipped radiance or
  independently expose sky and dark alleys. Sky participates in metering. Native
  exposure remains a positive additional multiplier. No local exposure, EV100,
  pre-exposure, autonomous settling frames or simulation-clock dependency.

## Implementation and ownership

Original WebGL2 shaders implement the documented UE histogram/eye-adaptation
concepts. A bounded 128-pixel long-edge grid feeds 64 weighted bins and trimmed
log luminance. The target maps to 0.18 middle gray. Linear travel transitions to
exponential convergence within 1.5 stops, with distinct bright/dark speeds.
One 1x1 output supplies the native tone mapper divisor. Lock skips metering but
retains adjustable compensation; reset meters immediately, including when locked.
Disable/destruction release owned targets. Resize preserves exposure history.

The complete changed upstream-owned set is **SGP-0027**:

- `packages/engine/Source/Scene/PostProcessStageCollection.js`: import, native
  tone-mapper variant/divisor, prepare/meter scheduling and controller destruction.

All algorithms, shaders, API, Specs and examples are SceneGIS-owned. Generated
barrels, shader modules, bundles and declarations are rebuilt, not committed.

## Validation

- Eleven feature GPU Specs pass with WebGL validation in both development and
  release builds: middle gray, black/limits, percentile rejection, center weights,
  30/60 FPS equivalence, distinct speeds, compensation/native multiplier, lock,
  reset, resize, disable/manual pixel equality, tone mapper switching and lifecycle.
- Forty native PostProcessStageCollection and twelve existing TAA Specs pass.
- Two E2E cases pass, one per world: gradual response, lock, disable/re-enable,
  unchanged camera and opaque submissions, resize, wheel navigation and destruction.
- Full release, type generation and tsc pass. Existing unrelated JSDoc warnings
  remain. Scoped ESLint/formatting and patch audit pass; generated status is zero.
- Required AgentDocs global Markdown lint passes. Global Prettier still reports
  318 historical files; changed documents are formatted without mass cleanup.
- Isolated browser copies visually checked the independent day/night fixture and
  Bistro off/on at a fixed street view. Original user tabs/camera/settings were
  not operated. Visual acceptance belongs to the owner.

## Performance evidence

Windows / Chromium / ANGLE D3D11 / RTX 3060 Ti, Bistro, 1185x667, TAA and existing
AO/SSR settings. Four alternating whole-frame samples of 45 frames had medians
18.25 / 18.47 / 17.82 / 18.96 ms (off/on/off/on). These whole-frame values are noisy
and are not a portable FPS claim. A separate disjoint-checked timer around the
four exposure commands measured a 0.0512 ms median across 45 recorded samples;
there were occasional GPU scheduling spikes, up to 1.78 ms.

Owned targets: 128x72 log luminance, 64x72 rows, 64x1 histogram and two 1x1 history
textures, all RGBA32F: 222240 bytes (217.03 KiB). No full-resolution target.
Opaque main submissions remain 1409, AO prepass and SSR replay remain zero, and
existing MRT attachments remain five. Lock needs one 1x1 pass; disabled has zero
owned targets/draws. Scope does not promise equal costs on mobile or other GPUs.

## Handoff

Technical gate confirmed. Owner should enable the new Bistro folder and compare
street/sky/shadow views, or use the independent bright/dark example. No further
rendering phase is activated; global-exposure limitations remain as documented.

## Dusk fixture correction after owner review

- Status: fixed; architecture gate confirmed; date: 2026-09-28; checkpoint before
  correction: `6d9f2bf2c1`. Owner visual review remains pending on this correction.
- **High / actual lighting mismatch:** runtime inspection of the owner's dusk
  frame showed configured first SH [0.032,0.036,0.048], but the native uniform still
  held daylight [0.64,0.72,0.96]. Native pipeline captures the coefficient array.
  The example now allocates it once and updates vectors in place; this does not
  change native array-replacement semantics outside this fixture.
- **Medium / gamma mismatch:** intended background radiance was assigned directly
  to display-space backgroundColor, then raised to Scene.gamma in native HDR
  clearing. The red background at dusk was 0.00001294 instead of 0.006. Encode
  the linear preset values with inverse Scene gamma so background and model
  illumination scale together. Do not change metering weights to hide this error.
- **Evidence:** the original user frame metered gain about 11.98 with residual
  daylight IBL and near-black background, producing washed-out faces. A separate
  corrected page shows distinct lit/shaded faces and no rendering error. Original
  user tab, camera and settings were preserved; temporary diagnostic tab closed.
- **Regression:** two E2E cases pass in Globe/Planar, checking actual bound SH,
  linear HDR background and target exposure shift by log2(20) for dusk. Existing
  adaptation/lock/lifecycle/navigation checks remain in those cases. The new
  background scaling assertion fails on the prior fixture. Scoped lint/format
  passes; global AgentDocs retains its existing 318-file formatting debt.
- **Scope:** only owned Test, E2E and handoff files change. No upstream-owned file
  or additional SGP, no exposure-algorithm/API or build change. Public/native SH
  array replacement can be examined separately if required; in-place coefficient
  updates use the supported mutable data interface for this example. Global eye
  adaptation still tends to normalize brightness; artistic dusk/night darkness
  needs compensation or gain limits, now explained beside the controls.
