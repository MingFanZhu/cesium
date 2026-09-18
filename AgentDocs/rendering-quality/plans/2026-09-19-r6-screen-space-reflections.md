# Phase Plan: R6 Screen-space Reflections

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R3 `2e2dc02ce6`, explicitly accepted
- ADR: `ADR-0086`; SGP: `SGP-0016`; open discussions: None

## Scope and source facts

The owner prioritizes scene reflections before R4. Native forward PBR evaluates roughness and
normal maps but publishes neither to a screen texture. Native Scene prepares log/HDR/shadow
derived commands and frustum ranges before opaque drawing. R2 demonstrates a current-frame
replay at that boundary. Native IBL already supplies material weighting, authored environments,
anisotropic directions and clearcoat; preserve those computations rather than overlay final color.

R6 adds current-frame SSR for opaque native PBR Model / 3D Tiles receivers in Globe and Planar.
Opaque depth-writing terrain and primitives can appear in reflections. Transparent geometry,
classification overlays, labels, recursive reflections, offscreen geometry and temporal accumulation
are outside this phase. Missing rays retain existing IBL. Material and camera APIs stay unchanged.

## Design and implementation

1. Add a SceneGIS-owned effect with explicit Scene attachment, enabled/quality controls and
   deterministic destroy. One effect per Scene; Scene destroys its attached effect before Context.
2. Replay the visible opaque commands through existing log/HDR/shadow/AO variants, with SSR
   disabled in the capture. MRT stores HDR color and separate base/clearcoat reflection direction
   plus perceptual roughness, taken at the native IBL evaluation point after custom materials.
   Storing evaluated directions preserves anisotropy without reconstructing material normals.
3. Accumulate ranges far-to-near without clearing color between ranges; clear native depth per
   range and copy it into R32F common eye depth. Nonreceivers overwrite material records with zero.
4. Trace each lobe using bounded perspective-correct screen-space traversal and thickness testing.
   Use an HDR color mip cone approximation for glossy reflection; fade rough, edge and uncertain
   hits into existing IBL. No history, settling frames, camera jitter or hidden automatic quality.
5. Main forward draw samples the matching lobe result before native Fresnel/BRDF/IBL-factor/AO
   weighting. Geometry shadows, aerial perspective and tone mapping keep their existing order.
6. Add a deterministic local glTF demonstration for both worlds, a reflective floor and colored
   objects, with roughness, SSR enable and camera controls.

## Validation and risks

- Strict GPU Specs: actual colored-object hit and IBL miss, material roughness/custom shader,
  both lobes, planar/Globe transforms, log/multiple frusta, perspective/orthographic, AO/shadows,
  no picking influence, resize/disable/re-enable/destruction and capability/config rejection.
- Full build/release/types for public API and shader integration; focused native regression,
  scoped lint/format, AgentDocs checks and SGP audit.
- Inspect both examples and measure bounded GPU timing with enabled/disabled states; quantify
  replay work and texture memory. No universal frame-time claims.
- A shaded opaque replay adds geometry/lighting work. Full-resolution material and radiance
  targets consume bandwidth; initial targets are explicit rather than an unmeasured MRT change
  to native MSAA/OIT framebuffers. Glossy cone filtering is an approximation, not stochastic GGX.
- Screen-space disocclusion, thin geometry and silhouettes can lose hits; IBL continuity must
  remain visible. No claim that offscreen reflections are solved.
- Technical self-review and owner visual acceptance are required before the R6 checkpoint.

## Results and handoff

Implementation and technical self-review complete; 27 focused strict GPU Specs, full builds/types and patch audit pass. The glossy silhouette finding adds a bounded separable material/depth-aware filter to the initial mip-cone design. Timing, resource costs and limits are in the [R6 review](../reviews/2026-09-19-r6-screen-space-reflections.md). Owner explicitly accepted the visual result on 2026-09-19. The phase is complete.
