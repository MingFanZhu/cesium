# Phase R14: Main-pass AO MRT

- Type: `phase`; status: `completed`; date: `2026-09-19`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / architecture reviewer: Current task, architecture and execution
- Architecture review: `confirmed`; previous checkpoint: R13 `6b472fa2e4`
- Decision: ADR-0093; seams: SGP-0014, SGP-0016

## Verified scope and design

The owner requests reuse of MRT rather than an AO geometry prepass. R12 currently captures only
reflection response; R13 still submits depth geometry. Promote the owned reflection attachment
manager to shared lighting MRT. When AO is enabled, store the final material-weighted indirect
contribution alongside native main color/depth, independently of SSR being enabled.

For qualified linear-HDR single-frustum opaque rendering, estimate/filter AO from the resolved
current main depth. Apply `(AO - 1) * indirect` before water, translucency and environment. SSR
traces the AO-corrected opaque source and scales its replacement delta by AO. No geometry replay
is needed for either effect on this path. Preserve MSAA sample count and coverage-weighted output,
native alpha/discard/clipping, style/color transformations, and base/clearcoat layering.

Retain the established prepass contract for nonlinear LDR, multi-frustum, classification and
unsupported post-lighting branches. Do not silently disable AO or weaken the material contract.
Qualification and attachment capacity must be decided before submitting the scene. No new public
options, history, quality reduction or change to shadow scheduling is introduced.

## Implementation and verification

1. Share the existing owned MRT manager and add optional indirect output (2 targets for AO alone,
   5 for base SSR + AO, 8 for clearcoat SSR + AO). Reuse depth and isolate borrowed attachments.
2. Record exact indirect contributions in Model, Phong and Globe/Planar surface hooks. Preserve
   direct, emission and post-lighting linear multipliers; reject unqualified nonlinear branches.
3. Schedule AO estimate/filter and signed composition after opaque completion, before SSR source
   mip generation. Keep public controls and compatibility prepass behavior.
4. Strict GPU regressions cover geometry draw elimination, AO-only and AO+SSR, light separation,
   clipping/motion, clearcoat/MSAA, resize/toggle/destruction and compatibility paths. Run relevant
   existing AO/SSR/water tests, build/types, patch audit and scoped code/docs checks.
5. Measure unchanged real Viewer settings and view, recording draw/resource/frame-time changes.
   Restore diagnostics; technical review and a separate local checkpoint finish this phase.

## Risks and exit

Float attachments add bandwidth/memory; removal of raw depth on the shared path offsets only part
of it. Native MSAA depth resolve differs at sample edges from a single-sample depth prepass. Final
visual quality requires owner review. Do not claim unsupported pipeline configurations eliminated
their prepass. Retain prior R7 visual and startup-camera follow-ups.

## Completion

Implementation and technical review are complete. [Review](../reviews/2026-09-19-r14-main-pass-ao.md)
records 35 passing strict GPU regressions, zero AO geometry in the qualified real scene, about 18%
lower paired frame time, attachment memory and retained special-path contracts. Public settings
and saved scene are preserved. Owner visual review remains pending.
