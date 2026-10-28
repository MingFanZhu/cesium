# ADR-0193: Local GPU urban wind

- Status: accepted for W1; date: 2026-10-28.
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
no scale/shear/implicit CRS conversion. W1 periodic boundaries; W2 separately qualifies physical faces.

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

## Validation and limitations

W1: collision conservation, basis/units, CPU/GPU comparison, uniform/shear decay, scheduling and
lifecycle, GPU timing. Later gates: channel/wake/open boundaries, voxelization, passive transport,
depth displays and city performance. Report GPU ms/step, bytes, steps/frame and simulated/wall
seconds, not only FPS. Independent experiments/domain/grid convergence are required for engineering.

## References

- [d'Humieres et al., 2002](https://ntrs.nasa.gov/api/citations/20020075050/downloads/20020075050.pdf), Appendix A MRT.
- [Premnath, Pattison and Banerjee](https://arxiv.org/abs/0901.2786), Smagorinsky and wall limitations.
- [lbmpy Smagorinsky derivation](https://pycodegen.walberla.net/docs/lbmpy/1.4/notebooks/06_tutorial_modifying_method_smagorinsky.html), relaxation quadratic.

Independently written from equations; no third-party solver source copied.
