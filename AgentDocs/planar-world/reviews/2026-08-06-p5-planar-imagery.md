# Review: P5 Planar Imagery

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-06`
- Updated: `2026-08-06`
- Review target: complete working-tree diff after
  `e4d45e3bafcb249dac98ac8118c28a6b643c8146`
- Related plan:
  [P5 planar imagery phase plan](../plans/2026-08-06-phase-5-planar-imagery.md)
- Related ADR:
  [ADR-0005](../../../Documentation/SceneGIS/Decisions/ADR-0005-planar-imagery-runtime-and-composition.md)

## Scope

- Four public imagery types and `SceneGISPlanarWorld.imageryLayers`/dynamic `tilesLoaded`.
- SceneGIS-owned per-layer cache, request/texture lifecycle, ancestor fallback, single-pass alpha
  composition and P4 pick+depth replay compatibility.
- Focused public/private Specs, real WebGL Widget fixtures, exports/types/API docs, release/build
  evidence and the single `scenegis-planar-imagery` Sandcastle directory.
- Ownership audit from the P4 checkpoint. P6, upstream integration and generated outputs are outside
  this review.

## Summary

The first Architecture/code review confirms the P5 ownership boundary, one-command composition,
P3/P4 geometry and replay preservation, and the approved EPSG:3857/OpenStreetMap example shape.
Focused Architecture re-review confirmed P5-R003 through P5-R006. The second focused Architecture
re-review now also confirms P5-R001/P5-R002: fresh zero-layer tiles allocate no imagery container,
existing slots are cleared in place, and structural events are distinguished from real Cesium
`Event` instances by identity. All six findings are reviewer-confirmed `fixed`; P5 is approved for
its independent local checkpoint.

## Final source and spec mapping

| Source responsibility                         | Direct unique cases / focused runner evidence                  |
| --------------------------------------------- | -------------------------------------------------------------- |
| structural provider / URL provider            | `3` / `3`; focused runners `3 SUCCESS` / `3 SUCCESS`           |
| layer / collection                            | `3` / `4`; layer substring aggregate `7`, collection focused 4 |
| `_SceneGISPlanarImagery.js`                   | `13`; imagery substring aggregate `23 SUCCESS`                 |
| `_SceneGISPlanarTileImagery.js`               | `5`; focused runner `5 SUCCESS`                                |
| `_SceneGISPlanarSurfaceShader.js`             | `2`; covered by planar WebGL aggregate                         |
| P3 tile / surface seams                       | direct `5` / `20`; substring aggregates `10` / `22`            |
| real composition/depth/large-offset/lifecycle | imagery Widget direct and focused `9 SUCCESS`                  |
| engine-level manual example                   | `scenegis-planar-imagery` gallery directory                    |

The eight newly added P5 Spec files now contain `42` direct unique cases
(`3+3+3+4+13+5+2+9`). The new direct P3 Surface seam case brings the review's focused direct
evidence to `43`, exactly two more than the previously confirmed `41`. Substring aggregate commands
are retained as runner evidence only and are not summed as independent cases.

## Findings

| ID      | Severity | Status  | Owner role  | Location                                             | Finding                                                                                                                                                                                                                                                                                                                          | Disposition / required evidence                                                                                                                                                                                           | Follow-up                                                |
| ------- | -------- | ------- | ----------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P5-R001 | `high`   | `fixed` | `execution` | `_SceneGISPlanarSurface.js`; zero-layer Surface Spec | `updateTileSlots` now returns without allocation for a fresh zero-layer tile and only clears an already-existing slots array. The direct Spec proves fresh `_imagerySlots`, `imageryBindings` and `_imageryRelease` remain undefined, then proves an imagery-to-zero-layer transition retains and empties the prior slots array. | Architecture independently reran Surface `22 SUCCESS` and imagery Widget `9 SUCCESS`; code and direct assertions match the required fresh/transition behavior.                                                            | Architecture second focused re-review confirmed; closed. |
| P5-R002 | `high`   | `fixed` | `execution` | `_SceneGISPlanarImagery.js`; structural event Spec   | `reportProviderError` now uses `event instanceof Event` as the sole Cesium-event discriminator. Every other validated structural event takes the direct raise path regardless of extra properties. ADR-0005 now states the exact add/raise capability.                                                                           | Architecture independently reran imagery `23 SUCCESS`; the `numberOfListeners: 0` fixture receives `TileProviderError`, requests retry and retries only in frame 2, while real Event zero-listener logging remains green. | Architecture second focused re-review confirmed; closed. |
| P5-R003 | `medium` | `fixed` | `execution` | public JSDoc / generated declarations                | Interface metadata uses constant doclets so declarations are readonly; `urlScheme` is `"xyz" \| "tms"`; `errorEvent` is `Pick<Event<any>, "addEventListener" \| "raiseEvent">`; collection ownership and exception docs are complete.                                                                                            | Architecture independently reran `build-ts` and `tsc`; generated declarations have the exact readonly/union/structural shapes.                                                                                            | Architecture focused re-review confirmed; closed.        |
| P5-R004 | `medium` | `fixed` | `execution` | ADR-0005 / phase plan / tile imagery                 | ADR and plan now state desired + Level 0 bootstrap only, nearest cached READY reuse, one fallback reference, no proactive intermediate request, and terminal READY retention.                                                                                                                                                    | Tile imagery `5 SUCCESS` directly covers nearest READY, terminal failure and exact reference release.                                                                                                                     | Architecture focused re-review confirmed; closed.        |
| P5-R005 | `high`   | `fixed` | `execution` | Specs and validation matrices                        | Mapping uses direct source enumeration and explicitly labels substring aggregates. The previously confirmed 41 direct cases gained one private imagery case and one direct P3 Surface seam case, for 43 focused direct cases; all original high-risk transitions remain covered.                                                 | Architecture confirmed the prior accounting; second-round counts are imagery 23, Surface 22, Widget 9 and WebGL aggregate 116.                                                                                            | Architecture focused re-review confirmed; closed.        |
| P5-R006 | `medium` | `fixed` | `execution` | durable guides and Sandcastle metadata               | Architecture/DevelopmentGuide now record canonical identity, ownership, current-view readiness, fallback/request lifecycle, single-pass limit and P6 boundary. Demo metadata now has `development: false`.                                                                                                                       | Durable guidance and demo metadata are implementation-accurate; submitted docs/Sandcastle checks remain valid.                                                                                                            | Architecture focused re-review confirmed; closed.        |

IDs use `P5-R###`. Architecture confirms P5-R001 through P5-R006 as `fixed`; the review-level status
is `approved` and no finding remains unresolved.

