# Review: Bistro TAA subpixel flicker

- Type: review; status: completed; date: 2026-09-28
- Owner / reviewer: current task, architecture and execution self-review
- Target: [R4](../plans/2026-09-20-r4-temporal-antialiasing.md), prior accepted checkpoint c3add1660a
- Decision / existing seam: ADR-0094 / SGP-0022; no upstream changes
- Predecessor: [reference adaptation](2026-09-21-r4-temporal-reference-adaptation.md)

## Findings and disposition

- P1, fixed: The depth history is jittered while reconstructed color history is not.
  Rejection previously sampled both at the unjittered color coordinate. The renderer now
  retains previous jitter only after successful publication, and the shader projects the
  actual current surface sample into that previous depth grid. This preserves current
  covered-pixel depth and CPU camera-relative/ECEF precision.
- P1, fixed: A nearest-depth check rejects stationary subpixel foreground/background
  coverage as disocclusion. Check the four positive depths surrounding the projected
  sample; accept a matching surface without blending depth or widening tolerance. Existing
  color clipping bounds reused color; the camera-dolly regression remains passing.
- P2, fixed: Fine details still inject intermittent high-contrast current samples after
  depth correction. Adapt the already pinned Filament/Lottes luminance weighting after
  clipping. Preserve explicit historyWeight zero, and clarify its base-weight semantics
  in public JSDoc. No signature, default or range changes; attribution is updated.
- P2, accepted boundary: Camera-only reprojection cannot fully stabilize independently
  animated geometry, transparent layers or changing shading. Increased temporal retention
  can soften these features or retain trails. No motion vectors or reactive mask are claimed.

## Verification

- Added a GPU scene with thin dark railings and a covered bright background. The previous
  resolve fails the two-byte-level mean per-frame variation budget at 5.4268; corrected
  resolve passes. This checks actual displayed pixels across two full jitter cycles.
- All 13 strict WebGL TAA Specs pass in both development and release. Coverage includes
  both Worlds, current depth/picking, camera dolly against spatial ground truth, static
  fine texture, reset/disocclusion, orthographic/resize/destruction, multi-frustum, render
  failure cleanup and zero added geometry with shared AO MRT.
- Full release build, buildTs and tsc pass; existing upstream JSDoc warnings remain.
  Scoped JavaScript ESLint and formatting pass. The AgentDocs-wide markdownlint scan found
  only the edited index table alignment, which was corrected and passed a focused rerun.
  New review, R4 plan, index and ADR formatting pass. The required wide Prettier scan still
  reports the pre-existing 318-file debt after correcting the edited index; unrelated
  documents are not reformatted.
- A temporary browser copy reproduces the owner's Bistro camera/light/effect settings;
  the original tab is untouched. At 1219x826 with AO, SSR, shadows, specular AA and automatic
  exposure, mean RGB frame difference across 16 frames decreases 1.2619 to 0.3924 byte levels
  (68.9%). Fraction of pixels changing by more than ten levels decreases 2.355% to 0.436%
  (81.5%). Average displayed RGB remains 127.885 versus 127.807. These are static-scene
  diagnostic measurements, not a universal image-quality score.
- Real wheel interaction in the temporary page renders without a browser error. The
  diagnostic camera is restored and the corrected frame is inspected; owner visual
  acceptance remains pending.

## Performance, ownership and handoff

RTX 3060 Ti, ANGLE D3D11, 1219x826. EXT_disjoint_timer_query_webgl2 measures the isolated
resolve with identical inputs, alternating old/new order, 24 queries per version and eight
submissions per query. GPU disjoint is false. Median old/new costs are 0.09856/0.103808 ms;
p90 costs are 0.130432/0.13824 ms. About 0.005 ms median extra cost is specific to this
batched pass measurement and is not whole-frame timing. Three additional depth reads and
luminance arithmetic add no target, pass or geometry; owned texture storage stays 28 bytes/pixel.

No upstream-owned file or SGP manifest change. Existing Scene, UniformState and Picking
SGP-0022 hooks are untouched. Shader/API implementation, Specs, notice and documentation
are SceneGIS-owned. No generated file is submitted. Temporary GPU queries are destroyed;
closing the diagnostic page releases its commands/history. Create one independent local
checkpoint, then hand the corrected page back for owner acceptance.
