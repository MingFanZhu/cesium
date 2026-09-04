# A11-G Globe Moonlight, Shadow, and Surface Review

## Status

- Phase: `A11-G`
- State: `approved; owner visual gate passed 2026-09-04`
- Reviewer: Architecture Agent
- Open findings: `none`
- Owner visual gate: `passed 2026-09-04`
- Phase plan:
  [A11-G phase plan](../plans/2026-09-02-phase-a11g-globe-moonlight-shadow-surface.md)
- Frozen product predecessor checkpoint:
  A10-G=`6afba87af181f3cdb7a20aff09b81af11eb302f4`

## Review boundary

Review the single Globe primary celestial-light authority, controller ownership
of one stable native scene light, reuse of the one native ShadowMap, exact
SGP-0009 surface publication, improved native Moon texture lifecycle and their
focused automated/direct evidence. Reject a second light/shadow/body system,
camera-derived direction, Planar execution, displacement shader, hidden night
style or unrelated A1-A10 recalibration.

## Required evidence

- Sun/Moon ECEF and phase/horizon/night calculations have one shared finite
  authority and stay invariant under camera-only rotation.
- Day directional output preserves the accepted Sun result; full night uses the
  Moon endpoint; no-Moon/new-Moon state retains A9 ambient without false direct
  energy.
- Terrain, Cloud/A5 directional transport and native scene light consume the
  same primary publication without another Beer atlas or raymarch.
- Native ShadowMap and Globe ShadowMode lifecycle preserve prior caller state,
  fail closed on external mutation and produce a fixed-world caster/receiver
  witness over camera pitch/heading changes.
- Native Moon object/show/orientation/phase ownership remains unchanged; only
  its captured public texture URL is replaced/restored, and exact asset
  provenance/package delivery passes.
- Audit reports public defaults/ranges, native and SceneGIS resource deltas,
  upstream-owned files, SGP-0009 path count, generated files and remaining
  visual risks.

## Findings

### A11-AR-001 — Moon phase mixes inertial and Earth-fixed positions

`updateGlobeCelestialAuthority` subtracts the Earth-fixed Moon position from
`sunInertialPosition`. The phase vectors therefore do not share a coordinate
frame. At the fixed A11 observation, an independent same-source calculation
gives Lambert phase `0.9326044744950956`; the implemented mixed-frame expression
gives `0.29384491398532053`. Keep Sun and Moon positions in one frame before the
phase dot product and add an exact fixture that rejects the mixed-frame
mutation.

### A11-AR-002 — Globe Beer-shadow receiver still follows the actual Sun

The A5 atlas producer and matrices now use `primaryLightDirection`, but the
Globe tile record still publishes the actual Sun through
`u_sceneGISShadowSunDirection`. `SceneGISCloudShadows.glsl` uses that uniform
for distance-to-cloud-top and local-elevation receiver logic. At night, atlas
and receiver rays therefore disagree. Give all A5 producer/body/surface
receiver calculations one primary-light direction while preserving a separate
actual-Sun uniform for physical sky irradiance. Stay inside the existing
SGP-0009 hunk and reject the old direction split with compiled actual-GPU
evidence.

### A11-AR-003 — Celestial state consumes the previous frame time

`ControllerHost` passes the current simulation `time` before Scene updates
`frameState.time`, but both controller callbacks discard that argument and the
renderer reads `frameState.time`. A direct timeline jump can therefore render
one frame with the new native Moon and the previous SceneGIS light/shadow
authority. Thread the current controller time into the one-per-frame celestial
publication and keep the owned light current while Globe assets are still
loading. The fixture must perform one time transition without writing private
`frameState.time` or resetting `_celestialFrameNumber`.

### A11-AR-004 — External-state ownership is not identity safe

