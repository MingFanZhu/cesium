# Review: P8 Release Qualification

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-06`
- Updated: `2026-08-07`
- Review target: complete working-tree diff after
  `b9f3fca6c11252a77dd558ac69b172acffab7b78`
- Related plan:
  [P8 release qualification phase plan](../plans/2026-08-06-phase-8-release-qualification.md)
- Related ADR: ADR-0001 through ADR-0006; P8 adds no ADR
- SGP: no P8 SGP; read-only audit of active SGP-0001/SGP-0002

## Review target and scope

- Deterministic multi-tile/multi-layer warm, cache churn, depth replay and imagery lifecycle gates.
- Lightweight 50-cycle, real WebGL `CesiumWidget` 8-cycle and planar `Viewer` 8-cycle soaks.
- Local dev/release E2E, release timing evidence and package smoke.
- Read-only upstream/SGP audit including destructive fixtures.
- Planar World usage, support, tuning, troubleshooting and upgrade/private-dependency documentation.
- No product runtime source changed; public behavior, selection/SSE/LRU/fallback/pixels remain P1-P7.

## Implementation summary

- Engine qualification freezes the complete normal-frame signature on every one of 120 bare and
  two-layer warm frames. Five full multi-level/edge/corner camera/cache rounds converge within
  `tileCacheSize + protected`; 60 distinct depth queries replay exactly the cached command count while
  preserving command identity, selection, SSE, LRU, protection and allocation.
- Layer churn covers terminal failure, pending removal/late resolution and exact ready texture/runtime
  release. Fifty lightweight frame/ownership cycles and eight serial real Widget cycles balance
  resources without destroying caller-owned providers.
- Viewer soak restores ControllerHost, aggregator and DOM baselines across eight real cycles.
- Playwright uses only local canvas imagery and blocks non-localhost requests; dev/release GPU runs
  cover composition pixel, `tilesLoaded`, mathematical/depth pick, real wheel, Home and destroy.
- Audit derives ownership from the recorded upstream tree, retains NUL-safe old/new name-status paths,
  validates every changed line against its declared marker pair, and exercises 13 destructive fixtures.
  Package smoke packs without scripts into a repository-external consumer, resolves bare ESM/CJS package
  entry points, validates types/docs/private absence, and proves a broken public entry fails.
- Baseline evidence did not justify a product optimization; P8 adds only Specs, E2E, scripts and docs.

## Source-to-spec mapping

| Qualification source     | Direct evidence                                                                   | Cases |
| ------------------------ | --------------------------------------------------------------------------------- | ----: |
| Engine P8 gate Spec      | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarReleaseQualificationSpec.js` |     8 |
| Viewer lifecycle Spec    | `packages/widgets/Specs/SceneGIS/SceneGISPlanarReleaseQualificationSpec.js`       |     1 |
| Local browser/E2E timing | `Specs/e2e/scenegis-planar-release.spec.js`                                       |     2 |
| Audit/failure fixtures   | `scripts/scenegis/audit-upstream-patches.spec.mjs`                                |    13 |

Direct unique P8 runner cases: `24`. Existing P1-P7/upstream aggregates are overlap-only regression
evidence and are not added to this count.

## Validation evidence

- P8 focused: engine `8/8`, widgets `1/1`; audit Node tests `13/13`.
- P3-P7: Tile `10`, Quadtree `11`, Surface `22`, Camera `38`, controller `30`, World `14`, navigation
  Widget `4`, imagery `23`, imagery Widget `9`, Layer `7`, URL provider `3`, Home `7`, planar Viewer
  `18`; all SUCCESS. Substring aggregates overlap.
- P1/upstream: world `2`, world Widget `16`, CameraEventAggregator `16`,
  ScreenSpaceCameraController `73`, CesiumWidget `107`, Globe `127`, Viewer `102`, Scene `264`, Camera
  `241`, Request `39`, Resource `119`, Texture `161`; all SUCCESS.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, `tsc`: Exit 0; existing TSD-JSDoc
  warnings only.
