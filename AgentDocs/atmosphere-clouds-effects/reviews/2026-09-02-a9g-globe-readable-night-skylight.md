# A9-G Globe Readable Night Skylight Review

## Status

- Phase: `A9-G`
- State: `accepted; closed`
- Reviewer: Architecture Agent
- Open findings: `none`
- Owner visual gate: `passed; exact 2x readable-night result accepted`
- Phase plan:
  [A9-G phase plan](../plans/2026-09-02-phase-a9g-globe-readable-night-skylight.md)
- Frozen predecessor checkpoint:
  A8-G=`eee8a8bbb241c2e71dc68397a6b324faa670862c`

## Review boundary

Review one fixed Globe readable-night hemispherical irradiance source and its
existing terrain, cloud-body, cloud-ground-bounce, cloud-haze and height-fog
ambient consumers. Confirm local radial solar transition, direct-Sun/shadow
separation, exact day and Planar identity, finite storage and zero resource/API/
upstream delta.

Do not review or accept moonlight, stars/background night radiance, emissive
city lights, exposure, local lights, Model/3D Tiles lighting, Planar adaptation
or any second night style as part of A9-G.

## Required review evidence

- Changed-path, upstream and generated-source audit.
- Source review of the single helper and each allowed ambient consumer.
- Actual-GPU boundary/day/night/Beer-independence/Planar evidence.
- Exact resource and API delta statement.
- Focused lint/format/diff checks.
- One fixed owner-facing Globe night observation after code review.

## Findings

No findings are open before the first Execution handoff.

## Execution handoff — 2026-09-02

The review target adds one fixed shared shader source/factor and five existing
Globe ambient/irradiance consumers: terrain, cloud body, cloud ground bounce,
cloud-local haze and height-fog ambient. It adds no final-RGB lift, directional
source, Beer coupling, public state or resource.

The focused actual-GPU fixture passed `1/1` on Chrome 152 and directly covers
the `-6/-12 degree` factor boundaries, terrain albedo/scale response, Beer
independence, cloud structure and A9-removal mutation, ambient-only fog, day
identity, Planar identity and finite RGBA16F storage. The fixed Test observation
reported Sun `-20.120 degrees`, `ready · HDR` and errors `0`; no automatic
visual acceptance is claimed.

Changed executable paths are the five authorized SceneGIS GLSL sources, the
existing `SceneGISEnvironmentEffectsSpec.js` and
`Test/AdvancedEnvironment/globe.js`. Resource/API/GPU-byte/upstream-owned/
generated-tracked/new-SGP/Planar deltas are all zero. The tree remains
uncommitted and unpushed.

## Architecture review — 2026-09-02

Architecture independently inspected every executable diff. The fixed helper
uses normalized existing radial/Sun authorities; terrain, cloud incident sky,
ground bounce, cloud haze and height-fog ambient each consume the source once.
Direct Sun, Beer attenuation, fog directionality, rays and final RGB remain
separate. No unauthorized JS, uniform, resource, upstream, generated or Planar
path changed.

The focused production GPU fixture was independently rerun and returned
`1/1 SUCCESS` on Chrome 152. The upstream patch audit passed with current
delivery upstream-owned entries `0` and generated status `0`; focused ESLint,
Prettier, Markdownlint and `git diff --check` also passed.

Architecture then opened the fixed `A9 可读夜景` state at 15E/45N and measured
Sun `-20.120 degrees`. The page remained `ready · HDR` with no browser warning
or error. The frame retained a dark terrain/horizon boundary and cool cloud
silhouettes without a bright blue veil, viewport-wide fill or visible seam.
Exact terrain readability and cloud/terrain contrast are deliberately not
inferred from this observation; they now belong to the project-owner visual
gate. With no code finding open, A9-G is approved for that gate.

### A9-AR-001 — Fixed readable-night source is too dark

Severity: medium. Status: closed.

The project owner inspected the prepared `Sun -20.120 degrees` state and asked
for a brighter result. This rejects only the fixed source magnitude; there is
no reported chromaticity, transition, consumer, camera-authority, fog, seam or
resource defect.

Replace only the private source constant
`vec3(0.010, 0.018, 0.030)` with the exact 2x calibration
`vec3(0.020, 0.036, 0.060)`. Preserve the reviewed blue-gray ratio,
`-6/-12 degree` factor, source-domain insertion points, day/Planar identity,
direct-Sun/Beer separation, public/resource/upstream/generated boundaries and
the existing Test observation. Amend the existing GPU fixture as necessary to
retain exact constant authority and demonstrate the night output increased
without changing day or Planar output. One fixed browser observation is
sufficient; coefficient sweeps and alternate values are prohibited.

#### A9-AR-001 execution handoff

The source constant and existing fixture authority now use the exact 2x value.
The focused production GPU fixture passed `1/1` on Chrome 152 and retains
day/Planar exact identity, Beer independence, ambient-only fog and finite
storage. The single unchanged fixed night observation was `ready · HDR` at Sun
`-20.120 degrees`, reported zero browser/render errors and showed more readable
terrain/cloud layers without changing chromatic balance. No other executable or
resource boundary changed; owner acceptance is not inferred.

#### A9-AR-001 Architecture re-review

Architecture verified the exact corrected constant and the unchanged local
solar-transition and consumer code. The focused production GPU fixture was
independently repeated and passed `1/1`; `git diff --check` also passed. In the
same fixed 15E/45N, Sun `-20.120 degrees` browser state, the page remained
`ready · HDR` with no warning/error and showed brighter terrain/cloud structure
without a viewport fill or seam. The finding is closed and the owner re-gate is
open; this review does not infer visual acceptance.

## Project-owner gate result — 2026-09-02

The project owner explicitly accepted the corrected readable-night brightness.
With `A9-AR-001` already closed and no remaining Architecture finding, A9-G is
accepted and this review is closed.
