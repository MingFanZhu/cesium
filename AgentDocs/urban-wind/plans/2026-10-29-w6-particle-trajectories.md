# W6: Independent marker dimensions and GPU trajectories

- Type: phase; status: completed; owner visual gate pending; 2026-10-29.
- Parent: [roadmap](2026-10-28-urban-wind.md); owner/reviewer: current engine task, self-review.
- Architecture review: confirmed; ADR-0203; upstream/SGP: none planned.
- Entry: V3 `9f58ccf4f3`; wind solver/concentration unchanged.

## Source facts and API

W5 composes generic particles with one four-attachment update per display batch;
intermediate integrated positions are not exposed. Its sprite width/length share
particleSize and a 1..5 draw-local aspect. Generic particles and VoxelPrimitive
have no suitable history protocol. Use a narrow wind-owned two-attachment state
and sample/copy commands rather than expand generic particle or solver APIs.
Reuse native Texture/Framebuffer/DrawCommand and existing wind integration/sampling.

- Owner supersedes historical compatibility: remove particleSize directly.
  Live particleWidth=1.4, particleLength=2.5 meters; particleWidthUnits="pixels"
  by default, optionally "meters". No legacy aspect or migration validation.
- showTrails=false; live trailDuration=4 completed simulation seconds (0,120],
  trailFade=1 exponent [0,8], particleOpacity=0.75 [0,1] for markers and trails.
  Immutable trailSegments=32, integer 1..128. At most 64 MiB owned particle/history
  textures including atlas padding; reject layouts exceeding budget/context size.
- RK2 substeps <= physical timeStep use the latest completed batch velocity,
  splitting at evenly spaced duration/segments sample boundaries. Store actual
  integrated positions in a GPU ring. If a batch exceeds retained duration,
  integrate the older interval without storing discarded history; bound copies
  by ring capacity. This remains a visual batch-field approximation, not scalar
  mass transport or a time-resolved intermediate solver snapshot.
- Render native depth-tested translucent ribbons along 3D history, with pixel or
  metric widths. Generation tokens break all rebirths. Reject sampled chords
  crossing solids/domain limits rather than draw through buildings. Tail age
  fades from completed simulation time. No screen accumulation or CPU position readback.
- Pause freezes; generation/reset/rewind clears. Hidden/missed updates consume
  time and discard stale history; re-show starts a fresh tail without catch-up.
  Duration changes restart only history sampling. Style edits retain state and
  never rebuild the solver. Lazy history allocations live until consumer destroy.

## Gate

GPU tests: independent dimensions/pixels/opacity, uniform and curved
advection, sampled positions/time/capacity, collision/outflow/lifetime token breaks,
pause/single-step/reset/rewind/hide, depth and destruction. Both-world city captures
show thin curved trajectories, controls and bounded compute/draw timing/memory.
Full build/release/types, scoped lint/docs, review and independent Chinese commit.
SDK documentation gives defaults, units, layout cost and sampling approximation.

## Completion

[Review](../reviews/2026-10-29-w6-particle-trajectories.md) approves the technical
gate: 15 development GPU cases, 34 related release cases, two city browser cases,
full build/types and isolated native draw/memory evidence. Owner clarification
removes historical compatibility. No next phase is active.