The lifecycle snapshots only the Moon URL, not the Moon object. Replacing the
Moon with an object that carries the packaged URL can make release restore the
old URL onto the replacement. Shadow release also restores captured values
without first confirming the current values are still the exact states owned
by the controller. Bind texture ownership to the captured Moon identity and
restore each light/shadow/texture property only while its owned identity/value
is intact; otherwise preserve the external value and fail closed. Cover prior
true/false shadow states, light/Moon replacement, texture/shadow mutation,
disable, disconnect and fresh re-enable.

### A11-AR-005 — Required GPU and native-shadow witnesses are absent

The new fixture proves JavaScript direction equality after camera rotation, but
does not execute the planned night surface/cloud endpoint or a native
caster/receiver shadow result. Add the bounded evidence required by the phase
plan: correct phase/horizon/night endpoints on the compiled product, unchanged
day output, and one native ShadowMap caster/receiver whose world-space shadow
does not move under camera-only pitch/heading changes. Also prove that the one
Scene-owned map is the authority used by ordinary Globe and Model/3D Tiles
shadow modes; do not add a second map or a validation matrix.

## Execution handoff — 2026-09-02

The review candidate changes the SceneGIS controller/renderer and three owned
GLSL consumers, extends only the existing `GlobeSurfaceTileProvider.js`
SGP-0009 hunk, adds the focused Spec/Test evidence and imports one pinned Moon
color asset with provenance. There is no new render pass, program, FBO,
SceneGIS texture/history, public enum, upstream path or SGP.

Exact focused results:

- `node --test scripts/scenegis/import-three-geospatial-moon-asset.test.mjs`
  -> `2/2` pass;
- controller include -> `75/75 SUCCESS`;
- A1 private pipeline include -> `7/7 SUCCESS`;
- `packages/engine: npx tsc` -> exit `0`;
- `npm run build-release` -> exit `0`;
- installed package verifier -> pass, including engine/root Moon payload,
  notices, exact hash, bare ESM/CJS and public runtime/types;
- upstream audit -> exit `0`, current-delivery upstream-owned entry count `1`,
  generated status `0`.

The fixed browser observation at 15E/45N and
`2026-07-02T00:00:00Z` reports Moon `21.467 degrees`, Sun
`-20.763 degrees`, `ready · HDR` and zero errors. The Moon surface and bounded
local caster/receiver are in the same viewport. Remaining visual risk is the
owner judgment of night brightness, lunar surface quality and native shadow
contrast/stability; no acceptance is inferred.

## Execution correction handoff — 2026-09-02

The A11-AR-001..005 candidate now uses one Earth-fixed phase frame and the
current controller time. Fixed phase=`0.9326044744950956`; deterministic
mixed-frame mutation=`0.29384491398532053`; Lambert endpoints=`1/0`. The owned
DirectionalLight updates before assets are ready without private frame-time or
celestial-cache test mutation.

The SGP-0009 surface receiver now consumes `primaryLightDirection`, matching
the Beer producer and cloud body while the actual Sun remains independent.
Moon object/URL, light, ShadowMap enable and Globe ShadowMode restoration is
identity/value safe across prior false/true state, texture mutation, light/Moon
replacement, disable, disconnect and fresh re-enable.

Focused compiled evidence passes for night surface/cloud endpoints, unchanged
day output, producer/receiver Beer transport and the single Scene-owned native
ShadowMap. A Model caster and Primitive receiver produce different shadowed/
unshadowed pixels; camera-only rotation preserves the shadowed pixel exactly,
and the same map is retained across a time change. Final exact results:

- A11 primary/lifecycle fixture: `1/1 SUCCESS`;
- compiled night/native-shadow fixture: `1/1 SUCCESS`;
- controlled Beer atlas fixture: `1/1 SUCCESS`;
- controller: `79/79 SUCCESS`; A1: `7/7 SUCCESS`;
- `packages/engine npx tsc`: exit `0`;
- upstream audit: exit `0`, current-delivery upstream-owned=`1`, generated=`0`.

