# ADR-0055: Planar Physical Lighting and Cloud Shadows

## Status

- Date: `2026-09-11`; status: `accepted; implemented and verified in P2`
- Owner: Architecture Agent under project-owner implementation and visual-review delegation
- Phase: [P2](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-11-phase-p2-planar-lighting-cloud-shadows.md)
- Builds on: ADR-0040/0042/0047/0052/0054; P1 checkpoint `4c847d6def`
- Upstream seams: consume-only SGP-0008/0010; no new upstream hunk

## Current source and decision

The P1 Planar controller owns fixed-Z atmosphere/cloud resources but publishes
no surface-lighting record. Native model PBR already has source hooks owned by
SGP-0010; Planar surface shaders and their cache/uniform binding are entirely
SceneGIS-owned. Extend these explicit source-level paths, never relight resolved
color or attenuate emissive/sky with a fullscreen shadow overlay.

Publish a separate frame-local `_sceneGISPlanarLighting` record from the existing
controller update before world/model command assembly. It borrows Planar LUTs,
the cloud Beer atlas, explicit effective Sun direction and the existing
`surfaceRadianceScale`. Disable/disconnect removes the record and releases owned
shadow resources; model/surface variants return to native/unlit behavior.
The registered PlanarEnvironment retains scene.light ownership and its explicit
effective directions. No CRS inference, second light or new shadow toggle.

Direct beam irradiance uses the Planar transmittance LUT and solar irradiance;
its source carries no material cosine. The native PBR BRDF or surface Lambert
term supplies the cosine once. Planar irradiance LUT includes horizontal direct
irradiance: subtract that term before applying hemispherical normal weighting
to diffuse sky. Above the atmosphere, direct is unattenuated and sky zero.
The lower LUT boundary remains continuous for negative reconstruction roundoff
at Z = 0; no hard negative-height cutoff is applied to receiver irradiance.
Native authored model lightColor/SH, emissive, BRDF and specular IBL retain
precedence/ownership. Planar terrain combines imagery/material first, then uses
physical Sun/sky as albedo lighting while advanced effects are active. The
caller-owned world.enableLighting value is not mutated. Three lighting samplers
must count against the existing imagery/material texture-unit preflight.

## Beer geometry, history and resource boundary

Reuse existing cascade splits, world light-grid snapping, packed Beer channels,
receiver transmittance filtering and temporal resolve. The Planar producer
intersects horizontal cloud-base/top planes. Its receiver reconstructs distance
to the same top plane along positive Sun; no sphere radius or ECEF mapping.
Both consume the current Planar cloud material, wind and meter density scale.
Cumulus/stratus and the lower two mixed layers cast; cirrus/high mixed layers
remain visible without entering the caster support, matching the Globe policy.

Cloud-shadow matrices use a CPU-selected horizontal origin with Z fixed at zero.
CPU double subtraction converts camera/previous-origin deltas before GPU use.
Receiver position is reconstructed from eye position and inverse-view rotation
plus this relative camera vector, retaining direct absolute Z height. The
world light-grid remains fixed; changing the numerical origin cannot move the
material or shadow. History velocity compensates origin and cloud-wind deltas.
Existing continuity resets and current-neighborhood clipping remain in force.

Planar adopts the same bounded atlas topology as Globe: one two-attachment
current RGBA16F framebuffer, two single-attachment ping-pong history framebuffers,
one producer and one resolve program/command. Total atlas storage is 4 textures:
low 8,388,608, medium 33,554,432, high 75,497,472 bytes. Reuse the existing quad.
No new asset, loader, public property or native ShadowMap. Native geometry-shadow
support is outside P2; retain its existing caller controls/qualification guards.
Rays, HDR/celestial parity and cloud morphology remain later bounded phases.

## Verification and upgrade boundary

Use actual Planar producer/receiver pixels, known optical depth, large XY,
camera/wind movement and foreground-height cases. Verify real native PBR model
source/SH/emissive behavior, real Planar surface variant and sampler budget,
warm resources, disable/re-enable and exact destruction. Reuse focused Globe
model/shadow regressions; run full build/types because existing public lighting
properties gain a Planar consumer. Check direct day/low-Sun/cloud-shadow off/on
views and bounded GPU cost. Agent visual acceptance closes the phase after
review; create an independent local checkpoint before continuing.

On Cesium upgrades, recheck SGP-0010 PBR/IBL hooks, SceneGIS frame publication
order, Planar surface normals/material source and sampler-budget preflight.
Generated Shader JS/barrels/build outputs remain generated and uncommitted.

## 2026-09-18 amendment: planar geometry shadows

[ADR-0083](ADR-0083-planar-cascaded-shadows.md) supersedes the planar geometry-shadow exclusion
and disabled-shadow guard in this decision. It retains native switches and adds fixed-Z stable
cascades through SGP-0013. Other qualification and physical-lighting boundaries are unchanged.
