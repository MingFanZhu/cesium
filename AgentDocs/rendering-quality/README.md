# Rendering Quality

## Metadata

| Field                  | Value                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Extension slug         | `rendering-quality`                                                                                      |
| Status                 | `active`                                                                                                 |
| Planning model         | `extension`                                                                                              |
| Active extension plan  | [roadmap](plans/2026-09-18-rendering-quality-extension.md)                                               |
| Current phase          | None; R30 completed and visually accepted                                                                |
| Active phase plan      | None; [completed R30](plans/2026-10-23-r30-rect-area-light.md)                                           |
| Active standalone plan | None; [completed directional occlusion assessment](plans/2026-10-22-directional-occlusion-assessment.md) |
| Architecture contact   | Current task                                                                                             |
| Execution contact      | Current task                                                                                             |
| Last updated           | `2026-10-23`                                                                                             |

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

- 2026-10-23: owner requests rectangular area lighting. Activate
  [R30](plans/2026-10-23-r30-rect-area-light.md), ADR-0186, on the completed
  `71b47223a4` baseline. Reuse the light collection and shared forward/deferred
  shader; no upstream seam is planned. Earlier visual gates remain independent.
  R30 is now technically complete; [review](reviews/2026-10-23-r30-rect-area-light.md)
  records dev/release 31 passing focused cases each, one reproduced baseline bloom
  expectation, four browser cases, builds/types, GPU cost and inspected pictures.
  Its local checkpoint is `02644b6ecc` on `feature/rect-area-light`. The owner
  visually accepts R30 on 2026-10-23 and requests the acceptance record commit.
  Merge remains pending. No next phase is active.

- 2026-10-22: [R29 optimization/review](reviews/2026-10-22-r29-directional-occlusion-cost.md)
  complete. Bistro lighting groups/draws fall 627 to 1, geometry remains 627;
  all eight Globe/Planar PNG pairs are pixel-identical. Native light/binding updates
  and lifetime checks pass in normal and release builds. Recorded CPU cost improves
  substantially; incremental GPU cost remains above the original target. No next
  phase, merge or default change is activated.

- 2026-10-22: owner visually accepts R28 (`023016e69c`) and authorizes [R29 cost optimization](plans/2026-10-22-r29-directional-occlusion-cost.md). CPU profiling reproduces repeated model lighting-group rebuilds. Preserve the accepted shader quality, sampling and defaults.

- 2026-10-22 historical R28 delivery: implementation and [technical review](reviews/2026-10-22-r28-directional-occlusion.md)
  are complete; owner visual gate was pending, now accepted above. Optional directional environment
  specular occlusion works in both worlds. GPU estimator increment is 0.19–0.21 ms,
  but whole-frame increment is 2.9–3.2 ms on the measured Bistro scene, exceeding
  the investigation target. Defaults stay off; no next phase is activated.

- 2026-10-22: owner approves R28 implementation after assessment checkpoint `b31f09bdff`.
  [Active plan](plans/2026-10-22-r28-directional-occlusion.md) / ADR-0184 / SGP-0014
  adds optional environment specular occlusion, retaining scalar diffuse AO and
  strict Planar atmosphere. R27 code checkpoint is `0d4b58b8a4`; its historical
  visual and cold-build records remain unchanged.

- 2026-10-22: [directional environment occlusion assessment](reviews/2026-10-22-directional-occlusion-assessment.md)
  is complete. Both-world scalar AO baselines pass; measured estimate/filter cost is
  about 1.89 ms at 1280×800 on the recorded GPU, without added geometry rendering.
  Recommend bounded GTSO first. Full directional diffuse has a Planar irradiance
  dependency; SSR composition and storage costs are explicit implementation gates.
  No directional renderer, API/default change or next phase is activated.

