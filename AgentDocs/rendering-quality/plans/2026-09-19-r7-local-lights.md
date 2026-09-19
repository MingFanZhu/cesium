# Phase Plan: R7 Local Night Lighting

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R11 `a94a3232fb`
- ADR: `ADR-0090`; SGP: `SGP-0019/0020`

## Source facts and scope

Native Scene exposes one directional light. Model PBR already separates emission and IBL;
CustomShader can supply HDR emissive radiance. Phong and both lit terrain paths expose
material color and normals. AO and SSR derive color commands after native log/HDR and
shadow selection. Reuse these seams without a deferred renderer or another geometry pass.

Add a Scene-bound collection, point lights and spot lights. Preserve `scene.light`, existing
material emission, CustomShader and bloom. Globe uses ECEF positions/directions; Planar
uses its Cartesian axes, with distances in meters. First-phase collection capacity is 16;
overflow is an explicit API error. No local shadows, GI, volumetric light shafts, automatic
glTF light-node import or new emission material type. Emissive surfaces do not illuminate
neighbors; matching explicit lights provide that illumination.

## Design and steps

1. Register narrow upstream Scene, PBR, Phong and Globe shader seams. Owned command
   derivation supplies fixed-size uniforms, updated eye-space positions and directions once
   per frame. Skip disabled collections and unrelated shaders; no per-light GPU resources.
2. Use smooth finite-range inverse-square attenuation and a finite source radius. Spot cones
   have a fully lit inner angle and a smooth outer fade. Preserve PBR BRDF/clearcoat,
   Phong and terrain Lambert models; add light before fog and tone mapping, independent
   of directional shadow visibility and AO. Keep unlit materials unchanged.
3. Cover render-command derivation in native color and SSR capture paths. Preserve native
   pick/depth, translucent color and both World coordinate conventions. Scene owns the
   collection lifetime; light descriptors are shareable CPU values and caller-owned.
4. Add an independent night example and a trial switch in the shared photogrammetry scene.
   Show point/spot response, colored overlaps, metallic highlights, native HDR emission
   and bloom, with deterministic local assets and separate controls.

## Verification and gate

Public API validation/capacity/lifecycle, GPU point range and inverse-square falloff, cone
direction and edge falloff, additive colors, shadows/AO/emission independence, unlit
preservation, both Worlds, terrain/Phong/PBR, HDR/LDR and SSR capture. Verify examples,
bounded GPU cost and program reuse; complete development/release/type build and scoped
checks. Record technical review; visual acceptance remains with the owner.

## Risks and status

Forward cost scales with visible pixels and light count. Sixteen local lights are a bounded
first step, not a city-scale clustered system. Local lights shine through occluders until a
separate local-shadow phase. Baked scan illumination and missing normals remain content
limitations. Implementation and technical self-review are complete; owner visual acceptance
has not been explicitly confirmed. The owner redirected work to real-scene performance
on 2026-09-19; preserve this visual follow-up while checkpointing the technically complete
phase independently. See the [review](../reviews/2026-09-19-r7-local-lights.md) for tests,
build/type checks, bounded performance, resources and all upstream changes.

## Confirmed implementation adjustments

Native OIT replaces `czm_phong` with `czm_translucentPhong`; the latter needs the same
small local-light hook. GPU tests cover both opaque and OIT Phong paths.
OIT also needs the direct-only Sun-shadow receiver contract; otherwise its native final-color
shadow multiply suppresses local light and emission. A caster-based GPU regression covers it.

The night example reproduced false-color contours with native bloom enabled. Its extraction,
blur and composition stages use unsigned-byte targets before HDR tone mapping, quantizing
dark gradients and clipping emission. SGP-0020 matches these existing targets to Scene HDR
precision (with native cache/lifecycle), and clamps negative extracted RGB. No additional
stage or control is introduced. Bloom targets cost twice as many bytes in RGBA16F; local
lighting itself still adds no targets or passes. A real GPU regression checks dark emission
preservation, texture reuse, HDR/LDR transitions and destruction.
