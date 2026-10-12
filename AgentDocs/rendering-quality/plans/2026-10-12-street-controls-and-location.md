# Street controls and UTC location

- Type: `standalone`; status: `completed`; date: `2026-10-12`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / reviewer: current task, execution and architecture self-review
- Previous checkpoints: R23 `f94d0d1766`, exposure attribution `d18b3f52ca`
- Related decision: ADR-0100; upstream files / SGP: none

## Scope and source facts

The owner requests direct advanced-environment controls instead of baseline/experiment
switches, and a UTC-local equinox placement. The Bistro and Sponza pages share
`Test/Rendering/PBR验收.js`; retain the unrelated Sponza reference behavior. Bistro
currently uses an ENU anchor (-75.596, 40.038), June 21 at 19:00 UTC, and two effect
presets plus lighting presets. Planar astronomy uses the same geographic origin.

Use Greenwich longitude 0, latitude 51.4779; default March 20, 2026 at 14:00 UTC.
The [Royal Observatory calendar](https://www.rmg.co.uk/stories/space-astronomy/space-astronomy-highlights-2026)
confirms this spring equinox date. UTC is Greenwich local standard time; the example
does not apply UK summer-time conversion to other selected dates or equate civil
noon exactly with apparent solar noon.

## Implementation and verification

1. Give Bistro a single current rendering configuration, with direct grouped controls
   following existing advanced-environment examples: time, atmosphere, clouds, fog,
   HDR/exposure, shadows, AO, reflections, indirect light, antialiasing and probes.
   Preserve prior effect/lighting defaults; no shader, engine or asset changes.
2. Reuse native controllers and the existing Clock synchronization, relocation frame,
   export and lifecycle. Keep manual probe capture explicit. No A/B gates in Bistro.
3. Set Globe placement and Planar astronomical origin consistently. Keep local asset
   geometry and camera coordinates. Export actual location, UTC date and settings.
4. Adapt the two Bistro E2E cases for direct control binding, geographic placement,
   date/time/pause, export and destruction. Run the shared Planar Sponza regression.
   Check the visible grouping and daylight frame; scoped lint/format and AgentDocs
   checks suffice for owned example changes. No full engine rebuild is needed.

Exit: requested controls and location work, tests pass, review records remaining limits
and the preview is shown to the owner. No new rendering-quality phase is activated.

## Delivery

Bistro now has one current rendering configuration and a dedicated development-only
panel assembly. Both-world E2E checks and the shared Planar Sponza regression pass
(three cases). Runtime verifies the actual Globe model origin and Planar astronomical
origin, not only exported labels. Controls, date/Clock pause, export and destruction
are checked. The in-app preview is refreshed at the requested spring Greenwich view.
No engine, asset, generated file, upstream file or SGP changes. See the
[review](../reviews/2026-10-12-street-controls-and-location.md).
