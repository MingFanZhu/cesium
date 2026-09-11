# P2 Planar Lighting and Cloud Shadow Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-11`
- Reviewer: Architecture in the current task; no independent agent claimed
- Plan: [P2](../plans/2026-09-11-phase-p2-planar-lighting-cloud-shadows.md)
- Decision: [ADR-0055](../../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Visual authority: owner explicitly delegates stage acceptance to the agent
- Predecessor: P1 `4c847d6def`; upstream delta budget: zero

## Review targets

- Planar beam/diffuse split and per-material direct-only Beer attenuation.
- Fixed-Z producer/receiver agreement, large-coordinate rebasing and wind.
- Frame publication, shader variants, sampler-budget preflight and exact lifetime.
- Real pixels, visual result and bounded cost; Globe source/resource regression.

## Findings and handoff

- High, fixed: the inherited cascade-corner conversion divided by zero Planar
  ellipsoid radii. Keep Planar corners Cartesian. The real surface/Beer test
  and ready page now publish a valid record without controller exceptions.
- High, fixed: oblique reconstruction at Z = 0 produced tiny negative heights;
  an explicit negative-height cutoff blackened the surface. Use the LUT's
  continuous lower-boundary clamp. Nadir/oblique GPU pixels agree within one
  byte, and the actual model view retains continuously lit ground.
- Medium, fixed: explicitly compile legacy Globe shadow probes and their hard
  cascade mutation as Globe after introducing Planar geometry. The hard/faded
  comparison again detects the intended discontinuity.
- Test harness, fixed: resource destruction checks now capture underlying FBOs
  and four textures, not FramebufferManager. Sampler preflight uses the public
  runtime ContextLimits identity rather than a separate Specs module.

Architecture accepts P2 under the owner's delegated visual gate. Actual 1724 ×
1150 rendering shows daylight and low-Sun material faces, diffuse-lit shadowed
surfaces, cloud projection and continuous angled ground, ready/HDR and zero
reported browser errors. Medium 512-pixel, three-cascade GPU producer samples
at low Sun and 0.75 coverage were 3.17–3.76 ms (median 3.69 ms, six samples).
Separate resolve queries returned zero and are not usable cost evidence; no
zero-cost resolve or total-frame performance claim is made. Exact storage is
33,554,432 bytes at medium and 8,388,608 bytes in the low-profile lifecycle test.

Validation passed: both native Globe/Planar PBR source/SH/emissive/lifetime
cases; integrated Planar Beer/surface, oblique lower boundary, Material smooth
and geometric compilation, three-sampler atomic preflight, cloud-above/below,
20-million-meter XY, camera/wind history and exact release; hidden-medium
lighting readiness; Planar assets/re-registration; Globe cascade fade, Beer
filter and warm atlas lifetime; eight existing surface shader assembly checks.
Full build, build-ts and tsc pass. build-ts emits existing broad JSDoc warnings.
Changed ESLint/Prettier and AgentDocs markdownlint pass; the full AgentDocs
Prettier sweep retains the 16 pre-existing unrelated failures documented in P1.
Ownership audit passes with zero current upstream-owned changes and zero
generated-file changes; SGP-0008/0010 are consume-only.

Remaining limits, accepted for this phase: P1's coarse cloud morphology and
its older cloud radiance calibration; Planar rays, HDR artifacts, readable
night/celestial and native geometry-shadow qualification remain the explicitly
deferred roadmap, owned by the current agent. P2 adds no geometry shadow
switch or inferred CRS behavior. Next phase starts after this local checkpoint.