- Headed real-GPU E2E: dev `1 passed / 1 release-only skipped`; release `2/2 passed`; external request
  attempts, local 4xx responses, `pageerror` and console errors are all zero. Because an unrelated existing
  server occupied the standard mirror port 8081, the focused rerun used a short-lived repository-root
  static server on port 8070 through an ephemeral, removed no-webServer config. No server process or E2E
  config remains in the delivery diff.
- Timing environment: 960x540, DPR 1, Chrome 151, ANGLE/NVIDIA RTX 3060 Ti. Samples use fixed batches of
  20 renders and normalize per frame after readiness/selection/submission/persistent-state preconditions.
  Baseline/candidate aggregate P95 medians are `0.35/0.35 ms` for bare, imagery and motion. One identical
  product imagery repeat produced a transient `0.55 ms` warning; the immediate repeat returned to
  `0.35 ms` with identical hard-gate state, so it is recorded as non-repeatable same-machine noise rather
  than hidden. No product runtime differs between the runs.
- Package smoke Exit 0 for repository-external installed tarballs: bare engine/widgets/root ESM, bare
  root CJS, declarations and API docs; all private roles absent; broken-entry fixture rejected.
- no-embedding gallery Exit 0 with `305` demos; no-embedding Sandcastle Exit 0 with existing chunk
  warning. Standard embedding Exit 1 on external Hugging Face metadata fetch.
- Final scoped ESLint, Prettier, Markdownlint, `git diff --check`, audit and generated-status checks:
  Exit 0; `git diff --check` emitted only existing LF/CRLF warnings.

## Architecture independent review

- Architecture independently reran the engine qualification suite at `8/8 SUCCESS` and the widgets
  lifecycle suite at `1/1 SUCCESS`.
- During initial review, Architecture independently reran the original audit self-test and live audit,
  then used reviewer fixtures to expose the unmarked-hunk and rename false positives recorded below.
- A reviewer fixture with one valid marker pair plus a second unmarked modification in the same
  registered upstream file was incorrectly accepted by the audit at Exit `0`.
- A reviewer fixture that staged a pure rename of an upstream-owned `manifest-only` file was also
  incorrectly accepted as `0 registered upstream-owned files` and Exit `0`, because the new pathname
  does not exist in the upstream tree and the old pathname was lost by the name-only representation.
- During focused re-review, Architecture reran the repaired audit suite at `13/13 passed`, the live audit
  at Exit `0` with `3` historical upstream entries, `82` marker tokens and current-delivery upstream count
  `0`, and the external installed-tarball package smoke at Exit `0`.
- Architecture inspected the exact warm/cache/depth, lifecycle and E2E/timing assertions and accepted the
  recorded focused engine/widgets, headed-GPU E2E and build/type/docs evidence. The five findings are
  reviewer-confirmed `fixed`; no unresolved review item remains.

## Ownership audit

- Relative base: `b9f3fca6c11252a77dd558ac69b172acffab7b78`.
- P8 upstream-owned product/test/build files: `0`; P8 SGP: `0`.
- `.scenegis` base/manifest and existing SGP-0001/0002 hunks are unchanged.
- Current audit sees the three historical registered upstream seams only; current delivery upstream
  count is `0` and generated status is `0`.
- SceneGIS-owned product/test/script patch-marker hits: `0`; generated/Build/SpecList status: `0`.
- The review target was uncommitted and unpushed during review; no later phase exists or has started.

## Remaining risks

- Performance numbers are same-machine diagnostic evidence, not a cross-machine threshold. Private
  counters do not observe every transient JS allocation.
- Current headless Chromium OpenGL path lacks WebGL; headed GPU is the executable local gate.
- Standard embedding and public OSM availability remain external; deterministic gates are local.
- Cesium renderer/Camera/Viewer private semantics remain upgrade risks tracked by the new checklist.

