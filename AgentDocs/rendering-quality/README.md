# Rendering Quality

## Metadata

| Field                  | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                                  |
| Status                 | `active`                                                             |
| Planning model         | `extension`                                                          |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md)           |
| Current phase          | R24 completed and visually accepted                                  |
| Active phase plan      | [R24](plans/2026-10-12-r24-color-grading.md)                         |
| Active standalone plan | None; [completed scope](plans/2026-10-12-street-reflection-scope.md) |
| Architecture contact   | Current task                                                         |
| Execution contact      | Current task                                                         |
| Last updated           | `2026-10-12`                                                         |

## Scope

提升 Globe / Planar 的场景光照、材质、遮蔽、反射和运动稳定性，按可见收益、覆盖范围、
实现成本与每帧开销逐项推进。已有大气、云、雾继续由 `atmosphere-clouds-effects` 维护。
具体实现阶段进入前再确定 ADR、SGP 和公共 API；默认延续 Cesium 原生 API。

## Engineering links

- Source: [native Scene](../../packages/engine/Source/Scene/)、[SceneGIS Scene](../../packages/engine/Source/SceneGIS/Scene/)、[SceneGIS shaders](../../packages/engine/Source/Shaders/SceneGIS/)
- Tests: [SceneGIS Specs](../../packages/engine/Specs/SceneGIS/)、[native Scene Specs](../../packages/engine/Specs/Scene/)
- Development examples: [AdvancedEnvironment](../../Test/AdvancedEnvironment/)、[Planar](../../Test/Planar/)、[Rendering](../../Test/Rendering/)
- Sandcastle: No new example planned yet.
- Related ADR: [ADR-0039](../../Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md)、[ADR-0054](../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md)、[ADR-0055](../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Related SGP: `SGP-0007`、`SGP-0008`、`SGP-0009`、`SGP-0010`; R1 adds `SGP-0013` and updates `SGP-0001/0002` seams.

- R1 ADR: [ADR-0083](../../Documentation/SceneGIS/Decisions/ADR-0083-planar-cascaded-shadows.md).
- R1 example: [级联阴影](../../Test/Planar/级联阴影.html).

## Current handoff

- 2026-10-12: owner authorizes white balance, picture controls and three street presets.
  [R24](plans/2026-10-12-r24-color-grading.md) uses exposed linear HDR inside existing native
  tone stages, with no new full-screen pass. ADR-0154 / SGP-0044; grading preserves
  light, Clock, atmosphere and automatic metering. [Technical review](reviews/2026-10-12-r24-color-grading.md)
  confirms nine dev/release feature Specs, 51 regressions, two-world Bistro E2E and
  release/types/tsc/audit. The current page offers three looks and individual controls;
  the owner accepts the result and authorizes its independent local phase checkpoint.
  No next implementation phase is active.

- 2026-10-12: local reflection probes leave the changing-WebGIS street workflow.
  [Standalone scope](plans/2026-10-12-street-reflection-scope.md) removes Bistro controls
  while retaining engine APIs, Specs, the independent example and the Sponza fixture.
  WebGL quality continues with materials, sky/environment and screen-space reflections;
  automatic probe placement/refresh and GI expansion are deferred. Older R17 visual
  findings remain recorded; retaining capture infrastructure does not establish GI support.
  Maintenance is complete: three E2E cases pass; [review](reviews/2026-10-12-street-reflection-scope.md)
  records scope, verification and retained tooling limitations. No new rendering phase is active.

- The owner's direct advanced-environment controls and UTC-local equinox placement
  are complete. [Standalone maintenance](plans/2026-10-12-street-controls-and-location.md)
  removes Bistro A/B gates and places it at Greenwich on March 20, preserving shared
  Sponza fixtures and the completed R23 record. Three E2E cases pass; the updated panel
  is shown in-app. [Review](reviews/2026-10-12-street-controls-and-location.md) records
  verification and time semantics. No new rendering algorithm or phase is activated.

- R23 is authorized after checkpoint `16422ff2f4`: tune the original WebGL Bistro
  direct/environment lighting, shadows and exposure using existing APIs first.
  [Active phase](plans/2026-10-12-r23-webgl-street-lighting.md) records current source
  facts, matched-image validation and major-decision boundaries. R22 and older
  outstanding visual reviews remain pending; WebGPU/GI expansion stays deferred.
  [R23 technical review](reviews/2026-10-12-r23-webgl-street-lighting.md): both-world
  Bistro and shared Sponza E2E pass. Matched restaurant images and bounded GPU timings
  are complete; the default preset retains the 64 MiB shadow target. The owner accepts
  the baseline on 2026-10-12 and authorizes its checkpoint and continued work.
  Checkpoint: `f94d0d1766`. Follow-up exposure isolation supports the owner's observation:
  original lighting with auto exposure (native multiplier 1, gain about 3.57) provides
  similar overall brightening. R23 is exposure/parameter calibration; its separate
  lighting contribution is stronger shadow separation. See the review amendment.
  Normalize and lock exposure for subsequent lighting comparisons; retain automatic
  adaptation as a separate navigation check. No next implementation phase is active.

- 2026-10-12: owner selects WebGL quality first and confirms `scenegis/develop` as base.
  `feature/webgl-rendering-quality` starts at `2f6d4ce30b`; the completed
  [standalone backport](plans/2026-10-12-webgl-fix-backport.md) transfers only shared bug fixes.
  WebGPU/P4n work and open visual findings remain on the original branch, deferred.
  [Migration review](reviews/2026-10-12-webgl-fix-backport.md): 181 native cases, six GPU/browser
  cases, release/types/tsc and patch audit pass; existing tooling/visual limitations are recorded.
  Existing R22 and older visual gates remain unchanged; no new quality phase is active.

- R21 is authorized after SSIL checkpoint `2bd5a2598f`: global histogram exposure,
  eye adaptation, lock/manual controls, independent example and Bistro controls.
  ADR-0100 / SGP-0027; no local exposure. R20 example is owner accepted.
  R21 implementation and [technical review](reviews/2026-09-28-r21-auto-exposure.md)
  are complete; owner visual acceptance is pending, no next phase is active.
  Owner dusk follow-up fixes stale example SH bindings and background gamma;
  both-world exposure/lighting regressions pass. See the R21 plan/review amendment.

- R20 is authorized after checkpoint `d68562fbc5`: finite-distance SSIL, shared MRT,
  independent example and optional Bistro control. ADR-0099 / SGP-0026.
  Completed phase: [R20](plans/2026-09-28-r20-screen-space-indirect-lighting.md).
  Latest [technical review](reviews/2026-09-28-r20-screen-space-indirect-lighting.md) confirms
  implementation and bounded verification. The owner accepted the SSIL example; R21 follows above.

- R19 adapts Three.js geometry-normal filtering after R18 checkpoint `8d27a60feb`.
  ADR-0098 / SGP-0025; retain TAA and native camera behavior. No open discussion.
  Implementation and [review](reviews/2026-09-28-r19-specular-antialiasing.md) are complete;
  owner visual acceptance remains pending. R20 is tracked above.

- R18 is technically complete after R17 checkpoint `5972618214`: SSR efficiency and
  stability use pinned AMD references. See the [review](reviews/2026-09-28-r18-screen-space-reflections.md).
  Owner visual acceptance is pending. Retain manual probes; dynamic probes, diffuse
  GI and subsequent AO work are deferred. Prefer GPU-vendor designs for future rendering
  work, with source review, attribution and measured platform-specific tradeoffs.

- R17 is authorized: environment occlusion and local specular probes with explicit runtime
  capture after loading/light edits. Diffuse bounce is excluded. See the active phase,
  [ADR-0096](../../Documentation/SceneGIS/Decisions/ADR-0096-local-environment-probes.md)
  and SGP-0024. Implementation and bounded verification are complete; see the
  [R17 review](reviews/2026-09-28-r17-local-probes.md). Owner visual acceptance is pending.

- [R16](plans/2026-09-28-r16-cycles-calibration.md) and its
  [review](reviews/2026-09-28-r16-cycles-calibration.md) are technically complete:
  same-asset Cycles reference, matched camera/physical sky/output, direct/full transport,
  independent comparison page and six bounded checks. Corrected unused source AO bindings;
  documented largely constant source roughness. No upstream/SGP or renderer changes.
  Open Blender document and browser configuration are preserved. Owner visual review
  is pending; R17 now activates local probes only. GI remains deferred.

- R14 checkpoint `31ba432cc8` is owner accepted on 2026-09-20.
- R4 correction checkpoint `c3add1660a` is owner accepted as usable on 2026-09-21. Existing moving-content limitations remain documented.
- Previous accepted plan / review: [R4 plan](plans/2026-09-20-r4-temporal-antialiasing.md), [zoom/reference review](reviews/2026-09-21-r4-temporal-reference-adaptation.md).
- Verification: 45 strict feature/regression Specs, full release/types and patch audit pass. Native AutomaticUniforms has 87 passes and one pre-existing overlay constant mismatch.
- Owner-reported static TAA jitter is corrected by current-pixel reconstruction and slope-aware depth rejection. The real reference ROI improves 87%; the new regression fails on the prior release and passes on the correction.
- Follow-up to `9255216681`: retain actual covered-pixel depth and adapt the pinned Filament resolve after owner-reported zoom instability. Twelve dev/release TAA Specs pass; moving-camera spatial-reference error improves 22%. The isolated resolve costs about 0.01 ms more at 1198x852, with no new geometry, pass or target. This correction changes no upstream file.
- Real-view FPS is essentially unchanged at 37–38; estimated auxiliary storage saving is 59.2 MiB. TAA stays optional, with no native-default changes.
- Both-world [standalone AA example](../../Test/Rendering/时域抗锯齿.html) and the [reference scene](../../Test/Rendering/实景对比.html) expose comparison controls.
- Decision / seam: ADR-0094 / SGP-0022. Three upstream files; camera-only reprojection retains moving-content limitations.
- [R15 PBR reference scene](plans/2026-09-21-r15-pbr-reference-scene.md) and [technical review](reviews/2026-09-21-r15-pbr-reference-scene.md) are complete: local Intel Sponza main/composite pages, explicit 2K delivery and retained original 4K, Khronos material targets, pool and fixed comparisons. Five fixture/E2E checks pass; owner visual review is pending. No upstream or renderer change. Retain R7 night and Viewer startup-camera follow-ups; no new GI/glass phase is active.
- Follow-up: physical atmosphere controls are owner accepted; standard navigation is restored
  with downward inspection poses. The owner prefers a GIS street scene and plans to prepare
  converted city assets. The supplied Bistro GLB and original FBX/texture archive now
  complete the [Bistro fixture follow-up](plans/2026-09-21-r15-bistro-scene.md).
- [Bistro review](reviews/2026-09-21-r15-bistro-scene.md): default street fixture, restored
  source material channels, explicit 1K delivery, both-world checks and retained Sponza
  composite. Three Bistro tests and one existing Planar composite regression pass. Original
  GLB/FBX/DDS remain intact; glass/source conversion limitations are documented. Owner visual
  acceptance is pending. No upstream files, SGP or next renderer phase.
- Railing follow-up to `388a4d8162`: singular UVs without tangents produced white
  speckles in native material normals. The [Bistro plan](plans/2026-09-21-r15-bistro-scene.md)
  and [review](reviews/2026-09-21-r15-bistro-scene.md) record the correction, GPU tests
  and unchanged-view inspection. One upstream shader, `SGP-0023` /
  [ADR-0095](../../Documentation/SceneGIS/Decisions/ADR-0095-degenerate-model-normal-mapping.md).
  Camera/settings are restored. No subsequent renderer phase is active.

- R4 Bistro flicker follow-up: [review](reviews/2026-09-28-r4-bistro-flicker.md) and
  [phase](plans/2026-09-20-r4-temporal-antialiasing.md) technically complete on 2026-09-28.
  Previous-jitter depth registration, 2x2 surface support and pinned Filament luminance
  weighting reduce static variation with unchanged scene exposure. Thirteen strict TAA
  Specs pass in dev/release; build/types pass. No upstream changes; owner visual review pending.

- R22 authorized: optional spectral wind waves on existing water and a standalone Xuanwu Lake example. See [phase](plans/2026-09-28-r22-wind-water.md) and ADR-0101. No occlusion-culling implementation is active.

- R22 technical gate passed: [review](reviews/2026-09-28-r22-wind-water.md), 21 strict GPU Specs in dev/release, two World example checks, release/types and bounded GPU timings. The Xuanwu Lake page awaits owner visual acceptance. No next phase is active.

- R22 grid follow-up: continuous camera-distance displacement filtering removes the owner-reported tile highlight bands while retaining watertight boundaries. 22 focused strict GPU Specs pass; same-view GPU timing and ownership review are recorded in the R22 review. No upstream files or new render passes. Owner visual acceptance remains pending.
