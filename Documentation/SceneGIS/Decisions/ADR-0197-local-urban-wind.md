# ADR-0197: Local GPU urban wind

- Status: accepted through W4; date: 2026-10-28.
- Plan: [urban-wind](../../../AgentDocs/urban-wind/README.md); upstream files / SGP: none.

## Source facts and decision

Cesium 1.144 WebGL2 supports float MRT. ComputeEngine is single-target; owned particles/PBF
demonstrate persistent Framebuffer/DrawCommand execution in normal update. VoxelProvider requires
typed-array tile metadata, not live textures. Implement independent local air, not a PBF mode.
No SDK/distribution changes. Owned JS/GLSL/Specs use existing exports/buildRelease/type generation.

## Model

D3Q19: rest, six axis, twelve face diagonals; weights 1/3, 1/18, 1/36, cs²=1/3.
Equilibrium wi*rho*(1+3ci.u+4.5(ci.u)²-1.5u²). Use d'Humieres Appendix A orthogonal MRT
on f-feq, conserved density/momentum rates zero; e=1.19, epsilon/pi=1.4, q=1.2, cubic=1.98.
Five deviatoric stress modes share 1/tauEff. These rates do not imply the paper's optimized
stability claim, which also modifies equilibrium moments.

Smagorinsky: nuT=(Cs*dx)² sqrt(2S:S), default Cs=0.12, allowed 0..0.2 (zero for laminar tests).
Filter length one cell. Pi is deviatoric sum ci*ci*(fi-feqi).
tauEff=(tau0+sqrt(tau0²+18Cs²*sqrt(2Pi:Pi)/rho))/2. No noise forcing. Without van Driest damping,
this is an unresolved-wall interactive closure, not a validated wall-modelled LES. Isothermal,
weak compressibility; density is dimensionless ratio about one.

## Units and limits

Meters, seconds, m/s and m²/s; cubic width dx and fixed physical dt:
uL=u*dt/dx, nuL=nu*dt/dx², tau0=0.5+3nuL. Input Ma=sqrt(3)|uL|<=0.1.
Runtime acceleration may violate this: input validation is not a stability proof.
Require 0.5000001<tau0<=2; unsupported combinations throw without changing viscosity/dt.
FP32 stores g=f-w to reduce equilibrium cancellation. City air viscosity is near the stability
limit and requires explicit qualification; do not advertise quantitative engineering accuracy.
Local cell centers minimum+(index+0.5)dx, rigid modelMatrix to Globe ENU or planar World;
no scale/shear/implicit CRS conversion.

## Static geometry, faces and forcing

`SceneGISWindObstacleMask.fromExtrudedPolygons` accepts explicit simple XY rings, bottom/top
and a rigid geometry-local to simulation-local transform. Cell-center containment of closed prisms
is unioned with an optional horizontal ground half-space. Concave rings supported; holes,
self-intersections and scale rejected. Subcell geometry can be missed; no arbitrary scene mesh access.

Default horizontal faces classify prescribed flow-towards direction by inward/outward/tangent normal
as inlet/outlet/slip. Bottom is no-slip, top specular slip; periodic faces must be paired.
Building and wall links use halfway bounce-back. Open nodes are at outer cell centers.
Inlet reconstructs equilibrium at prescribed velocity plus the previous adjacent post-collision
non-equilibrium distribution; density is extrapolated. At mixed open corners inlet wins.
Outlet explicitly advances each population with the sum of one-sided convective fluxes at the
prescribed normal wind speed. This is a first-order absorbing approximation, not a reflection-free
or backflow-stable condition. Place recirculation well upstream and test downstream buffer length.

Optional constant physical acceleration uses Guo forcing in moment space:
`g' = g - M^-1 S M(g-geq) + (I-M^-1 S M/2)F`.
Collision velocity uses pre-collision momentum plus half force; published velocity subtracts half
force from stored post-collision momentum. Nonequilibrium stress includes the half-force correction.
No random perturbation, velocity clamp, viscosity increase or automatic divergence reset.

## Scheduling and sharing

Mount simulation once in Scene.primitives before consumers. Normal-render frame-number guard;
only producer owns stepping. maximumStepsPerFrame bounds work, never dt. Report Scene-time debt;
pause does not accumulate it. Explicit step works paused. Reset restores initial populations/time.
Layout/physics are construction snapshots; placement and display do not change local solution.

Atlas (i,j,k) maps to (i+(k%columns)*nx,j+floor(k/columns)*ny). Two sets of five RGBA32F
distributions, two collision draws (4+1) and one macro draw. getGpuField publishes current velocity
(xyz local m/s, w density ratio), solid texture, dimensions, columns, minimum, cellSize,
modelMatrix, generation/version and completed simulationTime. Cell-centered storage; consumers
use defined trilinear interpolation. Borrow descriptor/textures; resolve identities after swaps,
never mutate/destroy them. No per-frame full-field readback/upload or raw-GL simulation backend.

## Passive scalar and display