## Findings

- `P8-R001` — high, fixed, reviewer-confirmed: hunk/rename/owned-region false positives are rejected.
- `P8-R002` — high, fixed, reviewer-confirmed: package smoke resolves public bare entry points externally.
- `P8-R003` — medium, fixed, reviewer-confirmed: warm/cache/depth hard gates lock exact work and convergence.
- `P8-R004` — medium, fixed, reviewer-confirmed: real lifecycle soak balances imagery and late async state.
- `P8-R005` — medium, fixed, reviewer-confirmed: E2E and batched timing assert their claimed preconditions.

### P8-R001 — file-level marker counts do not enforce the upstream patch boundary

Location: `scripts/scenegis/audit-upstream-patches.mjs:41-76` and `:120-170`

The audit first reduces the diff to pathnames. Once a pathname is registered, it only checks that at
least one matching BEGIN/END pair exists somewhere in the current file. It never maps changed hunks or
new-side changed lines to those marker spans, and it does not reject foreign marker IDs in a registered
file. Consequently, a second upstream modification outside the valid pair is silently accepted. The
reviewer fixture described above reproduced Exit `0` with exactly that invalid state.

The pathname model also does not preserve rename/copy status or the old pathname. A staged pure rename
is represented only by the new pathname, which does not exist in the upstream tree; the audit therefore
classified the fixture as zero upstream-owned files and passed it. `statusPaths` has the same ambiguity
for porcelain rename text. Finally, the SceneGIS-owned marker scan covers engine/widgets SceneGIS and
`scripts/scenegis`, but omits other declared owned test/product regions such as
`Specs/e2e/scenegis-*.spec.js` and `packages/sandcastle/gallery/scenegis-*/**`.

Required disposition:

- parse a NUL-safe name-status representation and retain old/new paths for modified, deleted, renamed
  and copied entries;
- for `paired` files, prove every applicable new-side changed line/hunk is inside a correctly ordered
  pair for the file's declared SGP, and reject undeclared/foreign marker IDs;
- require active manifest entries to be consistent with the upstream diff, while retaining an explicit
  `manifest-only` route for genuinely unannotatable delete/rename/binary changes;
- scan every SceneGIS-owned product/test/script region declared by root `AGENTS.md`, while continuing to
  exclude the documentation syntax example;
- add destructive fixtures for an unmarked second hunk in a registered file, pure rename/delete,
  foreign marker ID, SceneGIS E2E/Sandcastle marker and stale/inconsistent manifest entry. The submitted
  four existing failure fixtures must remain.

Disposition: `fixed`. The audit now parses NUL-safe name-status and porcelain data, keeps old/new paths,
checks every applicable changed new-side line inside the declared SGP pair, rejects foreign/nested/unpaired
markers, and reserves `manifest-only` for delete/rename/copy/binary changes. Its owned marker scan covers
every root-AGENTS product/test/script area. The Node suite is `13/13`, including registered rename/delete
success plus unmarked second hunk, foreign ID, unregistered rename, stale manifest, engine/E2E/Sandcastle
owned marker and generated-dirty failures. Live audit exits `0` with three historical entries, current
delivery upstream count `0`, 82 marker tokens and generated status `0`.

### P8-R002 — extracted files are not tested through the public package entry points

Location: `scripts/scenegis/verify-planar-packages.mjs:11-36` and `:120-150`

The script extracts tarballs into a directory named `node_modules`, but imports their exact filesystem
files (`index.js`, `Source/Cesium.js`, `index.cjs`). Those imports bypass each package's `exports`,
`main`, bare-specifier resolution and dependency wiring. The smoke would still pass if the published
root entry were broken while those internal files remained present. This is not the installed-consumer
boundary claimed by the P8 plan, Architecture rule and review summary.

