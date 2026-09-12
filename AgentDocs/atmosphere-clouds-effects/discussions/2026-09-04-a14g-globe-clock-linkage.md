# Discussion: A14-G Globe Clock Linkage

## Metadata

- Type: `discussion`
- Status: `resolved; code approved; owner gate passed`
- Author: Architecture Agent
- Created / updated: `2026-09-04` / `2026-09-11`
- Base: `ccd5affdc426016215bb443664dc653bba945d94`
- Plan: [A14-G](../plans/2026-09-04-phase-a14g-globe-clock-linkage.md)
- Review: [A14-G](../reviews/2026-09-04-a14g-globe-clock-linkage.md)

## Source evidence

- `Test/AdvancedEnvironment/globe.js` initializes cloudTime=0 and only uses
  `bindNumber` for manual publication. All three observation functions set
  `viewer.clock.currentTime` and pause, but never publish corresponding cloud
  time. No Clock listener exists; destroy only removes the existing render
  and controller listeners. The animation widget is disabled, timeline kept.
- `SceneGISEnvironmentEffects.js` documents caller-owned cloud seconds,
  validates finite +/-1e9 values and uses the warm setter. ADR-0046 explicitly
  delegates simulation-time driving to the caller/sample and prohibits a
  second runtime time authority.
- Private renderer `updateFrame` computes wrapped displacement from
  `_cloudTime * _cloudWindSpeed`. Cloud body, Beer map and their histories
  consume the same `_cloudOffset`. Celestial authority separately consumes
  scene time. Linking this one public property covers the existing cloud
  motion consumers without shader changes.
- `CesiumWidget.render` calls Clock.tick before Scene.render(currentTime).
  Clock.tick always raises onTick after committing currentTime, including
  paused/canAnimate=false ticks. Native Viewer timeline scrubbing assigns
  currentTime and shouldAnimate=false. Scene.render invokes controllerHost
  update after preUpdate. Thus the page Clock listener precedes both lighting
  preparation and cloud passes for the same simulation instant.
- Globe `u_cloudStbnSlice` reads native frameNumber, intentionally not
  cloudTime. Temporal continuity uses cloudTime differences and the existing
  1-second bound; fast-forward/large seeks may legitimately reject history.

Graph search located the renderer/sample functions and native render entry.
The indexed snippet offsets are stale, so exact known files were inspected to
confirm current assignments and call order. This diagnosis needs no live-page
mutation and does not revisit the accepted A13 visual result.

## Decision and alternatives

Use a fixed initial-observation epoch plus explicit sample offset, publishing
from the native Clock onTick. Equal JulianDates then produce equal cloud time
for equal offsets, even after reverse or seek. Do not use accumulated frame
deltas, Date.now, render-frame count, or a shouldAnimate-only listener: they
either invent a second time authority or miss paused timeline seeks.

Do not alter the renderer to implicitly consume Scene time: that would change
the established caller-owned public contract and risk deterministic custom
applications and deferred Planar behavior. This task only completes the
existing Globe example's API assembly. General product automatic-clock modes
are neither necessary nor authorized.

The initial epoch keeps the current default cloud placement. Other existing
time presets will now select their corresponding deterministic cloud position,
which is the intended fix, not a density/shape change. No epoch reset on seek
or midnight. Extreme simulation dates still follow existing cloudTime range
validation; no speculative clamp or silent fallback is introduced.

One page-owned listener and lil-gui bindings are the entire added runtime
ownership. Product GPU resources, API, sampling and Planar remain unchanged.
The focused E2E test covers deterministic Clock/GUI/cleanup behavior; root owns
the later direct observation of visible cloud and shadow motion.

## Execution evidence

The absolute-time assembly follows the confirmed tick ordering without delta
accumulation or multiplier duplication. The real-page E2E passes forward,
reverse, paused seek and deterministic return plus real GUI and cleanup checks;
see [execution result](../reviews/2026-09-04-a14g-globe-clock-linkage.md#execution-result--2026-09-04).
One listener is removed before teardown, including initialization failure;
no product clock authority or sampling change was introduced. Native Clock
behavior is qualified, while the direct visible-motion observation remains
Architecture-owned. No new diagnosis or performance claim accompanies delivery.

## Independent conclusion

Architecture confirms the fixed-epoch caller assembly as implemented. The real
owner page now advances cloud position and ground shadows during playback and
tracks native timeline seeks even while paused. No second animation clock,
shader repair or change to the accepted A13 sample sequence is necessary.
Original page state is restored. The direct result supports code approval, not
an inferred owner pass; see [review](../reviews/2026-09-04-a14g-globe-clock-linkage.md#independent-architecture-review--2026-09-04).

## Owner closure — 2026-09-11

The owner explicitly accepts A14, closing the remaining manual gate. The
fixed-epoch sample assembly and its existing validation stand without a new
design or product change. The phase is completed in its isolated local
checkpoint; no successor or Planar work is activated. See
[owner acceptance](../reviews/2026-09-04-a14g-globe-clock-linkage.md#project-owner-acceptance--2026-09-11)
for the final disposition and retained limits.
