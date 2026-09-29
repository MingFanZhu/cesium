# P2 weather scope

- Type: discussion; status: resolved; date: 2026-09-29
- Owner: architecture/execution; parent: [extension](../plans/2026-09-29-gpu-particles.md)

The project owner accepted moving beyond P1 and selected broad aerial GIS atmosphere before street-level shelter. P2 delivers rain/snow, local near/far particle volumes following the observer without dragging overlapping world particles, wind and smooth intensity/type transitions, both worlds and an independent aerial district example. Existing atmosphere/height fog supplies optional distant haze in the example; weather does not install another fullscreen haze pipeline or seize environmental lighting.

Roof shelter, collision maps, splashes, wet materials, puddles and snow accumulation are deferred. Ordinary opaque depth testing remains. Quality is an explicit bounded particle budget, not automatic FPS-driven switching. P1 remains generic: initial pool filling and render-only styling are reusable capabilities; forces and trajectories stay in weather shaders.

Implementation enters [P2 plan](../plans/2026-09-29-p2-aerial-weather.md), with [ADR-0103](../../../Documentation/SceneGIS/Decisions/ADR-0103-aerial-weather.md).
