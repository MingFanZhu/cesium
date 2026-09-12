# Review: C8 Route-derived Geometry and Path

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Review target: branch `feature/planar-content`, complete working-tree diff after
  `480a865fda210c4e49b8a0d9eea4efa91111c38c`
- Related plan:
  [C8 route-derived geometry and path](../plans/2026-08-10-phase-c8-route-derived-geometry-and-path.md)
- Related decision:
  [ADR-0020](../../../Documentation/SceneGIS/Decisions/ADR-0020-planar-route-derived-geometry-and-path.md)

## Scope

Review the two public CPU Geometry descriptors, the Wall/PolylineVolume appearance extension to
`SceneGISPlanarPrimitive`, private Route/Path adapters, fixed-only sampler isolation, callback integration,
focused/WebGL evidence, public/private generation boundary and zero-upstream ownership audit.

Out of scope are C9 continuous ground, PORTIONS/INERTIAL/VVLH Path, public Corridor/Path Geometry, Shader/Worker,
Sandcastle/E2E/package delivery and upstream integration changes.

## Implementation summary

- Added immutable `SceneGISPlanarWallGeometry` and `SceneGISPlanarPolylineVolumeGeometry` with local DOUBLE
  positions, finite normals/indices/bounds and private outline seams.
- Extended `SceneGISPlanarPrimitive` with fixed Wall open/non-flat and PolylineVolume closed/non-flat kinds.
- Added `_SceneGISPlanarRouteVisualizer`: Corridor lowers through Euclidean XY generation to public
  Polygon/Polyline; Wall and PolylineVolume use the new public Geometry.
- Added `_SceneGISPlanarPathSampler` and `_SceneGISPlanarPathVisualizer` for FIXED/WHOLE path sampling rendered
  through public planar Polyline.
- Appended Route and Path after the existing six automatic children without changing the C4 upstream hunk.

## Review targets

- Geometry snapshot/topology/corner/normal/bounds validation and Primitive appearance/fixed-kind compatibility.
- Corridor corner/end-cap and generated-vertex terrain behavior; Wall/Volume property profiles and outline seams.
- FIXED-only Path preflight, interval/sample reuse, outside/hide/dynamic/lifecycle behavior.
- Candidate/current atomicity, original Entity pick, per-DataSource target, bounds, warm identity and cleanup.
- Callback allowlist/order and seventh/eighth-child rollback; default/non-planar regression.
- Root/types/API visibility, private role hiding, generated status and zero-upstream/zero-SGP boundary.

## Findings

| ID      | Severity | Status | Owner role | Location                                                                                             | Finding                                                                                                                    | Disposition / evidence                                                                                                                                                                                                                                                                                          | Outcome |
| ------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| C8-R001 | high     | closed | execution  | `_SceneGISPlanarRouteVisualizer.js` `createState` geometry signature / Route Spec                    | The signature serialized only `geometry._localPositions`, so rigid world translation could reuse stale model/bounds state. | Signature now includes the validated Geometry `_origin`; direct Route `6/6` proves Corridor/Wall/PolylineVolume replacement, translated bounds, static warm reuse and insertion-failure preservation. Real Context `2/2` additionally translates Corridor and verifies the new bounds and original Entity pick. | Closed  |
| C8-R002 | high     | closed | execution  | `SceneGISPlanarPolylineVolumeGeometry.js` `validateShape` / side triangle generation / Geometry Spec | Clockwise simple shapes reached side generation with inward winding.                                                       | `validateShape` canonicalizes a cloned clockwise snapshot to counter-clockwise before centering/triangulation. Geometry `4/4` compares CW/CCW closed topology/bounds and verifies every representative side/cap triangle has a finite outward normal; the existing real Context volume render remains green.    | Closed  |
| C8-R003 | high     | closed | execution  | `SceneGISPlanarPolylineVolumeGeometry.js` `validateRoute` / Geometry Spec                            | Normalized dot equality missed ordinary non-axis exact reversals.                                                          | Reversal preflight now compares scale-normalized raw adjacent segment components before corner generation. Geometry `4/4` rejects `(0,0)->(1,2)->(0,0)` for ROUNDED/BEVELED/MITERED and accepts a nearby legal turn.                                                                                            | Closed  |
| C8-R004 | medium   | closed | execution  | `_SceneGISPlanarPathVisualizer.js` `computeState` / Path Visualizer Spec                             | Repeated samples could reach public Polyline construction with fewer than two distinct positions.                          | `computeState` now removes consecutive duplicates before shown/signature/bounds. Path `4/4` proves stationary intervals hide without exception, retain the current owner/primitive across warm updates, resume motion with the same owner and release exactly once.                                             | Closed  |

## Validation submitted

- Focused: Wall `2/2`, PolylineVolume `4/4`, Primitive `9/9`, Route `6/6`, Path Sampler `2/2`, Path
  Visualizer `4/4`, callback `10/10`, automatic Widget `4/4`, real Context `2/2`, qualification `3/3`.
- C8 direct new cases=`20`; focused aggregate cases=`46`; aggregate overlap and modified-existing cases are separated
  in the phase result.
- `npm run build`, `build-ts`, `build-docs`, `tsc`, scoped ESLint/Prettier, Markdownlint and
  `git diff --check`: Exit `0`; type/docs generation emitted only existing upstream TSD-JSDoc warnings.
- Official upstream audit: Exit `0`, current-delivery upstream-owned entries=`0`, historical SGP entries remain
  `SGP-0001`/`SGP-0002`, generated status=`0`.
- Generated root runtime/types/API contain both public Geometry types; private PathSampler/PathVisualizer/
  RouteVisualizer declaration/API hits=`0`; generated status=`0`.
- Architecture focused re-review independently reran PolylineVolume Geometry `4/4`, Route Visualizer `6/6` and
  Path Visualizer `4/4` serially; all passed.

## Ownership audit

- Implementation base: `480a865fda210c4e49b8a0d9eea4efa91111c38c`.
- Upstream-owned files changed: `0`.
- C8 SGP: `0`; manifest and SGP-0001/0002 hunks unchanged.
- New `SCENEGIS_PATCH` markers: `0`; generated files are absent from status.

## Remaining risks

- `PathVisualizer._subSample` and standard synchronous Primitive internals require Cesium-upgrade revalidation.
- Corridor generated-vertex terrain is intentionally not continuous ground; C9 remains the explicit boundary.
- All four review gaps are closed. C9 must still begin only after the independent C8 checkpoint is committed.

## Conclusion

C8-R001 through C8-R004 are closed. The implementation, focused evidence and zero-upstream ownership boundary are
approved. C8 may be marked `completed` and committed as an independent local checkpoint before C9 planning; no push.
