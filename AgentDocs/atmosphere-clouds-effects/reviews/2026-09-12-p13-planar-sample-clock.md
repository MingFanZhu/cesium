# P13 Planar Sample Clock Review

## Metadata

- Type: `review`; status: `accepted`; created: `2026-09-12`
- Reviewer/implementer: current Architecture / Execution role
- Target: [P13 plan](../plans/2026-09-12-phase-p13-planar-sample-clock.md)
- Predecessor: P12 `3a5710390b`
- Upstream-owned files / SGP delta: none

## Findings and disposition

- Fixed: Timeline was disabled and sample presets wrote manual solar directions.
  The page now uses native Viewer Clock/Timeline and existing astronomical mode
  with explicit reference longitude/latitude zero. Required constructor seed
  directions are retained; normal controller updates publish Sun/Moon directions.
- Fixed: the cloud time slider was independent of simulation time. One owned
  tick listener now publishes elapsed Clock seconds plus a user offset, with
  pause, multiplier, reverse and Timeline seek semantics matching Globe.
- Verified: day/low-Sun/night presets set paused Clock times without moving the
  camera. Native Timeline handles seek/pause; no duplicate settime subscription,
  custom timer or runtime celestial calculation is introduced.
- Verified: cleanup removes the sample tick listener before controllers/Viewer;
  existing repeated destroy remains safe. The Planar-only CSS reserves room
  above the bottom Timeline for the GUI and narrow-screen information card.

## Evidence

The focused [real-browser E2E](../../../Specs/e2e/scenegis-planar-environment-clock.spec.js)
passes in 26.6 s with external requests blocked:
native Timeline visible/selected through its actual DOM interaction; pause,
positive/negative multiplier and canAnimate; cloud offset/read-only time;
Sun/Moon updates at a seek; nighttime Sun below/Moon above the horizon;
day/night preset time coherence; unchanged camera; repeated destroy followed by
Clock tick with zero listeners, no cloud mutation, no Timeline DOM or page error.

The live owner page has a visible bottom UTC Timeline and right-side playback
controls. It starts paused at 10:30 UTC with cloud time zero. Latest camera near
(82043, -139462, 1369), coverage 0.24 and surface radiance scale 11.9 are restored,
including the matching GUI values. Scene ready/HDR remain true; errors are empty.

Scoped ESLint, formatting, whitespace and ownership audit pass. Full AgentDocs
Markdown lint passes; mandatory full Prettier reports only the same 16 unrelated
baseline files as P12. No engine, Shader, generated output, public API or upstream
file is changed. Existing astronomical solver qualification is reused; no full
build, types generation or repeated rendering/performance matrix is warranted.

## Limits and handoff

The 0°/0° astronomical reference is explicitly chosen by this sample, independent
of camera XY and CRS. It is not per-location astronomy across the global plane.
The default time range and paused state are deterministic example settings;
native timeline navigation remains available beyond that day. Moon-disc and
other deferred environment work are unaffected. No unresolved finding blocks
P13. Architecture self-review and owner-delegated visual review accept this
phase; the containing commit is the independent local checkpoint. No push or
successor activation is included.
