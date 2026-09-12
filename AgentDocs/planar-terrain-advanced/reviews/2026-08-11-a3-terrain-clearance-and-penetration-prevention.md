# Review: A3 平面地形净空与防穿透

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-11`
- Updated: `2026-08-11`
- Review target: `feature/planar-terrain-advanced` working-tree diff relative to
  `5ff4753579be5cf063d9efd84aa138ba4093d5c9`
- Related plan:
  [A3 phase plan](../plans/2026-08-11-phase-a3-terrain-clearance-and-penetration-prevention.md)
- Related decision:
  [ADR-0026](../../../Documentation/SceneGIS/Decisions/ADR-0026-planar-terrain-clearance-and-penetration-prevention.md)

## Scope

- Review the public `minimumTerrainClearance` constructor/property contract and zero-mutation setter.
- Review surface Camera-local resident terrain to Z=0 fallback and endpoint-only world +Z correction.
- Review first/programmatic/input update ordering, no-Home behavior, underground bypass and A1/A2 snapshot preservation.
- Review deterministic, real-Context, generated API, Sandcastle, ownership and A4 boundary evidence.

## Review targets

| Area | Paths | Expected behavior |
| --- | --- | --- |
| Product | `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js` | Finite positive clearance, pre/post endpoint correction, underground bypass, no hot-path allocation |
| Deterministic Specs | `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js` | Contract, revision rise/fall, mode switch, three PC inputs, non-identity large-offset pose |
| Real Context | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js` | Non-flat push-out, no Home, underground bypass, stable terrain/command refs and Z=0 pick |
| Example | `packages/sandcastle/gallery/scenegis-planar-terrain/**` | Deterministic Surface clearance action plus preserved navigation, Lighting, Mountain and Home controls |
| Durable docs | ADR-0025/0026, Architecture, DevelopmentGuide and PlanarWorld guides | Endpoint clearance and explicit no-sweep boundary |

## Implementation summary

The controller validates and owns `minimumTerrainClearance`, queries only resident terrain at the Camera world XY,
falls back to Z=0, and pushes finite surface poses only along world +Z. The same resolver runs before input and again
only after an input path that may move the Camera. Underground mode performs neither query nor correction. Existing
A1 pointer anchors and A2 held target snapshots remain unchanged. Product runtime changes are confined to one
SceneGIS-owned controller file.

## Validation evidence

- Controller after A3-R002: 47/47, Exit 0; A3 direct unique cases=7 (initial clearance 3, crossing 2 and tangent recovery 2).
- Terrain-navigation real Context: 1/1, Exit 0; existing case expanded through bidirectional held crossing.
- Existing navigation depth: 4/4, Exit 0; focused aggregate=50/50.
- `npm run build`, `build-ts`, `build-docs`, `tsc`: Exit 0; only existing repository-wide TSD-JSDoc warnings.
- Gallery discovery: 307 examples, Exit 0; no-embedding Sandcastle build: Exit 0 with non-blocking chunk/plugin warnings.
- Scoped lint/format/docs, `git diff --check` and official upstream audit: Exit 0.
- Generated types/API expose `minimumTerrainClearance: number`; non-underscore export inventory remains `24/2/26`;
  generated status is zero.
- Architecture independently reran the post-R001 Controller suite (45/45), Exit 0. Static path review then found that
  the suite continues held Perspective movement through tangent but does not exercise release exactly at tangent or
  the Orthographic tangent denominator; those gaps are recorded as A3-R002.
- Architecture independently reran the post-R002 Controller suite (47/47), official upstream audit and
  `git diff --check`; all completed with Exit 0. Final path review found no remaining blocking issue.

## Ownership audit

- Upstream-owned product files: `0`.
- A3 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.

## Remaining risks and manual gate

- The contract is endpoint clearance against the latest resident point height, not continuous swept collision,
  wheel crossing, free-look or terrain following.
- Terrain revisions are adopted on the next registered/enabled controller update; terrain lowering never pulls the
  Camera downward.
- Project-owner browser/GPU retest passed the originally listed Surface clearance, underground-side gestures,
  Mountain/Home and Lighting checks, then exposed the crossing gap fixed by A3-R001/R002. The final Sandcastle retest
  also passed bidirectional middle-orbit crossing, release near tangent and subsequent pan/rotate/wheel on the new side;
  the manual gate is closed.

