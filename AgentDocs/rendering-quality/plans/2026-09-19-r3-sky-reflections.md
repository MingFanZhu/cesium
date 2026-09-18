# Phase Plan: R3 Physical Sky Reflections

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R2 `c824cfec1e`, owner accepted
- ADR: `ADR-0085`; SGP: `SGP-0015`; open discussions: None

## Source facts and design

Native DynamicEnvironmentMapManager captures an unrelated atmosphere into RGBA8 and generates
per-model maps. Its reference transform rotates with the model. Native PBR already has GGX split-sum,
roughness LOD, anisotropy and clearcoat; keep those material paths. SceneGIS owns the physical
atmosphere LUTs and frame-local Globe / Planar lighting records.

Create one lazy HDR sky cubemap producer owned by each environment renderer. Capture the existing
physical atmosphere at the camera's local frame into 128-square RGBA16F faces. Reuse the native GGX
convolution fragment shader with squared perceptual roughness and a separate input cube. Publish
all eight roughness levels synchronously, so no model sees incomplete faces. A narrow private
Framebuffer mip-level option enables direct HDR cube rendering without forbidden float copies.

Rebuild only on atmosphere resource replacement, local sun change above 0.1 degree, altitude change
above 100 meters or local frame change above 0.1 degree. Material brightness remains a sampling
uniform. Rotation of the camera or model cannot rotate the reflected world. A single regional probe
is deliberately shared; large-world spatial probes, nearby geometry, clouds, fog and SSR are outside R3.
Exclude the solar disk already evaluated by native direct-light BRDF. Retain the existing readable
night irradiance convention and an atmosphere-lit neutral ground hemisphere.

Use existing ImageBasedLighting factors. Explicit per-model KTX2 and scene specular maps take
precedence; authored SH remain untouched. Disabled native environmentMapManager disables the
automatic sky reflection for that model. Skip native procedural generation while physical lighting
owns its default sources, without mutating caller controls or manager ownership.

## Implementation and verification

1. Add owned producer, capture/direction GLSL and renderer lifecycle wiring.
2. Add minimal framebuffer, model IBL and native manager seams under SGP-0015.
3. Add deterministic GPU tests: HDR values, face directions and roughness, cache invalidation,
   lifecycle, real PBR world orientation, authored precedence and native regression.
4. Add a local Globe / Planar material comparison example with roughness and time controls.
5. Run focused GPU Specs, full builds/types, scoped lint/format, patch audit and bounded GPU timing.

Technical review and owner visual acceptance are required before completing/checkpointing R3.

## Results and handoff

Implementation and technical self-review complete. 50 focused strict GPU Specs, full builds/types and patch audit pass. Native manager baseline failures, visual checks, timing and limits are recorded in the [review](../reviews/2026-09-19-r3-sky-reflections.md). The owner explicitly accepted the visual result on 2026-09-19. No public API or generated source edits. R3 is ready for its isolated checkpoint before the requested scene-reflection work.