- 2026-10-22: bounded Globe / Planar material audit complete. The
  [review](reviews/2026-10-22-material-lighting-audit.md) records matching default
  imagery/PBR controls and a reproduced Globe imagery gamma discontinuity. Four
  browser cases pass; GPU suites report 53 passed / 3 existing imagery failures.
  The owner then selects Globe as reference; the
  [compatibility follow-up](../planar-surface-styling/reviews/2026-10-22-globe-filter-compatibility.md)
  aligns Planar and resolves all three imagery test failures. Globe and lighting
  defaults are preserved. Earlier water findings remain separate.

- 2026-10-21: R27 implementation and technical verification are complete. The
  [review](reviews/2026-10-21-r27-lake-wave-quality.md) records 40 feature/regression
  Specs, three browser cases and measured third-band cost. Owner visual acceptance
  in the curved-lake example remains pending; inherited cold-build limits stay open.

- 2026-10-21: after R26 acceptance checkpoint `32dc94f984`, activate R27 / ADR-0181.
  The owner selects the curved-lake example. Broaden wind-wave directions and add an
  independent ripple frequency band; preserve the accepted private river spectrum.

- 2026-10-21: owner visually accepts R26 random FFT waves at `c6a5da44d2`. Record a
  separate acceptance checkpoint before planning lake-quality work. Shared cold mesh
  construction limitations remain recorded, with no implied scheduling fix.

- 2026-10-21: owner rejects the coherent crests at checkpoint `47f56ad792` and approves
  random FFT fields with local flow orientation. The same R26 now owns two broadly
  directional wave bands and samples adjacent fixed angular sectors; authored transport
  is independent from intrinsic dispersion. Ten feature Specs and both-world browser
  coverage verify the replacement; [R26 review](reviews/2026-10-21-r26-river-surface.md)
  records performance, ownership and retained limitations. Visual acceptance is pending.

- 2026-10-21: owner feedback on the R26 checkpoint rejects broad white streaks and
  normal-only ripples. The same phase now shares actual vertex/normal waves along the
  river chart and disables artistic foam by default. Nine feature Specs, 29 water
  regressions, both-world E2E and release/types pass. Runtime evidence and remaining
  owner visual/cold-build gates are recorded in the R26 review below.

- 2026-10-21: after R25 checkpoint `d2ef77d1cd`, the owner authorizes a distinct river
  class for authored along-channel heights and changing flow. [R26](plans/2026-10-21-r26-river-surface.md)
  / ADR-0180 is implemented. [Technical review](reviews/2026-10-21-r26-river-surface.md)
  records qualification and retained synchronous build cost. Confluences, branches,
  waterfalls and hydraulic simulation are explicitly excluded. Owner visual acceptance
  is pending; R25 visual/cold-build follow-up stays open in its review.

- 2026-10-21: owner authorizes regional curved rivers/lakes, automatic mesh LOD and the
  existing FFT. [R25](plans/2026-10-21-r25-curved-water.md) / ADR-0179 adds an explicit
  ellipsoid geometry mode while retaining local water. Global ocean work stays deferred.
  [Technical review](reviews/2026-10-21-r25-curved-water.md) records 7 feature Specs,
  22 water/FFT regressions, lake/river and both-world local-water E2E, release/types,
  measured runtime and synchronous cold-build cost. All paths are SceneGIS-owned;
  SGP-0017 is unchanged. Owner visual acceptance and cold-build tolerance remain pending.
  R26 was subsequently authorized above; these R25 findings remain open.

- After R24 checkpoint `2e09227156`, the owner reports weak nighttime emission.
  [Focused maintenance](plans/2026-10-12-street-night-emission.md) diagnoses a disabled
  bloom and an inherited threshold above the fixture's emissive range. Tune only
  optional street bloom parameters; preserve native emission, exposure and daytime
  defaults. No new renderer phase or GI scope is active.
  [Technical review](reviews/2026-10-12-street-night-emission.md) confirms both-world
  real bloom-buffer E2E and same-view night inspection. The owner accepts this adjustment
  on 2026-10-13, completing the independent local checkpoint gate.

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
