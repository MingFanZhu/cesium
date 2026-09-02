# A11-G Globe Moonlight, Shadow, and Surface Source Discovery

## Status

- State: `resolved; A11-G activated`
- Date: `2026-09-02`
- Frozen product predecessor: A10-G
  `6afba87af181f3cdb7a20aff09b81af11eb302f4`
- Decision:
  [ADR-0053](../../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md)

## Owner correction

The project owner rejected the accidental Planar successor route before P1 was
reviewed or accepted. The intended next Globe phase is Moon lighting, Moon-cast
directional shadows and a better lunar surface. “Moon shadow” explicitly means
directional Moon-light shadows on terrain, 3D Tiles and models, not a lunar
eclipse. The unaccepted P1 candidate is preserved outside committed delivery
and is not part of the A11-G baseline.

## Cesium source facts

- `Moon` already owns Simon1994 position, IAU orientation, `Ellipsoid.MOON`,
  Sun-only phase lighting, culling/occlusion and one mutable public
  `textureUrl`. Its default is `256 x 128` `moonSmall.jpg`.
- `Scene.light` defaults to `SunLight`. A `DirectionalLight.direction` is the
  direction in which light is emitted; `UniformState` exposes the opposite
  source direction and its color/intensity to Models and 3D Tiles.
- `Scene` owns exactly one native `shadowMap`. When enabled with a
  `DirectionalLight`, the shadow camera copies that light direction. Native
  derived commands already cover Globe, 3D Tiles and ordinary opaque model
  passes; Globe defaults to receive-only while 3D Tiles and Models default to
  cast-and-receive.
- The native shadow receive shader calls the original material shader first and
  multiplies final RGB by visibility. It therefore composes after the existing
  `SGP-0009` Globe surface function without a second surface hook.
- The A5 Beer atlas is volumetric optical depth, not geometry depth. It cannot
  replace native ShadowMap, but its existing directional producer can consume
  the same primary celestial direction at night without another atlas.
- The current renderer already computes ECEF Sun direction once with
  `Simon1994PlanetaryPositions` and
  `Transforms.computeIcrfToCentralBodyFixedMatrix`; the same fixed transform
  supports a camera-independent Moon authority.
- `SceneGISEnvironmentEffects` has established snapshot/restore and fail-closed
  lifecycle precedents for Globe terrain depth. Planar environment has a stable
  `DirectionalLight` precedent, but A11 uses stricter active identity validation
  rather than reasserting over external mutation.

## Reference asset facts

Pinned `three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`
uses `storybook-webgpu/assets/moon/color_large.webp` as an sRGB lunar color map.
It is `2048 x 1024`, `213446` bytes, SHA-256
`1709ba3b65991842cd84a8d338ef46ad942241ee056b1ac8aad0d3776edf7dbd`.
The source README credits NASA CGI Moon Kit and links NASA Images and Media
Usage Guidelines. The reference's displacement path depends on its custom
MoonNode/cotangent shader and is not compatible with Cesium native Moon through
a public texture-only seam.

## Decision

A11-G reuses native Scene light/shadow/Moon objects rather than cloning them.
It adds one stable primary celestial direction and energy publication: exact
Sun behavior at day, phase/horizon/night-weighted readable Moon at night. The
same publication drives SceneGIS directional cloud/surface transport and the
stable native `DirectionalLight`; the native shadow map is enabled only for a
positive Moon contribution and explicit `showMoonShadows`.

The lunar color asset is imported with exact provenance and set through public
`Moon.textureUrl`; Moon visibility remains caller-owned. No displacement,
normal-map shader, eclipse, second Moon, second geometry shadow renderer,
Planar behavior or exposure/local-light system is authorized.

## Confirmed integration surface

- Globe controller lifecycle and public properties in
  `SceneGISEnvironmentEffects.js`;
- one-time ECEF celestial publication, A6 compatibility and A5 directional
  reuse in `_SceneGISEnvironmentEffectsRenderer.js`;
- SceneGIS-owned atmosphere/cloud/surface/fog shaders directly consuming the
  primary light;
- one additional uniform read inside the existing upstream-owned
  `GlobeSurfaceTileProvider.js` SGP-0009 hunk;
- exact Moon asset importer/provenance/package verifier;
- the existing controller Spec and Globe lil-gui sample.

Any second ShadowMap, new render slot, new SGP, Moon primitive/material copy,
Planar execution or generated-source edit is an Architecture stop condition.
