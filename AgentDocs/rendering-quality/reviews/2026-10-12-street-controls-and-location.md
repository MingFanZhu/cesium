# Street controls and UTC location review

- Type: `review`; status: `approved`; date: `2026-10-12`
- Owner / reviewer: current task, architecture and execution self-review
- Target: [standalone plan](../plans/2026-10-12-street-controls-and-location.md)
- Upstream-owned files / SGP: none

## Findings

- **Addressed / direct controls:** Bistro uses one current configuration, exports its
  actual settings and does not expose A/B or lighting-preset controls. Probe enable
  is independent of comparison mode. The separate panel module only assembles native
  controllers and existing environment parameters; no rendering algorithm is added.
- **Addressed / placement:** Globe model, cameras and probe frame use longitude 0,
  latitude 51.4779. Planar retains local geometry with the same astronomical origin.
  Default March 20, 2026 at 14:00 UTC is spring equinox day at Greenwich. Clock playback,
  pause and manual date/hour edits retain native semantics. Cloud time follows Clock.
- **Addressed / shared example:** the original Sponza comparison panel and June location/
  time stay on the reference path. Source materials, mesh data and renderer defaults
  are unchanged. Current authored Bistro light/effect values are retained.
- **Accepted / time meaning:** UTC is local standard GMT; the example explicitly does
  not apply British summer time to other selected dates. Civil noon is not claimed
  to be exact apparent solar noon. No geolocation/timezone service is introduced.

## Verification and limits

- Three E2E cases pass: Bistro Planar/Globe and shared Planar Sponza. Checks cover actual
  placement, absent comparison gates, bound IBL/exposure/bloom/AO/shadow values, same
  camera/time during parameter edits, date reset, Clock play/pause, export, navigation
  and destruction. Model triangles remain 2829226. No page/render error is observed.
- In-app preview shows the new ordered folders and March 20 Greenwich street, with
  time open and detailed groups collapsed for scanning. Screenshot is retained locally
  at ignored `Build/Specs/street-panel.jpg`. The owner's older rendering-quality gates
  remain independent; this UI/location maintenance does not claim a new quality gain.
- Scoped ESLint, Prettier and whitespace checks pass. AgentDocs Markdown lint passes;
  global AgentDocs Prettier retains 398 historical warnings, changed documents pass.
- No engine/build/type/asset changes; no repeated release build or GPU benchmark is
  warranted. Existing optional-effect costs and material limitations remain unchanged.
