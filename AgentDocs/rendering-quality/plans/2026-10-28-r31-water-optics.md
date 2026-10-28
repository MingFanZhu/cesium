# R31: Water optics and comparison fixture

- Type: phase plan; status: technically complete, owner visual gate pending; created: 2026-10-28.
- Roles: current task, architecture and implementation; source-based self-review.
- Parent: [rendering-quality roadmap](2026-09-18-rendering-quality-extension.md).
- ADR: [ADR-0194](../../../Documentation/SceneGIS/Decisions/ADR-0194-water-medium-optics.md).
- SGP: existing SGP-0017 unchanged; all planned edits are SceneGIS-owned.
- Review: [technical evidence and open visual gate](../reviews/2026-10-28-r31-water-optics.md).

## Facts and scope

The owner approves the water-quality investigation and three-stage upgrade. The
local-water fixture uses normal-only waves, not the existing optional FFT. Water
currently interpolates toward waterColor with Beer absorption. Distorted color and
undistorted optical distance disagree at bottom-depth discontinuities. FFT foam is
instantaneous compression; underwater views are explicitly discarded.

R31 adds opt-in homogeneous-medium absorption/scattering and phase directionality,
coherent accepted refraction depth/color, and clear/lake/turbid example presets.
Retain the legacy waterColor contract when scattering is undefined. Share optics
with local, curved and river surfaces; preserve Fluid's existing helper contract.
No persistent foam, underwater camera, caustics, new framebuffer, CPU readback,
upstream hook, SDK change, FFT algorithm change or asset dependency in this phase.

## Implementation

1. Add copied optional RGB scattering coefficients (inverse meters) and bounded
   scatteringAnisotropy to WaterSurface and the RiverSurface forwarding API.
2. Integrate a homogeneous single-scattering slab analytically. Extinction is
   absorption + scattering. Incident direct light uses normalized HG; sky uses
   an isotropic hemispherical approximation. Attenuate light and viewing paths,
   keeping the already-lit bottom snapshot out of the lighting calculation.
3. Accepted distorted samples provide both color and optical distance. Rejected
   foreground, above-water and offscreen samples retain the original pair.
4. Add independent water-color and wave-mode controls to the existing both-world
   fixture; preserve the camera and explicit lifecycle of borrowed FFT resources.
5. Review source, numerical/scene regressions, visual captures, performance and
   generated types, then create a separate local phase checkpoint.

## Verification and exit

- GPU optics tests against numerical quadrature: zero coefficients, thickness,
  deep-water limit and phase sign. No test-only shader path.
- Scene Specs: legacy compatibility, new-material mutation without resource churn,
  both worlds, distorted depth step/foreground rejection, river forwarding.
- Existing water, wind, curved-water and river GPU regressions and resource cleanup.
- Development/release build and public type generation/checks.
- Same-view comparison and bounded timing, no universal performance promise.
- Owner visual acceptance is separate from technical review. Preserve earlier R25
  cold mesh and R27 visual findings; do not silently close them.

R32 (persistent foam) and R33 (underwater/caustics) remain coarse roadmap entries.
Do not activate another phase before this phase's independent checkpoint.

## Handoff

Implementation and technical review are complete. Development/release GPU checks,
both-world example runs, builds/types and ownership audit pass as recorded in the
review. No scope expansion beyond R31; this phase's commit is its independent checkpoint. Owner visual
acceptance remains open, with the updated local-water page as the review fixture.
