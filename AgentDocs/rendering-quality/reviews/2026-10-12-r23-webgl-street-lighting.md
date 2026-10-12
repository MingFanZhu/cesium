# R23 review: WebGL street lighting baseline

- Type: `review`; date: `2026-10-12`; status: `approved; owner visually accepted`
- Author / owner: current task, architecture and execution self-review
- Target: [R23 phase](../plans/2026-10-12-r23-webgl-street-lighting.md)
- Previous checkpoint: `16422ff2f4`; no next phase activated
- Upstream-owned files changed: **none**; SGP: **none**

## Findings and disposition

- **P2, fixed / Clock pause:** the original pause handler called setTime using stale
  panel values, rewinding the visible instant. The panel now observes the actual Clock;
  pausing only changes shouldAnimate, while explicit reset retains its setTime action.
  Both-world E2E advances Clock independently, starts/stops playback, verifies the
  retained instant and calls tick while paused. The listener is removed on destruction.
- **P2, fixed / shadow budget:** an initial 4096 preset was described as an atlas size.
  Native size is per cascade: runtime verifies 8192-square DEPTH_STENCIL/UNSIGNED_INT_24_8
  storage of 268435456 bytes. Default returns to 2048 per cascade, 4096-square/67108864
  bytes. The optional high setting and UI/docs state this cost. Full 300 m range stays.
- **P2, addressed in example / weak daylight separation:** original exposure 1 and
  residual direct shadow visibility 0.3 make this street look dim and reduce separation.
  The authored daylight preset uses exposure 2.5, diffuse IBL 0.5, specular IBL 1 and
  darkness 0. Matched restaurant images show brighter lit paving/stone and clearer
  doorway/awning shadows. This is parameter calibration, not an engine-lighting fix or
  physically computed environment visibility. Final quality remains the owner's gate.
- **P3, fixed / comparison reproducibility:** lighting presets are independent from
  effects A/B and preserve camera, Clock and exposure enable/lock state. Export records
  actual IBL weights, tone mapper, shadow settings and Clock. Original street camera
  remains available. Preset names become custom after manual exposed-setting edits.
- **P3, fixed / regression fixture:** the existing Sponza test still selected an old
  exposure label. Point it at the actual exposure-multiplier control; its native
  navigation, atmosphere reset, fixed IBL, effects/export and destruction now pass.

## Verification

- Two Bistro E2E cases pass, Globe and Planar, including actual 2829226 triangle asset,
  camera/time-preserving presets, effects A/B, auto-exposure ready/lock preservation,
  manual time/play/pause, original views, export, wheel navigation and full teardown.
- One shared Planar Sponza composite case passes; its original lighting values and
  default camera remain unchanged. No asset conversion or geometry is modified.
- Matched original/daylight restaurant captures use the same 1280x800 camera, 19:00 UTC,
  PBR Neutral, TAA, AO, SSR and specular AA; SSIL and local probes remain disabled.
  Images were visually inspected. No rendering errors were observed.
- One bounded stationary sample per setting, 36 frames, Chrome / ANGLE D3D11 /
  RTX 3060 Ti. GPU queries wrap complete Viewer.render, disjoint=false. Original/tuned
  medians: 14.380/14.369 ms; P95: 15.195/15.577 ms. CPU medians: 15.0/15.1 ms.
  Both use 1591 command-list entries and the same 64 MiB shadow target. This is not a
  cross-device FPS guarantee or a moving-shadow benchmark. Optional 4096 measured
  14.387 ms in this stationary view but quadruples shadow storage to 256 MiB.
- ESLint, changed-file Prettier and diff whitespace checks pass. AgentDocs Markdown
  lint passes. Global AgentDocs formatting reports 398 pre-existing files; do not
  mass-format unrelated history. Engine/release/type rebuilds are unnecessary because
  only owned examples, E2E tests and documents change.

Ignored local evidence: `Build/Specs/street-review/original.png`, `tuned.png`,
`high-shadow.png`, `report.json`; browser runs are under `Build/Specs/street-results/`.

## Remaining limits and handoff

Diffuse IBL scaling does not solve directional building sky occlusion or color bleeding.
Existing GTAO is local/screen-based; probes and SSIL remain optional. Alpha glass,
foliage transmission, mostly constant source roughness and 1K textures retain their
previous limits. Emission is source-authored and unchanged. No engine defaults or
public API change; WebGPU/P4n remains deferred on its original branch.

The owner accepts the same-camera original/daylight baseline on 2026-10-12 and
authorizes the phase checkpoint and continued work. This review does not close older
visual gates or claim parity with the supplied third-party renderer screenshot.
