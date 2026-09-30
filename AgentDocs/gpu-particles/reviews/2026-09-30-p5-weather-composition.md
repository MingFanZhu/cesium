# P5: Unified weather review

- Type: architecture/code review; status: approved for local checkpoint
- Created/updated: 2026-09-30; reviewer/finding owner: current task, self-review
- Target: P5 after 51be32aa8d; [plan](../plans/2026-09-30-p5-weather-composition.md)
- ADR-0106; upstream-owned files changed: none; SGP: none

## Findings and disposition

| ID  | Severity    | Status   | Evidence / disposition                                                                                                                                                                                                                                                   |
| --- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | correctness | fixed    | Initial refactor shadowed the time helper with the existing local advance flag. Renamed the helper; all original ten particle Specs pass.                                                                                                                                |
| W2  | correctness | fixed    | Scene preUpdate can run without drawing. Shared transition time cannot replace last-rendered particle time when rebasing camera-local state. A dedicated regression verifies actual rendered transform publication after update-only ticks; no settling/retry mechanism. |
| W3  | ownership   | fixed    | Borrowed fog/surface/lens references remain shared and alive. Manual groups receive no writes; destruction conditionally restores only unchanged fields. Own components/listener and their Scene references are released. Lifecycle/foreign-binding Specs pass.          |
| W4  | scope       | accepted | Height fog explicitly borrows the existing registered/enabled environment controller. Weather does not instantiate another atmosphere or silently enable lighting/cloud dependencies. Viewer must pass that reference and remove its old per-frame glue.                 |

## Verification

- Eighteen scoped SceneGISWeather/SceneGISWeatherComposition Specs pass in development
  and release, Chrome Headless 154 / Windows with WebGL validation. Both world modes,
  rain/snow/clear, full-intensity strengths, shared crossfade, pause/hide, same-frame
  material preparation, update-only time, manual authority, invalid bindings and
  deterministic teardown are covered.
- Local Planar aerial E2E passes: presets, SSR toggle, manual surface override,
  automatic resumption, rain/frost selection, hide/clear, externally controlled fog
  surviving a clear preset, and complete disposal. Globe composition is covered by
  engine contracts; this phase does not requalify online ion data availability.
- Desktop local aerial inspection shows snowfall, snow-covered roofs/ground, height
  fog and static edge frost together. No change to particle/surface/lens shaders.
- Full buildRelease, buildTs and gulp tsc pass. Generated exports/types remain build
  products. Scoped ESLint, changed-file formatting and whitespace checks pass.
  All-AgentDocs Markdownlint passes. All-AgentDocs Prettier reports 320 existing
  unchanged documents, including the preceding snow plan/review; no unrelated
  formatting cleanup is included.

## Cost and limits

Composition adds constant scalar CPU work, one Scene listener and fixed small binding
records. The steady-state Spec observes zero requestRender/setter-induced changes.
The same two particle pools and native stages are reused; rain/snow transitions do
not rebuild them. No new shader/pass/texture/buffer class, geometry submission or GPU
readback is introduced. During the deliberate rain-to-snow crossfade both existing
lens stages may be active; clear/hidden automatic channels disable both.

This phase changes orchestration, not effect algorithms, so resource identity and
idle-write regressions are the relevant performance evidence; no new FPS guarantee.
Automatic effects still have their existing GPU costs. Surface coverage is visual,
not physically accumulated. Paused freezes shared weather transitions/particles;
native rain lens/ripples keep their Scene-time animation unless the Scene clock stops.
Borrowed resources must stay live until weather is removed. Bound weather must be
destroyed before its Scene when using a non-destroying primitive collection.

No unresolved implementation finding or later phase. Owner visual judgment and the
separate Viewer integration/acceptance remain application-level work; this task did
not alter that checkout or send coordination messages.
