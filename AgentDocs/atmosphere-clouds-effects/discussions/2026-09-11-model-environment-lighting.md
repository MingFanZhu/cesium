# Discussion: Model Environment Lighting and Shadow Ownership

## Metadata

- Type: `discussion`; created / updated: `2026-09-11`
- Author: Architecture Agent
- Status: `resolved; A16 implemented and accepted`
- Parent: [extension plan](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Diagnosis-time phase: [A15 cloud stability](../plans/2026-09-11-phase-a15g-cloud-edge-stability.md)
- Related decisions: [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md),
  [ADR-0053](../../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md)
- Successor: [A16 plan](../plans/2026-09-11-phase-a16g-model-environment-lighting.md)
  and [ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md).
  The diagnosis below records the pre-fix source. The owner authorizes the model
  correction and requires only native Cesium geometry-shadow switches, with no
  added SceneGIS switch. A15 is checkpointed separately at `4d1d122b1c`.

## Report and confirmed causes

The owner reports cloud shadows missing from models, geometry shadows present
under Moonlight but absent in daylight, and models following native solar
direction without the advanced environment's solar appearance.

### Cloud-shadow receiver is missing

`ModelFS.glsl` calls `lightingStage` after material/custom-shader evaluation.
`LightingStageFS.glsl` computes native PBR direct lighting, then adds emissive,
IBL and optional clearcoat. Neither the model shader nor its lighting pipeline
binds the SceneGIS Beer atlas or transmittance/irradiance LUTs.

The existing integration is explicitly Globe-only: `prepareGlobeLighting`
publishes `_sceneGISGlobeLighting`; `GlobeSurfaceShaderSet` and
`GlobeSurfaceTileProvider` inject the SceneGIS library and uniforms under
SGP-0009. `SceneGISGlobeSurfaceLighting.glsl` attenuates primary irradiance by
cloud transmittance before adding sky irradiance. ADR-0047 explicitly excludes
Models/3D Tiles from this initial physical surface consumer. Consequently,
enabling the native geometry shadow map cannot supply the missing cloud atlas
receiver to a model.

### Moon shadows deliberately override the native switch

`SceneGISEnvironmentEffects.js` captures the caller's light, shadow-map enabled
state and Globe shadow mode in `acquireGlobeCelestialLifecycle`.
`updateGlobeCelestialLifecycle` enables the existing native shadow map when
Moon contribution is positive and both `showMoonlight` and `showMoonShadows`
are true. Both controls default to true. It also enables Globe cast/receive;
per-model/tileset shadow modes remain caller-owned.

When Moon contribution disappears, `releaseMoonShadowLifecycle` restores the
captured values. Thus a page initialized with native shadows disabled gets
Moon shadows at night and returns to disabled shadows in daylight. This is the
ADR-0053 A11 behavior, not a separate Moon shadow renderer or spontaneous
activation by `ModelFS`. Any change to consistent explicit day/night geometry
shadow control must amend that lifecycle contract and retain caller ownership.

### Direction is shared, physical source and IBL are not

`updateGlobeCelestialAuthority` publishes a stable primary direction. During
daylight it deliberately preserves the captured native SunLight color and
intensity; it does not convert the physical atmosphere's irradiance into the
model's source. `UniformState` converts that controller-owned DirectionalLight
to `czm_lightDirectionEC` and `czm_lightColorHdr`, which native model PBR uses.
The solar direction is therefore connected; the apparent disconnect concerns
the energy/color/environment response.

`surfaceRadianceScale` belongs to Globe lighting under the current public
contract. The model does not consume this scale, the physical Sun attenuation
LUT, or the advanced sky irradiance. `ImageBasedLightingPipelineStage` instead
binds the model/tileset's existing IBL and `DynamicEnvironmentMapManager`;
the latter uses native `frameState.atmosphere`, not the SceneGIS sky renderer.
Fullscreen aerial/fog composition can still affect models, but does not replace
their material illumination.

## Read-only live evidence

The current owner page shows Cesium OSM Buildings in New York, medium/mixed,
cloud coverage 0.3, density 1, cloud radiance 2.8 and surface radiance 10.
Inspection preserves camera, time, controls and render loop; no comparison
toggle, injected shader, frame capture or GPU resource is needed for this
missing-consumer diagnosis.

- The active `scene.light` is exactly the controller-owned `DirectionalLight`:
  white color, intensity 2; automatic HDR light color is `(2,2,2)`.
- Automatic world light direction matches the published primary direction.
  Moon contribution is zero in this daylight state.
- `scene.shadowMap.enabled=false`, matching the captured false value;
  Globe mode is `RECEIVE_ONLY`, while the tileset is `ENABLED`.
- One distinct current building program has `LIGHTING_PBR`, `HAS_NORMALS`,
  `USE_IBL_LIGHTING`, `DIFFUSE_IBL`, `SPECULAR_IBL` and `CUSTOM_SPECULAR_IBL`.
  It has no custom light-color define, SceneGIS lighting source or SceneGIS
  shadow/surface uniforms. Its command has both cast and receive flags true.
- Tileset IBL factor is `(1,1)` and its enabled environment manager has both
  a radiance cube map and spherical harmonics. The sample remains ready with
  one controller and zero reported browser/render errors.

These observations exclude unlit material, absent normals, model-specific light
color override and disabled model cast/receive as causes in this reproduction.
Night switch behavior is established from the actual lifecycle source and
accepted ADR; no new night-view visual verification is claimed.

## Follow-up boundary

The following diagnosis-time follow-ups are resolved by the completed
[A16 phase](../plans/2026-09-11-phase-a16g-model-environment-lighting.md) and
[ADR-0054](../../../Documentation/SceneGIS/Decisions/ADR-0054-model-physical-lighting-and-explicit-shadows.md).
The owner explicitly requires only Cesium's original shadow switches and has
accepted the implemented model result. The bullets retain the original review
boundary; current results and limitations are in the A16 review.

- Add a narrow opt-in model lighting integration at the PBR stage, sharing
  SceneGIS's physical source and existing Beer atlas. Preserve metallic,
  roughness, normal maps, clearcoat, emissive and native geometry shadows.
  Account for the PBR BRDF's existing cosine term when adapting irradiance.
- Apply cloud attenuation to direct illumination; do not multiply the final
  `ModelFS` output, which would also darken emissive and unrelated IBL.
- Define advanced sky/IBL ownership and radiance calibration explicitly rather
  than treating Globe's Lambertian result as a complete model material.
- Resolve day/night geometry-shadow ownership in the public contract. Keep
  cloud transmittance and native geometry shadow controls distinguishable.
- Register any required upstream model integration seam before implementation;
  edit GLSL sources and pipeline generators, never generated shader JS.
- Future GPU coverage must distinguish direct cloud attenuation, retained
  emissive/IBL, native shadow toggles and day/night source behavior; include
  disable/destroy restoration and bounded model shader cost. No new automated
  test is run for this read-only diagnosis.
