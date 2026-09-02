# Phase Plan: A9-G Globe Readable Night Skylight

## Metadata

- Plan type: `phase`
- Status: `complete; owner visual gate passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-31-phase-a8g-globe-qualification-delivery.md](2026-08-31-phase-a8g-globe-qualification-delivery.md)
- Frozen predecessor checkpoint:
  A8-G=`eee8a8bbb241c2e71dc68397a6b324faa670862c`
- Local checkpoint:
  A9-G=`f8d655ab75baf95b1421eddb35489a6a9d9dd62e`（not pushed）
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-09-02`
- Updated: `2026-09-02`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A9-G readable-night source discovery](../discussions/2026-09-02-a9g-readable-night-skylight-source-discovery.md)
- Decision:
  [ADR-0050](../../../Documentation/SceneGIS/Decisions/ADR-0050-globe-readable-night-skylight.md)
- Upstream patches: active `SGP-0008` and `SGP-0009`, both frozen/consume-only
- Open review findings: `none`
- Owner visual gate: `passed; exact 2x readable-night result accepted`

## Goal

Keep the accepted Globe terrain, volumetric clouds and ambient participating
media readable after the physical Bruneton Sun/sky contribution collapses at
night. Use one fixed blue-gray hemispherical source with a local solar-elevation
transition. Do not introduce a second style or pretend that the source is a
physical moon model.

## Frozen predecessor

- A8-G checkpoint `eee8a8bbb241c2e71dc68397a6b324faa670862c` is
  immutable.
- A2-A8 geometry, atmosphere LUTs, cloud material/transport, Beer shadows,
  temporal histories, quality tiers, HDR bloom/lens, depth authority, resource
  topology, public properties/defaults/ranges, imported assets and delivery
  pages remain frozen except for the single A9 Globe observation described
  below.
- `SGP-0008` and `SGP-0009` remain unchanged. No upstream-owned file is
  authorized to change.
- Planar formulas, shaders, resources, Test page and package behavior remain
  byte-for-byte outside this phase.
- No commit or push is authorized for Execution.

## Fixed lighting contract

### One source, no modes

Define one SceneGIS-owned Globe shader helper with the fixed source-domain
irradiance:

```glsl
const vec3 SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE =
    vec3(0.020, 0.036, 0.060);
```

The value is intentionally a conservative game-readable fill, not measured
moonlight. It is internal and fixed. A9-G adds no `showNight*`, intensity, color,
mode or style public property.

For a sample's actual Globe radial up `up` and the existing ECEF
`sunDirection`, use:

```glsl
float nightFactor = 1.0 - smoothstep(
    -0.2079116908,
    -0.1045284633,
    dot(up, sunDirection));
```

The constants are `sin(-12 degrees)` and `sin(-6 degrees)`. Day and civil
twilight at or above `-6 degrees` receive exact zero A9 energy; astronomical
night at or below `-12 degrees` receives the fixed full source. The factor must
be evaluated at the receiver/sample position, never from the camera or a global
Test-page elevation.

### Consumers

- **Globe terrain:** add the A9 source to sky irradiance before Lambertian
  reflection. Preserve the existing `0.5 * (1 + dot(normal, radialUp))`
  hemispherical orientation, `albedo / pi`, direct-Sun Beer attenuation and
  `surfaceRadianceScale`. Do not shadow the night source with the Beer atlas.
- **Globe cloud body:** add the same source in the current sky-irradiance domain
  before the existing `1 / (4*pi)` angular source, height profile, phase,
  multiple scattering and `cloudRadianceScale`. Direct Sun remains unchanged.
- **Cloud ground bounce:** evaluate the same source at the existing ground
  irradiance lookup position with its surface normal/up orientation before the
  accepted one-sample bounce.
- **Cloud-local haze:** add the same source to the existing scalar sky
  irradiance authority before haze coefficients and Beer composition.
- **Globe height fog:** add the source only to
  `sceneGISHeightFogAmbientSource` at the representative Globe sample. Keep
  `sceneGISHeightFogDirectionalSource`, its phase lobe and A5 shadow fraction
  physical-Sun-only.

Background sky radiance, aerial in-scattering, Sun disk, cloud shadows,
crepuscular rays, tone mapping, exposure and A7 are not consumers in A9-G.

## Authorized executable paths

- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeSurfaceLighting.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/AdvancedEnvironment/globe.js`
- the active extension/phase/review/ADR records

If the fixed helper can be placed in an already shared SceneGIS-owned shader
without changing every listed consumer file, use the smaller changed set. Any
need for controller, renderer, pipeline, upstream, generated, asset or Planar
changes must stop and return to Architecture instead of expanding scope.

## Execution steps

1. Add the fixed constant and local-radial night-factor helper to the existing
   shared Globe atmosphere source. Keep it compile-safe for Planar but call it
   only inside `SCENEGIS_GLOBE` branches.
2. Add the source once at each accepted terrain/cloud/ground-bounce/haze/fog
   ambient authority. Do not add final-color lifts or duplicate coefficients.
3. Add or amend the smallest actual-GPU fixture proving boundary factors,
   terrain and cloud/fog ambient consumers, direct-Sun/shadow independence,
   finite RGBA16F output and Planar identity.
4. Add one visible `A9 可读夜景` observation to the existing Globe `lil-gui`
   page. It must use the existing fixed 15E/45N camera family and a fixed time
   whose measured local solar elevation is at or below `-12 degrees`. The page
   may report the measured elevation and active fixed policy; it must not add a
   hidden style switch, retry, sweep or acceptance metric.
5. Run the minimum sufficient focused shader/controller, lint/format and direct
   visual checks, then write a review-ready handoff and stop.

## Required automated evidence

- Exact A9 factor is zero at/above `-6 degrees`, smooth and bounded inside the
  transition, and one at/below `-12 degrees`.
- A fixed no-direct-Sun Globe surface pixel is nonzero, blue-gray, finite and
  still responds through existing albedo and `surfaceRadianceScale`.
- A fixed no-direct-Sun cloud sample retains nonzero thickness-dependent
  structure; disabling the A9 source in a test mutation produces a distinct
  darker result.
- Globe height-fog ambient receives A9 energy while its directional lobe remains
  zero without physical Sun input.
- Changing the Beer shadow atlas cannot attenuate the A9 terrain/cloud ambient
  term.
- A day sample above `-6 degrees` is exact-identical to the pre-A9 formula, and
  the Planar product path is exact-identical.
- Output remains finite and within RGBA16F storage bounds. Resource/pass/program/
  texture/FBO/history/readback counts remain unchanged.

The existing SceneGIS environment controller aggregate and private A1 pipeline
need only be rerun if touched or if the focused GPU fixture exposes a lifecycle
regression. No full repository matrix, replay, convergence, hash suite, absolute
FPS gate or installed-package run is required because A9 adds no JS/API/resource.

## Project-owner visual gate

After Architecture code review, prepare one fixed Globe night state and leave
the page interactive. Acceptance requires:

- terrain imagery and relief remain dark but readable rather than black or
  gray-washed;
- clouds retain volumetric thickness and a cool ambient underside without a
  fake directional highlight;
- enabled height fog does not become a black slab or a bright blue veil;
- camera pitch/orbit does not change the lighting field at fixed time;
- there is no terminator ring, horizon seam, color clipping or viewport-wide
  fill;
- day and accepted sunset appearance remain unchanged.

The physical black background sky is not a failure in A9-G. Stars, moonlight,
night sky radiance, city emissive content, local lights and Model/3D Tiles
lighting are separate future decisions.

## Execution results — 2026-09-02

- Added the fixed source and local-radial factor to the shared Bruneton source;
  only `SCENEGIS_GLOBE` consumers invoke it.
- Added it before Lambertian terrain reflection, cloud angular transport,
  ground bounce, cloud-haze composition and height-fog ambient normalization.
  Direct Sun and every Beer/directional path remain separate.
- Added one existing-Spec-file actual-GPU fixture. Final-source command:
  `npm run test -- --includeName "adds fixed Globe readable-night irradiance only to ambient domains on the actual GPU" --production --failTaskOnError`
  returned `TOTAL: 1 SUCCESS` on Chrome 152 with process exit `0`.
- Added one `A9 可读夜景` action to the existing Globe `lil-gui`. Its fixed
  15E/45N, `2026-06-21T22:00:00Z` observation measured Sun elevation
  `-20.120 degrees`, stayed `ready · HDR`, and reported zero browser/render
  errors.
- Public API, uniforms, controller/renderer state, passes, programs, commands,
  textures, FBOs, histories, readback, assets, requests, dependencies and GPU
  bytes changed by exactly zero. Upstream-owned paths, generated tracked files,
  SGP scope and Planar output also changed by zero.

## A9-AR-001 owner brightness correction — 2026-09-02

The first owner gate rejected only the absolute night-fill magnitude: the
result remains too dark. Architecture preserves the accepted blue-gray ratio,
local solar transition, all five consumers and every source/resource boundary,
and authorizes one exact source-only calibration:

```glsl
const vec3 SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE =
    vec3(0.020, 0.036, 0.060);
```

This is exactly `2x` the first reviewed source. Execution must change the shared
constant and the existing focused fixture's exact authority/mutation only,
repeat that fixture plus focused static checks, then perform one fixed A9 night
observation. No alternate coefficient, parameter sweep, public intensity,
transition/consumer change or new test is authorized.

## Stop conditions

Execution stops and reports to Architecture if the implementation needs a new
uniform/public property, upstream hunk, SGP, generated-file edit, resource,
Planar change, final-color lift or camera-derived lighting input. After the
review-ready handoff, no owner gate, checkpoint, push, A10 or Planar work is
inferred.

## Completion criteria

- ADR-0050 source-domain and consumer contracts are implemented without scope
  expansion.
- Focused automated evidence and one fixed direct observation pass.
- Architecture closes all findings and the project owner explicitly accepts the
  prepared night result.
- Architecture creates one isolated local A9-G checkpoint before any successor
  phase is designed or activated.

## A9-AR-001 execution result — 2026-09-02

Execution applied the exact 2x constant and changed no consumer, transition,
Test state or other shader. The existing actual-GPU fixture passed `1/1` on
Chrome 152 while retaining day/Planar exact identity, Beer independence,
ambient-only fog and finite storage. The single unchanged fixed observation was
`ready · HDR` at Sun `-20.120 degrees` with zero browser/render errors; terrain
and cloud layers are visibly more readable, pending owner judgment.

## A9-AR-001 Architecture closure — 2026-09-02

Architecture confirmed that the correction changes only the shared private
source and the existing fixture's exact mutation authority. An independent
production GPU rerun passed `1/1`; `git diff --check` passed with retained line
ending warnings only. The same fixed owner page remained `ready · HDR` at Sun
`-20.120 degrees`, with no browser warnings/errors and no visible viewport fill
or seam. The finding is closed and the owner re-gate is open. No checkpoint,
push, A10 or Planar work is authorized before explicit owner acceptance.

## Project-owner acceptance — 2026-09-02

The project owner reviewed the corrected fixed night state and explicitly
accepted its brightness. A9-G therefore meets its final visual completion
criterion. Architecture may create the isolated local phase checkpoint before
activating the successor Globe phase; no push is inferred.
