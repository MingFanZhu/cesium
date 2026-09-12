# ADR-0054: Model Physical Lighting and Explicit Geometry Shadows

## Status

- Date: `2026-09-11`; status: `accepted; implemented and visually accepted`
- Owner: Architecture Agent; project owner confirms the result meets expectations
- Phase: [A16-G](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-11-phase-a16g-model-environment-lighting.md)
- Diagnosis: [model lighting](../../../AgentDocs/atmosphere-clouds-effects/discussions/2026-09-11-model-environment-lighting.md)
- Related decisions: ADR-0047, ADR-0053; new upstream seam: `SGP-0010`

## Decision

Advanced Globe lighting extends its existing frame-local lighting record to
PBR Models and 3D Tiles. A SceneGIS-owned helper participates in native Model
update and LightingPipelineStage; native GLSL exposes only narrow source hooks.
No final-color relighting, material replacement, prototype patch, additional
atlas, LUT, pass or GPU resource is introduced. ModelFS ordering is unchanged.

Model update rebuilds its native draw commands only when the ready Globe
lighting variant changes. Inactive/loading/Planar/classification paths retain
native shaders. Primitive material PBR/unlit and normal availability continue
to decide whether directional lighting applies. Native resources retain native
ownership, while model uniforms borrow the current frame's SceneGIS resources.

Reconstruct actual ECEF position from eye position with inverse view, then use
the same geodetic altitude to Bruneton-sphere mapping as Globe. Do not apply
the model matrix to an already-world-space receiver. Direct source samples
transmitted primary irradiance normal to the light, scaled by the common
`surfaceRadianceScale`; the existing PBR BRDF supplies the material cosine.
Beer optical depth attenuates this source before base-layer and clearcoat
direct reflection. Explicit model lightColor remains an authored source
override, still attenuated by clouds. Emissive and indirect light are untouched
by cloud attenuation.

Default diffuse IBL uses physical sky irradiance and readable night irradiance
from the same SceneGIS LUT, converted to irradiance/pi in native IBL's domain.
Retain native Fresnel/multiple-scattering material weighting and IBL factors.
Explicit caller spherical harmonics retain precedence. Existing specular IBL,
including caller maps and native generated reflections, is retained: generating
a new physical sky reflection cube map is outside this bounded correction.
This limitation is explicit rather than claiming full environment-map parity.
No native environment-map object is replaced or destroyed.

`surfaceRadianceScale` now calibrates both Globe and default physical model
direct/diffuse lighting. Background, aerial, cloud and authored IBL scaling keep
their existing controls. Material normal maps, metallic/roughness, anisotropy,
clearcoat, emissive, alpha and native geometry-shadow derivation remain native.

### Geometry-shadow control

The owner explicitly requires Cesium's original shadow switches without any
additional SceneGIS switch. Remove the A11 showMoonShadows API/UI and its native
shadow-map/Globe shadow acquisition, automatic activation, guards and restore.
Do not add showShadows or a replacement alias. Native Viewer.shadows,
scene.shadowMap.enabled and per-receiver ShadowMode remain entirely caller-owned
through daylight, Moonlight, effect toggles and destruction. Primary light still
provides the native shadow camera's Sun/Moon direction when the caller enables
shadows. The sample does not automatically enable shadows, including its fixed
Moon observation. Existing cloud-shadow control remains independent.

## Integration and validation

SGP-0010 covers Model.js update, LightingPipelineStage.js source binding,
LightingStageFS.glsl direct source/IBL arguments, and
ImageBasedLightingStageFS.glsl diffuse source selection. All computation and
binding logic remains in SceneGIS-owned helpers. Generated shader JS and
barrels are regenerated, never edited.

Real-model GPU coverage passes for cloud direct attenuation, physical source/scale,
preserved emissive and indirect terms, explicit lightColor/SH precedence, warm
uniforms, disable/re-enable and borrowed-resource ownership. Caller-selected
shadow-off/on survives day/night, live changes and controller release. Native
lighting-stage and compiled readable-night/native-shadow regressions pass, as
do full build, generated types and type checks.

The owner accepts the restored model view on 2026-09-11. On that view, 29 native
OSM model draws at 1900x1150 increase median isolated GPU draw cost from 0.257
to 0.538 ms (12 paired observations); this is not whole-page frame time. No new
resource/pass is introduced, and specular IBL remains the explicit fidelity
limit above. Full evidence, static checks and final gate are recorded in the
[A16 review](../../../AgentDocs/atmosphere-clouds-effects/reviews/2026-09-11-a16g-model-environment-lighting.md).
