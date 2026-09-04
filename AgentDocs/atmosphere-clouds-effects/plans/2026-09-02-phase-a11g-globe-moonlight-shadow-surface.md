# Phase Plan: A11-G Globe Moonlight, Directional Shadows, and Lunar Surface

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; owner visual gate passed`
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
- Updated: `2026-09-04`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A11-G Moonlight/shadow/surface source discovery](../discussions/2026-09-02-a11g-globe-moonlight-shadow-surface-source-discovery.md)
- Decision:
  [ADR-0053](../../../Documentation/SceneGIS/Decisions/ADR-0053-globe-moonlight-shadow-surface.md)
- Upstream patch: reuse active `SGP-0009`; no new SGP
- Open review findings: `none; A11-AR-001 through A11-AR-007 closed`
- Owner visual gate: `passed 2026-09-04`

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

## Execution result — 2026-09-02

- Added the three warm public properties exactly as planned and retained
  `[0,64]`, request-render-only setter behavior, A6 history identity and Planar
  bypass.
- The renderer computes one camera-independent Sun/Moon/phase/horizon primary
  record per Globe frame. Surface, Cloud MRT, A5 Beer atlas/rays and the stable
  native `DirectionalLight` consume that record; actual Sun remains the
  atmosphere, native Moon phase and A7 lens authority.
- Lifecycle acquisition/restoration covers caller light, native shadow enable,
  Globe `ShadowMode` and native Moon texture URL. The packaged URL is resolved
  lazily at activation, avoiding a DOM dependency during bare CJS import.
- Imported the exact `2048 x 1024`, `213446` byte payload with SHA-256
  `1709BA3B65991842CD84A8D338EF46AD942241EE056B1AC8AAD0D3776EDF7DBD`
  plus provenance, NASA notice and MIT license. No normal/displacement payload
  was adopted.
- SceneGIS renderer topology delta is zero. Enabling the already Scene-owned
  native shadow map activates its existing four-cascade `4096 x 4096`
  depth-stencil atlas (about `67,108,864` bytes); the decoded native Moon color
  payload is `8,388,608` bytes, versus `131,072` bytes for the former
  `256 x 128` RGBA image.
- Final checks: controller `75/75`, A1 `7/7`, importer `2/2`, TypeScript,
  release build, installed-package/provenance verifier and upstream audit all
  pass. The one fixed browser observation is `ready · HDR`, Moon
  `21.467 degrees`, Sun `-20.763 degrees`, errors `0`, with native Moon and the
  bounded local caster/receiver simultaneously visible.

## Review-correction execution — 2026-09-02

- A11-AR-001: phase subtraction now uses fixed Sun and fixed Moon positions.
  The current-time fixture obtains `0.9326044744950956`, proves Lambert
  full/new endpoints `1/0`, and rejects the mixed-frame value
  `0.29384491398532053`.
- A11-AR-002/003: controller `time` is threaded into pre-resource and ready
  publication; render consumers retain that current authority. Atlas producer,
  cloud body and SGP-0009 surface receiver use the same primary direction,
  while actual Sun remains separately published for physical sky.
- A11-AR-004: lifecycle snapshots the exact Moon object and URL. Light, Moon
  URL, native ShadowMap enabled state and Globe ShadowMode restore only while
  their owned identity/value remains intact; external replacement/mutation is
  preserved and fails closed.
- A11-AR-005: amended actual-GPU evidence executes night surface/cloud and day
  identity endpoints. One native Model caster and Primitive receiver use the
  same Scene-owned ShadowMap/Globe shadow authority; camera-only rotation keeps
  the receiver result exact, while a time transition changes primary direction.
- Final bounded validation: primary/lifecycle `1/1`, night endpoint/native
  shadow `1/1`, Beer atlas `1/1`, controller `79/79`, A1 `7/7`, TypeScript and
  upstream audit pass. No SceneGIS resource, API, generated, new-SGP or Planar
  delta was introduced by the correction.

## Final correction continuation — 2026-09-02

- Added a distinct actual-Sun surface uniform through the existing SGP-0009
  hunk. Bruneton sky/A9 ambient use it, while direct surface irradiance and Beer
  transport retain `primaryLightDirection`.
- The lifecycle fixture now isolates light, Moon, native ShadowMap and Globe
  ShadowMode external mutations across independent acquisitions. Release
  restores only controller-owned identity/value, including the captured Moon
  URL, and never mutates a replacement Moon.
- Moon horizon endpoints are explicit: below horizon contributes zero; the
  fixed `21.467 degrees` Moon uses factor one. The native Model/Primitive
  witness moves the camera position by 250 m and recomputes its direction to
  the same receiver; both positions independently distinguish shadow off/on on
  the same Scene ShadowMap.
- Final results: primary/lifecycle `1/1`, compiled night/native shadow `1/1`,
  Beer atlas `1/1`, controller `76/76`, A1 `7/7`, and TypeScript exit `0`.
  Browser evidence is one fixed local witness at `ready · HDR`, Moon
  `21.467 degrees`, Sun `-20.763 degrees`, errors `0`; no historical cloud
  location is used after reload.

## A11-AR-006 isolated fixture correction — 2026-09-02

- The existing lifecycle fixture now creates and assigns one caller-owned
  native `Moon` with a deterministic caller URL before the first A11 update.
  This removes the hidden dependency on test order while preserving every
  ownership, fail-closed and release assertion.
- Exact results: isolated lifecycle `1/1`, exact compiled night/native-shadow
  filter `1/1`, and final controller `78/78`. The correction is Spec-only; no
  product, resource, API, Test page, Planar, upstream or SGP delta occurred.

## A11-AR-006/007 final execution — 2026-09-02

- A11-AR-006: the test-local deferred asset authority remains pending for every
  lifecycle re-acquisition after the initial eight requests. Independent
  light, Moon, native shadow and Globe ShadowMode cycles now reach their exact
  fail-closed assertions in isolated execution.
- A11-AR-007: `SceneGISCloudShadowFS.glsl` now places each global ECEF lattice
  ray on the Sun-facing cloud-top shell. The existing 200 km cap therefore
  bounds in-shell transport rather than the former 100 km radial approach plus
  transport. This corrects a frozen A5/A8 producer geometry defect revealed by
  A11 Moon elevation; cascade/resource/receiver/history topology is unchanged.
- One amended actual-GPU atlas fixture retains high-Sun output, proves nonzero
  finite atlas/receiver/packed ray length at Sun `27.019736617450597 degrees` and Moon
  `21.467 degrees`, and makes the old inflated-origin mutation return zero at
  the low-Sun endpoint.
- Final results: lifecycle `1/1`, Beer atlas `1/1`, compiled night/native
  shadow `1/1`, controller `79/79`. One fixed browser observation remains
  `ready · HDR`, errors `0`, at low Sun and the A11 Moon state; it does not
  search for pre-refresh cloud-shadow positions.
- The Sun endpoint uses fixed `2026-06-21T16:00:00Z`. Its product elevation is
  `27.019736617450597 degrees`; the former `26.725 degrees` record was only a
  stale label and did not change the bounded below-30-degree witness.

## A11-G project-owner acceptance — 2026-09-04

The project owner explicitly passed the prepared A11-G visual gate, including
the low-angle cloud-shadow and crepuscular-ray correction. Architecture closes
A11-AR-001 through A11-AR-007 with no open finding. The exact final Beer-atlas
GPU filter was independently verified as `1/1 SUCCESS`; the isolated lifecycle
filter also passed `1/1`. Earlier accepted build, type, asset/package and native
shadow evidence is retained without repeating unrelated validation.

The phase-closing local commit containing this record is the isolated A11-G
checkpoint. Current-phase upstream changes are confined to
`packages/engine/Source/Scene/GlobeSurfaceTileProvider.js` under existing
`SGP-0009`; generated changes and new SGP count are zero. No push, successor
implementation or Planar activation is included. The owner's newly reported
cloud grain is a separate follow-up, not a reopening of the accepted light and
shadow result.
