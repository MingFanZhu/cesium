# Phase Plan: A11-G Globe Moonlight, Directional Shadows, and Lunar Surface

## Metadata

- Plan type: `phase`
- Status: `active; Architecture assignment ready`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-09-02-phase-a10g-globe-native-moon-composition.md](2026-09-02-phase-a10g-globe-native-moon-composition.md)
- Frozen product predecessor checkpoint:
  A10-G=`6afba87af181f3cdb7a20aff09b81af11eb302f4`
- Deferred route:
  [P1 Planar integrated-medium restoration](2026-09-02-phase-p1-planar-integrated-medium-restoration.md)
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-09-02`
- Updated: `2026-09-02`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A11-G Moonlight/shadow/surface source discovery](../discussions/2026-09-02-a11g-globe-moonlight-shadow-surface-source-discovery.md)
- Decision:
  [ADR-0053](../../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md)
- Upstream patch: reuse active `SGP-0009`; no new SGP
- Open review findings: `none; implementation not reviewed`
- Owner visual gate: `blocked until Architecture code review`

## Goal

Deliver one coherent Globe night primary light: phase- and horizon-aware
readable Moon illumination for the existing SceneGIS directional consumers and
native scene geometry, camera-independent Moon-cast shadows over terrain,
3D Tiles and models, and a higher-resolution surface on the existing native
Moon. Preserve the A10 Moon object/ephemeris/orientation/phase authority and the
A9 readable no-Moon ambient.

## Required implementation

### Shared celestial publication

Extend the existing renderer frame update to compute actual Sun direction,
Moon ECEF position, observer-to-Moon direction, A9 night factor, Moon horizon
factor, Lambert phase, readable Moon RGB and the finite irradiance-weighted
primary direction exactly once per frame. Use geodetic surface position/radial
up, never camera view/right/up. Day primary output must preserve existing Sun
behavior; full night must use the Moon endpoint. Include primary direction and
energy in A6 cloud/shadow continuity so a time/light change invalidates stale
history while pure camera rotation at fixed position/time does not.

Expose Globe-only public properties:

- `showMoonlight=true`;
- `showMoonShadows=true`;
- `moonlightIntensity=1.0`, finite inclusive `[0,64]` relative scale.

Setters request render only and must not invalidate or reallocate A2-A7
resources. Planar execution remains an exact bypass.

### SceneGIS directional consumers

Keep actual Sun authority for background atmosphere/aerial scattering, native
Moon phase and A7 Sun lens gate. Use the shared primary direction/energy for
Globe cloud directional transport, A5 Beer atlas/rays and Globe surface direct
lighting. Add the Moon direct term before the existing final surface scale and
storage guard; A9 ambient remains additive and cloud Beer attenuation remains
single-authority. Do not add another cloud march, Beer atlas, history or
fullscreen relight.

Publish the Moon/primary surface fields through the current frame-local Globe
lighting record. Add only the minimal uniform accessors inside the existing
`GlobeSurfaceTileProvider.js` paired SGP-0009 hunk. Do not edit
`GlobeSurfaceShaderSet.js`, `GlobeFS.glsl` or `Scene.js` unless Architecture
reopens the boundary.

### Native scene light and shadows

Create one stable controller-owned `DirectionalLight`. When Globe Moonlight is
active, capture the caller's undefined/default `SunLight`, install the stable
object once, and update its direction/color/intensity in place from the shared
primary publication. Reject an initial custom non-`SunLight` before mutation.
External active replacement is a fail-closed controller error and must not be
silently overwritten.

For positive Moon contribution with both toggles enabled, snapshot and set
`scene.shadowMap.enabled=true` plus
`scene.globe.shadows=ShadowMode.ENABLED`. Reuse that exact native map and its
derived cast/receive commands; do not enumerate or mutate primitive/tileset
shadow modes. Restore captured state when the Moon contribution/toggle/lifecycle
releases ownership. Prior enabled values, external mutation, disable,
disconnect and re-enable must have direct lifecycle evidence.

### Native Moon surface

Add a deterministic importer for the exact pinned
`three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`
`color_large.webp`, its canonical provenance and NASA notice. Deliver it under
`Assets/SceneGIS/Environment/Moon/` and verify exact `2048 x 1024`, `213446`
bytes and SHA-256
`1709ba3b65991842cd84a8d338ef46ad942241ee056b1ac8aad0d3776edf7dbd`.

When a native Moon with public `textureUrl` exists, capture and replace only
that URL with the packaged `buildModuleUrl` value, then restore it under the
same ownership rules. Do not set `scene.moon.show`, replace/destroy the Moon,
touch `onlySunLighting`, or import displacement/normal payloads.

### Direct Globe sample

Add lil-gui controls for the three public A11 properties and one fixed
`A11 月光与月影` observation at 15E/45N, 500 m,
`2026-07-02T00:00:00Z`. Keep BaseLayerPicker and timeline. The observation must
show the native Moon plus deterministic terrain and a bounded local shadow
caster/receiver; the existing best-effort global-buildings action remains
available for 3D Tiles judgment. Add no replay, sweep, screenshot threshold,
retry, settling frame or inferred acceptance.

## Authorized paths

Product:

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- directly affected `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/*.glsl`
- `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js` (`SGP-0009` only)
- `.scenegis/upstream-patches.json` (SGP-0009 decision/writeback only)

Asset/delivery:

- `packages/engine/Source/Assets/SceneGIS/Environment/Moon/**`
- one focused `scripts/scenegis/import-three-geospatial-moon-asset.mjs`
- its focused script test if needed for tamper/atomicity authority
- `scripts/scenegis/verify-planar-packages.mjs`

Evidence/sample:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `packages/engine/Specs/Scene/GlobeSurfaceTileProviderSpec.js` only if the
  existing SGP uniform contract requires amendment
- `Test/AdvancedEnvironment/globe.js`

Persistent records may update the extension README/plan, A11 plan/review/
discussion, ADR-0053 and Architecture summary. Any other executable path
requires Architecture review before modification.

## Validation

1. Amend the frozen constructor/public contract for exact defaults, range,
   setter render requests, installed runtime/types and no A6 history reset.
2. Add one focused lifecycle fixture for stable light identity, day/night
   in-place values, prior state preservation, Moon texture URL, native shadow/
   Globe ShadowMode ownership, external mutation fail-closed, disable,
   disconnect, fresh re-enable and Planar bypass.
3. Add one focused actual-GPU fixture for phase/horizon/night endpoints,
   surface/cloud primary contribution, finite storage and unchanged day output.
   A compiled camera-direction or same-view-derived Moon mutation must fail.
4. Use one fixed native-shadow caster/receiver witness to prove camera pitch/
   heading changes do not move the world shadow while simulation-time changes
   may. Confirm one published native map serves Globe and ordinary
   3D Tiles/Model shadow modes; do not duplicate Cesium ShadowMap's own matrix.
5. Verify importer publish/verify/tamper behavior, exact asset provenance and
   dev/release/installed package delivery. Run engine `tsc` and the relevant
   build/type/package path because public API and packaged assets change.
6. Run focused ESLint/Prettier/Markdownlint, `git diff --check` and upstream
   audit. Report every changed upstream-owned path, SGP ID, generated status,
   public API delta and exact native/SceneGIS resource deltas.
7. After automated evidence passes, perform the one fixed direct observation
   and return review-ready. Do not infer owner acceptance.

## Resource and ownership budget

- New SceneGIS program/command/FBO/history/readback: `0`.
- New SceneGIS runtime asset: one `2048 x 1024` lunar color payload plus
  provenance/notice; native Moon owns its decoded texture.
- Native ShadowMap: reuse the Scene-owned object and existing four-cascade
  implementation; enabling may lazily allocate its existing 2048-square
  attachment and derived commands. Execution must report actual texture format,
  bytes and command impact rather than labeling them zero.
- No second ShadowMap, Beer atlas, celestial-body command or render slot.
- Public API delta: three Globe-only warm properties; no mode/style enum.
- Upstream delta: existing `GlobeSurfaceTileProvider.js` under reused SGP-0009
  only; total SGP-0009 path count remains exactly three, new SGP count zero.

## Out of scope

- lunar/solar eclipse simulation;
- Moon displacement, normal-map material, changed ellipsoid/angular size or a
  second Moon primitive;
- stars, Milky Way, city emissive, local lights, auto exposure or two night
  styles;
- a second directional light, second geometry shadow renderer or custom
  primitive/tileset traversal;
- Planar Moon/light/shadow/environment behavior or the preserved P1 candidate;
- A7 lens/tone-map recalibration and public native ShadowMap quality controls.

## Stop conditions

Stop and report if implementation requires a second ShadowMap/light/body,
`Scene.js`, a new upstream path or SGP, a generated-file edit, Planar execution,
displacement shader, new HDR pass/history, primitive collection mutation,
camera-derived light direction, silent external-state overwrite or product path
outside the authorization above.

## Completion criteria

- Architecture independently closes all implementation findings.
- Fixed owner observation shows a credible improved Moon surface and readable
  Moon lighting; camera-only rotation leaves terrain/3D Tiles/model shadows
  registered in world space.
- The project owner explicitly accepts the A11-G result.
- Architecture creates one isolated local A11-G checkpoint before activating
  P1 or any later phase.
