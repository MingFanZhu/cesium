# W6 GPU trajectories review

- Type: review; status: technically approved; owner visual gate pending; 2026-10-29.
- Owner/reviewer: current engine task, architecture/code self-review.
- Target: [W6](../plans/2026-10-29-w6-particle-trajectories.md), ADR-0203, wind-owned
  particle state/copies, dimension/ribbon shaders, Specs, SDK guide and city example.
- Entry: V3 `9f58ccf4f3`. Upstream-owned changes: none; SGP-0072 unchanged.
- SDK, distribution copies, LBM and conservative scalar transport: untouched.

## Findings and disposition

| Finding                                                            | Severity | Owner        | Disposition / evidence                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coupled marker size and 1..5 aspect cannot express thin long marks | P1       | execution    | Fixed. Independent pixel/metric width and metric length. Owner drops compatibility; particleSize and its branch are removed. GPU images verify independent dimensions and constant pixel width under zoom.                                         |
| Generic particles retain final state without intermediate history  | P1       | execution    | Fixed without expanding generic APIs. Wind-owned two-attachment ping-pong state and tiled GPU ring retain RK2 endpoints. A rotational field verifies curved samples against an independent circular solution, including irregular display batches. |
| Rebirth and coarse chords can connect teleports or cross buildings | P1       | execution    | Fixed. Recycle tokens, collision/outflow/lifetime breaks and whole-chord voxel traversal. GPU tests cover every cause and corner crossings. Invalid chords leave gaps rather than being redirected.                                                |
| Pause/reset/hidden updates can replay stale history                | P1       | execution    | Fixed. Completed time, generation and normal frame guard. GPU tests cover pause, rewind, reset, real-producer step, hidden component/ancestor, restore and repeated/pick updates. Duration changes restart history without reallocating textures.  |
| Unbounded samples or excessive capacity                            | P2       | execution    | Fixed. At most one retained ring of new boundaries per batch; older motion still integrates. Long-batch test verifies retained times/copy count. Constructor checks padded 64 MiB and 1..128 segments; allocation checks context dimensions.       |
| Test assumed environmentEffects exists before first Scene render   | P2       | test fixture | Fixed setup by removing the unnecessary assignment. No product fallback or settling frames.                                                                                                                                                        |
| Batch-field, sparse-history and near-eye approximations            | P2       | architecture | Accepted in ADR-0203 and UrbanWind. Substeps use final batch velocity. Sparse chords may be rejected; segments crossing the eye are omitted. No engineering trajectory or pollutant-mass claim.                                                    |

No blocking technical findings remain. No raw WebGL numerical backend, normal-frame
position/field readback, private producer access or screen persistence is introduced.
Uniform maps borrow the public live field. Native transparent depth/OIT handles
ribbons. CPU keeps metadata times only. Style changes preserve GPU resources and
never reconstruct flow. V3 source membership was checkpointed independently.

## Verification

- All 15 strict development GPU cases pass: eleven trajectory/API cases plus four
  existing visualization/integration cases. Cover independent length/width, zoom,
  fade/opacity, curved samples, capacity, collision/outflow/life, generation/rewind/
  hidden ancestors, exactly-once integration, both-world depth, real-producer uniform
  advection, concentration displays and ownership.
- Final release selection passes all 34 cases: these fifteen plus nineteen native
  tileset voxelization cases. No failure is hidden by release-only behavior.
- Two reproducible city browser cases pass in Globe/Planar at 40 simulation seconds.
  Captures include overview, close curved paths and markers-only. Paused fixed-view
  captures are byte-identical; style edits retain solver version and allocations.
  Removing display releases all targets while retaining the field; producer/viewer
  destruction completes. These are actual Scene depth/OIT pictures.
- Full build, buildRelease, buildTs and tsc pass. Generated declarations expose
  dimensions, trails, readonly capacity/byte counts, with no particleSize option.
  No generated files are committed.
- Changed JS/HTML/docs ESLint/Prettier and diff/ownership checks pass. Full AgentDocs
  markdownlint passes; full Prettier retains unrelated historical formatting debt.
  Scoped extension records pass, without unrelated repair.

## Actual cost and pictures

Chrome 156 / ANGLE D3D11 / RTX 3060 Ti, 1440 x 960, fixed 40 s. The example uses
1536 particles, 64 segments, 8 simulated seconds; API defaults remain 4096 / 32 /
4 s, trails opt-in. Three samples per direct native draw, median GPU time:

| World  | Marker draw ms | Ribbon draw ms | Particle + history bytes | History subset bytes |
| ------ | -------------- | -------------- | ------------------------ | -------------------- |
| Planar | 0.0236         | 0.1290         | 1896960                  | 1797120              |
| Globe  | 0.0225         | 0.1239         | 1896960                  | 1797120              |

The isolated DrawCommand measurements target the default framebuffer and exclude
integration, copies, solver, OIT composition and other Scene work; they are not
full-frame/display cost guarantees. Solver/tracer timers remain independent.
Head/history textures add about 1.81 MiB in this example, plus a 48-byte quad VBO
and programs; borrowed 119.25 MiB field/native scene targets are excluded. Default
4096/32 uses 0.25 MiB head-only or 2.50 MiB after first history enable, with padding.

Reproduce Test/Wind/?world=globe or planar, compute to 40 s. Browser tests also
capture a closer camera. Ignored Build/Specs/e2e/wind-trajectories holds local
pictures; examples contain configuration only. Thin paths show turning/wakes and
retain independent dimensionless tracer semantics. Owner visual acceptance remains
external. No next implementation phase is active; form the W6 local checkpoint.
