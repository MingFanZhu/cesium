# Standalone Plan: Real-scene Derived Shader Performance

- Type: `standalone`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R7 `f1a002ae46`; explicit night visual acceptance remains a follow-up
- Related ADR: `ADR-0084/0086`; no new public or pipeline contract
- Upstream changes / SGP: None planned

## Reproduced facts

The saved Globe Viewer scene uses 14 layers, a 1097 x 822 drawing buffer and an RTX 3060 Ti
through ANGLE D3D11. All tile requests/processing have completed. It submits 1699 commands,
including 1595 SSR capture draws, with AO, SSR, shadows and the physical environment enabled.
The visible frame counter is approximately 5 FPS. CPU profiling attributes most time to AO/SSR
receiver derivation, including inlined ShaderCache lookups.

Cesium ShaderCache concatenates the derived keyword and the complete source shader key on every
lookup. Observed keys reach 190753 characters; 3000 repeated lookups of a 132147-character key
take 57.5 ms, versus approximately 0.1 ms for direct reference reuse. AO receiver and SSR capture/
receiver currently call that lookup for each draw despite already having per-command records.
GPU elapsed queries include idle command-stream gaps and must not be called isolated GPU workload.

## Implementation and boundary

Use weak source ShaderProgram identity maps for the resolved AO receiver and SSR capture/receiver
programs. Query/create through the native ShaderCache only for an unseen source identity. Share
these entries across commands: a release regression reproduced an already-resolved source lookup
after material updates with command-local caching alone.
Continue cloning all current command fields and refreshing changed uniform maps on every draw.
Native ShaderCache retains program ownership; no new resources, passes, public options, lowered
quality settings, historical color/depth reuse or pipeline ordering changes.

Changes are limited to owned AO/SSR helpers, focused Specs and handoff documents. Viewer dev mode
serves the engine's release build directly; regenerate Build/Cesium and reload the saved scene.
Saved camera/layers/settings must remain intact. Do not edit the separate Viewer application.

## Verification

1. Add regressions for warm draws without repeated AO/SSR shader-key lookups and refresh after a
   real source-shader change; retain current-frame uniform and command behavior.
2. Run the affected AO and SSR GPU suites, including both Worlds, picking and resource lifetime.
3. Build development/release and run the new regressions against release; scoped lint/format/diff.
   No public API/type changes: existing declarations remain valid.
4. Reload the real scene, confirm camera/configuration and loaded command counts, compare bounded
   CPU/GPU-elapsed samples and visible output. Record residual cost rather than expanding scope.

## Status

Implementation, bounded verification and technical self-review are complete. The regenerated
release package is running in the Viewer at the original captured near view, with saved rendering
settings unchanged. See the [review](../reviews/2026-09-19-real-scene-performance.md) for final
performance, tests and remaining draw-submission cost. Owner visual confirmation remains pending.
