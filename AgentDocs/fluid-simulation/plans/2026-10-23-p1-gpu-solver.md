# Phase P1: GPU solver qualification

- Type: phase; Status: completed; Created / Updated: 2026-10-23
- Parent: [extension](2026-10-23-native-fluid.md); Phase: P1
- Owner / architecture review: current task, confirmed; self-review
- ADR / SGP: ADR-0187; no upstream change

## Source facts

`SceneGISGpuParticleSystem` directly executes persistent MRT viewport commands in normal frame
update. Its per-particle shader cannot query other particles through a stable public protocol.
`ComputeEngine` has one output; no compute shader / atomic scatter backend exists on develop.
Owned GLSL under `Source/Shaders/SceneGIS` uses existing generated JS and Spec build paths.

## Detailed design

Evaluate WebGL2 PBF with GPU bitonic sorting of `(cell,id)`, binary-searched cell ranges and
27-cell exact neighbor enumeration. No fixed cell occupancy truncation; dense worst cases cost more.
Use fixed-capacity float textures and persistent quad commands. Position projection uses Poly6
density / Spiky gradient. Gravity predicts positions; local box projects collisions. GPU state
contains position/lifetime and velocity. CPU only schedules deterministic circular births and time.
Each correction is bounded by 0.1 h; cell width `h + 2 * iterations * 0.1 h` bounds relative motion.
Build once at prediction, query original cells and test current distances. GPU/CPU checks cover
both initial and projected positions. Predicted positions are clamped before building the grid.

Initial trial: 1024 / 4096 particles, 1/60 second, two iterations. Values remain qualification
candidates until measured. Recycle expired/out-of-bounds particles on GPU, circular replacement
at saturation. Internal solver takes one fixed step; public accumulator and pause contract belong P2.

## Implementation / validation

1. Owned private solver + GLSL; allocation / release paths and immutable layout.
2. GPU sorted cells / density compared with CPU on a small varied lattice; projection reduces
   compression; gravity / collision / emission / lifetime / reset behavior; no invalid GL calls.
3. Bounded full-capacity GPU timer measurements on actual browser / device, inspect both sparse
   filled water volumes. Compression before/after provides direct interaction evidence.
4. Build, focused strict GPU Specs, scoped lint; record chosen constants and budgets in ADR.
5. Review, update index/roadmap, independent P1 local checkpoint before rendering/API P2.

## Risks / results

Sort cost scales N log²N per rebuild; grid dimension budget must be explicit. PBF is approximate
and conservation is affected by birth/death/boundary projection. No arbitrary 3D Tiles collision
or scientific simulation promise. Strict Specs 4/4, scoped lint/build passed; hardware GPU medians
about 8 ms at 1024/4096 particles, 63/86 draws, CPU 0.2–0.6 ms. Full evidence in ADR-0187 and
[resolved self-review](../reviews/2026-10-23-p1.md). No upstream-owned files changed.
