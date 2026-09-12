# P11 Planar Moonlight

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P10 `ed4b32fd31`; decisions: ADR-0053/0054/0055/0056
- Upstream/SGP delta budget: zero

## Source facts and implementation contract

The owner requests directional Moonlight after P10. Planar currently publishes
Sun-only primary lighting while exposing effective Sun and Moon directions.
Reuse the Globe twilight, horizon, Lambert phase, readable lunar irradiance and
existing `showMoonlight` / `moonlightIntensity` controls. Compute Planar phase
from angular separation of the effective directions; world XY and camera
orientation do not determine lunar energy. Height remains absolute metric Z.

Publish one primary direction and RGB scale for the Beer atlas, cloud material,
surface/model lighting and directional fog/haze. Keep actual Sun authority for
physical sky LUTs, diffuse night ambient and lens effects. Borrow the stable
Planar Environment light through an explicit private owner/state connection;
release returns its configured Sun, and disconnect restores the caller light.
Include primary energy/direction in Planar temporal history qualification.

No extra render pass, texture, Moon disc renderer or native geometry-shadow
qualification. ADR-0039's Planar native ShadowMap restriction stays in force.

## Execution and verification

1. Record ADR-0056; implement CPU authority, owned light lifecycle and shaders.
2. Add focused runtime and actual GPU coverage for night illumination, Moon
   phase/horizon/controls, warm history, cloud shadows and source separation.
3. Verify daytime and Globe regressions, lifecycle, build/types, lint and
   ownership; inspect day/night views and bounded GPU/resource evidence.
4. Restore user camera/settings, self-review, complete docs and create an
   independent local checkpoint before any successor phase.

## Completed handoff

Shared Moonlight authority and all listed Planar directional consumers are
connected. Thirty-two relevant cases, full build/types, scoped lint, ownership
audit, delegated day/night/model views and bounded GPU/resource checks pass.
See the [review](../reviews/2026-09-12-p11-planar-moonlight.md) for evidence and
remaining boundaries. This phase's containing commit is its local checkpoint.
