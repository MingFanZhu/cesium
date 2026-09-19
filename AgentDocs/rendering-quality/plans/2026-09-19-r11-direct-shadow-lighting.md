# Phase Plan: R11 Direct Shadow Lighting

- Type: `phase`; status: `completed`; created: `2026-09-19`
- Owner / reviewer: Current task, architecture and execution self-review
- Architecture review: `confirmed`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: R10 `c2e8127dcc`
- ADR: `ADR-0089`; SGP: `SGP-0018`

## Source facts and scope

Native `ShadowMapShader` calls the material main before multiplying its final color by
visibility. This incorrectly darkens model IBL, emission, Phong ambient and physical sky
irradiance, sometimes after tone mapping. The owner selected this correction before probes/GI.

Keep the shadow atlas, filtering, native API, cast/receive selection and World semantics.
Compute visibility before material lighting and expose it through a private GLSL function.
Explicitly qualify native model lighting, Phong and lit Globe/Planar receivers. Multiply only
direct diffuse/specular (including clearcoat) before tone mapping. Keep ambient floors,
AO, IBL/SSR, emission, fog, clipping edges and translucent background composition independent.
Unlit glTF has no direct term and remains unshadowed. Plain unlit terrain and arbitrary
custom fragment shaders retain the existing color-receiver behavior: no lighting split exists.
No new public switch, probe, texture, framebuffer or pass.

## Implementation and verification

1. Register the minimal upstream seams in ShadowMapShader, model LightingStageFS, Phong and
   GlobeFS. Put shared GLSL and physical terrain changes in owned sources.
2. Test actual derived GPU shaders and scene receivers: direct versus indirect/emission,
   clearcoat, both Worlds, HDR/LDR, fallback receivers, opacity and shadow disable/enable.
   Run native shadow, Planar shadow and affected AO/SSR regressions with bounded scope.
3. Add an independent local-data shadow-lighting example; inspect it and the shared scan.
4. Validate development/release builds, scoped lint/patch audit and bounded GPU timing.
   Record technical review and leave the final visual gate to the owner.

## Risks

Shadow code now runs before material discard, so clipped fragments may perform unused shadow
samples; derivatives must remain outside divergent control flow. Derived AO/SSR capture must
still use the same material lighting. Builtins precede user shader sources, requiring a private
function declaration. Debug cascade colors must run after material main. Existing baked
photogrammetry lighting cannot be recovered by changing real-time shadow composition.

## Current handoff

Implementation and architecture self-review are complete. The owner advanced to multi-light
night rendering on 2026-09-19; this progression closes R11 for its isolated checkpoint.
The [review](../reviews/2026-09-19-r11-direct-shadow-lighting.md) records the source changes,
fixture corrections, both-World GPU/E2E validation, build/type checks and bounded timing.
No probe/GI or following phase has been activated.