One final-source fixed page reload/click reports `ready · HDR`, Moon
`21.467 degrees`, Sun `-20.763 degrees`, browser/render errors `0`, with Moon
and local caster/receiver visible. No old cloud-shadow location was used as a
post-refresh witness. Architecture review and owner judgment remain pending.

## Architecture correction review — 2026-09-02

- A11-AR-001 is closed: both phase vectors now use ECEF, and the fixed
  `0.9326044744950956` authority rejects the `0.29384491398532053` mutation.
- A11-AR-003 is closed: current `ControllerHost` time reaches the renderer and
  updates the owned light before asset publication without private time/cache
  mutation.
- A11-AR-002 remains open. Changing
  `u_sceneGISShadowSunDirection` to the primary direction aligns the Beer
  receiver, but `SceneGISGlobeSurfaceLighting.glsl` also uses that same uniform
  as `globeSun` for `GetSunAndSkyIrradiance` and
  `sceneGISReadableNightSkyIrradiance`. The separately published actual Sun has
  no Globe surface uniform consumer. At the fixed Moon-up night this treats the
  Moon direction as a full solar atmosphere direction and suppresses the A9
  night factor. Add a distinct actual-Sun surface uniform while retaining the
  primary direction for A5 receiver/direct transport; test both authorities as
  deliberately different inputs.
- A11-AR-004 remains open as an evidence correction. The identity/value-safe
  release code is present, but the fixture replaces Moon, light and both shadow
  values simultaneously; validation exits on the Moon identity first, so it
  does not prove the claimed independent fail-closed light/shadow/Globe paths.
  Exercise those mutations separately in the same bounded lifecycle fixture.
- A11-AR-005 remains open. The native witness changes only the camera up vector
  while keeping position and view direction fixed, which is a roll change, not
  the required pitch/heading change. Reobserve the same fixed world receiver
  from a genuinely different camera position/direction. The fixture also lacks
  the assigned Moon-horizon zero/full endpoint; add that bounded authority
  without a sweep.

## Execution response to final correction — 2026-09-02

- A11-AR-002: SGP-0009 now binds distinct actual-Sun and primary-light surface
  uniforms. The production surface uses actual Sun for physical sky/night
  ambient and primary direction for direct irradiance and Beer reception. The
  compiled fixture holds actual Sun fixed while mutating only the primary
  receiver direction.
- A11-AR-004: light identity, Moon identity, `shadowMap.enabled` and
  `globe.shadows` are each mutated in separate acquisition cycles. Every path
  fails closed exactly once and release preserves the external value; the
  captured Moon URL is restored while a replacement Moon remains untouched.
- A11-AR-005: the fixture proves zero Moon contribution below the horizon and
  full horizon factor at the fixed 21.467-degree endpoint. The native witness
  observes one fixed receiver from two different camera positions/directions;
  both distinguish caster off/on while retaining the same Scene ShadowMap.
- Exact validation: primary/lifecycle `1/1`, night/native shadow `1/1`, Beer
  atlas `1/1`, controller `76/76`, A1 `7/7`, TypeScript exit `0`. One refreshed
  fixed browser witness is `ready · HDR`, Sun `-20.763 degrees`, errors `0`.
  It is deterministic local geometry and does not depend on recovering the
  project owner's pre-refresh cloud shadows.

## Execution response to A11-AR-006 — 2026-09-02

The existing lifecycle fixture now assigns a deterministic caller-owned
`Moon` and `caller-owned-moon.webp` URL before A11 activation. A bare Spec
Scene therefore supplies the same lifecycle prerequisite explicitly instead
of inheriting it from test order. The exact Architecture lifecycle command is
`1/1 SUCCESS`; the exact compiled night/native-shadow command is also
`1/1 SUCCESS`, not `0/0`; the final controller include is `78/78 SUCCESS`.
No product source or browser evidence changed.

## Architecture independent validation — 2026-09-02

