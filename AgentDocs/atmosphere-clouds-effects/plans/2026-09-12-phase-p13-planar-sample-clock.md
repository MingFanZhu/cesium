# P13 Planar Sample Clock and Timeline

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P12 `3a5710390b`
- Upstream-owned files / SGP delta: none

## Contract and implementation

The owner requests the same Cesium Clock and bottom Timeline integration as the
Globe test page. Reuse Viewer Clock/Timeline and the existing PlanarEnvironment
`astronomical` mode, which consumes explicit host time and a WGS84 reference
point. The sample explicitly chooses longitude/latitude zero for its reference;
neither projected XY nor CRS names determine astronomical input.

Enable Timeline and add the same play/multiplier controls as Globe, retaining
its choice of no Animation widget. Start paused on a deterministic day with a
24-hour timeline extent. Day/low-Sun/night buttons set Clock time rather than
manual directions. Cloud advection uses seconds from the fixed initial epoch
plus the existing user-adjustable time offset, including pause/reverse/scrub.
Remove the sample-owned tick listener during existing idempotent cleanup.

Only sample assembly, scoped CSS/help text and a SceneGIS E2E are required.
No engine, shader, public API, celestial solver or coordinate contract changes.
The shared CSS amendment must apply only to the Planar page.

## Verification and exit

- One focused E2E: actual Timeline interaction, pause/play/reverse, cloud offset,
  time-driven Sun/Moon, presets, camera preservation and listener/DOM cleanup.
- Existing astronomical solver evidence is reused; no unchanged engine matrix.
- Inspect the live page with its latest owner camera/quality settings restored.
- Scoped lint/format, mandatory document checks and self-review; independent
  local checkpoint after acceptance, no push.

## Completion

Implemented within the sample-only boundary. The existing constructor still
receives its required manual Sun/Moon seed directions; astronomical mode replaces
the effective directions at the normal controller update using Viewer time.
The page starts paused at 2026-06-21 10:30 UTC, with an explicit 0°/0° reference.
The native timeline displays the full day; preset times are 10:30, 17:45 and
21:00 UTC. Clock seconds drive cloud motion plus the retained offset control.

The focused real-browser E2E passes (26.6 s), including actual native timeline
selection, forward/reverse/pause, canAnimate, cloud offset, day/night Sun/Moon,
camera preservation, idempotent destroy and zero remaining tick listeners/DOM.
Scoped lint/format and ownership checks pass. Full AgentDocs Markdown lint
passes; full Prettier retains the 16 unrelated baseline warnings, with changed
documents formatted. No engine/API/build change requires a new engine matrix.
Live layout is verified with the latest owner camera and cloud/brightness values
restored. See the [accepted review](../reviews/2026-09-12-p13-planar-sample-clock.md).
The containing commit is the independent local checkpoint; no push.
