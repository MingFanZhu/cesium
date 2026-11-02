# G3：高斯投射示例与交付验证

- Type: phase plan
- Status: completed
- Parent: [Gaussian extension](2026-11-02-gaussian-extension.md)
- Date: 2026-11-02
- Owner / architecture review: current task, confirmed
- Entry: G2 checkpoint cb0cb10d53
- ADR: ADR-0208; SGP: SGP-0065

## Source facts and design

G2's real sparse MCI4 fixture verifies rendering, shared atlas, mesh blockers, order and
ownership, but is not a useful visual reference for contiguous Gaussian surfaces. Add a
deterministic producer script using the existing CPU builder to generate ignored Build
walls, floor and an occluding panel. No second runtime, binary snapshot or external media.
An actual HTMLVideoElement displays a locally generated calibration stream and can accept
a user video file; the page owns all media and releases it separately from the projector.

The both-world page uses public engine APIs. Provide enable, opacity, flip, guide and mesh
blocker controls; explicit parameter values; a stable paused view; and minimal diagnostics.
The fixture is designed to expose Gaussian front/rear shadow boundaries. Tests compare
projection enabled/disabled at known world locations, move the main camera independently,
and verify no extra paused uploads, atlas recreation or stale projection on disable/remove.

## Qualification and exit

- Capture and inspect planar / ENU images, actual panel occlusion and video grid orientation.
- Record splats, atlas and depth/video sizes, capture draws/CPU and bounded whole-frame GPU
  timer samples where available. Do not infer cost from FPS or a tiny protocol fixture.
- Full branded build (runtime/resources/types/docs), build-ts/tsc, current documentation
  tests, focused release example smoke and existing relevant GPU regressions. Native source
  inventory must retain its translation contract; remove obsolete inherited entries only if
  the new owned enabled description supersedes one.
- Finish SDK guide / example links, record findings/remaining approximation and local commit.
  Owner retains final visual judgment; no SDK edits, push or automatic merge.

## Outcome

Deterministic 8,531-splat walls/panel/floor and a real local calibration stream qualify both
Worlds. Four development and four branded-release browser cases pass, including a panel
behind the display camera and the public threshold switch. Both images inspected. Full
SceneGIS build, strict declarations/tsc and 42 Node checks pass. The owned enabled override
replaces one inherited native translation: 15,522 native fields and 2,342 owned fields, no
missing/stale/unused. See [G3 review](../reviews/2026-11-02-g3-gaussian-qualification.md).
