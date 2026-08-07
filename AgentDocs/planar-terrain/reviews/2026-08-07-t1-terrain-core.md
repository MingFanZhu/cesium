# Review: T1 平面地形 Core 契约

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-07`
- Updated: `2026-08-07`
- Review target: `feature/planar-terrain` working-tree diff relative to
  `0e7cef708d23fe333ab83d8dfe3b84cbd7457469`
- Related plan:
  [T1 terrain Core phase plan](../plans/2026-08-07-phase-t1-terrain-core.md)
- Related ADR:
  [ADR-0007](../../../Documentation/SceneGIS/Decisions/ADR-0007-planar-terrain-core-contract.md)
- SGP: None；T1 upstream-owned files=`0`

## Scope

Review the three new public SceneGIS Core terrain types, their direct Specs, generated public surface,
and the T1 AgentDocs handoff. World, renderer, async runtime, mesh, Worker, GPU and T2 are explicitly
outside this review.

## Implementation summary

- `SceneGISPlanarTerrainProvider` fixes the synchronous structural provider contract, complete Level-0
  precondition, global meter range, geometric error, Promise request and tri-state availability.
- `SceneGISPlanarTerrainData` fixes generic read-only CPU metadata, interpolation and direct-child
  availability without mesh/upsample/destroy lifecycle.
- `SceneGISPlanarHeightmapTerrainData` implements numeric TypedArray ownership, Cesium-compatible
  structure decoding, exact decoded min/max, SW→NE triangle interpolation, child mask and metadata.

Final source-to-spec mapping and direct counts are recorded in the phase plan. The review target adds no
private runtime module and changes no approved ADR/Architecture contract.

## Expected behavior

- All three interfaces/classes reject invalid direct construction or programmer input with
  `DeveloperError` as documented.
- Encoded little/big-endian and Terrain-RGB-compatible local fixtures decode to finite meter heights.
- Outer extent boundaries are inclusive; finite outside coordinates return `undefined`; interpolation
  matches the fixed SW→NE surface rather than bilinear interpolation.
- Child availability uses SW=`1`, SE=`2`, NW=`4`, NE=`8` and rejects non-direct addresses.
- Formal root JS/types/API docs expose only the three approved public types and their documented shapes.

## Validation evidence

- Focused Specs: Provider 4/4, TerrainData 3/3, Heightmap 10/10; 17 direct unique cases total.
- `npm run build`, `npm run build-ts`, `npm run build-docs`, and `npm run tsc`: Exit 0.
- Scoped ESLint, Core/Spec Prettier, SceneGIS/planar-terrain Markdown Prettier and Markdownlint, and
  `git diff --check`: Exit 0.
- `build-ts` retains the repository's pre-existing Cesium 1.144 TSD-JSDoc warnings; no new terrain
  warning was observed.
- Exact command results and generated declarations are recorded in the phase plan.

## Ownership audit

- Upstream-owned files: `0`.
- T1 SGP: `0`; `.scenegis/upstream-patches.json` unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated/tracked delivery status: `0`; root barrels, declarations, SpecList, API HTML and Build outputs
  were generated only for verification.
- Actual product/test paths are the six approved SceneGIS-owned Core/Spec files.

## Findings

| ID      | Severity | Status | Owner role | Location                                                                        | Finding                                                                                                                                                                                                                                                                                                                          | Disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                      | Follow-up                                                                                      |
| ------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T1-R001 | medium   | fixed  | execution  | `packages/engine/Specs/SceneGIS/Core/SceneGISPlanarHeightmapTerrainDataSpec.js` | The approved phase plan requires one deterministic combined EPSG:3857/Terrain-RGB-compatible fixture. The implemented fixture proved three-byte Terrain-RGB decoding only on the shared `[0, 2]` extent, so it did not lock the project-owner's primary reuse case or north/west interpolation at full Web Mercator coordinates. | Added one network-free full Web Mercator extent fixture using ordinary RGBA bytes with `elementsPerHeight=3`, `stride=4`, big-endian Terrain-RGB decode. It asserts decoded `0..3 m`, NW/NE/SW orientation and finite center interpolation `1.5 m`. Focused Heightmap command passed 10/10, Exit 0. Spec Prettier, planar-terrain Markdown Prettier/Markdownlint and `git diff --check` all Exit 0. Product code unchanged. | Architecture Agent focused re-review confirmed the fixture and evidence; no follow-up remains. |

## Accepted risks proposed for review

- TypedArray element immutability remains contractual after ownership transfer because JavaScript cannot
  freeze its elements.
- Concrete Provider validation, request state, attachment ownership and rendering remain deferred to
  their approved future phase boundaries.

## Conclusion

Architecture Agent focused re-review confirms T1-R001 `fixed`; review status is `approved`. The three
public Core types, 17 direct unique Specs, root/types/API evidence and zero-upstream/zero-SGP audit satisfy
T1. Product source was unchanged by the focused fix. T1 can be marked `completed` and included in its
independent local checkpoint. No push or T2 implementation is authorized by this approval.
