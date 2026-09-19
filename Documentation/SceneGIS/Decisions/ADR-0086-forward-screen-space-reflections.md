# ADR-0086: Screen-space Reflections in Forward PBR

- Date: `2026-09-19`; status: `accepted; implemented and visually accepted`
- Phase: [R6](../../../AgentDocs/rendering-quality/plans/2026-09-19-r6-screen-space-reflections.md)
- SGP: `SGP-0016`; builds on ADR-0084 and ADR-0085

## Context and decision

Cesium 1.144 has per-fragment material roughness, normals and native split-sum IBL, but its
postprocess inputs have no evaluated material buffer. A complete deferred renderer would affect
MSAA, transparency, classification and native lighting far beyond the reflection requirement.

Keep forward lighting. Add an explicitly attached `SceneGISScreenSpaceReflections` effect with
one owner per Scene. Its lazy private renderer replays visible opaque commands after AO and
shadow preparation, using the native log/HDR/shadow/AO programs. A derived MRT capture stores
scene-linear color and the actual base/clearcoat reflection directions and perceptual roughness.
Directions are captured inside native IBL, retaining normal maps, custom shaders and anisotropy.
Nonreceiver opaque geometry still supplies color/depth and clears material eligibility.

Process native frustum ranges far-to-near and convert their depth to one R32F eye-depth texture.
Trace bounded screen-space rays for the two lobes. Filter captured HDR color with a roughness
cone mip approximation, including coverage normalization, followed by separable material/depth-aware
filtering of premultiplied hit radiance and confidence. Main PBR blends hit radiance with its
existing IBL source before native material weighting; never add reflections to final scene color.
The capture excludes SSR to avoid texture feedback and accidental recursive energy.

The effect requires SCENE3D, HDR, WebGL2, floating-point color/depth targets and three MRT outputs.
Properties are validated synchronously; unsupported active rendering fails explicitly. Disabled
effects allocate nothing initially and retain existing targets for reuse. Resize replaces targets;
manual destroy detaches, and Scene destruction releases the effect before destroying Context.

## Scope, cost and upgrade boundary

Globe / Planar share eye-space tracing. Opaque native PBR Models / 3D Tiles with specular IBL are
receivers. Depth-writing opaque terrain/primitive commands are reflection sources. Transparency,
classification overlays, screen-external objects, recursion and temporal filtering are excluded.
Existing IBL remains the defined source for misses and rough surfaces. Authoring APIs are unchanged.

An explicit shaded replay costs an additional opaque geometry/lighting pass. This avoids changing
native multisample/OIT target layouts and makes ownership testable. Two-layer tracing costs at most
the configured step budget per eligible lobe. Static scenes still need a capture when they render;
there is no persistent camera-history cache or request-render loop.

SGP-0016 touches Scene scheduling/draw/destruction and two native IBL shader libraries only.
Implementation and GLSL remain under SceneGIS-owned roots, using existing generation, bundling,
Specs and declaration generation. Recheck native derived-command order, IBL source/BRDF semantics,
log/multifrustum reconstruction and ShaderCache lifetime during upgrades.

## Validation

GPU hit/miss and material tests, both coordinate worlds and projection types, native AO/shadow
composition, picking exclusion and resource lifecycle are required. Full build/release/types and
bounded actual-GPU timing accompany the owner-visible example. See the R6 plan for the phase gate.

## R12 amendment

[ADR-0091](ADR-0091-main-pass-reflection-mrt.md) replaces unconditional shaded replay with an
eligible main-pass MRT path. Public behavior and per-lobe material weighting remain; the existing
replay preserves native branches outside that path's qualification. See R12 for the exact MSAA,
weighted replacement, background coverage and resource contracts.
