# WebGL backport review

- Type / Status: review / approved; bounded technical migration gate complete
- Date: 2026-10-12
- Reviewer / implementer: current architecture and execution task, self-review
- Target: `feature/webgl-rendering-quality` against `scenegis/develop` at `2f6d4ce30b`
- Plan: [standalone backport](../plans/2026-10-12-webgl-fix-backport.md)
- Source: committed shared fixes from `feature/webgpu-renderer` at `ec5f98014c`

## Delivered behavior and provenance

| Source commit | Shared correction                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `122ba3dd1d`  | Explicit Model > Scene > procedural IBL, current SH arrays, immediate removal of a superseded Scene map                 |
| `4ee99433ab`  | Globe background and stars defer height fog to the existing final Aerial pass; Planar keeps its ordering                |
| `5bede894ca`  | Metric cloud shell precision, constant-channel variance clipping and integer full-resolution reconstruction coordinates |
| `ec5f98014c`  | Native heightmap parents report mesh readiness so missing descendants can finish upsampling                             |

No WebGPU implementation, async camera/query seam, GI structure, resource adapter or helper
extraction was imported. Existing APIs and assets are retained. The original WebGPU checkout
keeps its committed and uncommitted P4n work. D34 A defers that work without accepting its
street pictures or closing WGR-P4N-07.

## Validation

- Native Karma: 90 Heightmap-related cases, 79 GlobeSurfaceTile/Provider cases, three native
  ImageBasedLightingPipelineStage cases and eight procedural-star cases pass (180 total).
  The missing-descendant regression runs the real native terrain state machine and checks
  descendant completion, generated parent meshes and interpolated height.
- Six focused Playwright cases pass on Chrome 155 / ANGLE D3D11: three production-GLSL
  numerical probes and three native Scene / Planar / Globe source-priority integrations.
  The probes cover nine shell rays against independent double-precision roots, one-ULP
  constant-channel residue versus real outliers, and 1198 full-resolution fragment centers.
- The Globe integration also reads actual HDR output before/after 50% fog, verifies 50%
  attenuation, exact restoration, warm texture reuse and release on controller destruction.
  SH/cube tests cover replacement, mutation, Model overrides, clearing and viewer destruction.
- Development and release builds, type generation and `tsc` pass. Shader resource paths and
  generated files use the existing build; generated files are not part of the delivery.
- Upstream patch audit passes: exactly three delivery upstream files; generated status zero.
  Scoped source ESLint and document Markdownlint pass. Full AgentDocs formatting reports 398
  unchanged pre-existing files; none is a touched document. Do not bulk-format that backlog.
- The large cloud-radiance/history integration test passes after the fixture corrections below
  (103.724 seconds, both worlds). The final native total is 181. Earlier failing/timed-out
  attempts are not counted as passes.

## Findings and disposition

1. **Fixed, test compatibility:** the star-only fixture expected Globe fog before final
   composition. It now checks unchanged Globe star radiance at that stage, retains Planar
   extinction, and is paired with the actual final-HDR fog regression. Eight cases pass.
2. **Fixed, local validation environment:** fresh installation selected Babel parser 7.29.9 /
   traverse 7.29.10 and JSDoc failed on the same source. Running the existing workspace's
   JSDoc succeeded. Matching parser/traverse 7.29.8 in the new checkout's ignored dependencies
   makes `build-ts` and `tsc` pass. No dependency manifest or lock policy changes are included.
   Fresh-install reproducibility remains a tooling follow-up, not a rendering regression.
3. **Fixed and verified, cloud test fixture:** the original 30-second timeout could tear down
   the owner during synchronous shader compilation. The completed diagnostic run took about
   104 seconds. This one test now allows 120 seconds. It also pinned only the composition
   uniform map, leaving the trace command's independent STBN sequence advancing. Pin both
   actual consumers for the existing identical-sampling assertion; do not change product
   sampling, history weights or error tolerances.

## Ownership, cost and remaining risk

| Upstream-owned delivery file                                            | Patch               |
| ----------------------------------------------------------------------- | ------------------- |
| `packages/engine/Source/Core/HeightmapTerrainData.js`                   | SGP-0043 / ADR-0153 |
| `packages/engine/Source/Scene/Model/ImageBasedLightingPipelineStage.js` | SGP-0015 / ADR-0085 |
| `packages/engine/Source/Scene/Scene.js`                                 | SGP-0015 / ADR-0085 |

All other implementation, shader, Spec and documentation changes are SceneGIS-owned. No
additional textures, passes, geometry, ray steps, CPU copies or history buffers are allocated;
the six pixel/resource regressions provide bounded hot-path evidence. No frame-rate improvement
or Bistro visual-quality acceptance is claimed by this backport.

Historical strict-WebGL cloud fixture failures, prior visual gates and the unaccepted WebGPU
Bistro/GI quality remain open in their original reviews. Next work should establish a fixed
WebGL Bistro lighting/exposure baseline before new effect implementation. No later phase is
activated here. The architecture review authorizes one local Chinese migration checkpoint.
