# Phase Plan: R17 Local Environment Probes

- Plan type: `phase`
- Status: `completed`
- Owner visual acceptance: pending
- Owner role: Current task, architecture and execution
- Architecture review: `confirmed` by source-based self-review
- Created: `2026-09-28`
- Parent: [rendering roadmap](2026-09-18-rendering-quality-extension.md)
- ADR: ADR-0096; upstream seam: SGP-0024
- Review: [technical review](../reviews/2026-09-28-r17-local-probes.md)

## Authorized scope

The owner selected environment occlusion and specular probes, excluding diffuse bounce
and dynamic GI. Capture runs explicitly after loading or lighting edits; unchanged frames
reuse GPU results. Keep forward PBR, existing MRT, native materials and both-world APIs.

## Source facts and design

- R3 captures sky and neutral ground only. Native ModelSceneGraph can submit all ready
  glTF primitive commands before camera culling. Camera-selected 3D Tiles and terrain
  commands cannot prove complete offscreen coverage.
- First qualify explicit, caller-borrowed standalone Model sources. No hidden traversal,
  loading, tile pinning or claims that selected tiles form a complete capture.
- A Scene-owned collection holds at most two bounded rigid-box probes. Each owns HDR
  radiance/GGX cubes and a small cosine-filtered sky-visibility cube. Blend locally with
  boundary fade; correct specular lookup using ray/box intersection. Occlusion is a
  coarse directional field at capture positions; existing GTAO supplies contact detail.
- Capture all six faces in one requested render and publish only a complete candidate.
  Use an independent Camera, native HDR commands, alpha masks and clipping. Exclude
  transparency, screen-space effects, probe feedback and atmosphere postprocessing.
  Reuse native ShadowMap for a bounded capture-only directional map when shadows are
  enabled; never overwrite the main camera shadow atlas. No new shadow implementation.
- Physical sky is the initial source and the outside-volume source. Apply visibility
  only to default sky diffuse; use captured radiance before native specular BRDF and SSR.
  Authored IBL stays authoritative. No final-color multiplication or new MRT attachment.
- Native Scene gets a narrow prepare/capture/destroy seam. Native IBL shader libraries
  get position-aware source hooks. Implementation and GLSL stay in owned paths.

## Steps and validation

1. Implement and document immutable probe placement, collection lifecycle, explicit
   capture, validation and frame-state restoration on failure.
2. Implement offscreen capture, native GGX integration, cosine visibility, material
   source composition and bounded two-probe interpolation.
3. GPU Specs: offscreen source, masked opening, occlusion/direct/emission separation,
   both coordinates, source priority, clean-frame capture count and destruction.
4. Independent local example and Bistro controls; inspect pictures at fixed camera.
   Record manual capture draws/time and unchanged-frame overhead separately.
5. Relevant regressions, complete build/types, patch audit and source-based review.
   Update handoff and create one local phase checkpoint; owner judges visual quality.

## Explicit limits

No diffuse color bleeding, volumetric clouds, transparent capture, recursive reflections,
automatic scene-change tracking, tiled streaming capture, exact per-point visibility or
global leak-free probe field. A capture can cause a visible one-time frame stall. Pending
requests do not retry silently; caller retries after addressing the reported failure.
