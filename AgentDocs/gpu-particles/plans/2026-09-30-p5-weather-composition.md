# P5: Unified weather composition

- Type: phase; status: completed implementation; created/updated: 2026-09-30
- Parent: [extension](2026-09-29-gpu-particles.md); entry checkpoint: 51be32aa8d
- Architecture/execution/review: current task, self-review; entry confirmed
- ADR-0106; upstream-owned files / SGP: none planned

## Scope and facts

The owner requests a complete weather entry point for Viewer: precipitation, fog,
wet/snow coverage and lens effects. Current orchestration exists only in the aerial
example. Independent effects must remain usable, especially external fog controls.
No clouds, light/exposure changes, terrain SSR or water-surface ripples are added.

Scene.preUpdate precedes ControllerHost and surface-material preparation. Primitive
update is too late for same-frame fog/surface synchronization. Existing native lens
stages and surface settings already own their GPU/Scene lifecycle. EnvironmentEffects
is caller-registered and must be borrowed, not recreated or implicitly enabled.

## Implementation

1. Extend SceneGISWeather with optional scene-bound composition and typed fog,
   surface and lens controls. Preserve unbound particle-only use. Bind the existing
   EnvironmentEffects explicitly for fog; absence is explicit no-fog binding.
2. Advance shared weather transitions before Scene consumers, including rain/snow
   crossfade. Automatic channels derive effect values from this state; manual
   channels perform no writes, allowing direct access to the same effect instances.
   Clear/hide disables automatic channels but retains configured strengths.
3. Create missing surface/lens instances; reuse the Scene surface or explicit
   borrowed stages. Enforce one bound weather per Scene and validate bindings before
   allocation. Remove owned resources/listener on destruction; restore only unchanged
   weather-written fields on borrowed components, preserving later external edits.
4. Replace aerial example glue with engine controls. Retain standalone effect pages.
   Publish integration instructions for Viewer; do not edit a different checkout.

## Verification and exit

Specs cover default rain/snow/clear, transitions, pause/hide, manual authority,
cross-Scene/mode errors, no duplicate allocation, steady-state no writes, borrowed
restoration and owned disposal. Existing particle Specs remain regression evidence.
Scoped local aerial E2E covers controls and same-frame visual integration; inspect a
local browser scene. Run release/types and scoped formatting/lint. No shader or GPU
algorithm changes: unchanged pass/pool identity and idle-write evidence suffice for
composition overhead. Record self-review and independent local checkpoint.

## Completion

Implementation follows the plan with no new upstream seam or shader. PreUpdate and
particle timing are separated because request-render updates do not always draw.
Both-world engine contracts and the local integrated aerial page pass. Release and
public type generation/checks pass. See the [review](../reviews/2026-09-30-p5-weather-composition.md)
for resource evidence, resolved findings and remaining Viewer acceptance scope.