A separate transport pass follows every completed velocity step. Two RGBA32F atlases store
dimensionless concentration in R and outgoing scalar CFL in G. Conservative face-centered upwind
advection and centered diffusion use shared velocities; solids/walls/slip have zero normal flux,
periodic faces wrap and open incoming concentration is zero. Explicit diffusion requires
6Ddt/dx²<=0.5, leaving advective headroom under the low-Mach contract. No clipping of negative values.
First-order numerical diffusion and absence of a turbulent-Schmidt scalar closure limit accuracy.
Sources are at most 16 local spheres, uniform rate per fluid cell in tracer units/s. Source changes
do not reset flow; reset clears concentration. There is no pollutant mass calibration.

`SceneGISWindFieldSampling` supplies GLSL and uniform callbacks resolving live descriptor getters.
Cell-centered trilinear display interpolation renormalizes fluid-corner weights; inside solids or
outside the domain returns zero. This is not the conservative transport stencil.
`sampleAsync` snapshots one nearest cell through existing Context PBO and Sync interfaces, up to
16 outstanding calls; it reports snapshot version/time and rejects on producer destruction.

`SceneGISWindVisualization` owns its PostProcessStage and ordinary translucent line command.
Volume uses deterministic midpoint ray samples, concentration opacity and speed/concentration
colors. Ray end is clipped to scene opaque depth; transparent surfaces are not occluders.
Horizontal slice uses the same field and opacity. GPU midpoint-integrated instantaneous streamlines
stop at solids/domain bounds. They do not advance particles or represent pollutant trajectories.
No wall-clock animation, repeated simulation, Voxel metadata rebuilding or per-frame field transfer.
Destroy consumers before producer; scene collection destruction also releases the stage and lines.
Stage enable changes publish at Scene.preUpdate, before native post-process allocation/selection.
Primitive update occurs later and must not change that frame's active post-process chain.

Optional GPU instrumentation owns at most four pending EXT_disjoint_timer_query_webgl2 queries.
It wraps only the full fixed-step batch, reports milliseconds/step plus batch size/version and never
blocks for results. Unsupported extension is explicit, disjoint results are discarded, external
queries are not nested. The helper accesses WebGL only for timer objects; all numerical resources
and commands remain native Renderer objects. Reset/destroy clears pending measurements.
Reset cancels already queued work; explicit step calls after reset execute on the restored state.

Public API, reproducible city evidence and SDK usage are documented in [UrbanWind](../UrbanWind.md).

## W5: GPU flow particles

The W5 storage/style implementation below is superseded by ADR-0203 W6:
independent dimensions and wind-owned two-attachment state with optional GPU
trajectory history. The solver, tracer, public field and batch approximation remain.

Owner feedback replaces the default instantaneous lines with 4096 directional GPU markers.
Visualization composes the existing SceneGISGpuParticleSystem; its narrow `timeSource` hook
uses completed simulation seconds rather than wall/Scene time. Generation changes reset the
deterministic particle state. Hidden periods consume the clock, so re-show does not catch up.
Particle state is 128 bytes/allocated slot, 0.50 MiB for 4096; no field readback or producer-private
access. Native instanced translucent quads provide opaque depth testing and OIT.

RK2 visual advection uses substeps <= physical timeStep and samples the latest completed field
through public WindFieldSampling. Intermediate velocity snapshots inside a render batch are not
retained: this is approximate marker advection and may vary with compute batch in unsteady flow.
The separately evolved conservative scalar remains the concentration authority. Deterministic
random values seed/recycle positions only; there is no velocity noise. Cell traversal tests whole
segments, including corner crossings; collision/outflow recycles the marker rather than tunnelling.
Solid seeds remain invisible until recycled into fluid. Short screen-oriented ellipses and lifetime
fading are draw-local style, not accumulated screen trails. Pause is stable and camera changes do
not leave ghost geometry. Explicit legacy `showStreamlines=true` remains supported.

## Validation and limitations

W1: collision conservation, basis/units, CPU/GPU comparison, uniform/shear decay, scheduling and
lifecycle, GPU timing. Later gates: channel/wake/open boundaries, voxelization, passive transport,
depth displays and city performance. Report GPU ms/step, bytes, steps/frame and simulated/wall
seconds, not only FPS. Independent experiments/domain/grid convergence are required for engineering.

## References

- [d'Humieres et al., 2002](https://ntrs.nasa.gov/api/citations/20020075050/downloads/20020075050.pdf), Appendix A MRT.
- [Premnath, Pattison and Banerjee](https://arxiv.org/abs/0901.2786), Smagorinsky and wall limitations.
- [lbmpy Smagorinsky derivation](https://pycodegen.walberla.net/docs/lbmpy/1.4/notebooks/06_tutorial_modifying_method_smagorinsky.html), relaxation quadratic.
- [Guo, Zheng and Shi, 2002, forcing](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.65.046308).
- [Guo, Zheng and Shi, 2002, non-equilibrium extrapolation](https://cpb.iphy.ac.cn/en/article/doi/10.1088/1009-1963/11/4/310).
- [Yang, 2013, convective outflow analysis](https://www.sciencedirect.com/science/article/pii/S0898122112006736).

Independently written from equations; no third-party solver source copied.
