# Review: P4 Planar Navigation and Picking

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-05`
- Updated: `2026-08-06`
- Review target: anticipated working-tree implementation diff from
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439` on `feature/planar-world`
- Related plan:
  [P4 planar navigation plan](../plans/2026-08-05-phase-4-planar-navigation.md)
- Related ADR:
  [ADR-0004](../../../Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md)

## Scope

Review the P4 public `SceneGISPlanarCameraController`, the two new
`SceneGISPlanarWorld` surface-picking methods, all SceneGIS-owned private camera/frustum
helpers, focused Specs and documentation evidence. Confirm that the implementation provides only
the approved PC navigation and flat-surface picking scope and does not enter touch, inertia,
imagery, automatic Viewer/Widget integration or P5/P6.

Final product source and Specs under review:

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`
- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarCameraSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarTileSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarNavigationCesiumWidgetSpec.js`
- `Documentation/SceneGIS/Decisions/ADR-0004-planar-navigation-and-picking.md`
- `AgentDocs/planar-world/**` P4 plan, review and handoff updates

The Surface/Tile paths are the Architecture-authorized P4-discovered P3 correction. ADR-0003,
the completed P3 plan and approved P3 review contain append-only post-approval records; P3 was not
reopened.

## Summary

Implementation and validation are ready for Architecture/code review. Review should verify:

- ControllerHost structural lifecycle without replacing or modifying the concrete legacy
  `scene.screenSpaceCameraController`;
- fail-fast legacy-input conflict, paired register/remove, reconnect and exactly-once input
  cleanup;
- real type classification and correct window rays for all four supported frusta;
- overflow-safe home fit, north-up/nadir pose, near/far preservation and target constraints;
- deterministic left pan, middle rotation and wheel zoom with pointer anchoring and no inertia;
- bounded inclusive mathematical surface picking independent of render/depth state;
- explicit separation from `scene.pickPosition` plus supported-depth consistency evidence;
- large-coordinate numerical safety, public types/docs, regressions and a zero-upstream diff.

## Findings

| ID      | Severity | Status  | Owner role  | Location                                                                                                                                                                                                    | Finding                                                                                                                | Disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Follow-up                                                                          |
| ------- | -------- | ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P4-R001 | `high`   | `fixed` | `execution` | `SceneGISPlanarCameraController.js`: `_computeHomeState`, `_getRanges`, `_zoom`, `viewHome`                                                                                                                 | The perspective zoom limit mixed center and pointer metrics and cached stale home state.                               | Perspective now clamps the Camera-to-center-target range; home maximum is purely recomputed from the current viewport/frustum/padding. Focused Specs cover valid initial zoom-out, ordinary/direct-off-center non-center pointer at home, and padding/frustum/resize changes. Controller 24/24 and aggregate 31/31 pass.                                                                                                                                                                                                                                                                                                                                                                       | Architecture/code re-review confirmed; no further implementation actions required. |
| P4-R002 | `medium` | `fixed` | `execution` | `_SceneGISPlanarCamera.js`: `getHeadingPitch`; `SceneGISPlanarCameraController.js`: `_syncRig`                                                                                                              | External pose sync lost exact-nadir heading and accepted rolled axes.                                                  | The helper now decomposes normalized world direction/up/right, restores nadir heading from up/right, validates handed orthogonal axes and reports roll. `_syncRig` homes invalid/rolled poses. Identity helper and non-identity Camera transform Specs cover preserved non-zero heading, next rotation and safe rolled-pose home.                                                                                                                                                                                                                                                                                                                                                              | Architecture/code re-review confirmed; no further implementation actions required. |
| P4-R003 | `medium` | `fixed` | `execution` | `SceneGISPlanarCameraController.js`: setters, `_cancelEvent`, `_clearInputState`, `_discardQuarantinedInput`                                                                                                | Canceled held drags could resume and direct `_isDown` writes desynchronized `_buttonsDown`.                            | Cancellation now quarantines the original press identity until actual release and only clears movement updates; it never changes `_isDown` or `_buttonsDown`. Specs cover controller/feature disable, stale first update, zero canvas, move-before-release, release/new gesture and `anyButtonDown` consistency. CameraEventAggregator 16/16 remains green.                                                                                                                                                                                                                                                                                                                                    | Architecture/code re-review confirmed; no further implementation actions required. |
| P4-R004 | `high`   | `fixed` | `execution` | `SceneGISPlanarCameraController.js`: `_rotate`, `_rotateWindowAnchor`                                                                                                                                       | A missed middle press reused the miss position for a center-target fallback pivot.                                     | The controller stores the successful pointer anchor or the press-time viewport center for fallback. Perspective, orthographic and direct off-center Specs keep the fallback pivot projected at center and keep the target away from an erroneous boundary clamp.                                                                                                                                                                                                                                                                                                                                                                                                                               | Architecture/code re-review confirmed; no further implementation actions required. |
| P4-R005 | `medium` | `fixed` | `execution` | `_SceneGISPlanarCamera.js`: `validateBounds`, `robustNormalize`, `getWorldPose`, `getWindowRay`; `SceneGISPlanarCameraController.js`: `positionForWindowAnchor`, `_computeHomeState`, `_getRanges`, `_zoom` | Accepted finite-slope perspective arithmetic still used overflow-prone raw near-scale products and Euclidean squaring. | `validateBounds` now stores dimensionless slopes. Rays/anchors use `direction + right*xSlope + up*ySlope` with max-component robust normalization; home/range/position use division-before-multiplication slope formulas and `Math.hypot`. SceneGIS world-pose conversion bypasses Camera's unrelated ellipsoid/cartographic update for extreme planar positions while preserving transforms. The reviewer huge fixture (`±1e300`, near `1.5e306`, far `2e306`) and subnormal-near fixture both home/pick/anchor with finite unit rays and unchanged fields; rejected `±Number.MAX_VALUE` bounds remain atomic. Focused 33/33, controller 25/25, world 13/13, Widget 4/4 and WebGL 79/79 pass. | Architecture/code re-review confirmed; no further implementation actions required. |