## Validation submitted

Focused fix round:

- Direct unique P5 cases: provider 3, URL provider 3, layer 3, collection 4, private imagery 13,
  tile imagery 5, shader 2 and imagery Widget 9 (`42` total), plus one direct P3 Surface seam case
  (`43` focused direct cases). Aggregate runners passed with imagery 23 (public overlap 10), Surface
  22 (shader overlap 2) and Widget 9.
- Planar WebGL validation aggregate: `116 SUCCESS`, `15825 skipped`. Prior P3/P4 focused regressions:
  quadtree 11, world 14, camera aggregate 33, controller 25, P3 Widget 1 and navigation Widget 4.
- `npm run build`, `build-release`, `build-ts`, `build-docs` and `tsc`: Exit 0. `build-ts` emitted
  only the existing repository-wide TSD-JSDoc warnings. Ten exact declaration assertions passed;
  public types are present and the three private types have declaration/API HTML hits of zero.
- Scoped ESLint, Prettier, Markdownlint and `git diff --check`: Exit 0. No-embedding gallery found
  304 examples; no-embedding Sandcastle build completed with only plugin-timing/chunk-size warnings.

- Focused new and P3/P4 regression suites: all Exit 0; exact per-suite counts are recorded in the
  phase plan. WebGL aggregate: `105 SUCCESS`, `15824 skipped`.
- Upstream regressions: Request/RequestScheduler/Resource/Texture `352 SUCCESS`; URL provider,
  layer and collection `102 SUCCESS`; `GridImageryProvider` replacement `6 SUCCESS`; CesiumWidget,
  Globe and Scene `442 SUCCESS`.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, `tsc`: Exit 0. Public root/types/API
  expose all four types and world members; private declaration/API hits are 0.
- Sandcastle no-embedding gallery/build: Exit 0, 304 examples. Standard embedding commands are
  environment-blocked by Hugging Face metadata access and are explicitly not claimed as passing.
  Manual OSM run verified orientation, refinement/navigation, visible linked credit and clean console.
