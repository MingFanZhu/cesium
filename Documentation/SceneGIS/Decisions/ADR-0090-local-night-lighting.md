# ADR-0090: Forward Local Night Lighting

- Status: accepted
- Date: 2026-09-19
- Baseline: Cesium 1.144, `.scenegis/upstream-base.json`
- Related: ADR-0084, ADR-0086, ADR-0089; SGP-0019, SGP-0020

## Context and evidence

`Scene.light` provides a single directional source. `LightingStageFS` computes PBR direct
light, clearcoat, IBL and native emissive separately. `czm_phong` and lit Globe/Planar shaders
provide simpler material lighting. Scene selects log/HDR/shadow commands before the
owned AO/SSR receiver stages. Native glTF emissive factors/textures and CustomShader
already support emission; no parallel material API is needed.

## Decision

Expose `SceneGISLightCollection({scene})`, `SceneGISPointLight` and `SceneGISSpotLight`.
The collection borrows up to 16 CPU light descriptors, with native-style add/remove/get/
contains/length semantics. Overflow throws rather than silently dropping lights. Scene
owns the attached collection; explicit destroy detaches it. Descriptors have no destroy
method or GPU resources and may be shared. Mutable descriptor properties follow native
DirectionalLight; request-render applications call `scene.requestRender()` after edits.

World positions and directions use ECEF for Globe and planar Cartesian coordinates for
Planar; meter distances and angular radians are shared. Intensity is linear RGB irradiance
scale at one meter before finite-range attenuation, compatible with native relative HDR
lighting rather than a calibrated photometric display unit. A positive source radius caps
the inverse-square singularity. Smooth range and inner/outer spot cones avoid hard edges.

An owned helper derives eligible color shaders, with fixed uniform capacity and a dynamic
active count. It adds point/spot radiance at PBR (including clearcoat), Phong and lit terrain
terms. Positions/directions transform to eye coordinates in JavaScript double precision
once per frame. Directional geometric/cloud shadows and AO do not attenuate these
independent sources. Emission, IBL, transparency, fog and tone mapping retain native order.
Unlit materials remain unlit. SSR capture consumes the same lighting. No extra pass,
framebuffer, texture, vertex buffer, or per-light GPU allocation is introduced.

## Alternatives and boundaries

Deferred/clustered lighting would raise the first-phase cost and change the existing forward
pipeline unnecessarily for a bounded local set. Final-color post-process relighting lacks
material properties and incorrectly lights emission. Both are rejected for this phase.
Local-light shadows, probes/GI, glTF punctual-node import, volumetric scattering, vector
classification and custom lighting shaders are outside this contract. Native PBR, lit
Primitive and lit terrain are the receivers; local water retains its existing lighting.
Emissive surfaces brighten themselves and may bloom, but require explicit local lights
to illuminate nearby geometry. Existing native bloom is reused, never applied twice.

The night example exposed native bloom's unsigned-byte intermediates before HDR tone
mapping. They quantize dark gradients and clip colored emission. SGP-0020 changes only
the precision selection of existing bloom stages: the same floating type as SceneFramebuffer
in HDR, unsigned byte in LDR. Native texture-cache invalidation handles transitions, resize
and destruction. Negative RGB after contrast extraction is clamped before float blur.
RGBA16F targets double the existing bloom texture bytes; no extra pass or public control
is added. Both dark-emission preservation and lifecycle are covered by actual GPU tests.

## Delivery, maintenance and verification

Owned JS uses the existing flat engine export/build/type chain; GLSL uses ADR-0030's
source root. SGP-0019 tracks Scene scheduling/lifetime and the small PBR/Phong/Globe
material integration seams. ShaderCache owns derived programs; collection destruction
releases CPU references, and base-program/Context destruction releases shaders.

GPU Specs verify both Worlds, material response and independent shadow/AO/emission
semantics. Collection Specs verify capacity, mutations and lifecycle. Example E2E and
manual night-scene comparison verify photogrammetry and native HDR emissive/bloom.
Record bounded GPU timing and cache reuse, complete development/release/type checks,
and retain first-phase capacity and occlusion limits in the public docs and phase review.
