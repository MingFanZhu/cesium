# ADR-0106: Unified weather composition

- Status: accepted; date: 2026-09-30
- Parent: ADR-0103/0104/0105; upstream-owned files / SGP: none
- Plan: [P5](../../../AgentDocs/gpu-particles/plans/2026-09-30-p5-weather-composition.md)

## Decision

SceneGISWeather remains a collection-owned precipitation primitive. Supplying scene
enables composition with existing surface and native lens implementations. The caller
explicitly supplies its registered SceneGISEnvironmentEffects for height fog; weather
never creates/enables an atmosphere, changes lighting, exposure, clouds or clocks.
Omitting scene retains independent precipitation. Omitting environmentEffects means
no fog binding; requesting automatic fog without that binding is a configuration error.

Mutable fog/surface/lens configuration groups have automatic and enabled controls.
Automatic channels follow the current precipitation intensity and rain/snow mixture.
Their strength settings are retained when clear/hidden. Manual channels stop all
weather writes; callers adjust the exact same effect instances through weather's
read-only references or their existing references. Re-enabling automatic explicitly
returns authority to weather. This avoids two continuously competing controllers.

Scene.preUpdate advances composition before environment controllers/material prepare;
primitive update consumes the same transition state without advancing twice. Bound
weather belongs to one live SCENE3D Scene, with matching explicit world mode, and one
bound weather per Scene. No new render pass, shader, readback or GPU allocation class.
Only changed values invoke effect setters; no settling frames or automatic quality.

Reuse an existing Scene surface setting or explicit borrowed native lens stages.
Otherwise weather creates these components and removes/destroys them with itself.
Borrowed resources remain caller-owned. On destruction restore only controlled fields
that still equal weather's last write; subsequent external edits are preserved.
Do not destroy or unregister EnvironmentEffects. Render-loop and Scene-time advancement
remain caller-controlled; this is visual weather, not accumulation/drainage physics.
