# Review: C7 Common Solid and Area Graphics

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-10`
- Review target: branch `feature/planar-content`, complete working-tree diff after
  `4fca3180818ae2690cbcf9d76dec7a60cb7a6917`
- Related plan:
  [C7 common solid and area graphics](../plans/2026-08-09-phase-c7-common-solid-and-area-graphics.md)
- Related decision:
  [ADR-0019](../../../Documentation/SceneGIS/Decisions/ADR-0019-planar-common-solid-and-area-graphics.md)

## Scope

Review the three public local volume Geometry descriptors, the closed-volume extension to
`SceneGISPlanarPrimitive`, private Solid/Area Entity visualizers, shared fixed-planar transform, C4 callback
integration, real Context closure, durable docs, generation evidence and zero-upstream ownership boundary.

Out of scope are C8/C9, continuous ground, cross-Entity batching, Shader/Worker/build seams, Sandcastle/E2E and
changes to upstream-owned files.

## Implementation summary

- Added `SceneGISPlanarBoxGeometry`, `SceneGISPlanarCylinderGeometry` and
  `SceneGISPlanarEllipsoidGeometry` as immutable CPU descriptors over local standard Cesium geometry.
- Extended `SceneGISPlanarPrimitive` with a closed, non-flat `PerInstanceColorAppearance` path for the three
  fixed geometry kinds while retaining the C6 polyline/polygon contracts.
- Added `_SceneGISPlanarEntityTransform` and migrated Model to the shared fixed-planar quaternion/matrix math.
- Added `_SceneGISPlanarSolidVisualizer` for Box/Cylinder/Ellipsoid and `_SceneGISPlanarAreaVisualizer` for
  Plane/Ellipse/Rectangle lowered to public Polygon/Polyline Geometry.
- Extended the instance-owned visualizer callback after the existing four child roles; no upstream integration
  hunk changed.
- Updated Architecture, DevelopmentGuide and PlanarContentGuide with the implemented compatibility matrix and
  vertex-only terrain/C9 boundary.

## Review targets

- Public constructor/preflight/input snapshot/local bounds and root/types/API visibility for all three Geometry
  types.
- Primitive appearance/kind compatibility, replacement atomicity, second-Context, pick/depth/warm/destroy.
- HeightReference support offsets, fixed-planar orientation, Plane equation, Ellipse/Rectangle meter/rotation and
  generated-vertex terrain behavior.
- Original Entity pick, per-DataSource target, union bounds, dynamic update, candidate/current ownership and
  exactly-once cleanup.
- Callback order/rollback/gate behavior and regression of existing six content types.
- Zero-upstream, zero-SGP and generated-delivery boundary.

## Findings

| ID | Severity | Status | Owner role | Location | Finding | Disposition / evidence | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C7-R001 | high | closed | execution | `_SceneGISPlanarAreaVisualizer.js` `planeGeometryState` / Area Spec | Plane now lowers to a canonical nondegenerate XY rectangle and a finite plane-basis transform, composed after the fixed-planar Entity orientation. Vertical `UNIT_X` and oriented oblique planes construct successfully; invalid dimensions preserve the current owner. | `SceneGISPlanarAreaVisualizer` `6/6`, Exit `0`; direct vertical/oblique/orientation/atomic regression. | None |
| C7-R002 | high | closed | execution | `_SceneGISPlanarSolidVisualizer.js` `cylinderOutlines` / Solid Spec | Zero-radius top or bottom rings are omitted while the nonzero ring and requested apex-to-ring vertical lines remain. Both cone directions produce four valid outline primitives in the representative fixture. | `SceneGISPlanarSolidVisualizer` `7/7`, Exit `0`. | None |
| C7-R003 | high | closed | execution | Solid/Area `signature`, `createOwner`, focused Specs | Candidate keys now contain effective fill/outline presence plus actual outline position counts, covering Cylinder vertical lines, Ellipsoid subdivisions, Ellipse extrusion vertical lines and alpha-zero topology. Same-topology style still updates in place. | Solid `7/7` and Area `6/6`, Exit `0`; ready Cylinder `5 -> 7`, transparent Box `1 -> 7`, extruded Ellipse `1 -> 5 -> 7`. | None |
| C7-R004 | medium | closed | execution | Solid/Area `cloneCondition` / focused Specs | Owners store independent near/far snapshots on creation and after successful application. Same-object `CallbackProperty` mutations retain the ready owner and update the instance attribute in both paths. | Solid `7/7` and Area `6/6`, Exit `0`; direct attribute-read/value assertions. | None |
| C7-R005 | medium | closed | execution | Area and real Context focused Specs | Ellipse `+Y` counter-clockwise and Rectangle `+Y` clockwise coordinates are asserted. The existing C7 real Context case now reads a red Box pixel and closes `scene.pickPosition` on its rendered top surface while retaining original-Entity `scene.pick`. | Area `6/6`, real Context `2/2`, Exit `0`; Context runner emitted only Node `DEP0060`. | None |

## Validation submitted

- Direct C7 cases=`24`; focused aggregates: Geometry `2/2` each, Primitive `8/8`, transform `2/2`, Solid `7/7`,
  Area `6/6`, callback `9/9`, Model `11/11`, automatic Widget `4/4`, real Context `2/2`, qualification `3/3`.
- `npm run build`, `npm run build-ts`, `npm run build-docs`, `npm run tsc`: Exit `0`. `build-ts` emitted only
  existing upstream TSD-JSDoc warnings.
- Changed-scope ESLint and JS/Markdown Prettier, SceneGIS/planar-content Markdownlint, `git diff --check` and
  `node scripts/scenegis/audit-upstream-patches.mjs`: Exit `0`.
- Engine/Cesium root JS and `.d.ts`, plus generated API HTML, contain the three public Geometry types. Private
  EntityTransform/SolidVisualizer/AreaVisualizer declaration and API hits=`0`; generated status=`0`.

## Architecture review evidence

- Minimal source-level fixture with `Plane(Cartesian3.UNIT_X, 0)` and positive dimensions reproduced
  `DeveloperError: positions must have nonzero finite area`.
- Minimal source-level cone fixtures reproduced the zero-radius outline failure with
  `DeveloperError: positions must contain at least two adjacent distinct positions`.
- A valid `numberOfVerticalLines` change from `2` to `4` retained the same Cylinder owner and primitive count
  (`5 -> 5`), confirming stale topology reuse.
- A ready Box owner created with transparent outline retained one primitive after outline alpha changed to `0.5`,
  confirming that zero-to-visible topology is omitted from the key.
- A same-object dynamic `DistanceDisplayCondition` mutation retained the owner and performed zero instance-attribute
  reads, confirming comparison aliasing.
- These are narrow, CPU-only diagnostic fixtures. No unrelated full suite or build was rerun for this review round.

## Focused fix validation

- `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarSolidVisualizer"`: `7/7`, Exit `0`.
- `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarAreaVisualizer"`: `6/6`, Exit `0`.
- `npm run test -- --includeName "SceneGIS/DataSources/SceneGISPlanarContentVisualizer"`: `2/2`, Exit `0`;
  only the existing Node `DEP0060` warning.
