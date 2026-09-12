# P11 Planar Moonlight Review

## Metadata

- Type: `review`; status: `approved`; created: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P11 plan](../plans/2026-09-12-phase-p11-planar-moonlight.md)
- Predecessor: P10 `ed4b32fd31`; decision: ADR-0056
- Upstream-owned files: none; SGP delta: none

## Findings and disposition

- Fixed: Planar now uses effective Sun/Moon directions and the shared Globe
  radiometry. Twilight, lunar horizon, phase and existing intensity/visibility
  controls determine one primary direction and RGB scale. Globe retains its
  existing exact phase calculation and native light lifecycle.
- Fixed: Planar Environment borrows advanced state through an explicit private
  owner connection and keeps its stable DirectionalLight. Its own updates cannot
  overwrite Moonlight with Sunlight. Release restores the configured Sun;
  disconnect restores the caller light. No native shadow setting is changed.
- Fixed: terrain/model direct optical paths and cosine, cloud incident light,
  local cloud light march, Beer caster activation and directional fog/haze use
  the primary light. Physical sky LUTs, night diffuse ambient and lens effects
  retain the actual Sun. Moonlight is not multiplied into diffuse sky.
- Fixed: Planar cloud history checks primary energy/direction. Warm Moon changes
  invalidate temporal color without reallocating cloud or Beer resources.
- Verified: the shared primary-scale uniform is declared in the Planar branch
  of the existing common shadow library and bound for both surface and fullscreen
  consumers. No new pass, texture, asset or public API. The sample exposes the
  existing Moonlight controls. Native geometry-shadow qualification is unchanged.

## Automated evidence

Thirty-two distinct cases pass across three bounded runs:

- Two new P11 cases: phase/horizon/visibility/intensity, world XY and camera
  independence, stable native light identity, update ordering, warm history,
  resource identity and disable/re-enable/disconnect; actual GPU surface/cloud
  lunar RGB, unchanged night diffuse sources, directional fog and haze shadow
  suppression, retained opacity, real surface and Beer producer/receiver.
- Existing Globe primary-light authority and caller-owned shadow regression.
- Existing real native PBR tests for both worlds, extending Planar with lunar
  direct light, cosine direction, cloud attenuation and retained material,
  authored lighting, emissive and GPU ownership.
- P10 atmosphere/fog/haze source separation, P4 fixed-Z night, warm cloud history,
  and off-center cloud MRT through both frusta and depth variants.
- All 23 PlanarEnvironment cases, including astronomy, stable authority,
  disconnect/reconnect, world destruction, native conflicts and atomic setters.

The P10 isolated fog fixture now explicitly binds its chosen incident direction
as the primary direction. Its original directional-light assertions remain.
No product fallback or test-only rendering path was added.

Full build, generated types, type checking, scoped ESLint and upstream audit
pass. Generated outputs are uncommitted. Source review finds no unresolved
implementation issue. Changed-document formatting and full AgentDocs Markdown lint pass. The required
full AgentDocs Prettier scan reports the same 16 pre-existing unrelated files
as P10; no changed document appears in those warnings.

## Visual and bounded GPU evidence

The original owner camera at Z about 959 m, medium/cumulus, coverage 0.24,
density/radiance 1, surface scale 11.9 retains its daytime sky and cloud shadows.
Night Sun direction (-0.45, -0.2, -0.87), normalized, and the existing Moon
(-0.5, -0.2, 0.8), normalized, produce lunar contribution 0.574214 at intensity 1.
Direct off/on views show brighter cloud structure, terrain and lunar cloud
shadows; off retains the night ambient baseline. Below-cloud model inspection
at (90000, -145000, 1000) shows brighter Moon-facing tops in full composition.
The sample's original model preset at Z = 2000 enters the cloud layer; the
additional lower view avoids mistaking actual cloud occlusion for missing models.
Page/render errors remain empty.

RTX 3060 Ti / ANGLE D3D11, 862 by 575 cloud target: six alternating blocks,
18 measured frames per state. Measure cloud, resolve, Aerial, background and
Beer producer/resolve commands, with no concurrent test render loop.
Median command sums are 7.187 ms Moonlight off and 6.980 ms on. These close
measurements do not establish a speedup; enabling Moonlight activates Beer
work (producer median 0.663 ms) without a resolved aggregate regression in this
sample. Timer disjoint is false; framebuffer identities/dimensions are unchanged.
All timer queries and temporary command bindings are removed after measurement.

## Limits and handoff

Planar lunar phase uses directional angular separation, not finite-distance
ECEF phase. The readable lunar calibration follows Globe. Sky LUTs remain solar;
there is no second lunar atmosphere solve. P10 prefix/cascade bounds still apply.
Detailed Moon-disc rendering, ground bounce and Planar native geometry-shadow
qualification remain outside this phase. No unresolved finding blocks P11.

Architecture accepts the implementation and delegated visual evidence.
The owner camera and public effect/direction settings are restored and its
render loop is active. Explicit document checks are complete. This phase's
containing commit is the independent local checkpoint; no push or owner visual
gate is required.
