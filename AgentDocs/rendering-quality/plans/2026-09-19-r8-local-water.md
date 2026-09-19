# Phase Plan: R8 Local Water

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R6 `f9301bf8cd`, explicitly accepted
- ADR: `ADR-0087`; SGP: `SGP-0017`; open discussions: None

## Source facts and scope

The owner chooses lakes, rivers and pools before ocean rendering. Native Fabric Water uses
frame-count animation, perturbed normals and Phong highlights. It has no scene transmission,
thickness or physically weighted scene reflection. R6 captures opaque HDR color and common eye
depth, but its receivers are opaque native PBR models. R3 owns a shared physical sky probe.

Add an explicit SceneGISWaterSurface primitive using native PolygonHierarchy, a local XY water
plane and a rigid modelMatrix. Globe callers use ENU; Planar callers use Cartesian translation.
Keep native Water and Entity APIs unchanged. Native coplanar triangulation handles holes; native
DrawCommand, frustum culling, log depth, picking and collection ownership remain in use.

## Implementation

1. Add the public primitive with meter-based waves, flow, perceptual roughness, RGB absorption,
   deep-water scattering color and shallow contact foam. Animation follows Scene simulation time.
2. A Scene-owned lazy frame helper borrows R6 opaque color/depth when available; otherwise it
   captures opaque commands once for all water surfaces. Water is excluded from capture and AO.
3. Draw water after ordinary opaque geometry in each native frustum, before translucent objects.
   Compose transmitted background and Fresnel reflection in HDR, then write opaque coverage and
   surface depth. This is physical transmission composition, not constant-alpha blending.
4. Reuse R6 screen-ray traversal as an owned GLSL library. Reflected misses sample R3 sky when
   available; without a physical environment the documented reflection color is the source.
   Refraction rejects foreground samples; Beer absorption uses the camera-ray distance to the
   visible bottom. Depth-contact foam fades continuously and is an artistic local approximation.
5. Use analytic filtered multi-scale normal waves; no displacement, FFT, assets or simulation.
   Local single water layer, above-water viewing and opaque submerged objects are the qualification.

## Validation and exit gate

- Strict GPU tests: bottom transmission and absorption, occlusion/picking, scene reflection,
  both worlds, holes, time/flow, orthographic and multi-frustum depth, capture sharing, disable,
  resize, remove/destroy and unsupported configuration.
- Focused SSR regression; full builds/types, scoped lint/format and SGP audit.
- Inspect the local example in both worlds, measure bounded GPU cost and report resource budget.
- Technical review followed by owner visual acceptance before a separate R8 checkpoint.

## Limits

No ocean displacement, bathymetry data service, underwater camera, multiple overlapping water
layers, transparent submerged geometry, caustics, recursive reflection or offscreen scene capture.
SSR keeps its existing screen-space limitations. Current-frame depth cannot recover hidden bottom
geometry; missing bottom uses deep-water scattering. Native final-color shadow modulation is not
enabled on the water surface because it would incorrectly darken reflected/transmitted radiance.

## Owner-requested foam refinement

The current filtered noise still reads as a continuous gray shoreline band, with little bubble
structure and broad whitening above shallow objects. Refine the owned water fragment shader with
broken multi-scale foam coverage, small bubble openings and gradual flow-driven breakup. Keep
foamWidth as the existing depth range and foamIntensity as strength; no new API, texture, capture
or upstream seam. Preserve zero-strength/zero-width disable, deep/missing-bottom exclusion and
simulation-time freezing. Add focused GPU contracts in both worlds, inspect near/default/distant
Planar views and the equivalent Globe view, and compare bounded GPU cost before/after.
The owner accepted the refinement and moved on to the public-data comparison scene.

## Results and handoff

Implementation and technical self-review complete. 30 distinct focused strict GPU Specs pass,
including 12 water Specs after the foam refinement. Coverage clusters, varied bubble openings,
fine grain and independent footprint filtering replace the continuous noise band. Perpendicular
bottom depth also keeps the foam range correct with orthographic cameras. No API or resource change.
Build/release/types and upstream audit pass. Physical source sharing and exact above-plane
refraction rejection refine the initial design. See the [R8 review](../reviews/2026-09-19-r8-local-water.md)
for findings, visual checks and bounded GPU/resource costs. Owner acceptance is complete.
