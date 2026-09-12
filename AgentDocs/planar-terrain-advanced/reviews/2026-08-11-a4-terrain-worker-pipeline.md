# Review: A4 平面地形 Worker 管线

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: Architecture Agent
- Created: `2026-08-11`
- Updated: `2026-08-11`
- Review target: `feature/planar-terrain-advanced` complete working-tree diff relative to
  `c03f7d9a561a2e94495631339f883b9c11873781`
- Related plan:
  [A4 phase plan](../plans/2026-08-11-phase-a4-terrain-worker-pipeline.md)
- Related decision:
  [ADR-0027](../../../Documentation/SceneGIS/Decisions/ADR-0027-planar-terrain-worker-tasks-and-delivery.md)

## Scope

- Review the single thin Worker entry and the independent `decodeLerc` / `createHeightmapMesh` protocols.
- Review transfer ownership, main-thread TerrainData/result preflight, shared topology and GPU ownership.
- Review terrain direct/fallback mesh states, two-start/two-promotion normal-frame budgets, readiness, retry and stale isolation.
- Review actual TaskProcessor, real Context, dev/release/tar delivery and zero-upstream evidence.

## Review targets

| Area            | Paths                                                                                                             | Expected behavior                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Worker protocol | `Source/Workers/SceneGISPlanarTerrainWorker.js`, `Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorker*.js` | Lazy shared TaskProcessor, two task kinds, transferable validation and serialized errors        |
| Provider/data   | URL Heightmap provider, Heightmap TerrainData                                                                     | LERC Worker decode; image unchanged; raw buffer clone leaves resident data intact               |
| Mesh/runtime    | private terrain mesh and terrain runtime                                                                          | Worker positions, main-thread indices/preflight/GPU, async state, budgets, stale/retry/fallback |
| Specs           | focused Core/Renderer/Scene/Widget Specs                                                                          | Pure and actual Worker, state/coverage/replay, real Context pixel/depth/query/lifecycle         |
| Delivery/docs   | package smoke, ADR/durable docs, AgentDocs                                                                        | dev/release/tar Worker exists; private/public and ownership boundaries remain exact             |

## Implementation summary

A4 adds one thin SceneGIS-owned Worker entry backed by a lazy module-scoped `TaskProcessor`. LERC compressed input and
decoded samples transfer through `decodeLerc`; an owned Heightmap buffer clone and generated Float32 positions transfer
through `createHeightmapMesh`. Main-thread code still constructs TerrainData, validates Worker results, owns cached
indices and creates GPU resources only on a later normal frame. Direct and fallback mesh task state is independent from
network state, with at most two task starts and two promotions per normal frame. Late results are token-isolated; the
shared Worker is never destroyed to simulate cancellation.

## Validation evidence

- Worker tasks 3/3, including actual `TaskProcessor("SceneGISPlanarTerrainWorker")`, real local 257×257 LERC,
  input/output buffer transfer and serialized invalid-kind rejection.
- URL provider 13/13; terrain mesh 5/5; terrain runtime 12/12; Surface/Shader aggregate 33/33; terrain Widget 1/1.
- Real Context Widget proves four-child terrain/imagery rendering, depth/query/pick closure, per-frame task/promotion
  limits, warm command/resource identity and balanced VA/vertex/index destroy.
- `npm run build` and `npm run build-release`: Exit 0; development and release Worker outputs generated.
- Installed package smoke: Exit 0; engine source/Build Worker and root release Worker tar entries, ESM/CJS,
  declarations/API/private boundary and broken-entry fixture passed.
- Scoped ESLint/Prettier, affected Markdownlint/Prettier, `git diff --check` and official upstream audit: Exit 0.
- Focused aggregate=67; A4 direct unique cases=6. Existing provider/surface/Widget cases extended for async Worker
  ordering are not double-counted as new cases.

## Ownership audit

- Upstream-owned product/test/build files: `0`.
- A4 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.
- Public inventory remains engine/widgets/root `24/2/26`; Worker entry and private task/scheduler do not enter
  supported declarations or API HTML.

## Findings

| ID   | Severity | Status         | Owner role | Location | Finding                                          | Disposition / evidence                                                     | Follow-up           |
| ---- | -------- | -------------- | ---------- | -------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------- |
| None | note     | not-applicable | review     | N/A      | No blocking findings.                            | Independent review evidence is recorded below.                             | None                |

## Accepted risks

- Cesium 1.144 TaskProcessor has no per-task abort. Active stale tasks finish and are ignored by generation/token; the
  module-scoped Worker persists for engine module lifetime.
- The actual Worker case duration includes cold startup and is not a comparable performance benchmark. Planning
  profiling selects the migration boundary; A4 makes no cross-machine speedup claim.
- Worker URL, ESM/IIFE behavior, LERC API, transfer/error serialization and package globs remain high-risk upgrade
  checkpoints.

## Independent review evidence

- Architecture reread the Worker task/scheduler/entry, provider/data seams, mesh finalizer and complete terrain
  direct/fallback state diff against `c03f7d9a561a2e94495631339f883b9c11873781`.
- The review confirmed that `TaskProcessor.taskCompletedEvent` is already connected to Scene request-render, so Worker
  completion records CPU state before a later normal-frame promotion without adding a new upstream hook.
- Architecture independently reran the actual TaskProcessor suite (3/3), terrain runtime suite (12/12) and real-Context
  terrain Widget suite (1/1); all exited 0. It also reran `git diff --check` and the official upstream audit, which
  reported current-delivery upstream-owned files `0` and generated status `0`.
- Result shape/metadata preflight, two-start/two-promotion budgets, current-view readiness, stale token isolation,
  shared-index ownership and flat/no-provider laziness match ADR-0027. No public API, Shader, A5 data format or
  upstream build seam was introduced.

## Conclusion

Architecture approves the complete A4 implementation. The single Worker entry, two independent task protocols,
normal-render-only GPU promotion, late-result isolation and development/release/package delivery satisfy ADR-0027.
The accepted lack of per-task abort remains an explicit Cesium 1.144 upgrade risk rather than an unclosed A4 defect.
A4 is `completed` and may form its independent local checkpoint before A5 source audit begins.
