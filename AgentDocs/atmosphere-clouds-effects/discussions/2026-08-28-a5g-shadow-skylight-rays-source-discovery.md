# A5-G Shadow, Skylight, and Rays Source Discovery

## Status

- Date: `2026-08-28`
- State: `resolved by Architecture`
- Scope: Globe A5-G only; Planar deferred
- Decision: [ADR-0047](../../../Documentation/SceneGIS/Decisions/ADR-0047-globe-cloud-shadows-skylight-crepuscular-rays.md)
- Phase plan:
  [2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md](../plans/2026-08-28-phase-a5g-globe-cloud-shadows-skylight-rays.md)

## Question

After the accepted A4-G checkpoint, where should cloud optical-depth shadows,
atmosphere skylight and crepuscular rays enter Cesium without relighting the
already shaded resolved scene or copying the reference project's raw WebGL
runtime?

## Source facts

The fixed `three-geospatial` cloud source uses cascaded Beer shadow maps rather
than geometry depth shadows. Its atlas stores front depth, mean extinction,
maximum optical depth and a tail term; the ground receiver reconstructs bounded
optical depth and applies Beer-Lambert transmittance. Its aerial perspective
passes an accumulated cloud `shadow_length` into Bruneton sky radiance instead
of applying a radial blur.

The Cesium fork preserves that algorithm topology but also carries temporal BSM,
raw WebGL and PBO machinery. Those mechanisms are implementation containers,
not the physical source model, and are outside SceneGIS A5-G/A6 ownership.

Current Cesium source shows three relevant seams:

1. native `ShadowMap` creates geometry/depth derived commands and cannot encode
   volumetric Beer optical depth;
2. `GlobeFS.glsl` owns the imagery/material `color` immediately before native
   Globe lighting, so it is the only approved albedo consumer for A5-G;
3. `GlobeSurfaceTileProvider` uniform callbacks and
   `GlobeSurfaceShaderSet.getShaderProgram` can consume a narrow frame-local
   record without global or prototype mutation. `GlobeVS.glsl` already exposes
   position/normal varyings and needs no new patch.

The accepted Cloud MRT has two `RGBA16F` attachments. A third attachment would
raise the draw-buffer capability boundary. The distance alpha can instead carry
one validity bit and a quantized `[0, 200 km]` shadow length while preserving
exact `0/1` when the length is zero. Semantic decode/filter/repack is required;
packed values are never averaged directly.

## Resolution

- Build one deterministic current-frame SceneGIS Beer shadow atlas with two or
  three texel-snapped cascades, not Cesium native `ShadowMap`.
- Publish one explicit frame-local Globe lighting record and add the minimal
  three-file upstream seam tracked as `SGP-0009`.
- Light only the Cesium Globe surface from A2 Sun/sky irradiance; direct Sun is
  attenuated by the BSM while sky irradiance remains.
- Carry equivalent shadow length through the existing Cloud distance alpha and
  use Bruneton/fog directional integration for crepuscular rays.
- Keep Planar, temporal BSM, PBO, raw `_gl`, generic scene relighting, radial
  blur and bloom outside A5-G.

## Reference authority

- [`three-geospatial` cascaded shadow maps](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/clouds/src/CascadedShadowMaps.ts)
- [`three-geospatial` cloud transport](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/clouds/src/shaders/clouds.frag)
- [`three-geospatial` aerial perspective coupling](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/atmosphere/src/shaders/aerialPerspectiveEffect.frag)
- [`cesium-clouds-atmosphere` fixed fork](https://github.com/yuwoniu03/cesium-clouds-atmosphere/tree/1f38602b84ab5c3f2bc289f9e4464df3db917155)

No reference binary or runtime dependency enters the repository in this phase.
