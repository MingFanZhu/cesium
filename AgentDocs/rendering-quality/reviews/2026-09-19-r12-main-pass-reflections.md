# Review: Main-pass Reflection MRT

- Type: `review`; status: `completed`; updated: `2026-09-19`
- Reviewer / owner: Current task, architecture and execution self-review
- Target: [R12](../plans/2026-09-19-r12-main-pass-reflections.md), after `cbd429e11b`
- Decision: `ADR-0091`; integration: `SGP-0016`

## Findings and disposition

- P1, fixed: SSR previously repeats all opaque material shading before the ordinary scene draw.
  Qualified main drawing now emits reflection rays, material weights and weighted environment
  energy through MRT; the real scene reports 1574 main draws and zero capture draws.
- P1, fixed during review: Writing the resolved full color back into a multisample target flattens
  native sample coverage. Composite now adds only the signed reflection replacement delta while
  preserving native sample color and alpha. Strict 4x MSAA regression passes.
- P1, fixed during review: Multiplying separately resolved environment and weight mixes different
  samples at edges. Store and resolve weighted environment energy directly. CPU styling/model
  color, AO and clearcoat response are propagated; weighted replay comparison stays within three
  byte values per color channel and native compatibility-to-main transition restores exact pixels.
- P2, fixed during review: Borrowed main color includes the background. A resolved opaque coverage
  mask excludes it from the SSR radiance mip chain shared with water; GPU background test is zero.
- P2, retained integration boundary: Cleared Globe depth, multiple frustums, classification,
  translucent Globe, blended opaque commands, unsupported post-lighting branches and insufficient
  MRT attachments retain the established replay path. Explicit guards preserve existing behavior;
  no frame-history approximation, quality reduction or public option is introduced. Globe depth
  clearing and invert-classification transitions are covered by strict GPU tests.

## Resources and native integration

Owned framebuffers alias native scene color/depth without attachment ownership. Resize and destroy
release owned half-float textures, renderbuffers and viewport programs; native attachments survive
and remain renderable. Every MSAA color attachment is resolved explicitly and WebGL framebuffer
bindings/cache are restored. Main reflection tracing runs after opaque drawing and before water,
translucency and environment composition. AO retains its current prepass.

All upstream-owned changes use paired `SGP-0016` markers:

- `packages/engine/Source/Scene/Scene.js`: one post-opaque resolve call.
- `packages/engine/Source/Shaders/Model/ImageBasedLightingStageFS.glsl`: record material response.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: AO and clearcoat response scaling.
- `packages/engine/Source/Shaders/Model/CPUStylingStageFS.glsl`: native style color response.
- `packages/engine/Source/Shaders/Model/ModelColorStageFS.glsl`: model color response.

SSR-owned storage is approximately 67 bytes/pixel on replay, 187 bytes/pixel with base-material
4x MSAA MRT, and 299 bytes/pixel with clearcoat MRT. At the measured resolution the base case adds
about 103 MiB. Native borrowed attachments, AO and shadows are excluded. A previously allocated
replay mip chain can remain after a path transition, adding about 3 bytes/pixel. This memory and
bandwidth tradeoff is explicit; lower-memory packing requires a separately verified design.

## Verification

- Development strict WebGL suites: 9 SSR, 11 AO and 12 water tests pass. Final release suites:
  9 SSR and 12 water tests pass, covering both Worlds, material/style updates, MSAA, clearcoat,
  compatibility transitions, picking exclusion, resize and resource ownership.
- Engine development and full release builds, `buildTs`, full `tsc`, scoped ESLint/format,
  full AgentDocs Markdown lint, upstream patch audit and diff checks pass. Full AgentDocs
  Prettier check reports 316 pre-existing formatting failures outside the changed files; changed
  documents pass their scoped check. Unrelated documents are not reformatted. The audit identifies
  exactly the five upstream files above; generated artifacts are regenerated and not committed.
- Existing Planar SSR example and real Globe Viewer render without console errors. The Viewer
  serves the rebuilt engine directly; its source and saved JSON/rendering settings are unchanged.
  The original captured near camera is restored after reload. The stored global startup-camera
  configuration remains a Viewer follow-up from the earlier performance review.

## Paired real-scene evidence

RTX 3060 Ti / ANGLE D3D11, 1097 x 822, 4x MSAA, 14 enabled layers, 1701 commands, one frustum,
1574 opaque draws; tile requests/processing are zero. AO, SSR, shadows and physical environment
remain enabled. A temporary browser diagnostic alternates the existing replay and main MRT within
one page; the private helper and all instrumentation are restored after measurement. Each sample
contains 24 natural render-loop intervals following resource/program transitions.

| Path               | Mean frame time | Median frame time | FPS   | Extra SSR capture draws |
| ------------------ | --------------- | ----------------- | ----- | ----------------------- |
| Replay, sample 1   | 144.5 ms        | 137.8 ms          | 6.92  | 1574                    |
| Main MRT, sample 1 | 105.5 ms        | 106.6 ms          | 9.48  | 0                       |
| Replay, sample 2   | 121.5 ms        | 115.1 ms          | 8.23  | 1574                    |
| Main MRT, sample 2 | 90.9 ms         | 89.3 ms           | 11.00 | 0                       |

Paired mean frame time falls 25–27%, equivalent to a 34–37% FPS increase. Desktop scheduling causes
variation; these samples do not guarantee a fixed frame rate. Separate instrumented CPU profiles
still show native drawing and uniform uploads as substantial costs. GPU timer queries include
command-stream gaps and cannot isolate GPU execution from CPU submission here. AO and cascade
shadow passes remain additional work; total performance is not accepted as solved.

## Gate and follow-up

Architecture and code self-review are complete and no technical blocker remains for this bounded
phase. Owner visual acceptance remains pending. Create an independent local R12 checkpoint; do not
activate subsequent optimization in this commit. Further AO pass sharing, shadow scheduling and
submission improvements require their own source-fact phase plans. Explicit R7 night visual
acceptance and Viewer startup-camera configuration remain separate owner follow-ups.