The temporary directory is created inside the repository before packing the root package, so it may
also become root pack input and contain the already-created engine/widgets archives. The assertion
matrix omits runtime `SceneGISWorld`, private `SceneGISPlanarTileImagery`, and the required generated
Viewer `ConstructorOptions.world`/readonly `planarCameraController` contract.

Required disposition: create the smoke root outside the repository, assemble or install only the local
tarballs without registry/network or lockfile mutation, and execute a consumer located there. That
consumer must use bare ESM imports for `@cesium/engine`, `@cesium/widgets` and `cesium`, plus bare CJS
`require("cesium")`; direct internal-path checks may remain only as supplementary diagnostics. Assert
the complete public list including `SceneGISWorld`, the Viewer option/getter declarations, all private
roles including TileImagery, package/API-doc visibility and absence, and that no nested smoke/archive
artifact entered the root tarball. Add a deliberate broken-entry fixture or equivalent proof that the
smoke fails when a public package entry is unavailable.

Disposition: `fixed`. The smoke creates its consumer under the OS temporary root, packs local
root/engine/widgets archives without scripts, assembles the external dependency layout, and executes
bare ESM imports for all three packages plus bare CJS `require("cesium")`. It asserts runtime
`SceneGISWorld`, the complete public list, exact Viewer world/readonly-controller declarations, tar
contents, and all private roles including TileImagery across runtime/types/API docs. A deliberately
broken root export fails the same bare consumer. Post-build smoke exits `0` without repository lockfile,
`node_modules` ownership or tracked-file changes.

### P8-R003 — submitted hard gates do not prove their named frame/pass sequences

Location:
`packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarReleaseQualificationSpec.js:165-268`

The bare warm case checks selected/submitted only before the 120-frame loop and then compares persistent
creation counters. It would pass if every subsequent frame selected or submitted nothing. The imagery
case observes only the final submission count. Neither freezes the complete per-frame
visited/culled/selected/submitted/resident signature required by the phase plan.

The cache case labels five alternating X renders at one height as five churn “rounds”; it does not run
the approved keyframe sequence across zoom levels, four edges and four corners five times, and it does
not prove imagery request/texture/ref convergence during camera churn. Most importantly, the sixty
distinct depth calls end with only `depthSubmittedCommands > 0`. A single successful replay would pass
while the review and plan claim sixty zero-mutation replays; cached command-reference identity is not
checked here either.

Required disposition: record the deterministic normal-frame signature and assert it for every one of
the 120 bare and imagery frames; execute a complete multi-axis/multi-level keyframe sequence for each
of five rounds and prove tile plus imagery live-state convergence; capture the cached command references
and pre-replay counter, then assert the exact expected submission delta for all sixty distinct cache
keys while every selection/SSE/LRU/protection/allocation counter remains unchanged. If a Cesium
multi-frustum detail changes the multiplier, derive it from the real cached commands/frustums and lock
that derivation rather than weakening the assertion to non-zero.

Disposition: `fixed`. The engine qualification freezes visited/culled/selected/SSE/submitted/resident,
ideal/protected-key and command-count signatures on every one of 120 bare and imagery frames. Its churn
fixture executes far/mid/near plus four edges and four corners for five complete rounds with two local
layers, checking cache bounds, settled requests and positive references at every keyframe, then proves a
120-frame converged signature. The depth fixture locks cached command references and exact
`60 * cachedCommands.length` replay delta while tile last-use, ideal/protected sets, quadtree counters and
persistent allocations remain identical. Focused engine and SceneGIS aggregate are `8/8` and `225/225`.

### P8-R004 — lifecycle loops omit tile/texture/imagery convergence

Location:
`packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarReleaseQualificationSpec.js:328-371` and
`packages/widgets/Specs/SceneGIS/SceneGISPlanarReleaseQualificationSpec.js`

