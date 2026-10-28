# W5: GPU flow particles

- Type: phase; status: completed; phase: W5.
- Parent: [roadmap](2026-10-28-urban-wind.md); owner/reviewer: current task, self-review.
- Architecture review: confirmed; created/updated: 2026-10-28.
- ADR: 0102 / 0193; upstream files / SGP: none planned.

## Objective and source facts

Owner rejects the regular instantaneous lines. Replace the default wind display with sparse,
speed-colored directional GPU sprites. The existing generic particle primitive already owns
MRT state, instanced quads, depth/OIT and disposal, but its clock is Scene time. Wind exposes
completed simulationTime and reset generation through the public live field descriptor.
Graph search returns no recent wind/particle symbols; source inspection verifies these facts.

## Design and API

- Add immutable optional `SceneGISGpuParticleSystem.timeSource(): number`, absolute seconds.
  Default remains Scene time. Frozen values/picking do not integrate; rewind resets.
- `SceneGISWindVisualization`: `showParticles=true`, `showStreamlines=false`, immutable
  `particleCount=4096`; live `particleSize=0.65` meters and `particleOpacity=0.75`.
  Reuse existing mode/color controls and preserve explicitly requested legacy lines.
- Owned adapter samples the public GPU field; reset on generation change, clock from completed
  simulation seconds. RK2 visual advection substeps no larger than the physical timeStep use the
  latest completed field. This is a display approximation within each render batch, not exact
  time-resolved trajectories. No changes to solver, scalar transport or physical parameters.
- Deterministic volume seeding/recycling, bounded cell traversal rejects solid-crossing segments;
  no random velocity or turbulence. Draw-local short streaks orient by projected velocity, fade
  on recycle and respect native opaque depth. Particle density is not tracer concentration.
- Consumer owns only particle resources. Borrowed samplers use shader aliases because generic
  particles reserve u_sg names. No private producer access or CPU field readback.

## Steps and verification

1. Clock hook and Specs; wind adapter/shaders and display defaults.
2. Example particle controls and GPU memory reporting, SDK notes/ADR amendments.
3. GPU uniform advection, solids, clock/pause/reset, resource reuse/disposal; existing both-world
   depth tests; scoped lint plus full release/type checks for public API.
4. Actual Globe/Planar screenshots, run/pause/single-step/recreate/dispose, bounded timings.
5. Record review/results, close W5 and create a separate local Chinese commit.

## Risks

Snapshot advection varies slightly with compute batch for unsteady fields; it is not pollutant
transport. Billboards have no motion vectors and obey native OIT limitations. Final visual
acceptance belongs to the owner. No SDK/distribution changes or generated-file commits.

## Results

Implemented and verified; [review](../reviews/2026-10-28-w5-particles.md) records 16 passing GPU Specs, release/types, both-world visuals, measured performance and the fractional-debt UI correction. No scope or numerical-model change.
