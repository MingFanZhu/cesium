# R20: Screen-space Indirect Lighting

- Type: `phase`; status: `completed`; date: `2026-09-28`
- Architecture / execution owner: Current task; architecture review: `confirmed`
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md)
- Decision: ADR-0099; seam: SGP-0026; open discussions: none
- Previous checkpoint: `d68562fbc5`; prior owner visual gates remain separate

## Scope and source facts

The owner authorizes a bounded SSIL prototype. SSIL and SSGI overlap in usage;
this phase estimates only a local, single diffuse bounce. It does not implement
world-space tracing, automatic probes, multi-bounce GI or a deferred renderer.

The shared lighting MRT currently captures weighted specular and indirect energy,
not diffuse response or diffuse outgoing radiance. It has a qualified single-frustum
HDR path and an eight-attachment ceiling. AO and SSR can own it independently.
Its resolved linear depth precedes water, translucency and atmospheric composition.

## Design

Implement the visibility-sector idea from Therrien et al., arXiv:2301.11376v2,
with 32-bit masks, finite thickness and bounded near-to-far slice sampling.
Use an original WebGL2 implementation; do not copy third-party engine code.
Capture direct diffuse plus emission and receiver diffuse response in two RGBA16F
attachments; store octahedral normals in their alpha channels. Diffuse source uses
a view-independent F0 approximation. Preserve authored occlusion and clearcoat
attenuation on the receiving material, without applying GTAO a second time.
Sources exclude sky IBL, specular highlights, previous SSIL, water and translucency.
Non-PBR geometry remains an occluder but is not an emitter/receiver in this phase.

Share the existing MRT when AO/SSR is active; support SSIL alone through the same
manager. No geometry replay. Explicitly reject unqualified layouts rather than
silently replaying or disabling other effects. Clearcoat SSR plus SSIL exceeds
eight attachments and is outside this prototype; clearcoat without SSR is supported.

Expose experimental Scene-owned SceneGISScreenSpaceIndirectLighting, disabled by
default, with enabled, radius, thickness, intensity, directionCount, stepCount and
resolutionScale (0.5 or 1). Stable spatial sampling and bilateral reconstruction
produce an immediate image; existing optional TAA may filter it. No SSIL history,
hidden convergence frames or quality adaptation. Disabled retains owned targets;
destroy/resize release resources. Globe/Planar use the same eye-space algorithm.

## Implementation and verification

1. Register ADR/SGP and implement shared MRT material capture and lifecycle.
2. Implement bitmask integration, edge-aware reconstruction and signed-free additive
   diffuse composition before SSR, water and atmosphere; preserve native alpha/MSAA.
3. GPU Specs cover direct/emissive color transfer, metallic/unlit exclusion,
   finite-thickness visibility, occluders, no recursive energy, independent AO/SSR,
   unsupported layouts, resize/disable/destruction and both projection types.
4. Independent colored-corner fixture in both worlds; optional Bistro control.
   Preserve the owner's existing browser camera and settings.
5. Focused regressions, full release/types, patch audit, measured GPU cost and
   memory/draw budget, source-based review and an independent local checkpoint.

## Risks and exit

Screen edges, hidden surfaces and fixed thickness are approximations. Large radii
can miss thin occluders. There are no object motion vectors or history. This is a
local diffuse supplement and cannot promise full GI or physically complete sky
occlusion. Technical gate needs meaningful GPU evidence; visual acceptance is
reserved for the owner. No further phase is authorized by this work.

## Completion and handoff

Implementation and [technical review](../reviews/2026-09-28-r20-screen-space-indirect-lighting.md) are complete. Thirteen feature cases, 39 existing regressions, two E2E cases, release/type checks and patch audit pass. GPU increment is approximately 1.1 ms on the measured Bistro/RTX 3060 Ti configuration, with no added geometry submissions. The original camera/settings are preserved. Owner visual acceptance is pending; no next phase is active.
