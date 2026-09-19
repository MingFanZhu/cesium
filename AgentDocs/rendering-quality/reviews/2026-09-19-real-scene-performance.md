# Review: Real-scene Derived Shader Performance

- Type: `review`; status: `completed`; updated: `2026-09-19`
- Reviewer / owner: Current task, architecture and execution self-review
- Target: [Performance maintenance](../plans/2026-09-19-real-scene-performance.md), after R7 `f1a002ae46`
- Related ADR: `ADR-0084/0086`; upstream changes / SGP: None

## Findings and disposition

- P1, fixed: AO receiver and SSR capture/receiver perform native derived-program lookup on every
  draw. The key contains complete shader sources, reaching 190753 characters in the saved scene.
  CPU profiles and a bounded lookup measurement reproduce the overhead. Weak maps keyed by the
  source ShaderProgram now reuse native-owned programs across commands and frames.
- P2, fixed during review: Command-local caching alone still repeats resolved-source lookups when
  commands change after material updates in the release regression. Shader-identity maps share
  the result across those commands; capture and receiver variants use independent maps.
- P2, retained boundary: Geometry count, native shadow passes, AO depth replay, SSR shaded replay
  and full-resolution effects remain. This patch removes CPU cache-key work, not draw calls or
  the graphics cost of these effects. No automatic quality reduction or frame-result cache.

## Correctness and lifecycle

Command cloning still copies current geometry, model matrix, draw count, state and ownership;
uniform maps still refresh on identity changes and live uniform callbacks run normally. A new
source program cannot match an old weak key. Source keys are weak and derived programs remain
owned/destroyed by the native ShaderCache. No new texture, framebuffer, shader variant or pass.
Only owned AO/SSR helpers change; no upstream-owned file or SGP entry is modified.

## Validation

- The two new GPU regression tests fail on the old repeated-lookup implementation.
- All 18 development AO/SSR tests pass with strict WebGL validation, covering both Worlds, evaluated roughness/clearcoat, clipping, motion,
  native shadows, picking exclusion, current uniforms, resize and destruction.
- Both new regressions pass against the release build, including material updates and reuse of
  previously resolved source shaders. Development/release builds, scoped ESLint, formatting and
  diff checks pass. No API/declaration change or upstream delta requires broader qualification.
- The Viewer application code is unchanged. Its dev server serves the regenerated engine
  `Build/Cesium` directly, including existing Workers and assets.

## Real-scene evidence

Saved Globe scene: 14 layers, 1097 x 822 drawing buffer, RTX 3060 Ti / ANGLE D3D11, 1699 submitted
commands and 1595 SSR capture draws; requests and tile processing are zero. AO, SSR, four-cascade
shadows and physical atmosphere/clouds remain enabled with the owner's saved settings.

Before the fix the UI reports approximately 5 FPS. Bounded probes report CPU median 179.4 ms
(10 frames during ablation) and 230.5 ms (24-frame standalone sample). Disabling SSR gives 71.2 ms;
disabling AO/SSR/shadows together gives 14 ms. This is diagnosis, not the delivered configuration.
The native cache-key microbenchmark costs 57.5 ms for 3000 lookups of a 132147-character source key.

The initial command-local implementation measured 49 ms CPU median and approximately 17–20 FPS.
The final shared shader-map implementation, after another reload, measured 74.8 ms CPU median,
83.5 ms p95 and 44.71 ms GPU elapsed median in 24 samples. A separate natural render-loop sample
of 60 frame intervals measured median 67 ms, mean 67.61 ms and p95 76.8 ms, with the visible
counter at 14 FPS. Report the final natural-loop result (approximately 14–15 FPS), not the best
intermediate sample. Desktop scheduling and cold execution affect bounded timing; this is not
a cross-machine frame-rate guarantee. Submitted commands and per-tileset selected triangle counts
match the original view exactly. GPU elapsed queries include idle command-stream gaps and are not
independent isolated GPU work measurements; all reported queries had `disjoint = false`.

Reload exposed that the stored startup camera is still a global view. The captured original
near-view camera was restored explicitly for measurement; saved JSON and rendering settings
were unchanged. This is a Viewer configuration follow-up, not a reason to benchmark the empty
global view. CPU sampling is stopped after diagnosis and temporary effect toggles are restored.

## Gate and follow-up

Technical self-review and final verification are complete; owner visual confirmation remains
pending. Remaining cost should be profiled as draw submission and rendering
work before considering batching or pass reduction. Explicit R7 night visual acceptance remains
a separate follow-up; this maintenance does not claim it.

## Follow-up: current-view pass costs

The owner reports 9 FPS and requests pass reduction. A subsequent unchanged-camera natural-loop
sample reproduces 8.5–9.0 FPS with 1701 commands and 1574 SSR capture draws at 1097 x 822.
Disabling SSR alone gives 12.2 FPS; AO alone 12.1 FPS; both 15–16 FPS; additionally disabling
shadows gives 31.4 FPS; additionally disabling the environment gives 38.6 FPS. Each configuration
uses 30 frame intervals after resource/variant transitions; all settings and the saved scene are
restored. These conditional costs are not additive. The earlier 14–15 FPS sample is not an
acceptance of overall performance. The owner authorizes main-pass MRT integration next.
