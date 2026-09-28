# R19: Geometric Specular Antialiasing

- Type: `phase`; status: `completed`; date: `2026-09-28`
- Architecture / execution owner: Current task; architecture review: `confirmed`
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md)
- Decision: ADR-0098; seam: SGP-0025; open discussions: none
- Review: [technical review](../reviews/2026-09-28-r19-specular-antialiasing.md)

## Scope and source facts

The owner requests Three.js-inspired highlight antialiasing after comparing MSAA
and TAA in Bistro. R18 checkpoint is `8d27a60feb`. Retain TAA, camera controls,
authored materials and existing lighting. No GI, probes or postprocess redesign.

Native ModelFS evaluates material and CustomShader before LightingStageFS.
GeometryStageFS exposes a normalized, unperturbed eye-space normal. Native PBR,
clearcoat, local lights, IBL and SSR consume material perceptual roughness.
No geometric specular antialiasing currently adjusts it.

## Design

Adapt Three.js r180, commit `0af9729d0c143a86a1d725d6e2c3ad83301f3f34`:
maximum absolute component of the geometry-normal screen derivatives adds to
base and clearcoat perceptual roughness, capped at one. Preserve flat mirrors;
omit Three's PMREM-resolution-dependent roughness floor. Normal-map variance,
silhouettes, alpha coverage and missing model normals are outside this method.

Add optional Scene-owned `SceneGISSpecularAntialiasing({ scene, enabled })`,
default disabled. FrameState publishes the boolean; a uniform changes existing
Model shaders without rebuilding commands. Owned GLSL runs only for enabled
PBR with normals, before all lighting consumers and after CustomShader.
No new pass, draw, sampler, render target, per-frame allocation or history.
Scene destruction detaches the effect. Expose an independent both-world example
and a Bistro experimental switch without moving the user's camera.

## Execution and verification

1. Register SGP-0025 before three runtime seams and the native pipeline Spec; ship pinned MIT notice.
2. Implement public lifecycle, owned shader and pipeline binding.
3. GPU Specs: disabled/flat preservation, curved-normal broadening, clearcoat,
   unlit/normal-map preservation and real Model material/SSR integration.
4. Both-world example checks, original-camera Bistro comparison and bounded GPU
   timing. Reuse existing normal-mapping and native lighting pipeline regressions.
5. Full release/types, patch audit, scoped lint, review and local checkpoint.

## Exit and risks

Technical exit requires successful shader/runtime validation, documented cost
and ownership, stable controls and review. Owner visual acceptance remains a
separate gate. This reduces geometry-driven highlight aliasing; it does not
replace TAA or promise to remove texture or silhouette aliasing in Bistro.

## Result and handoff

Implementation and technical review complete. Twenty focused dev Specs, eight
feature Specs against release, and two both-world E2E checks pass. Release/type
builds and TypeScript pass. Bistro at 1185 x 667 on RTX 3060 Ti / ANGLE D3D11:
60 GPU frames per state give 12.0105 ms disabled and 12.0136 ms enabled, with 1591
draws in each. This is no measurable total-frame change, not a speedup claim.
No texture, framebuffer or extra draw allocation. Full evidence and limits are
in the review. Create this phase's local checkpoint; owner visual review remains
pending. No following phase is active.
