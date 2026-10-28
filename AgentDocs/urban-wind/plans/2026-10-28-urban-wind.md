# Extension Plan: Local urban wind

- Type: extension; status: active; owner: architecture / current task.
- Created / updated: 2026-10-28; architecture review: confirmed (self-review).
- Discussion: [model](../discussions/2026-10-28-model.md); review: pending; ADR: 0193; SGP: none.

## Objective and boundaries

WebGL2 D3Q19 MRT + Smagorinsky LES, meter/second local Cartesian grid and static solids.
Fixed physical steps independent of display frequency. One producer owns GPU state. Globe ENU
and planar World differ only by rigid placement; consumers borrow the same completed field.
No private mesh extraction, depth-derived obstacles, per-frame full-field readback, Voxel metadata
rebuilding, SDK changes, distribution copying, WebGPU, moving solids or fluid/structure coupling.
Tracer is passive and dimensionless. Quantitative engineering accuracy needs independent validation.

## Source facts

Baseline `9ac687a4bc`, Cesium 1.144. ComputeEngine has one output and recreates FBO; owned particles
and PBF use persistent Framebuffer + viewport DrawCommand in normal update. GpuParticleSystem has
GLSL/uniform callbacks but Scene-time dt. VoxelProvider/Content needs typed-array tile metadata,
not a live texture. Build discovers JS/GLSL/Specs; generated files stay ignored. Existing fluid and
particle extensions remain independent. Graph omits recent symbols; source reads verified them.

## Roadmap

| Phase | Objective                                           | Entry                 | Exit                                                                           | Status                                         |
| ----- | --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| W1    | Solver, units, periodic grids, ownership/time       | Source/papers checked | Conservation, uniform/shear decay, GPU tests, 128×128×32 budget, review/commit | completed; [plan](2026-10-28-w1-solver.md)     |
| W2    | Static masks, geometry voxelization and boundaries  | W1 checkpoint         | Channel/wake/solid/oblique flow, limited grid comparison, review/commit        | completed; [plan](2026-10-28-w2-boundaries.md) |
| W3    | Tracer and shared volume/streamline/slice consumers | W2 checkpoint         | Transport/no-flux/depth/pause/lifecycle/query, review/commit                   | planned                                        |
| W4    | Both-world city example, SDK instructions           | W3 checkpoint         | Reproducible views, performance, release/types, review/commit                  | planned                                        |

## Risks and acceptance

Near-half relaxation at real air viscosity is a numerical risk, not permission to raise viscosity.
FP32 deviation populations reduce cancellation; actual Reynolds/grid limits must remain explicit.
Uniform inlet is not a measured atmospheric boundary layer. Stair-step solids, fixed LES and open
boundaries require grid/domain checks. 128×128×32 is a measurement target, not a performance promise.
Reject invalid parameters; never silently clip velocity or reset divergence. Consumers cannot step
the solver or destroy borrowed textures. Final evidence includes GPU ms/step, bytes, grid,
steps/frame and simulated/wall seconds; display FPS is insufficient. Each phase has its own local
Chinese commit. City visual acceptance remains with the owner.
