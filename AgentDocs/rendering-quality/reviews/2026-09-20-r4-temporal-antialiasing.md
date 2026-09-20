# Review: Temporal Antialiasing

- Type: `review`; status: `completed`; date: `2026-09-20`
- Reviewer / owner: current task, architecture and execution self-review
- Target: [R4](../plans/2026-09-20-r4-temporal-antialiasing.md), after R14 `31ba432cc8`
- Decision / seam: ADR-0094 / SGP-0022

## Findings and disposition

- P1, fixed after owner review: Static textured slopes visibly jittered. The stationary reference
  building ROI rejected 18–27% of history due to subpixel depth variation; rejected current samples
  also retained their projection offset. Reconstruct current color with the existing 3x3 samples
  using a Mitchell-Netravali kernel centered at the unjittered pixel, and include the local depth
  footprint in depth rejection. This adds arithmetic but no pass, texture or geometry draw.
  The new grazing-surface test fails on the old release at 5.242 byte levels/frame and passes below
  0.5 on the correction. At the same 1198 x 852 reference view, ROI (350, 80, 400, 400), 16 measured
  frame differences after eight initial frames, mean RGB absolute change drops from 1.225 to 0.162
  (87%); pixels changing by more than ten mean RGB levels drop from 2.425% to 0.056%. Disabling AO
  leaves the old failure unchanged (1.224); disabling TAA eliminates it. This is a stability witness,
  not an image-quality acceptance proxy; final owner judgment remains pending.

- P1, fixed: Camera mutation would affect culling, interaction and shadow stability. Only
  UniformState projection/infinite projection/frustum planes receive render jitter, after shadow
  submission. A finally block restores state before overlays and after render failure.
- P1, fixed: Depth picking must use the projection that produced the sampled depth. Each native
  PickDepth records the pixel offset when copied; unprojection compensates it, including when
  TAA has since been disabled. Eight-sample surface-position regression passes.
- P1, fixed: Rejecting every clear-depth sample prevents silhouette coverage accumulation. A
  one-pixel nearest-depth support neighborhood allows geometric edge history; fully removed
  support clears immediately. Current color bounds/variance and depth compatibility constrain
  history. This does not invent background motion vectors.
- P1, fixed: Native depth is per frustum. Fullscreen conversion merges opaque/water depth into
  one R32F surface before each near-frustum clear. Near and far depth witnesses both survive,
  with no geometry replay. Static and orthographic camera transforms use double-precision CPU
  current-eye to previous-eye multiplication for ECEF stability.
- P2, accepted scope: No object motion vectors, temporal upscaling or dynamic resolution. Dynamic
  geometry, translucent content, billboards/labels and changing shading can soften or trail;
  color/depth rejection is not equivalent to object motion. Independent examples expose these
  limits for owner review. Cloud history is neither reused nor changed.
- P2, fixed: First/reset/resize/projection/log-depth changes discard history; disable/destroy
  releases it. Scene owns its controller. Request-render accumulation does not schedule extra
  frames. Native MSAA and FXAA are never changed by the controller.

## Verification

- Ten strict development and final release TAA Specs pass: static grazing-angle detail, both Worlds, actual intermediate
  silhouette coverage, camera invariance, object and depth picking, removed surface/reset,
  orthographic motion, near/far frustum depth, zero extra geometry, shared AO, resize/disable/
  destruction and render failure cleanup.
- Existing strict release AO 14, SSR 9 and water 12 regressions pass. Full release build,
  declaration generation and full `tsc` pass. Scoped ESLint and patch audit are recorded at handoff.
- Native AutomaticUniforms: 87/88 pass. The existing overlay test fails because `Pass.OVERLAY`
  is 14 while `czm_passOverlay` is 13. Both exact values are already present at R14 HEAD;
  no TAA controller exists in that fixture. Preserve this independent baseline mismatch rather
  than broadening this phase or rerunning identical evidence.
  Follow-up owner: architecture; defer the native pass-constant consistency fix to a separately
  entered item in the [extension roadmap](../plans/2026-09-18-rendering-quality-extension.md).
- Planar and Globe standalone pages render matching geometry without console errors; both
  camera and object movement controls operate. Real Viewer buildings/trees/roads and moving
  camera render without errors with TAA, one-sample five-output MRT and zero AO prepass draws.
  This is technical observation; final visual quality remains the owner's gate.

## Performance and storage

RTX 3060 Ti, ANGLE D3D11, 998 x 622, HDR, AO/SSR/environment/shadows enabled, 14 loaded layers,
1627 scene commands, five MRT outputs. This session restored the saved camera and temporarily
enabled the already-configured building, surface and 11 prop layers. Saved JSON remained unchanged.
The earlier R14 session had a different viewport; its absolute FPS is not a comparison baseline.

Each mode uses 16 transition frames followed by 48 natural postRender intervals. FXAA is disabled
for all three modes. Same page/view/settings/geometry, no build/tests or second rendering example
during measurement. The native settings and temporary controller are restored in finally.

| Mode              | Mean 1    | Mean 2    | FPS 1 | FPS 2 |
| ----------------- | --------- | --------- | ----- | ----- |
| 4x MSAA           | 26.423 ms | 26.602 ms | 37.85 | 37.59 |
| One sample, no AA | 26.485 ms | 26.463 ms | 37.76 | 37.79 |
| One sample + TAA  | 26.417 ms | 26.958 ms | 37.85 | 37.09 |

There is no meaningful frame-rate improvement in this view. Removing MSAA alone also does not
improve cadence, so this result does not establish MSAA as the dominant frame-time cost. Retain
optional TAA for quality/storage choice; do not automatically replace the accepted default.

These timings precede the owner-reported static-jitter correction. The correction keeps the same
pass/target/sample count and adds reconstruction arithmetic; its GPU timing was not separately
measured. The table does not establish a speedup for the final implementation.

TAA owns 28 bytes/pixel: two RGBA16F color histories, two R32F depth histories and one current
R32F depth target, approximately 16.6 MiB here. At four samples, the four auxiliary RGBA16F MRT
renderbuffers alone consume 128 bytes/pixel. Removing those and adding TAA saves about 59.2 MiB,
excluding native multisample color/depth savings, driver alignment and all unchanged resources.
This storage estimate is not a GPU memory telemetry measurement or a promised FPS gain.

## Upstream-owned files

All use paired SGP-0022 markers:

- `packages/engine/Source/Scene/Scene.js`: preparation, jitter/depth/resolve order, cleanup,
  depth-pick sample association and Scene-owned destruction.
- `packages/engine/Source/Renderer/UniformState.js`: explicit render projection offset hook.
- `packages/engine/Source/Scene/Picking.js`: sample-offset correction during depth unprojection.

Owned implementation, shaders, Specs, independent example, API documentation and this review
form one R4 checkpoint. Retain R7 night and Viewer startup-camera follow-ups; no next phase is active.

## Final audit

Scoped code lint, formatting, diff checks and the upstream audit pass: three delivery upstream files,
SGP-0022 and no generated changes. Required AgentDocs-wide markdownlint passes; wide Prettier
reports pre-existing formatting issues (316 before formatting the touched roadmap/review). Changed
documents receive scoped formatting. The public photogrammetry comparison page also switches to
TAA without console errors. Temporary real-scene profiling is cleaned up; saved scene JSON is unchanged.