- Final scoped engine/demo ESLint, engine/demo/docs Prettier, Markdownlint and
  `git diff --check`: Exit 0. Public export/type/API checks passed with private hits 0.

## First Architecture reviewer audit

- Architecture independently reran
  `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarImagery"`; it passed but selected
  15 cases across collection (4), layer (3), provider (3) and private imagery (5), confirming the
  submitted count overlap in P5-R005.
- Direct source enumeration gives unique newly added suites of provider 3, URL provider 3, layer
  3, collection 4, private imagery 5, tile imagery 4, shader 2 and imagery Widget 8: 32 unique
  cases before the two modified P3 seam cases. This is not a failure count, but it replaces the
  current source-to-spec attribution.
- Generated `packages/engine/index.d.ts` exposes mutable interface fields at lines 48098-48126 and
  `urlScheme?: string` / `readonly urlScheme: string` at lines 48158/48205, confirming P5-R003.
- Diff and status inspection still show zero upstream-owned paths, zero generated output and no P6
  path. The ownership conclusion is accepted for this review round.

## Focused Architecture re-review audit

- Architecture independently reran the eight-file direct source enumeration and confirmed the
  submitted `3+3+3+4+12+5+2+9 = 41` current unique-case count.
- Architecture independently reran imagery `22 SUCCESS`, Surface `21 SUCCESS`, imagery Widget
  `9 SUCCESS`, `build-ts` and `tsc`; all exited 0. The generated interface fields are readonly,
  `urlScheme` is the exact `"xyz" | "tms"` union, and `errorEvent` has the approved structural Pick.
- Code inspection shows that `_SceneGISPlanarSurface.updateTileSlots` unconditionally applies
  `tile._imagerySlots ??= []`, including the zero-layer path. The zero-layer Spec asserts only the
  binding Map/release seam, so P5-R001 remains open.
- A read-only one-off runtime fixture used a valid add/raise structural event with an extra numeric
  `numberOfListeners: 0`. The observed result was `raised=0`, desired state `FAILED`; this directly
  reproduces P5-R002 and proves that property-presence duck typing is not a safe real-`Event`
  discriminator.
- ADR-0005 fallback rules, durable Architecture/DevelopmentGuide guidance, Sandcastle
  `development: false`, ownership boundaries and current test-attribution accounting are otherwise
  accepted.

## Second focused Architecture re-review audit

- Code inspection confirms the zero-layer branch returns before `??= []`; it only sets `length = 0`
  when `_imagerySlots` already exists. The direct Surface fixture covers both a fresh tile and an
  imagery-to-zero-layer transition without replacing the existing array.
- Code inspection confirms `event instanceof Event` is the sole route to Cesium
  `TileProviderError.reportError`; all other validated structural events use the direct constructed
  or reused error path regardless of extra properties.
- Architecture independently reran imagery `23 SUCCESS`, Surface `22 SUCCESS` and imagery Widget
  `9 SUCCESS`. The current direct accounting is 42 cases in the eight new P5 Spec files plus one
  modified P3 Surface seam case, for 43 focused direct cases.
- The final phase audit contains 35 changed paths, all under SceneGIS-owned roots. There are zero
  upstream-owned files, zero P5 SGPs, zero new patch markers, no patch-manifest change and no
  generated/build output in status.

## Ownership audit

- upstream-owned files: `0`
- P5 SGP: `0`
- `.scenegis/upstream-patches.json`: unchanged from checkpoint
- new P5 `SCENEGIS_PATCH` markers: `0`
- generated/Build/SpecList files in final status: `0`
- branch: `feature/planar-world`; implementation remained uncommitted during review; the approved
  Architecture checkpoint follows this conclusion; push: none

## Accepted risks proposed for review

- OpenStreetMap is an external best-effort manual dependency and never participates in Specs, E2E,
  screenshots or CI. Local deterministic fixtures cover terminal failure/baseColor/ancestor fallback.
- Existing Cesium repository-wide TSD-JSDoc warnings and optional embedding metadata access are not
  introduced by P5.

## Conclusion

Architecture/code review approves P5. P5-R001 through P5-R006 are reviewer-confirmed `fixed`; there
are no unresolved findings. Architecture may mark P5 completed and create its independent local
checkpoint. Stop at the phase gate after that commit: do not push, create a P6 plan or enter P6 until
the project owner starts the next-phase discussion.