The fifty “ownership” cycles remove their only layer before a zero-drawing-buffer/no-pass frame, so no
surface or imagery resource becomes live. The eight real CesiumWidget cycles render no imagery and
only compare buffer, vertex-array and shader counts. They do not balance quadtree created/destroyed
tiles, surface textures, imagery textures/bindings, requests/cancellations or late settlements. The
Viewer loop proves controller/aggregator/DOM final state, but the combined evidence is narrower than
the review's statement that all resources balance across the soak.

Required disposition: retain the cheap fifty-cycle ownership guard, but make the real serial cycles
exercise at least one controlled local imagery layer and include a pending/late case within the soak or
an exactly equivalent repeated fixture. After each cycle, assert created/destroyed tile, shared texture,
imagery texture/binding/request and controller/DOM/live-cache baselines as applicable, while continuing
to prove providers are not destroyed. The browser Context limit can keep the real count at eight; the
fix must not increase concurrent Contexts.

Disposition: `fixed`. The eight serial real-Context cycles now create a local imagery layer. Seven settle
live imagery and one keeps requests pending through destroy and late resolution. Every cycle asserts tile
created/destroyed balance, shared buffer/VA/shader/texture balance, imagery texture balance, empty tile,
protection/runtime/command caches, settled or exactly cancelled requests, zero late texture creation and
caller-owned provider non-destruction. Contexts remain strictly serial; the existing 50-cycle lightweight
guard and Viewer ControllerHost/aggregator/DOM soak remain intact. Focused engine/widgets are `8/8` and
`1/1`.

### P8-R005 — browser qualification does not fail on the integration states it claims

Location: `Specs/e2e/scenegis-planar-release.spec.js:3-130` and the P8 plan/results timing section

The route aborts non-localhost requests but never records/asserts that no such request was attempted.
The common E2E fixture does not fail on `pageerror` or console `error`, so the review's “page no errors”
claim is not tested. The release flow also does not assert `scene.world === world`,
`scene.globe === undefined` or the unique registered planar controller even though these are the root
bundle integration states the P8 E2E was required to qualify.

The timing function returns median/P95/max, but the committed baseline/candidate results record only
the five P95 values and a partial candidate max summary. Every aggregate P95 median is `1 ms`, at the
observed timer/workload resolution, so a `15%` warning cannot be meaningfully distinguished. The imagery
timing does not assert `tilesLoaded` or stable imagery counters immediately before sampling.

Required disposition: collect and assert zero unexpected external attempts, `pageerror` and console
errors; assert primary-world/globe/controller identity before interaction and their cleanup afterward.
Before each timing scenario, assert its selected/submitted/readiness and persistent-state preconditions.
Record all five median/P95/max runs for baseline and candidate. If single-render samples remain at the
timer resolution, measure fixed batches and normalize per frame, or explicitly classify timing as
inconclusive rather than claiming the `15%` comparison gate was exercised. Keep headed real-GPU as the
documented local environment; no workflow or e2e-config modification is requested.

Disposition: `fixed`. The browser flow records and asserts zero external HTTP(S) attempts, page errors
and console errors; it locks `scene.world`, absent globe, exactly one registered planar controller,
disabled legacy inputs, and post-destroy host/aggregator/world/DOM cleanup. Timing now uses 20-render
batches, normalized per frame, and asserts 16 selected/submitted tiles, imagery readiness and persistent
counters before and through every run. All five baseline and candidate median/P95/max triples are recorded
in the phase plan. Dev is `1 passed / 1 skipped`; release is `2/2 passed` on the headed real-GPU path.

## Review conclusion

Architecture confirms P8-R001 through P8-R005 as `fixed`; no review finding remains unresolved. The
qualification evidence is `approved`, and P8 plus the first-version `planar-world` extension are
`completed` by the independent local Architecture checkpoint. The delivery changes no product runtime,
upstream seam, SGP manifest, workflow, version or publication state. The checkpoint is not pushed or
tagged, and a later large capability requires a separate plan.
