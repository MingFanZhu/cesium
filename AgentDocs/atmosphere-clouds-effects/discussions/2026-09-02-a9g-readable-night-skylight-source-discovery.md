# A9-G Readable Night Skylight Source Discovery

## Status

- State: `resolved; A9-G activated`
- Date: `2026-09-02`
- Predecessor checkpoint:
  `eee8a8bbb241c2e71dc68397a6b324faa670862c`
- Related decision:
  [ADR-0050](../../../Documentation/SceneGIS/Decisions/ADR-0050-globe-readable-night-skylight.md)
- Related phase:
  [A9-G phase plan](../plans/2026-09-02-phase-a9g-globe-readable-night-skylight.md)

## Owner decision

The project owner chose to continue the Globe-first track and implement the
previously discussed conservative blue-gray night skylight before any 3D Tiles,
moon or city-light work. There is one product result only: `readable`. A second
physical/cinematic style, a mode enum and a runtime style switch are explicitly
out of scope.

## Current source facts

- `SceneGISGlobeSurfaceLighting.glsl` evaluates Bruneton Sun and sky irradiance,
  applies cloud transmittance only to direct Sun, then maps Lambertian reflected
  radiance through `surfaceRadianceScale`. When the physical Sun/sky source
  collapses at night, Globe terrain becomes black.
- `SceneGISVolumetricClouds.glsl` obtains direct and sky irradiance from the same
  A2 atmosphere source. Its cloud-body sky source and ground-bounce source also
  collapse at night, so lighting terrain alone would create a new terrain/cloud
  mismatch.
- `SceneGISGlobeClouds.glsl` derives cloud-local haze from the same scalar
  irradiance authority. `SceneGISExponentialHeightFog.glsl` derives ambient and
  directional sources from the attenuated physical Sun. A readable night source
  therefore has to enter their ambient source domain, while directional fog and
  crepuscular rays remain Sun-only.
- A5 cloud shadows attenuate direct solar irradiance. An isotropic hemispherical
  night fill is not a second directional light and must not be multiplied by the
  Beer shadow atlas.
- The accepted `SGP-0009` Globe surface seam already provides Sun direction,
  Bruneton LUTs and `surfaceRadianceScale` to the SceneGIS-owned surface shader.
  A fixed shader-domain policy therefore needs no new FrameState field, uniform,
  upstream hunk or SGP.
- Cesium Models and 3D Tiles use their own PBR/image-based-lighting path. They are
  not consumers of the SceneGIS Globe surface shader and remain outside A9-G.

## Selected design

A9-G adds one fixed, directionless, blue-gray hemispherical irradiance source in
the same physical/source domain as A2 irradiance. The source is zero at local
solar elevation `>= -6 degrees`, reaches its fixed full value at
`<= -12 degrees`, and uses one cubic `smoothstep` between those boundaries.
Every consumer computes this factor from its own actual Globe radial up and the
existing ECEF Sun direction. Camera position, camera pitch and the Test-page
solar-elevation label are never lighting authorities.

The source is consumed by:

1. Globe terrain Lambertian sky irradiance, using the existing hemispherical
   normal/up orientation and existing `surfaceRadianceScale`;
2. Globe cloud-body sky irradiance and cloud ground bounce, before existing
   cloud angular transport and `cloudRadianceScale`;
3. Globe cloud-local haze ambient irradiance;
4. Globe exponential-height-fog ambient source only. Directional fog remains the
   attenuated physical Sun source.

Background atmosphere radiance, Sun disk, cloud shadows, crepuscular rays,
bloom/lens, exposure and tone mapping are unchanged. The result is deliberately
an engine-readable fill rather than a physical moonlight claim.

## Rejected alternatives

- Raising final HDR color or exposure would lift every source, destroy black
  levels and hide the missing-lighting cause.
- Adding a fake directional moon without an astronomical direction, phase and
  shadow contract would create a second moving light authority.
- Emissive city imagery/local lights solve a different night-content problem and
  do not make unlit natural terrain or clouds readable.
- Relighting resolved scene color would incorrectly affect Models/3D Tiles and
  violate the accepted A5 surface-consumer boundary.
- A public physical/readable mode or style enum is unnecessary after the owner
  selected one readable result.

## Activation conclusion

A9-G may change only SceneGIS-owned Globe shader consumers, their focused Specs,
the Globe direct Test observation and active records. It adds no public API,
resource, pass, command, texture, history, asset, runtime dependency, upstream
path, generated source or Planar behavior. Implementation returns to Architecture
review before any owner gate, checkpoint or successor phase.
