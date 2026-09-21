# R15 Bistro fixture review

- Type: `review`; status: `approved`; updated: `2026-09-21`
- Target: [Bistro phase](../plans/2026-09-21-r15-bistro-scene.md)
- Reviewer / implementation owner: current task, architecture and execution self-review
- Upstream-owned files: none; SGP: none; no new runtime API or renderer seam

## Findings and disposition

- P1, fixed: the supplied Blender GLB treats every surface as blended metal without ORM.
  The original archive explicitly defines Specular channels as AO/roughness/metalness.
  Preparation restores these source channels, flips DirectX normal green, and retains
  original geometry. No metalness-by-name guessing or runtime shader workaround is used.
  Numeric texture checks and full geometry buffer comparisons pass.
- P2, accepted: original resources are too large for a convenient browser fixture. Label
  the maximum-1K derivative and its approximately 1.17 GiB RGBA8 texture budget. Original
  GLB/FBX/DDS remain intact, outside commits. The source snapshot and each DDS checksum
  remain in local preparation records; source identities are pinned in a tracked manifest.
- P2, accepted: one paper label lacks ORM; its explicit matte dielectric assumption and
  zero source alpha are recorded. Cutout foliage uses threshold 0.5. Glass follows source
  alpha and is not a physical-transmission reference. User GLB geometry has fewer triangles
  than the official FBX count; this fixture is identified as a converted derivative.
- P2, fixed: a provisional street camera was inside a facade. Pick actual road positions
  in the loaded scene and place the default camera over the street, looking downward.
  Keep native Planar/Globe interaction and the existing atmosphere controls.
- P2, fixed: replacement must not require Sponza files or erase the prior material fixture.
  Bistro has its own preparation readiness path; `asset=sponza` selects the previous
  composite. Its existing Planar regression passes, including atmosphere, controls and cleanup.

## Validation and remaining boundaries

Three Bistro checks pass (source contract 10.8 s, Planar 27.2 s, Globe 34.0 s). Existing
Planar Sponza composite regression passes (60 s). Actual IAB inspection confirms architecture,
road materials, foliage and shadows. Export records fixture identity, source and material
assumptions. Standard wheel input and resource destruction are covered in both Worlds.

Scoped ESLint, formatting, Python syntax and diff checks pass. AgentDocs-wide markdownlint
passes; AgentDocs-wide Prettier retains the same 316 pre-existing files, without unrelated edits.
No full engine build is required for example/data-only changes. No upstream-owned file or
generated output is committed. Owner visual acceptance remains pending. Correct physical
glass, original authored lighting, GI and probes remain outside this completed fixture phase.
