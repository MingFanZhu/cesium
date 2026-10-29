# W5 GPU particles review

- Date: 2026-10-28; architecture/code self-review: current task.
- Verdict: implementation approved for checkpoint; owner visual acceptance remains external.
- Plan: [W5](../plans/2026-10-28-w5-particles.md); ADR: 0102 / 0193.
- Upstream-owned changes / SGP: none. SDK / distribution copy: none.

## Findings and resolution

- Reuses generic particle MRT/quad/depth/OIT/lifecycle with a finite external-clock callback;
  original JulianDate arithmetic stays unchanged. Wind reset generation and completed time are
  read through its public descriptor. No particle CPU readback outside Specs, no solver changes.
- 4096 short directional markers, 0.65 m width, speed/concentration colors, fade on recycling.
  Explicit legacy lines remain available; default/example now use particles. No noise velocity.
- Segment voxel traversal rejects obstacle corner intersections even when both endpoints are
  fluid. Particles seeded inside solids are hidden and recycled; glyphs use native opaque depth.
- Documented approximation: all RK2 substeps in one display frame use the batch's completed
  velocity snapshot; markers do not replace conservative concentration and are not exact
  time-resolved Lagrangian trajectories. Native billboard/OIT/motion-vector limits remain.
- Manual run/pause exposed an example status bug: fractional Scene-time debt below one physical
  step was labelled computing forever. UI now checks for one full pending timeStep; solver debt
  is preserved, with no physical-parameter change or discarded simulation time.

## Evidence

- Strict WebGL GPU particle Specs: 12/12; wind visualization Specs: 4/4.
  Covers external clock/freeze/rewind, uniform displacement, deterministic reset/resource reuse,
  cell crossing including corners, Globe/Planar volume/particle depth and continuing after disposal.
- Initial new numeric Spec used canvas-default readback dimensions for a smaller particle target;
  fixed the test to read explicit texture width/height. No product workaround.
- Full buildRelease, buildTs and tsc passed (existing unrelated JSDoc/Gaussian warnings).
- Actual browser: both worlds at 40 s, continuous run then pause, single step 40.00→40.02,
  destroy/recreate and navigation checked; no new console errors. Screenshots in ignored
  Build/wind-evidence/particles-planar-40s.jpg and particles-globe-40s.jpg.
- RTX 3060 Ti, 1575×892, 128×128×32, budget 16: field 119.25 MiB + particles 0.50 MiB.
  Planar warm 40 s / 3.27 wall seconds (12.25×), solver+tracer 1.617 ms/step median;
  Globe 40 s / 3.90 wall seconds (10.25×), 1.627 ms/step. GPU timer excludes display;
  wall time includes it. No FPS substitute or claimed precise incremental GPU cost.
- Scoped lint/format, Markdown, diff and ownership audit are checkpoint checks.

No unresolved code findings. Numerical engineering-validation limits from W1–W4 remain unchanged.
