# Directional environment occlusion assessment

## Metadata

- Type: standalone assessment plan; status: completed; date: 2026-10-22.
- Owner/reviewer: current architecture/execution task, self-review.
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md).
- Predecessor: material/lighting audit and owner-selected Globe filter alignment.
- Related: ADR-0084, ADR-0093, ADR-0158, ADR-0161; existing SGP-0014/0010/0015/0046.
- Scope: evaluation only; no engine/public API/default change or new phase activation.
- Modified upstream-owned files / SGP: none planned.
- Review: [assessment and remaining implementation gates](../reviews/2026-10-22-directional-occlusion-assessment.md).

## Questions and method

1. Trace current GTAO sampling, filtering, depth ownership, deferred lighting,
   native/physical diffuse IBL, specular IBL, SSR and SSIL composition. Separate
   current code from historical forward/prepass documentation.
2. Compare original directional GTAO research, Intel XeGTAO and Filament/Epic
   implementations. Distinguish runtime screen-space visibility from baked maps,
   probe capture, distance fields and diffuse bounce.
3. Record existing scalar AO pictures, actual target formats and isolated GPU cost
   in matched Globe/Planar Bistro views. Keep light, material, exposure and camera
   fixed. Save ignored evidence under Build/Specs, without modifying live tabs.
4. Estimate incremental storage/work from the observed implementation; label
   estimates explicitly. Do not report another engine's timings as our measurement.
5. Propose a bounded implementation and visual/performance acceptance gates. Record
   the treatment of direct light, emission, sky, transparency, explicit IBL, material
   AO, SSR replacement, SSIL and large-world camera/depth changes.
6. Publish assessment/review and update handoff. No production prototype, renderer
   default changes, release build or unrelated test matrix in this assessment.

## Completion criteria

A source-grounded recommendation identifies expected visible benefit, actual
integration seams, approximate memory budget, measured current baseline and
remaining unknowns. Subsequent implementation requires its own current-source
phase plan and ADR/SGP review rather than silently entering a renderer phase.

## Outcome

Current-source inspection and two-world baseline are complete. Existing scalar AO
estimate/filter measures about 1.89 ms at 1280×800 on the recorded GPU, with shared
depth and no geometry prepass. Directional cost and visual improvement remain
unmeasured. Recommend bounded GTSO first; full diffuse work depends on Planar
directional irradiance. The review records references, candidate seams, memory
estimates and acceptance gates. No renderer phase or default change is activated.
