# Algorithm and continuous surface

- Type: discussion; Status: open; Created / Updated: 2026-10-23
- Owner: architecture; Related plan: [extension](../plans/2026-10-23-native-fluid.md)
- Resulting ADR / SGP: ADR-0187 / none

WebGL2 lacks compute atomics in the existing backend. GPU sort plus uniform cell ranges can provide
complete neighborhoods without a CPU readback or capped per-cell buckets. PBF offers iterative
density projection with a fixed timestep; explicit stiff SPH would require a stricter timestep.
Grid pressure methods add 3D free-surface pressure infrastructure disproportionate to a local spray.
P1 qualifies PBF before stabilizing the public contract.

The existing WaterFrame already supplies opaque scene HDR color / linear depth and schedules
liquid after opaque geometry. Screen-space sphere depth plus bilateral smoothing and accumulated
thickness can reconstruct connected water while retaining detached splashes. Exact integration
and reuse of optical code are P2 work; no claim that FFT water is a volume-fluid simulator.

Primary design references (independent implementation, no vendor code copied):

- [Macklin / Müller, Position Based Fluids](https://mmacklin.com/pbf_sig_preprint.pdf): density
  constraints, iterative position correction, particle neighborhood kernels.
- [NVIDIA, Fluid Simulation in Alice](https://developer.download.nvidia.com/tools/docs/Fluid_Rendering_Alice.pdf):
  screen-space depth / thickness, bilateral smoothing and surface shading.

P1 selects bounded-correction PBF with one conservative sorted grid per step, supported by
independent numeric checks and hardware timing in ADR-0187. Rendering discussion remains open
for P2; whole-scene opacity must never hide depth failures.
