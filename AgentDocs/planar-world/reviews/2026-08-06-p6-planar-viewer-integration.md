# Review: P6 Planar Viewer Integration

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-06`
- Updated: `2026-08-06`
- Review target: complete working-tree diff after
  `ac56b9c6f79cf813e1c6b8208bfdf1138f2c4a4c`
- Related plan:
  [P6 planar Viewer integration phase plan](../plans/2026-08-06-phase-6-planar-viewer-integration.md)
- Related ADR:
  [ADR-0006](../../../Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md)
- SGP: `SGP-0002` (`active`, `high`)

## Review target and scope

- Public `SceneGISPlanarHomeButton` and `SceneGISPlanarHomeButtonViewModel`.
- The narrow `Viewer.js` planar construction/preflight, controller ownership, Home/widget allowlist,
  selection/InfoBox behavior and Entity navigation guards.
- SceneGIS-owned direct/WebGL Specs, generated public API evidence, durable documentation and the
  single `scenegis-planar-viewer` Sandcastle example.
- Ownership and marker audit relative to the P5 checkpoint. P7 and generic custom-world Viewer
  integration are outside this review.

## Implementation summary

- Planar Viewer accepts only a live `SceneGISPlanarWorld`; all planar conflicts fail before child
  DOM or runtime mutation. Globe and `globe:false` construction keep their existing branch.
- Viewer forwards the same world, disables legacy inputs, registers exactly one planar controller,
  exposes it readonly and removes it before CesiumWidget/Scene/world destruction. Registration
  failure rollback disconnects exactly once.
- Planar Home uses the public controller command and existing CSS classes. Unsupported Earth widgets
  are suppressed by default and reject explicit enable/configuration.
- Left-click selection, SelectionIndicator and InfoBox title/description remain; InfoBox camera,
  double-click tracking and defined tracked/zoom/fly navigation are disabled or fail-fast.
- The new Sandcastle explicitly combines an EPSG:3857 world with its canonical OSM XYZ provider;
  Viewer does not create an online provider or picker.

## Source-to-spec mapping

| Source responsibility                  | Spec                                       | Direct cases |
| -------------------------------------- | ------------------------------------------ | ------------ |
| `SceneGISPlanarHomeButton.js`          | `SceneGISPlanarHomeButtonSpec.js`          | 3            |
| `SceneGISPlanarHomeButtonViewModel.js` | `SceneGISPlanarHomeButtonViewModelSpec.js` | 4            |
| `Viewer.js` planar integration seam    | `SceneGISPlanarViewerSpec.js`              | 18           |

The three new P6 Specs contain `25` direct unique cases. Aggregate substring runners are evidence
only and are not added again.

## Validation evidence

- P6 direct aggregate after the finding fixes: `25 SUCCESS` (`3+4+18`). The Viewer fixture covers
  option preflight and zero DOM
  mutation, controller lifecycle/rollback, Home/widget allowlist, real selection/InfoBox, sync
  navigation guards, default Globe and `globe:false`, local imagery pixel/credit/depth/warm state,
  and zero-layer lazy state.
- Engine regressions: P1 world Widget 16, P3 Surface 22, P3 World 14, P4 camera 33, P4 controller 25,
  P4 navigation Widget 4, P5 imagery Widget 9, Scene 259 and Globe 119, all Exit 0. Two focused
  engine CesiumWidget representative cases each passed `1 SUCCESS`.
- Widget regressions: HomeButton 11, InfoBox 9 and SelectionIndicator 12, all Exit 0. The focused
  fix rerun selected the 59-case upstream Viewer suite plus 23 mixin cases: `82 SUCCESS`. Architecture
  had already established that the earlier two render-loop timeouts were timing flakes by obtaining
  `59/59` on both clean P5 and current P6.
- Focused fix build rerun: `npm run build`, `build-ts`, `build-docs` and `tsc` Exit 0; the previously
  submitted `build-release` remains Exit 0. Existing
  repository-wide TSD-JSDoc warnings remain. Generated declarations and API HTML expose
  `Viewer.ConstructorOptions.world`, readonly `planarCameraController`, the Home union and both
  public Home types; generated private/patch-marker hits are zero.
- Standard embedding gallery: Exit 1 because Hugging Face tokenizer metadata was unavailable.
  `build-gallery-no-embedding` passed and found 305 examples; `build-sandcastle -- --no-embeddings`
  passed with plugin-timing/chunk-size warnings only.
- 8090 manual inspection found the single named example with correct source/metadata and no console
  errors. Both editor and standalone preview remained on Sandcastle's Bucket loading placeholder,
  so OSM direction/navigation/visible-credit visual acceptance remains open; local deterministic
  WebGL Specs provide the automated rendering evidence.
- Scoped ESLint, JavaScript/JSON/Sandcastle and Markdown Prettier, Markdownlint and
  `git diff --check`: Exit 0 after the final documentation update.

## Architecture independent review

- Before the first review, Architecture independently reran the initial P6 SceneGIS widget
  aggregate at `21 SUCCESS`. During focused re-review, Architecture independently reran the final
  Viewer suite at `18/18` and the Home/ViewModel suites at `7/7`, confirming the final direct count
  of `25/25`.
- The first Architecture rerun of the upstream Viewer aggregate reproduced the submitted
  `57/59` result and the same two five-second render-loop/error-panel timeouts. To separate a code
  regression from runner timing, Architecture then ran the same aggregate against the clean P5
  checkpoint and obtained `59/59`, followed immediately by a current P6 rerun at `59/59` in 2.89
  seconds.
- During focused re-review, Architecture's `Widgets/Viewer` aggregate again produced the same two
  timing-sensitive failures (`80/82`), while Execution had obtained `82/82` on the same fix state.
  Both failures exercise the unchanged non-planar render-loop/error-panel branch. Combined with the
  prior clean-P5/current-P6 `59/59` comparison, this remains an accepted runner flake rather than a
  P6 regression.
- Architecture independently ran `npm run build`, `build-ts`, `build-docs` and `tsc`: Exit 0;
  `build-ts` emitted only the existing repository-wide TSD-JSDoc warnings.
- The Sandcastle source, metadata and no-embedding build match the approved explicit
  EPSG:3857/OSM composition. The Bucket placeholder prevents the optional public-network visual
  signal, but deterministic local Viewer/WebGL imagery evidence exists; no P6 code finding is
  raised for this external/manual limitation.
- Public generated declarations and API docs expose the two Home types, the Viewer `world` option,
  the readonly controller and the Home union, while private and patch-marker generated hits remain
  zero.

## Ownership audit

- Upstream-owned product files: exactly
  `packages/widgets/Source/Viewer/Viewer.js`.
- `SGP-0002`: `active`, risk `high`; manifest lists only `Viewer.js`, the P6 Specs and ADR-0006.
  Every independent hunk has paired markers.
- `SGP-0001`, `packages/engine/Source/Scene/Scene.js` and
  `packages/engine/Source/Widget/CesiumWidget.js`: unchanged from the P5 checkpoint.
- Other upstream-owned product files: `0`; P6 SceneGIS-owned patch markers: `0`.
- Generated/Build/SpecList paths in status: `0`.
- Branch: `feature/planar-world`; implementation remained uncommitted during review. The approved
  Architecture checkpoint follows this conclusion; push: none; P7 work: none.

## Requested review

Please perform a focused re-review of P6-R001 through P6-R004, including atomic rollback,
ControllerHost count/order evidence, the completed Viewer behavior matrix and the narrowed first
SGP-0002 marker. The previously reviewed architecture/API boundary, timing flakes and optional
Sandcastle visual limitation are unchanged.

## Findings

| ID      | Severity | Status | Owner role | Location              | Finding                             | Disposition / evidence                                                                                                                                               | Follow-up         |
| ------- | -------- | ------ | ---------- | --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P6-R001 | high     | fixed  | execution  | Viewer constructor    | Constructor rollback was not atomic | Constructor and registration now share one cleanup boundary; constructor-dead Spec proves zero host callbacks/entries, one world/ClockViewModel destroy and zero DOM | Confirmed; closed |
| P6-R002 | high     | fixed  | execution  | Viewer/ControllerHost | Lifecycle ordering was unproven     | Specs prove `+1` registration, live world at disconnect, host baseline before world destroy and exactly-once cleanup                                                 | Confirmed; closed |
| P6-R003 | medium   | fixed  | execution  | Planar Viewer Specs   | Acceptance matrix had gaps          | Positioned direct/primitive picks, indicator/InfoBox, retained-widget false, controller identity and ellipsoid fixtures pass                                         | Confirmed; closed |
| P6-R004 | medium   | fixed  | execution  | Viewer engine import  | First SGP marker was too broad      | Marker now encloses only the three new engine imports; pairing/build/generated audits pass                                                                           | Confirmed; closed |

### P6-R001 — controller constructor failure is outside rollback

`new SceneGISPlanarCameraController(...)` executes before the rollback `try`. If construction
throws after `CesiumWidget`, Scene/world, Context and child DOM have been created, control bypasses
all P6 cleanup and leaks the failed Viewer state. This violates ADR-0006 and the phase plan
requirement to distinguish the not-yet-registered and already-registered failure paths. The current
Spec only injects a `connectedCallback`/registration failure.

Required disposition: put controller construction and registration in one atomic cleanup boundary.
Only attempt `removeController` when an instance could have entered the host; always destroy the
just-created CesiumWidget/world, remove Viewer child DOM and destroy the Viewer-owned ClockViewModel
before rethrowing. Add a deterministic preflight-live/controller-dead constructor fixture and prove
no connect/disconnect or host entry, world destroy exactly once and zero child DOM after the throw.

Execution disposition: `fixed`. The constructor now runs inside the same `try` as registration and
only attempts removal when the public host count proves synchronous insertion. The deterministic
second-`isDestroyed` fixture observes the original `DeveloperError`, zero
register/unregister/connect/disconnect calls, exactly one world and owned `ClockViewModel` destroy,
and zero container children. A separate pre-host registration failure proves an already-constructed
but never-inserted controller is not removed or disconnected.

Architecture confirmation: `fixed`. Code flow and the independent final Viewer `18/18` run confirm
both unregistered and inserted failure paths preserve the original error and clean only owned
state.

### P6-R002 — ControllerHost count and destruction order are not locked

The normal-destroy Spec name says “before destroying its world”, but it only observes one final
disconnect and a finally-destroyed world. The implementation could reverse those operations and the
test would still pass. Successful construction also does not prove the ControllerHost count delta,
and the registration-failure case does not prove the inserted host entry was removed before host
destruction. These are explicit high-risk P6 acceptance conditions.

Required disposition: capture the successful Viewer host and prove one registration/count delta.
During `disconnectedCallback`, prove the world is still live; after `viewer.destroy()`, prove the host
returned to baseline, disconnect occurred exactly once and the world is destroyed. In the injected
registration failure, capture the host and prove its count returned to baseline before/independently
of Scene destruction, while retaining the existing aggregator and zero-DOM assertions.

Execution disposition: `fixed`. Successful construction captures the real host and its baseline,
observes exactly one added entry, a live world inside `disconnectedCallback`, baseline restoration,
one disconnect and one later world destroy. Registration failure captures the inserted host entry;
unregister restores its baseline before `world.destroy`, with the aggregator undefined and DOM empty.

Architecture confirmation: `fixed`. The assertions observe the real public ControllerHost and
prove the required disconnect-before-world-destroy ordering rather than only final state.

### P6-R003 — changed Viewer branches need direct behavior evidence

Several new Viewer branches required by the approved acceptance matrix are not directly exercised.
The Entity fixture has no position, so upstream `_onTick` already computes `enableCamera === false`;
it therefore does not prove the planar InfoBox override or SelectionIndicator projection. There is
no `picked.primitive.id` case, no planar `homeButton:false` runtime case and no explicit-false matrix
for retained widgets. The controller enable/disable case checks only the boolean.

Required disposition: add focused cases that select a positioned planar Entity through both direct
`id` and `primitive.id`, update/show a finite SelectionIndicator and keep InfoBox camera false when
the upstream position path would enable it. Prove `homeButton:false` and retained
InfoBox/SelectionIndicator/Animation/Timeline/Fullscreen explicit-false getters/DOM. Prove
controller disable/re-enable retains controller/aggregator identity and legacy inputs remain false.
Add one allowed `ellipsoid` fixture preserving world coordinate-system/tiling-scheme identity.

Execution disposition: `fixed`. One real positioned-Entity fixture covers both `picked.id` and
`picked.primitive.id`, finite indicator position/visibility and forced InfoBox camera false. Added
runtime fixtures cover Home plus all retained widgets explicitly false, controller/aggregator
identity through disable/re-enable with legacy inputs false, and an allowed ellipsoid preserving
world coordinate-system/tiling-scheme identity.

Architecture confirmation: `fixed`. The final Viewer `18/18` run directly exercises every requested
runtime branch; existing P4 four-frustum and P3 single-Context component evidence remains valid.

### P6-R004 — SGP import marker scope is broader than the patch

The first `SGP-0002` marker encloses the entire pre-existing `@cesium/engine` import list even though
only the three planar imports are part of this patch. This makes SGP search results overstate the
owned hunk and weakens future upstream conflict review in a high-frequency file.

Required disposition: move the marker pair so it encloses only
`SceneGISPlanarCameraController`, `SceneGISPlanarWorld` and `SceneMode`; keep import
ordering/formatting valid. Re-run the paired-marker audit, generated-marker zero-hit checks and
scoped formatting/build evidence.

Execution disposition: `fixed`. The first marker pair encloses only
`SceneGISPlanarCameraController`, `SceneGISPlanarWorld` and `SceneMode`. Focused formatting, build,
declaration/API generation and marker audits pass.

Architecture confirmation: `fixed`. The marker encloses exactly the three added engine imports;
the final audit reports `25 BEGIN / 25 END`, zero SceneGIS-owned markers and zero generated hits.

IDs use `P6-R###`. Architecture confirms P6-R001 through P6-R004 as `fixed`; no finding remains
unresolved. The review-level status is `approved`.

## Review conclusion

The Viewer-only architecture, option preflight, public Home API, generated surface, explicit
EPSG:3857/OSM example and Globe compatibility direction are accepted. Existing P4 four-frustum
controller coverage plus the P6 Home ViewModel delegation is sufficient component evidence; it
does not need to be duplicated in all four frustums at the Viewer layer. Existing P3 single-Context
guard coverage remains sufficient for the documented shared-world misuse signal.

P6 is approved. All upstream product changes remain confined to `Viewer.js`/`SGP-0002`; public API,
controller/world ownership, Viewer behavior, generated surface, deterministic local rendering and
Globe compatibility evidence satisfy the phase boundary. Architecture will mark P6 completed and
create its independent local checkpoint with a Chinese commit message. The checkpoint is not
pushed, and P7 is not activated or implemented.