- A11-AR-002 is closed: the surface shader now consumes the actual Sun for
  physical atmosphere/A9 ambient and the primary light for direct irradiance
  and Beer reception.
- A11-AR-004 is closed at source level: Moon texture, Moon/light identity and
  both native shadow values have independent fail-closed acquisition/release
  branches and independent fixture cycles.
- A11-AR-005 is closed at source level: the fixture contains the assigned Moon
  horizon endpoints and observes the same fixed receiver from genuinely
  different camera positions/directions using the same native ShadowMap.

### A11-AR-006 — Lifecycle fixture is order-dependent and fails in isolation

Architecture reran the exact focused command for `uses one camera-independent
Globe primary light and owns Moon shadow state`. It fails at
`capturedMoon.textureUrl = "external-moon.webp"` because `capturedMoon` is
`undefined`. `connectGlobeWithDeferredAssets` constructs a bare Spec `Scene`
and `Globe`; unlike Viewer assembly, it does not install a native `Moon`.
Therefore the fixture does not provide the prerequisite object whose texture
lifecycle it claims to validate, and the reported `1/1 SUCCESS` is not
reproducible in isolation. Install one deterministic caller-owned native Moon
in this fixture before activation, then prove the exact isolated include is
`1/1 SUCCESS` without relying on test order. Also rerun the compiled
night/native-shadow include and confirm it executes one test; Architecture's
first retry returned `0/0`, which is not acceptance evidence.

Architecture's continuation rerun confirms that installing the native Moon is
necessary but not sufficient. The exact isolated lifecycle include still
fails `0/1`: after the first fail-closed cycle, repeated disable/re-enable
starts fresh asset generations, while `connectGlobeWithDeferredAssets`
provides deferred requests for only the first eight assets. Subsequent fetches
therefore fail with `Cannot read properties of undefined (reading 'promise')`.
The four later assertions see that incidental resource error instead of the
assigned `scene.light`, `scene.moon`, `shadowMap.enabled` and `globe.shadows`
errors. Make the fixture's pending-resource authority valid for every exercised
acquisition cycle, then rerun the exact isolated include. Do not weaken or
replace the independent lifecycle assertions.

### A11-AR-007 — Low-angle cloud-shadow producer exhausts its range before cloud entry

The project owner reports that Globe cloud shadows and crepuscular rays vanish
below approximately 30 degrees. Direct final-source inspection reproduces the
boundary independently of Moon selection. At Sun elevation `32.008 degrees`,
the high-tier 1536 by 1536 Beer-shadow atlas has 215,308 positive optical-depth
pixels and maximum `11.15625`. At `26.725 degrees`, every channel of every atlas
pixel is exactly zero. At that failing Sun state, `nightFactor=0`,
`moonContribution=0`, primary direction equals actual Sun direction, primary
scale is `(1,1,1)`, and both cloud-shadow/ray publication flags remain true.
The fixed A11 Moon endpoint at `21.467 degrees` reproduces the same all-zero
atlas with a positive Moon contribution of approximately `0.93259`.

The producer constructs each ray on a sphere whose radius is cloud top plus
half of the 200 km maximum shadow distance, so it starts 100 km radially above
the cloud shell. It then caps the complete ray distance at the same 200 km.
The transit to cloud entry is approximately `100 km / sin(elevation)` and
therefore reaches the complete 200 km allowance at exactly 30 degrees; below
that angle `segmentEnd <= segmentStart` and the producer writes zero. The
crepuscular-ray view integration consumes this atlas, so it disappears at the
same boundary.

Decouple the numerical ray origin from the bounded in-cloud traversal. Start
the producer at the Sun-facing cloud-top shell intersection (with only a
bounded numerical epsilon if required), and apply the 200 km cap to useful
cloud-shell traversal rather than empty approach distance. Preserve the global
ECEF light-plane lattice, fixed primary-light direction, three cascades,
resource sizes and receiver contract. Do not hide the defect by increasing the
maximum distance, adding an elevation threshold/fade, or switching back to a
camera-derived light. Add one bounded actual-GPU low-angle witness that rejects
the old inflated-origin mutation, proves nonzero finite atlas content at the
fixed 26.725-degree Sun and 21.467-degree Moon endpoints, and proves the
existing high-Sun endpoint remains unchanged.

