# A4-G Reference Source Map and Provenance Audit

## Metadata

- Status: `active implementation authority`
- Date: `2026-08-27`
- Owner: Execution Agent
- Phase:
  [A4-G Globe reference-first integrated cloud core](../plans/2026-08-27-phase-a4g-globe-integrated-cloud-core.md)
- Decisions:
  [ADR-0040](../../../Documentation/SceneGIS/Decisions/ADR-0040-dual-world-advanced-environment-rendering.md),
  [ADR-0046](../../../Documentation/SceneGIS/Decisions/ADR-0046-dual-world-volumetric-cloud-core.md),
  [ADR-0049](../../../Documentation/SceneGIS/Decisions/ADR-0049-globe-hdr-bloom-lens-flare.md)
- Reference commits:
  [`cesium-clouds-atmosphere@1f38602b`](https://github.com/yuwoniu03/cesium-clouds-atmosphere/tree/1f38602b84ab5c3f2bc289f9e4464df3db917155),
  [`three-geospatial@b012ad06`](https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/clouds)

## Source map

| Capability                                | Cesium reference authority                                                                                                                                                                                  | Upstream algorithm authority                                                                                             | SceneGIS disposition                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Globe atmosphere and cloud incident light | `src/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js#getAtmosphereForClouds`, `src/AtmosphereFromThreeGeospatial/AtmosphereForClouds.js`, `src/ThreeGeospatialPipeline.js#_buildCloudFragmentShader` | `packages/atmosphere` Bruneton runtime called by `GetSunAndSkyScalarIrradiance`                                          | Retain accepted A2 Bruneton textures and functions; adapt the same scalar Sun/sky ownership into the Globe cloud source.                                                                                                                                                             |
| Geometry aerial perspective               | `src/AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js#init`, `Shaders/aerialPerspectiveEffect.frag`                                                                                                 | three-geospatial atmosphere aerial integration                                                                           | Retain accepted A2 linear/log resolved-depth implementation and `SGP-0008` pre-tone-map slot. Do not adopt reference ACES/gamma.                                                                                                                                                     |
| Cloud layer packing                       | `src/ThreeGeospatialPipeline.js#_getLayerVec4`, `#_getDensityProfileVec4`, `#_getIntervalHeights`, `#_buildCloudUniforms`                                                                                   | `packages/clouds/src/CloudLayer.ts`, `CloudLayers.ts`, `DensityProfile.ts`                                               | Adapt the four-lane layer/profile model behind the existing immutable SceneGIS presets; do not add public mutable layer arrays.                                                                                                                                                      |
| Weather and density                       | `src/ThreeGeospatialPipeline.js#getCloudFragmentShader`: `shapeAlteringFunction`, `sampleWeather`, `sampleMedia`                                                                                            | `packages/clouds/src/shaders/clouds.glsl`: same functions                                                                | Adopt the function topology for the compiled Globe path: cube-sphere weather coordinates, semi-circle coverage shaping, profile-weighted layer density, shape remap, height-dependent detail erosion and bottom-weighted turbulence. Keep the retained Planar source path unchanged. |
| View and Sun marching                     | `src/ThreeGeospatialPipeline.js#getCloudFragmentShader`: `marchOpticalDepthToSun`, `getRayNearFar`, `marchClouds`                                                                                           | `packages/clouds/src/shaders/clouds.frag`: `marchOpticalDepth`, `getRayNearFar`, `marchClouds`                           | Adapt bounded Globe shell intervals, perspective footprint/LOD, empty-space acceleration, Sun optical depth and Beer-Lambert segment integration into Cesium Renderer-owned MRT. Retain exact raw-depth presence and SceneGIS attachment encoding.                                   |
| Cloud lighting                            | `src/ThreeGeospatialPipeline.js#getCloudFragmentShader`: `phaseFunction`, `approximateMultipleScattering`, atmosphere-irradiance branch in `marchClouds`                                                    | `packages/clouds/src/shaders/clouds.frag`: `phaseFunction`, `approximateMultipleScattering`, `getCloudsSunSkyIrradiance` | Retain the accepted A4-AR-026 normalized dual-HG, eight phase-preserving octaves, `1/(4*pi)` height-weighted sky source and local-extinction powder. These are already the reference equations in the solar-normalized SceneGIS domain.                                              |
| Cloud-local haze and light shafts         | Reference `HAZE` branch is enabled by every quality preset; `approximateHaze` consumes cloud coverage, ground Sun/sky irradiance and optional shadow length                                                 | `packages/clouds/src/shaders/clouds.frag#approximateHaze`                                                                | A5-AR-012 supersedes the earlier rejection. Adapt the reference term in the existing Globe Aerial composite while retaining A3 as a separate generic height-fog control; add no pass, resource, public calibration, radial blur or Planar behavior.                                  |
| Composition                               | Cesium reference cloud stage and `AerialPerspectiveEffect` stage                                                                                                                                            | `packages/clouds/src/shaders/clouds.frag#applyAerialPerspective` and MRT outputs                                         | Adapt only optical ordering. Retain SceneGIS premultiplied cloud MRT, depth-aware resolve and one Cesium display-transfer authority.                                                                                                                                                 |
| Cloud temporal resolve                    | `src/ThreeGeospatialPipeline.js#_taaCapture`, `#_taaGetHistoryTexture`, `#_taaUpdateVP`                                                                                                                     | `packages/clouds/src/CloudsResolveMaterial.ts`, `shaders/cloudsResolve.frag`                                             | Retain the already accepted SceneGIS cloud-only history owner, reset key and Cesium framebuffer managers. Reject raw PBO and reference runtime texture wrappers. Stack-wide temporal policy remains A6-G.                                                                            |
| Beer shadow, ground shadow and rays       | `src/CloudShadowPass.js`, `ShadowResolvePass.js`, pipeline BSM helpers                                                                                                                                      | `packages/clouds/src/ShadowPass.ts`, `ShadowResolveMaterial.ts`, shadow shaders                                          | Source-mapped only. Deferred to A5-G; no program, pass, texture or uniform is adopted in A4-G.                                                                                                                                                                                       |
| HDR bloom and lens artifacts              | `src/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js`                                                                                                                                                  | `packages/effects/src/LensFlareEffect.ts`, threshold/features/composite shaders                                          | A7-G adopts the half-resolution threshold, blur, ghost/halo and additive HDR topology inside the existing SceneGIS slot. Reject the fork's public postprocess container, screen blend and duplicate display transfer.                                                                |

## Terrain-depth lifecycle authority

The fixed Cesium reference establishes
`viewer.scene.globe.depthTestAgainstTerrain = true` in both
`src/ThreeGeospatialPipeline.js#init` and
`src/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js#init`. This is the
required container contract for terrain-aware atmosphere and cloud clipping:
it keeps actual terrain depth in the main depth buffer consumed by later
post-processing. SceneGIS adopts that lifecycle prerequisite in A5-AR-016 while
retaining consume-only `SGP-0008`. The reference fork's fake-depth heuristics,
far-plane substitutions and terrain-independent cloud masking remain rejected.

## License and file provenance

`three-geospatial/packages/clouds/LICENSE` is MIT and identifies Shota Matsuda,
copyright 2024. Git history at the fixed commit attributes the adopted shader and
layer files to Shota Matsuda. The Cesium reference root `LICENSE` is MIT,
copyright 2026 cesium-clouds-atmosphere contributors, and explicitly identifies
three-geospatial as the cloud source. The product shader retains the exact commit,
paths, copyright and MIT notice before adapted code.

Audited source files are:

- `three-geospatial/packages/clouds/src/shaders/clouds.glsl`
- `three-geospatial/packages/clouds/src/shaders/clouds.frag`
- `three-geospatial/packages/clouds/src/CloudLayer.ts`
- `three-geospatial/packages/clouds/src/CloudLayers.ts`
- `three-geospatial/packages/clouds/src/DensityProfile.ts`
- `three-geospatial/packages/clouds/src/CloudsMaterial.ts`
- `three-geospatial/packages/clouds/src/qualityPresets.ts`
- `three-geospatial/packages/effects/src/LensFlareEffect.ts`
- `three-geospatial/packages/effects/src/DownsampleThresholdMaterial.ts`
- `three-geospatial/packages/effects/src/LensFlareFeaturesMaterial.ts`
- `three-geospatial/packages/effects/src/shaders/downsampleThreshold.frag`
- `three-geospatial/packages/effects/src/shaders/lensFlareFeatures.frag`
- `three-geospatial/packages/effects/src/shaders/lensFlareEffect.frag`
- `cesium-clouds-atmosphere/src/ThreeGeospatialPipeline.js`
- `cesium-clouds-atmosphere/src/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js`
- `cesium-clouds-atmosphere/src/AtmosphereFromThreeGeospatial/AerialPerspectiveEffect.js`
- `cesium-clouds-atmosphere/src/AtmosphereFromThreeGeospatial/LensFlareBloomStage.js`

The Cesium fork changes container, depth reconstruction, atmosphere wiring,
uniform naming and optional display correction. SceneGIS adopts its Cesium Globe
feature topology but uses the upstream three-geospatial equations where the fork
adds undocumented calibration, fake-depth heuristics, ACES/gamma, magenta
correction, or raw-WebGL ownership.

## Texture audit and decision

| Reference asset     | Decoded contract                   | Sampling contract                                   | File evidence                                                                       | Decision                                                                              |
| ------------------- | ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `shape.bin`         | `128x128x128`, R8, 2,097,152 bytes | linear, repeat XYZ                                  | Fork and upstream SHA-256 `EF65CF...E2519C`                                         | Not copied; opaque binary generation is not independently attributable at file level. |
| `shape_detail.bin`  | `32x32x32`, R8, 32,768 bytes       | linear, repeat XYZ                                  | Fork and upstream SHA-256 `C09112...956E4F`                                         | Not copied for the same reason.                                                       |
| `local_weather.png` | `512x512`, RGBA8 after decode      | mipmapped linear, repeat XY                         | Fork and upstream SHA-256 `B84DAE...08031`                                          | Not copied for the same reason.                                                       |
| `turbulence.png`    | `128x128`, RGBA8 after decode      | mipmapped linear, repeat XY                         | Fork and upstream SHA-256 `EC2B1B...910F9`                                          | Not copied for the same reason.                                                       |
| fork `stbn.bin`     | `128x128x64`, R8, 1,048,576 bytes  | nearest/linear implementation-dependent, repeat XYZ | Fork SHA-256 `51F52F...BA852`; no upstream clouds binary counterpart at this commit | Rejected: origin is not sufficiently documented.                                      |

SceneGIS retains its independently generated CloudCore payload and measured
channel contract: shape `128^3 RGBA8`, detail `64^3 RGBA8`, weather `256^2
RGBA8`, turbulence `64^3 RGBA8`, STBN `128x128x64 R8`; total binary bytes
`11,796,480`. Shape/detail/turbulence use repeat XYZ with trilinear mip sampling,
weather uses repeat XY with linear base sampling, STBN uses repeat XYZ with
nearest sampling, and occupancy uses explicit conservative R8 max mips. A4-G
changes no asset, texture count, format, dimension, sampler or GPU byte budget.

## Incompatible reference mechanics

- Public `PostProcessStage` ordering after display transfer.
- `scene.context._gl`, raw framebuffer/texture/PBO ownership and state mutation.
- Runtime public-network shader or texture fetch.
- Cloud-local ACES, exposure, gamma, magenta correction or a second tone mapper.
- Optional cloud `HAZE` as a second default height-fog medium.
- BSM, shadow-length, ground shadow and crepuscular coupling before A5-G.
- `three`, React, GUI and third-party texture wrapper dependencies.

The resulting A4-G adaptation remains inside SceneGIS-owned shader, renderer,
Spec, Test and AgentDocs paths. `SGP-0008` is consumed unchanged.
