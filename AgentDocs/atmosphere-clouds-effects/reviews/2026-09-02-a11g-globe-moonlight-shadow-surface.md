# A11-G Globe Moonlight, Shadow, and Surface Review

## Status

- Phase: `A11-G`
- State: `implementation assigned; review pending`
- Reviewer: Architecture Agent
- Open findings: `none; candidate not received`
- Owner visual gate: `blocked until Architecture code approval`
- Phase plan:
  [A11-G phase plan](../plans/2026-09-02-phase-a11g-globe-moonlight-shadow-surface.md)
- Frozen product predecessor checkpoint:
  A10-G=`6afba87af181f3cdb7a20aff09b81af11eb302f4`

## Review boundary

Review the single Globe primary celestial-light authority, controller ownership
of one stable native scene light, reuse of the one native ShadowMap, exact
SGP-0009 surface publication, improved native Moon texture lifecycle and their
focused automated/direct evidence. Reject a second light/shadow/body system,
camera-derived direction, Planar execution, displacement shader, hidden night
style or unrelated A1-A10 recalibration.

## Required evidence

- Sun/Moon ECEF and phase/horizon/night calculations have one shared finite
  authority and stay invariant under camera-only rotation.
- Day directional output preserves the accepted Sun result; full night uses the
  Moon endpoint; no-Moon/new-Moon state retains A9 ambient without false direct
  energy.
- Terrain, Cloud/A5 directional transport and native scene light consume the
  same primary publication without another Beer atlas or raymarch.
- Native ShadowMap and Globe ShadowMode lifecycle preserve prior caller state,
  fail closed on external mutation and produce a fixed-world caster/receiver
  witness over camera pitch/heading changes.
- Native Moon object/show/orientation/phase ownership remains unchanged; only
  its captured public texture URL is replaced/restored, and exact asset
  provenance/package delivery passes.
- Audit reports public defaults/ranges, native and SceneGIS resource deltas,
  upstream-owned files, SGP-0009 path count, generated files and remaining
  visual risks.

## Findings

No finding is open because no implementation candidate has been reviewed. This
does not open the project-owner gate.