## Architecture validation of A11-AR-006/007 correction — 2026-09-02

- A11-AR-006 is closed. The exact isolated lifecycle command independently
  executes `1/1 SUCCESS`; later acquisition cycles retain pending resource
  promises and reach every assigned external-state validation branch.
- The A11-AR-007 product correction is source-correct: the producer now starts
  exactly on the Sun-facing cloud-top shell, and the old 100 km approach is
  retained only as a deterministic rejected mutation. The GPU run reaches and
  passes the positive atlas, receiver, crepuscular-length and Moon endpoint
  assertions.
- A11-AR-007 remains open for one evidence correction. Architecture's exact
  isolated Beer-atlas command executes `0/1`: the fixture uses
  `2026-06-21T16:00:00Z` but expects elevation `26.725 degrees`; the product
  calculation at that timestamp is `27.019736617450597 degrees`. Align the
  fixed timestamp and expected elevation (either retain 16:00 and its actual
  value, or use the exact observed 26.725-degree timestamp), then rerun the
  same isolated command to a genuine `1/1 SUCCESS`. No product or browser
  change is required for this continuation.

## Execution response to A11-AR-006/007 — 2026-09-02

- A11-AR-006: `connectGlobeWithDeferredAssets(true)` now returns an existing
  pending deferred promise for every request after the initial eight. The
  fixture's repeated disable/re-enable cycles no longer fail in resource setup
  and independently reach all assigned lifecycle conflicts. Exact isolated
  result: `1/1 SUCCESS`.
- A11-AR-007: the producer ray origin radius is exactly cloud-top radius; the
  former `u_sceneGISShadowRayOffset * 0.5` inflation is removed. The 200 km
  useful traversal bound, ECEF lattice, three cascades, atlas, receiver and
  history remain unchanged. This is recorded as an A5/A8 producer geometry
  defect first exposed by A11 low-angle Moon selection.
- The amended real-atlas GPU fixture keeps the existing high-Sun assertion,
  proves finite positive atlas optical depth, receiver optical depth and packed
  crepuscular length at fixed Sun `27.019736617450597 degrees` and Moon `21.467 degrees`,
  and deterministically rejects the inflated-origin mutation at low Sun.
- Exact final commands: lifecycle `1/1`, Beer atlas `1/1`, compiled
  night/native-shadow `1/1`, controller `79/79`. The bounded browser check is
  `ready · HDR`, errors `0`, for the existing 2.175-degree low-Sun view and the
  fixed A11 Moon view with clouds enabled. It does not infer owner acceptance.

The fixed low-Sun timestamp is `2026-06-21T16:00:00Z`; the compiled product
reports `27.019736617450597 degrees`. Execution corrects the stale
`26.725 degrees` expectation while preserving the same below-30-degree state
and every positive transport/mutation assertion.

## Architecture closure of A11-AR-007 — 2026-09-02

- Architecture independently reran the exact Beer-atlas filter on the final
  source. Chrome 152 executed `1/1 SUCCESS` in 70.737 seconds.
- The fixed `2026-06-21T16:00:00Z` endpoint now expects the compiled product's
  actual `27.019736617450597-degree` elevation. It remains below 30 degrees;
  the positive atlas, receiver optical depth, packed crepuscular length, Moon
  endpoint, high-Sun endpoint and inflated-origin rejection are unchanged.
- A11-AR-006 and A11-AR-007 are closed. No product change was made by the final
  evidence continuation. Architecture opens the owner visual gate only for
  confirming that cloud shadows and crepuscular rays remain visible at the
  fixed low-Sun and Moon endpoints; no acceptance is inferred.

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
