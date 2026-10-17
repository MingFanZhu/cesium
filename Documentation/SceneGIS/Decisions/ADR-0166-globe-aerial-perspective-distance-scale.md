# ADR-0166: Globe aerial perspective distance scale

- Status: accepted; Globe noon visual gate passed 2026-10-17; day/night review remains separate
- Date: 2026-10-17
- Owner: architecture / execution, current task
- Related: ADR-0044, ADR-0165
- Plan: [Environment radiance](../../../AgentDocs/webgl-deferred-renderer/plans/2026-10-16-environment-radiance.md)
- Upstream patch: none

## Context

The owner approves reducing aerial haze after the Globe directional diffuse fix.
Qualification stays on the current Globe noon scene with HDR and auto exposure off.
Scaling only atmospheric radiance leaves extinction unchanged and produces a
visible sky/ground seam. Use the distance-control concept described by
[Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-properties-in-unreal-engine),
without claiming an identical UE transport implementation.

## Decision

Add `SceneGISEnvironmentEffects.aerialPerspectiveDistanceScale` as a constructor
option and writable property. Default 1 preserves the current result; finite
values in [0, 8] shorten or lengthen the atmospheric lookup segment. Zero removes
finite-receiver atmospheric scattering and attenuation. Planar currently requires
1 and rejects other values explicitly; its transport qualification remains deferred.
The setter requests a frame without resource generation or shader recompilation.

Globe finite geometry and the atmosphere in front of cloud optical samples query
the existing Bruneton segment with the scaled distance and scaled shadow length.
Retain actual geometric distances for depth classification, occlusion, cloud
selection, height fog and picking. Clip any initial vacuum interval before scaling
so a space camera cannot move the lookup endpoint in front of atmospheric entry.
Direct illumination, diffuse sky, background sky, cloud density and height fog do
not use this artistic control. No LUT regeneration, new pass, sampler or attachment.

This remaps the lookup endpoint along the view ray; it does not regenerate a
different physical atmosphere or rescale global aerosol density. Non-unit values
can alter spatial gradients near atmospheric/planet boundaries. Inspect the actual
horizon instead of hiding differences with a view-dependent blend or fallback.
The existing aerial radiance scale remains an independent multiplier on scattering.

## Validation

Test defaults, invalid values, Planar restriction, uniform publication and warm
resource reuse. GPU tests compare the public path against independent calls of the
existing segment solver at the expected optical distances, including zero, unit,
reduced/enlarged scales, a camera outside the atmosphere and receivers before entry.
Cover finite geometry and cloud samples, preserve clear sky and actual depth,
and check shadow length consistency. Reuse existing log/linear depth, aerial/cloud
composition and ownership regressions. Build development/release and generated types.

The example exposes a Chinese distance control. Preserve current camera, noon,
HDR=false, sky=2.5, surface=1.2 and aerial radiance=1 during visual comparison;
choose a reduced distance only after viewing it. No global default change or commit
before owner visual acceptance.

## Accepted default amendment (2026-10-17)

The owner has accepted the Globe/Planar appearance and explicitly requests a
Globe default of 0.5, with Planar remaining at 1. This supersedes the initial
Globe default of 1 above. Explicit 1 restores the unscaled physical lookup;
zero, range validation, warm updates and Planar's unit-only restriction remain
unchanged. Both automatic and explicit environment construction use the same
mode-dependent defaults. HDR and automatic exposure remain disabled by default.
Related sky/surface appearance defaults are recorded in ADR-0044's latest amendment.
