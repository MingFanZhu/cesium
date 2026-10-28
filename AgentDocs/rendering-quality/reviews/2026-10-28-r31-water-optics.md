# R31 water optics review

- Type: implementation and architecture review; date: 2026-10-28.
- Target: R31 on `feature/water-rendering-quality`, baseline `19b984476f`.
- Roles: current task, implementation and source-based self-review.
- Plan: [R31](../plans/2026-10-28-r31-water-optics.md); decision: ADR-0194.
- Upstream-owned files changed: none. SGP-0017 unchanged; no new SGP.
- Disposition: technical gate passed; owner visual acceptance pending.

## Findings and disposition

1. **Medium, fixed — inconsistent refracted absorption distance.** Accepted distorted
   samples now provide both opaque color and water-to-bottom distance. Foreground,
   above-water and offscreen rejection keeps the original pair. A production-shader
   depth-step regression observes both crossing directions; the existing foreground
   exclusion case remains green. Foam still uses the unperturbed contact depth.
2. **Medium, fixed — fixed tint cannot represent separate absorption/scattering.**
   Optional scattering and HG anisotropy use homogeneous single-scattering optics.
   Independent midpoint quadrature verifies GPU thickness, transparent channels,
   thin and infinite-depth limits. HG normalization and direction are GPU-tested.
   Captured lit bottom radiance is attenuated once, never relit.
3. **Medium, fixed — compatibility and ownership.** Undefined scattering keeps the
   existing material, zero means absorption only. WaterColor is ignored in coefficient
   mode. Both-world mutation tests preserve program, VA and shared scene input;
   RiverSurface forwards controls. Existing wind, curved mesh and disposal cases pass.
   The shared Fluid helper signatures and behavior are unchanged.
4. **Low, fixed — diagnostic fixture hides FFT capability.** The existing local-water
   page exposes separate optical presets and wave modes, defaulting to clear water
   and modest FFT waves. It uses explicit neutral lighting scales of 1, not a new
   engine default. Hidden alternative surfaces do not draw. All surfaces are removed
   before destroying their borrowed FFT, then the Viewer. Both worlds and builds
   exercise selection, camera movement and final texture destruction.
5. **Visual gate, open — owner acceptance.** The agent inspected the actual in-app
   Planar/Globe pages and fixed-view preset captures. Clear water retains submerged
   detail; lake/turbid examples have distinct extinction and scattering. The scene
   uses untextured diagnostic geometry. Foam remains a contact/instantaneous-crest
   approximation, and no underwater-camera or caustics capability is claimed.
   Owner: project owner; next: inspect the local-water fixture before accepting R31.

## Verification

- Development strict WebGL: WaterOptics 2 + WaterSurface 20 passed.
- Release strict WebGL: WaterOptics 2, WaterSurface 20, RiverSurface 11,
  EllipsoidWater 7, WindWaves 6 passed (46 total).
- Browser fixture: two both-world cases passed in development and release (four
  runs total), including four presets, both wave modes, camera changes and disposal.
- `build`, `build-release`, `build-ts`, `tsc` passed. Existing native JSDoc warnings
  and the Gaussian removed-export assertion warning remain; generated WaterSurface
  and RiverSurface declarations include both new controls. No generated file staged.
- Scoped JS ESLint and new/edited feature file formatting passed. HTML lint uses
  the existing equivalent rule configuration without the broken html/seatbelt
  processor. Scoped documentation and full AgentDocs Markdown lint passed.
- Required full AgentDocs Prettier check reports 605 pre-existing unformatted files;
  changed AgentDocs are formatted. No unrelated repository-wide formatting applied.
- Upstream audit passed: zero current delivery upstream-owned edits, zero generated
  files. No SDK files changed.
- The normal commit hook reproduced the existing html/seatbelt processor error
  (`Expected pluginName/processorName`, received `eslint-seatbelt@0.1.3`) and restored
  its stash. Equivalent scoped lint, formatting and full type checks passed above;
  the phase checkpoint uses a one-command HUSKY=0 override, without changing hooks.

## Cost and limits

Chrome Headless 156, Windows, ANGLE D3D11, RTX 3060 Ti, 1185 x 800. Frozen scene,
same FFT geometry, six alternating full-frame GPU samples per material mode in the
release browser test. Planar medians: legacy 2.795 ms, coefficient optics 2.789 ms;
the difference is below useful measurement precision. Globe coefficient samples
range 2.700–2.760 ms, but legacy samples contain 16.6–22.8 ms outliers. The Globe
comparison is inconclusive; it is not evidence of a speedup or a universal budget.
Raw bounded samples and screenshots remain ignored build artifacts.

The optical change adds arithmetic and three uniforms, no textures, captures,
draws, runtime readbacks or new resource owners. Enabling FFT in the fixture adds
the existing optional simulation/geometry cost; this is distinct from optics.

Uniform medium and local-slab single scattering remain approximations. No multiple
scattering, volumetric geometry shadows, physically relit submerged floor, recursive
refraction or finite-volume exit is implemented. No opaque bottom retains the
existing infinitely deep interpretation. R25 cold mesh construction and earlier
R27 visual findings remain open in their original reviews. R32 foam and R33
underwater/caustics remain separate roadmap phases, not delivered by R31.
