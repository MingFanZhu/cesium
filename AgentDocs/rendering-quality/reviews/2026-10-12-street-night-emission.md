# Street night emission review

- Type: `review`; status: `approved; owner visually accepted`; date: `2026-10-12`; updated: `2026-10-13`
- Target: [standalone maintenance](../plans/2026-10-12-street-night-emission.md)
- Architecture / execution: current task, source-based self-review
- Upstream-owned files: none; SGP: none

## Findings and disposition

- **P2, fixed / fixture threshold:** the supplied ten emissive materials have factor
  [1,1,1] and texture RGB at most 1, while the inherited unexposed bloom threshold is 10.
  Source GLB inspection confirms no lost emissive-strength extension. Configure only
  Bistro at threshold 0.1 / intensity 0.15; retain optional startup-disabled bloom.
  No authored material or engine default changes, including shared Sponza behavior.
- **P3, resolved / controls:** label the threshold as before exposure and use 0.01
  adjustment steps. Fixture guidance distinguishes surface emission, lens halo and
  illumination of neighboring geometry. Snapshot already exports actual bloom values.
- **P3, retained / night contrast:** the owner's automatic exposure reaches gain 64 in
  the current night view, raising background brightness. Preserve this configuration;
  no hidden time-driven exposure rule or extra emitter gain is introduced. Bloom can
  include any pixel above threshold, including daytime reflected highlights; it is not
  an emitter-only mask. These asset-specific settings are not photometric calibration.

## Verification

- Existing Bistro E2E passes in Planar (44.0 s) and Globe (48.4 s). At 22:00 it reads
  the real floating bloom target after postRender: threshold 10 yields zero RGB signal,
  the initial threshold yields nonzero signal, and switching back restores the signal.
  Controls, snapshot, navigation and destruction remain covered by the same two cases.
- Source/GLB and runtime inspection confirms native emission survives independently
  of direct lighting and AO. Same-view manual comparison shows bulb halos; the owner
  page retains original camera/lighting/grading/auto-exposure settings and intentionally
  changes only Clock to 22:00 and optional bloom for inspection. Local proof image:
  `Build/Specs/street-night-emission.jpg` (ignored, not delivered in Git).
- Scoped JS ESLint, source formatting and diff check pass. AgentDocs Markdown lint
  passes. Global AgentDocs Prettier retains 398 historical warnings; new plan/review
  and changed index are formatted separately.
- No shader, engine, API, build, texture or generated file changes. Existing optional
  bloom executes its existing targets/passes when enabled; parameter tuning adds no
  pass or resource. Full builds/types and extra performance runs are not required for
  this example-only correction. Sponza remains on the original constructor options.

## Handoff

Technical review has no blocking finding. The owner visually accepts the street bloom
adjustment on 2026-10-13, completing the independent local checkpoint gate. This does not
close the earlier R7 night-example gate, establish local illumination/GI, or activate
another renderer phase.
