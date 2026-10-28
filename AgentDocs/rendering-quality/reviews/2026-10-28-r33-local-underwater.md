# R33 implementation and technical review

- Type: review; owner/author: current architecture and execution task; 2026-10-28.
- Target: [R33 plan](../plans/2026-10-28-r33-local-underwater.md), ADR-0196.
- Status: technical gate complete; owner visual gate pending.
- Baseline: R32 `8a5600d08a`; no SDK changes.

## Algorithm implementation and findings

- Fixed: preset-only color authoring was handled in R32. Controls remain editable
  with explicit sRGB-to-linear Beer/scattering conversion, retaining presets.
- Fixed: camera-dependent shoreline generation. Optional copied bathymetry now
  drives a fixed local shallow-foam simulation with advection and analytic
  generation/decay. Without that input, legacy screen contact remains. Structure
  follows [Crest foam](https://docs.crest.waveharmonic.com/Manual/Appearance/Foam.html).
- Replaced before acceptance: an independent procedural caustic slope draft did
  not follow the actual waves. The delivered path samples FFT displacement and
  normals (or shared analytic slopes), refracts a grid onto bathymetry, computes
  projected area ratios and adds overlaps. It follows the demonstrated
  [Evan Wallace algorithm](https://madebyevan.com/webgl-water/); no source was copied.
- Fixed: looking down from inside water lost its opaque inputs because the surface
  command was culled. Owned WaterFrame now also recognizes active volumes and
  resolves medium at the nearest frustum before transparent geometry.
- Fixed: underwater FFT reflections inherited the above-water bottom rejection.
  Local SSR now rejects hits across the incident medium; regression verifies
  bottom reflection beneath a calm FFT interface. Curved/river rejection is unchanged.
- Fixed after final screenshot inspection: underside reflections had dense stippled
  misses. A 64/256-step comparison and a TAA comparison isolated coarse ray traversal,
  rather than wave normals or temporal filtering. A long projected stride crossed
  the sloped bottom without overlapping its depth thickness at the sampled endpoint.
  SSR now brackets signed depth gaps as well as depth intervals and refines according
  to the starting gap sign. It retains the 64-step default and five refinement steps.
  The perspective traversal/refinement structure follows
  [McGuire and Mara](https://jcgt.org/published/0003/04/04/); the gap fix is our adaptation.
  A continuous white-bottom regression at a 16-step budget fails with a black pixel
  when only the new bracket is disabled, and passes with it enabled. TAA is not added
  to the fixture as a workaround.
- Fixed: degenerate receiver derivatives at contact edges produced black dashes
  in visual captures. Normalize the receiver cross product with a finite denominator;
  zero-area footprints receive zero caustic normal weight. Final captures inspected.
- Corrected evidence: the earlier R32 river baseline swap did not regenerate GLSL.
  A full build of R31 passes 11/11, and the current development/release river suite
  passes 11/11. The R32 review retains a correction rather than an invented baseline defect.

Optics retain the R31 absorption/scattering/HG model, consistent with the volume
model described by [Unreal Single Layer Water](https://dev.epicgames.com/documentation/unreal-engine/single-layer-water-shading-model-in-unreal-engine).
Underwater uses independent numerical quadrature checks for both increasing and
decreasing light depth, including the zero exponent limit and zero extinction.

## Validation

- Development WaterSurface: 24 GPU cases pass; WaterOptics: 4 pass. New cases cover
  finite volumes, holes, outside/disabled views, down-facing captures in both worlds,
  continuous underside reflection at a coarse ray budget, bathymetry copying,
  camera-invariant fields, FFT evolution,
  unit caustic ratio for a calm interface, API validation and texture destruction.
- Release: Water/Optics 28, WindWaves 7, RiverSurface 11, EllipsoidWater 7,
  ScreenSpaceReflections 15: 68 pass with WebGL validation and failure exit enabled.
  After the shared SSR traversal fix, all affected water/river/curved/SSR suites
  pass again; unchanged WindWaves results are retained without another rerun.
- Both-world browser cases pass in development and release: open colors, presets,
  wave modes, underwater horizontal/up views, return above water, camera motion,
  console/render errors and destruction. The final release browser rerun and
  screenshot inspection confirm removal of the dense underside stippling at the
  default 64-step budget. Current IAB fixture
  refreshed to the new controls and implementation.
- Development/release builds, generated declarations, tsc, changed-source ESLint,
  HTML with the existing processor workaround, Markdown lint and diff check pass.
  The existing ESLint 10 / eslint-seatbelt HTML processor incompatibility still
  prevents the ordinary lint-staged hook. Equivalent scoped checks ran separately;
  the checkpoint uses only a process-scoped HUSKY=0, without changing hook configuration.
- Upstream audit: zero changed upstream-owned files, zero generated delivery files.
  Existing SGP-0017 scheduling seam is reused without modification.

## Cost, limits and disposition

- A 256-square bathymetry field owns about 2.98 MiB of GPU textures/mesh per surface,
  excluding existing water/FFT targets. The example retains two independently
  switchable surfaces. Animated fields add one foam quad and one caustic mesh draw,
  plus clear/mipmap generation. Frozen camera-only motion reuses fields. Immersion
  adds one fullscreen medium draw and a small edge texture, with no full-resolution
  target. No runtime CPU readback is introduced.
- RTX 3060 Ti / Chrome 156 / 1185x800 alternating whole-frame GPU timings were noisy:
  development Planar medians 6.49 ms disabled / 7.30 ms enabled, Globe 6.73 / 6.68 ms;
  release medians changed substantially and reversed ordering. These do not establish
  an isolated effect cost or speedup. Do not repeat timing matrices merely to obtain
  a preferred number; use the verified resource/pass delta and revisit under a
  controlled performance investigation if needed.
- Accepted first-version limits: supplied static bathymetry; local XY/Globe ENU
  volumes with <=256 segments; mean-plane immersion; one non-overlapping water
  body at a point; opaque submerged receivers. No automatic terrain capture,
  displaced-wave meniscus, curved/river volume, translucent medium integration,
  refractive object shadows or recursive reflection/refraction.
- Caustics use a finite grid, bounded area ratio, three height-field projection
  iterations and captured-radiance modulation. Vertical/tall receivers and offscreen
  internal reflection remain approximate. This is an implemented real-time method,
  not a claim of film-quality photon transport or parity with every Crest feature.
- Owner visual acceptance remains open. Earlier R25 cold mesh / R27 visual findings
  remain recorded; no unrelated finding is closed by this checkpoint.

Architecture self-review approves a separate local R33 checkpoint; no further phase
is activated automatically. The current task creates that checkpoint under AGENTS.
