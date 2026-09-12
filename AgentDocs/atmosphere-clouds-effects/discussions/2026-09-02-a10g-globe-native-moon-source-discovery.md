# A10-G Globe Native Moon Source Discovery

## Status

- State: `resolved; A10-G activated`
- Date: `2026-09-02`
- Frozen predecessor: A9-G
  `f8d655ab75baf95b1421eddb35489a6a9d9dd62e`
- Decision:
  [ADR-0051](../../../Documentation/SceneGIS/Decisions/ADR-0051-globe-native-moon-composition.md)

## Owner request

After accepting the A9 readable-night brightness, the project owner requested
the Moon as the next Globe feature and specifically recalled Cesium's existing
Moon implementation. The intended result is a correct visible Moon body in the
accepted SceneGIS night pipeline, not a second procedural approximation.

## Source facts

`CesiumWidget` creates `scene.moon = new Moon()` for the default WGS84 Earth
skybox path. `Moon.update(frameState)` already owns the required astronomical
and visual behavior:

- `Simon1994PlanetaryPositions` supplies the Earth-centered Moon position;
- `IauOrientationAxes` supplies the date-dependent Moon orientation;
- `Ellipsoid.MOON` and the existing `EllipsoidPrimitive` preserve physical size;
- `Assets/Textures/moonSmall.jpg` is the existing packaged surface texture;
- `onlySunLighting=true` preserves the Sun-lit phase instead of inventing a
  uniformly emissive disk;
- `Scene.updateEnvironment` applies the existing culling volume and Globe
  occluder before executing the native Moon command.

The direct sample currently calls `configureNativeEnvironment`, which sets
`scene.moon.show=false`. The active Globe validator also rejects any visible
native Moon. Even if those two guards are removed, current `Scene.renderEnvironment`
executes the Moon before the opaque SceneGIS advanced background in `SGP-0008`,
so the later full-screen background covers it.

At the existing fixed A9 observer and time, 15E/45N, 500 m,
`2026-06-21T22:00:00Z`, the same Cesium ephemeris places the Moon at approximately
`7.315 degrees` elevation and `258.268 degrees` azimuth with a strongly lit
visible phase. The existing state is therefore suitable for an A10 owner
observation without changing the accepted A9 lighting time.

## Options considered

### Reimplement a Moon disk in the SceneGIS background shader

Rejected. It would duplicate ephemeris, orientation, phase lighting, texture,
angular size and occlusion already owned by Cesium, and would create a second
body authority.

### Allocate a second SceneGIS-owned `Moon`

Rejected. Although it would reuse the class, it would duplicate the primitive,
texture/program lifecycle and diverge from caller-owned `scene.moon` state.

### Reorder the existing advanced background around the native Moon

Accepted. Move the already registered `SGP-0008` advanced-background call from
after the Moon/panorama block to immediately before the native Moon block. With
no active pipeline the call remains an exact no-op and native ordering is
unchanged. With an active pipeline the advanced background renders first, then
the same cached native Moon command executes exactly once, followed by panorama,
the primary-world environment and ordinary geometry.

## Frozen boundary

- Globe validation permits caller-owned visible `scene.moon`; every other native
  conflict remains fail-closed.
- Planar validation continues to reject native Moon.
- The controller does not create, destroy, replace, hide, restore or otherwise
  own `scene.moon`.
- No `showMoon` controller property is added. Applications use the existing
  native `scene.moon.show` state.
- A10 adds no moonlight, Moon shadows, star field, exposure change, new asset,
  SceneGIS GPU resource, new SGP or generated file.
- Existing A9 readable-night irradiance remains the only night illumination
  source in this phase.

## Execution confirmation — 2026-09-02

The accepted reorder required no second body authority: the same cached native
Moon command now follows the existing `SGP-0008` background call exactly once.
The fixed Test observation uses the same Simon1994/ICRF-to-fixed authority as
native Moon and derives azimuth `257.917 degrees`, elevation `7.443 degrees` at
the assigned state. No Moon asset, light, shadow, resource, public API, Planar
behavior or new SGP was introduced.
