# W3: Passive tracer and shared GPU displays

- Type: phase; status: completed; date: 2026-10-28; owner: current task.
- Entry: W2 checkpoint `b86f621118`; architecture review: confirmed (self-review).
- Parent: [extension](2026-10-28-urban-wind.md); ADR: 0193; SGP: none expected.
- Review: [approved](../reviews/2026-10-28-w3-tracer-display.md).

## Source facts and API

Context.readPixelsToPBO, Buffer.getBufferData and Sync already support small asynchronous readback.
No Renderer patch is needed. PostProcessStage exposes scene color/depth; ordinary DrawCommand
depth-tests line geometry. Existing particles use Scene-time integration and Voxel needs tile
metadata: neither owns the required fixed wind step or a live concentration volume.

- Simulation owns a separate passive-scalar transport component, stepped once after each velocity
  step. Add construction tracerDiffusivity (m²/s), tracerSources, setTracerSources for live source
  edits, and borrowed concentrationTexture to getGpuField.
- Sources are explicit local spheres, rate in dimensionless tracer units per second per fluid cell;
  enable and source changes do not reset velocity. No physical pollutant calibration is implied.
- Conservative first-order upwind face advection plus centered isotropic diffusion; no-flux solid,
  wall and slip faces; clean open inflow / zero-gradient outflow; paired periodic faces.
- Enforce diffusion timestep bound and document transport CFL/low-Mach limits. No negative clamp.
- Public sampling shader/uniform adapter shares live velocity, solid and tracer texture identities.
- sampleAsync(localPosition) snapshots one nearest cell with PBO/fence, bounded outstanding queries,
  version/time and explicit destruction rejection. No full field CPU transfer.
- SceneGISWindVisualization is a primitive with a scene-owned post stage for volume/slice and
  GPU-integrated instantaneous streamlines. Volume ray ends at scene opaque depth; lines use normal
  depth testing. All display time uses completed simulation time; paused frames stay unchanged.

## Verification and risks

Test scalar mass conservation, diffusion, advection, blocked solid flux, source enable/reset,
async query lifecycle and shared identity; render small scene for depth/pause and both display paths.
Volume sampling remains bounded; no per-frame metadata or field upload. Full release/types after API
addition; scoped lint, architecture/code review and separate commit before W4.
First-order tracer is numerically diffusive and streamline integration is instantaneous, not a
Lagrangian pollutant model. Opaque depth is supported; transparent surfaces do not occlude volume.