## Findings

| ID | Severity | Status | Finding | Execution disposition |
| --- | --- | --- | --- | --- |
| A3-R001 | major | fixed | Underground skipped clearance correctly, but middle rotate clamped pitch by the starting side and rejected candidate positions that crossed the pivot plane. | Underground now permits the full mirrored pitch range during a held middle drag, preserves the press-time pivot/window anchor/target without repeated terrain queries, and resynchronizes only after release. Controller 45/45, terrain-navigation 1/1, navigation 4/4 and build passed; focused static/docs/audit evidence is recorded below. |
| A3-R002 | major | fixed | Exact tangent is only continued while the original middle drag remains held. If the user releases on a flat terrain/pivot plane, the next gesture calls `_syncRig`, which rejects the equal-side pose and leaves input inert. In Orthographic frustums, continuing the held drag also recomputes `(pivot.z - ray.origin.z) / ray.direction.z` as `0/0`. Preserve or recover a finite held orbit distance and define release-time tangent normalization/recovery without Home, visible angular jump, new terrain queries or free-look. Add one Orthographic held-crossing case and one exact-tangent release/new-gesture case. | The controller snapshots a finite orbit distance at middle press and reuses it for the full underground drag, including Orthographic tangent frames. Releasing exactly at tangent applies a controller-owned signed `EPSILON6` pitch normalization around the unchanged pivot/window anchor/distance before clearing held state. The focused Orthographic held crossing and flat-tangent release followed by pan/wheel/rotate pass in Controller 47/47 with zero Home and no held terrain-query delta. |

### A3-R001 execution evidence

- Deterministic real `CameraEventAggregator` evidence crosses an off-center full 3D pivot above→tangent→below and
  below→tangent→above in held middle drags. The exact tangent frame remains finite and the next movement continues;
  release followed by pan/wheel works on the new side. Pivot projection, target height, mode, zero Home and held
  terrain-query counts are locked.
- A separate surface fixture applies the same large vertical middle movement and remains above the pivot with negative
  pitch, no crossing and no Home.
- The existing non-flat real-Context fixture now crosses below→above→below around the rendered terrain pivot, then
  releases and starts a new-side input. Terrain debug state and cached command references remain identical.
- Product changes remain confined to the SceneGIS-owned controller. No public API, World/Surface/TerrainQuery,
  private Camera helper, Widget/Viewer/upstream, Shader/Worker or build seam changed.

### A3-R002 execution evidence

- One real `OrthographicFrustum` fixture snapshots the press-time orbit distance, reaches exact tangent, then continues
  below the pivot in the same held drag. The distance remains finite and identical, the pivot stays at the original
  window anchor, and resident terrain query counts do not change.
- One flat-terrain Perspective fixture releases exactly at tangent. Release normalizes by a signed `EPSILON6` pitch
  around the unchanged full 3D pivot/window anchor/distance; subsequent pan, wheel and middle drag remain usable and
  finite without Home, mode changes or additional release-time terrain queries.
- `npm run test -- --includeName "SceneGIS/Scene/SceneGISPlanarCameraController"` passed 47/47. The product delta remains
  confined to the SceneGIS-owned controller and uses only controller-owned numeric state and existing scratch objects.
- `npm run build`, changed-scope ESLint/Prettier, affected Markdown Prettier/Markdownlint, `git diff --check` and the
  official upstream audit all exited 0. Audit reports current-delivery upstream-owned entries `0`, generated status
  `0`, and unchanged SGP-0001/0002 tracking.

## Review conclusion

Architecture approves the complete A3 implementation. A3-R001 closes ordinary bidirectional underground middle-orbit
crossing; A3-R002 closes exact-tangent release recovery and Orthographic held continuity. Surface clearance, A1/A2
snapshots, public Z=0 picking, zero-upstream ownership and the no-free-look/no-wheel-crossing boundary remain intact.
The project-owner Sandcastle crossing retest passed, so A3 is `completed` and may form its independent checkpoint before
A4 source audit begins.
