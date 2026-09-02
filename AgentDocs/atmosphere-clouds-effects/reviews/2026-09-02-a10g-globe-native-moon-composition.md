# A10-G Globe Native Moon Composition Review

## Status

- Phase: `A10-G`
- State: `approved; owner gate passed; phase complete`
- Reviewer: Architecture Agent
- Open findings: `none`
- Owner visual gate: `passed`
- Phase plan:
  [A10-G phase plan](../plans/2026-09-02-phase-a10g-globe-native-moon-composition.md)
- Frozen predecessor checkpoint:
  A9-G=`f8d655ab75baf95b1421eddb35489a6a9d9dd62e`

## Review boundary

Review only the Cesium native Moon exception, the `SGP-0008` background/Moon
ordering, focused conflict/order evidence and one fixed direct Globe Moon
observation. Reject duplicate Moon ownership, moonlight, new assets/resources,
new public API, new SGP, Planar changes or A9/A7 recalibration.

## Required evidence

- Source review proves the original native Moon command remains exact-once and
  continues to own ephemeris, orientation, phase, texture and occlusion.
- Focused Spec proves active ordering and disabled/detached identity.
- Globe conflict evidence permits visible native Moon while retaining every
  other fail-closed native conflict; Planar remains unchanged.
- Audit reports changed upstream-owned paths, `SGP-0008`, generated status and
  exact SceneGIS resource delta.
- One fixed browser observation is left for project-owner judgment only after
  Architecture code approval.

## Findings

No finding is open.

## Execution handoff — 2026-09-02

The candidate preserves one caller-owned native Moon command and orders it
after advanced background and before primary-world/geometry. The amended
render-slot fixture passed `5/5`, inactive/detached identity included; the
private pipeline passed `7/7`; visible Globe Moon acceptance, remaining Globe
conflicts and Planar Moon rejection each passed their focused `1/1` witness.
The upstream audit reports only `Scene.js` under reused `SGP-0008`, generated
status `0`, and zero SceneGIS resource/API delta. The single fixed A10 browser
observation was `ready · HDR`, centered the native phase at derived azimuth
`257.917 degrees` / elevation `7.443 degrees`, and reported zero errors. Cloud
occlusion and final native texture/phase appearance remain owner-visible risks.

## Architecture review — approved for owner gate 2026-09-02

Independent source review confirms that the existing paired `SGP-0008` block
is moved intact to immediately before the unchanged native Moon block. The Moon
command remains exact-once and caller-owned; no duplicate body, asset, public
API, SceneGIS GPU resource, new SGP or second upstream path exists. Globe removes
only Moon from native conflict detection, while Planar Moon rejection and all
other fail-closed conflicts remain unchanged.

Architecture independently ran the accepted production entry from
`packages/engine`: render-slot ordering `5/5`, visible Globe Moon acceptance
`1/1`, and Planar Moon rejection `1/1`. `audit-upstream-patches.mjs` passed with
one current-delivery upstream-owned path (`Scene.js`), existing `SGP-0008`,
generated status `0`, and no new SGP; `git diff --check` passed with retained
line-ending warnings only.

On a fresh direct-sample load, the fixed `A10 月亮夜景` action produced a
centered native textured crescent above the terrain horizon at azimuth
`257.917 degrees`, elevation `7.443 degrees`, Sun elevation
`-20.120 degrees`, `ready · HDR`, with zero browser warnings/errors. One direct
cloud-control check kept the body within the existing cloud/HDR composition;
the page was then restored to the clouds-off fixed observation. The remaining
texture/phase balance, small physical angular footprint, interactive horizon
occlusion and cloud attenuation are owner-visible judgments. The code gate is
approved; owner acceptance is not inferred.

## Project-owner visual gate — passed 2026-09-02

The project owner explicitly accepted the prepared native Moon result. With no
open Architecture finding, A10-G is complete. The phase-closing local commit is
the isolated unpushed A10-G checkpoint; it does not authorize moonlight, Moon
shadows, alternate assets, Planar changes or successor work.