IDs use `P4-R###`. Architecture re-review confirms P4-R001 through P4-R005 as `fixed`; the
review-level status is `approved` and no finding remains unresolved.

## Architecture decisions and resolved implementation blocker

- A real WebGL non-Globe Scene renders the P3 planar surface at the center pixel and reports
  `pickPositionSupported === true`, while `scene.pickPosition(center)` returns `undefined` even
  with `pickTranslucentDepth = true`.
- `_SceneGISPlanarSurface.render` rejects frames where `frameState.passes.render` is false, so the
  planar opaque command is absent from the depth/pick pass consumed by
  `Picking.pickPositionWorldCoordinates`.
- Architecture first authorized a P4-contained P3 correction in `_SceneGISPlanarSurface`: normal
  render caches the exact submitted command list and pick+depth passes replay it without
  selection, allocation or LRU/protection mutation.
- The first correction exposed raw depth `0`. Diagnostic evidence was drawing-buffer `[150,75]`
  in a `300x150` buffer, cached/submitted command count `1`, replay `0 -> 1`, and a generated
  frustum near `465.5752570745143`, far `470.23100964525946`. The exact zero-thickness OBB put the
  nadir mathematical plane exactly on near.
- The second Architecture decision adopted dual responsibilities without physical thickness:
  exact OBB for quadtree selection/SSE and a once-derived conservative BoundingSphere for
  DrawCommand culling/near-far fitting. No quadtree, shader, model matrix, geometry, render-state,
  public API or upstream file changed.
- The blocker is resolved. Tile 4/4 and Surface 18/18 prove conservative containment, exact OBB
  selection, strict command-volume frustum interval, same-reference replay, zero mutation/
  allocation deltas and Context ownership. Four real Widget fixtures prove default depth, first
  translucent-depth replay, non-log linear depth and `1e9` large-offset consistency, with
  `0 < rawDepth < 1` in every supported path.

## Validation reviewed

- P3 correction: Tile 4/4, Surface 18/18 and planar WebGL aggregate 67/67.
- P4 focused after finding fixes: private/helper plus controller 33/33, controller 25/25,
  world 13/13, Widget 4/4.
- Architecture independently reran the combined helper/controller 33/33, world 13/13 and real
  Widget depth 4/4 suites on `2026-08-06`; all completed with Exit 0.
- ControllerHost integration 1/1, P1 Widget 16/16 and P3 Widget 1/1.
- WebGL aggregate after finding fixes: 79/79.
- Upstream regressions: Camera 241/241, CameraEventAggregator 16/16,
  ScreenSpaceCameraController 73/73, CesiumWidget 75/75, Globe 119/119 and Scene 220/220.
- `build`, `build-release`, `build-ts`, `build-docs` and `tsc`: Exit 0. `build-ts` emitted only
  the existing repository-wide TSD-JSDoc warnings. CesiumWidget/Globe/Scene emitted the existing
  Node `DEP0060` warning.
- Scoped ESLint, JS Prettier, SceneGIS Markdown Prettier, Markdownlint and `git diff --check`:
  Exit 0.
- Four real frusta are covered across landscape, portrait and square viewports; type, FOV/aspect
  or off-center ratio and near/far are preserved, and all padded corners fit. Pointer anchoring,
  inclusive boundary clamp, minimum/home maximum, input priority, feature flags, no inertia,
  legacy conflict, invalid external-pose home and remove/reconnect cleanup are directly asserted.
- Public controller/root declarations/API HTML and world pick signatures are present; the private
  helper is absent from declarations/API HTML. Generated files are absent from status.

## Ownership audit

- Implementation diff base:
  `4cfbf58a5658f57bba57e3ba8cd7e75ef9989439`.
- Upstream-owned files: `0`.
- P4 SGP entries: `0`.
- `.scenegis/upstream-patches.json`: unchanged.
- `SCENEGIS_PATCH` markers added by P4: `0`.
- Generated/build files in final status: `0`.
- Commit/push performed by Execution Agent: no/no.

## Accepted risks

Remaining review risks are the documented Cesium private Camera/frustum and
CameraEventAggregator seams plus Surface command-replay/derived-command upgrade sensitivity.
Touch, inertia, object picking, P5 data loading and P6 automatic integration remain explicit scope
deferrals, not incomplete P4 PC behavior.

## Conclusion

Architecture/code re-review confirms P4-R001 through P4-R005 and finds no regression in the P3
command replay, dual-volume correction, bounded mathematical picking or ownership boundary. P4 is
approved and may be closed in its independent local checkpoint. Stop at the phase gate after that
checkpoint; no push or P5 work is authorized before the next-phase discussion.
