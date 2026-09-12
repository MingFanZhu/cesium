# Phase Plan: A10-G Globe Native Moon Composition

## Metadata

- Plan type: `phase`
- Status: `completed; Architecture approved; owner visual gate passed`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-09-02-phase-a9g-globe-readable-night-skylight.md](2026-09-02-phase-a9g-globe-readable-night-skylight.md)
- Frozen predecessor checkpoint:
  A9-G=`f8d655ab75baf95b1421eddb35489a6a9d9dd62e`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-09-02`
- Updated: `2026-09-02`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A10-G native Moon source discovery](../discussions/2026-09-02-a10g-globe-native-moon-source-discovery.md)
- Decision:
  [ADR-0051](../../../Documentation/SceneGIS/Decisions/ADR-0051-globe-native-moon-composition.md)
- Upstream patch: active `SGP-0008`, reused and narrowed to the same `Scene.js`
  environment-order seam
- Open review findings: `none`
- Owner visual gate: `passed`

## Goal

Make Cesium's existing caller-owned native Moon visible and correctly ordered in
the accepted SceneGIS Globe advanced environment. Preserve Cesium's Moon
position, orientation, physical size, surface texture, Sun-lit phase, culling
and Globe occlusion. Do not create a SceneGIS Moon approximation or moonlight.

## Required implementation

### Native Moon authority

Use the existing `scene.moon` object and its existing `Moon.update(frameState)`
command. The SceneGIS controller must not allocate, replace, destroy or mutate
that object. `scene.moon` may remain absent or hidden; a visible native Moon is
an allowed Globe configuration after A10.

### Environment ordering

In upstream-owned `packages/engine/Source/Scene/Scene.js`, reuse the existing
paired `SGP-0008` marker and move only its advanced-background invocation from
after the Moon/panorama block to immediately before the native Moon block. The
resulting active order is:

1. disabled native sky/atmosphere/Sun slots;
2. SceneGIS advanced background;
3. the cached native Moon command, at most once;
4. panorama and primary-world environment;
5. ordinary geometry;
6. existing SceneGIS pre-tone-mapping HDR composition.

When no advanced pipeline is attached, the moved call is a no-op and the native
Moon remains in its original relative position between Sun and panorama.

### Conflict policy

Remove only `scene.moon` from the Globe native-conflict predicate and update its
error text. Native `SkyAtmosphere`, SkyBox, Sun, Sun bloom, built-in bloom, Fog,
ground atmosphere and Globe lighting remain forbidden. Planar conflict policy
is byte-for-byte unchanged.

### Direct sample

Keep every existing A8/A9 fixed observation unchanged and Moon-hidden. Add one
Globe-only lil-gui Moon control that writes the existing
`viewer.scene.moon.show` property, plus one `A10 月亮夜景` observation at the
existing 15E/45N, 500 m, `2026-06-21T22:00:00Z` state. It must enable the native
Moon and derive the camera heading/pitch from the same Cesium Moon ephemeris so
the body is centered. The observation may disable clouds/height fog to expose
the body initially; the existing controls remain available for one direct cloud
occlusion judgment. No retry, sweep, replay, hash or pixel gate is added.

## Authorized paths

Product and upstream seam:

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/Scene/Scene.js` (`SGP-0008` only)
- `.scenegis/upstream-patches.json`

Focused Specs and direct sample:

- `packages/engine/Specs/SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlotSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `Test/AdvancedEnvironment/globe.js`

Persistent records may update the active extension README, this phase plan,
the A10 review, source-discovery discussion, ADR-0051 and Architecture summary.
No other executable path is authorized without Architecture review.

## Validation

- Amend the existing advanced render-slot ordering fixture to prove active
  `advanced-background -> native-moon -> primary-world -> geometry`, exactly one
  Moon execution, and unchanged inactive/detached behavior.
- Amend the existing Globe conflict fixture to prove a visible caller-owned Moon
  is accepted before asset mutation while the remaining native conflicts still
  fail before fetch/attachment. Retain Planar Moon rejection.
- Run the focused render-slot, pipeline and SceneGIS environment controller
  Specs needed by the changed ownership seam; do not run unrelated matrices.
- Run focused ESLint, Prettier, Markdownlint, `git diff --check`, engine `tsc`
  if the upstream JSDoc/type surface requires it, and the SGP audit for exactly
  one changed upstream-owned path under existing `SGP-0008`.
- Perform one fixed direct Globe Moon observation only after automated evidence
  passes. Record browser/render errors and the exact fixed state; do not infer
  owner acceptance.

## Resource and ownership budget

A10 adds zero SceneGIS programs, commands, textures, FBOs, histories, readbacks,
assets, requests or GPU bytes. Showing the native Moon may activate its existing
Cesium `EllipsoidPrimitive`, packaged texture and cache-owned renderer resources;
their ownership and destroy behavior are not transferred to SceneGIS. Public
SceneGIS API/default/range delta is zero. Upstream-owned delta is exactly one
existing `Scene.js` path under reused `SGP-0008`; generated delta and new SGP
count are zero.

## Out of scope

- directional moonlight, Moon shadows or changing `scene.light`;
- procedural Moon disk, alternate texture, higher-resolution asset or phase
  approximation;
- stars, Milky Way, auto exposure, local lights or emissive city content;
- Planar Moon/body/environment behavior;
- A9 readable-night coefficient or consumer changes;
- cloud, fog, A7 bloom/lens or tone-mapping recalibration.

## Stop conditions

Execution stops and reports if correct composition requires a second Moon
instance, new asset/resource, Moon command duplication, a new upstream path or
SGP, public API, moonlight, Planar change, final-color lift, depth workaround or
change outside the authorized files. After review-ready handoff, no owner gate,
checkpoint, push, A11 or Planar work is inferred.

## Completion criteria

- Architecture closes all implementation findings.
- The project owner explicitly accepts the fixed native Moon appearance and its
  behavior with the existing atmosphere/cloud controls.
- Architecture creates one isolated local A10-G checkpoint before activating a
  successor phase.

## Execution result — 2026-09-02

The existing `SGP-0008` background call now executes immediately before the
unchanged native Moon block. Globe accepts caller-owned visible Moon while all
other conflicts remain pre-fetch/pre-attachment failures; Planar Moon rejection
is unchanged. Focused results are render-slot `5/5`, private pipeline `7/7`, and
three conflict tests at `1/1` each on Chrome 152. The SGP audit reports one
current-delivery upstream path, generated status `0`, and no new SGP or
SceneGIS resource/API delta. One fixed browser observation showed the centered
native Sun-lit phase at derived azimuth `257.917 degrees`, elevation
`7.443 degrees`, with zero browser/render errors. Owner visual acceptance is not
inferred.

## Architecture review — approved for owner gate 2026-09-02

Architecture independently verified that the moved `SGP-0008` block remains a
single paired upstream seam immediately before the unchanged exact-once native
Moon command. Globe removes only Moon from its native-conflict predicate;
Planar and every other conflict remain fail-closed. Production focused runs
from `packages/engine` passed render-slot `5/5`, Globe Moon acceptance `1/1`
and Planar Moon rejection `1/1`. The upstream audit passed with one
current-delivery upstream-owned path, existing `SGP-0008`, generated status
`0`, new SGP `0`, and zero SceneGIS resource/API delta.

Architecture reloaded the direct sample and ran the single fixed `A10 月亮夜景`
observation. The caller-owned native textured crescent was centered above the
terrain horizon at azimuth `257.917 degrees`, elevation `7.443 degrees`, with
Sun elevation `-20.120 degrees`; the page remained `ready · HDR` with zero
warnings/errors. Enabling the existing cloud control retained the Moon inside
the existing cloud/HDR composition rather than drawing it as a final overlay.
The page was restored to the clouds-off fixed observation. Code review is
complete; body/phase appearance and interactive terrain/cloud occlusion remain
project-owner visual judgments, so acceptance is not inferred.

## Project-owner acceptance — passed 2026-09-02

The project owner inspected the prepared native Moon result and explicitly
reported that the visual gate passes. Architecture therefore closes A10-G with
no open finding. The phase-closing local commit containing this record is the
isolated A10-G checkpoint and remains unpushed. Directional moonlight, Moon
shadows, alternate Moon assets, Planar behavior and any successor phase remain
inactive until separately designed and authorized.