- `npm run build`, scoped ESLint/Prettier/Markdownlint, `git diff --check` and official upstream audit: Exit `0`.
- Product public API did not change; first-round `build-ts`/`build-docs`/`tsc` evidence remains applicable.

## Architecture focused re-review

- Source review confirmed the canonical Plane basis/model-matrix composition, nondegenerate cone outlines,
  effective topology keys and value-snapshot condition comparison close C7-R001 through C7-R004 without changing
  the approved public contract.
- The strengthened Area and real Context assertions close C7-R005 by fixing both rotation conventions and proving
  representative Box color, rendered top-surface depth and original-Entity picking.
- Architecture independently reran Solid `7/7`, Area `6/6`, real Context `2/2` and `npm run build`; all passed.
- SceneGIS scoped Prettier, Markdownlint, `git diff --check` and the official upstream audit passed. The audit reports
  current-delivery upstream-owned entries=`0`, generated status=`0` and no new SGP or patch marker.

## Ownership audit

- Implementation base: `4fca3180818ae2690cbcf9d76dec7a60cb7a6917`.
- Upstream-owned files changed: `0`.
- C7 SGP: `0`; `.scenegis/upstream-patches.json` and SGP-0001/0002 hunks unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Product, Specs and docs changes are confined to the approved SceneGIS-owned paths.

## Accepted risks proposed for review

- Core Box/Cylinder/Ellipsoid and standard Primitive internals remain Cesium-upgrade-sensitive dependencies.
- Ellipse/Rectangle terrain remains generated-vertex sampling; continuous ground is intentionally deferred to C9.
- Broad project-owner browser acceptance remains a later delivery-stage gate, not a substitute for the submitted
  deterministic real Context closure.

## Conclusion

C7-R001 through C7-R005 are closed. The implementation, focused behavior, real Context closure, public/private
generation boundary and zero-upstream ownership boundary are approved. C7 may be marked `completed` and committed
as its independent local checkpoint before C8 planning; no push is authorized or required.
