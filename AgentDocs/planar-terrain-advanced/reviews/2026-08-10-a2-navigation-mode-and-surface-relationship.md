# Review: A2 平面导航模式与相机—地表关系

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Updated: `2026-08-11`
- Review target: `feature/planar-terrain-advanced` working-tree diff relative to `6657aac8fe1466cef6705e63d840ba32b930f367`
- Related plan:
  [A2 phase plan](../plans/2026-08-10-phase-a2-navigation-mode-and-surface-relationship.md)
- Related decision:
  [ADR-0025](../../../Documentation/SceneGIS/Decisions/ADR-0025-planar-navigation-mode-and-surface-relationship.md)

## Scope

- Review the exact public `navigationMode` constructor/property contract and held-input isolation.
- Review resident terrain → Z=0 relationship fallback, terrain-first center target and Z-preserving XY clamp.
- Review surface compatibility and underground above/down plus below/up pan/rotate/wheel behavior.
- Review deterministic and real-Context evidence, public generation, ownership and A3 boundary.

## Summary

Architecture/code review approves the complete A2 implementation and its corrected acceptance page. The public
`"surface" | "underground"` contract remains unchanged. The existing terrain Sandcastle now exposes the active mode
and a deterministic mirrored underground view, so the project owner can exercise below-surface pan/rotate/wheel
without confusing the default surface Home recovery with missing functionality.

## Review targets

| Area                | Paths                                                                                      | Expected behavior                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Product             | `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`                  | Exact mode, atomic input transition, terrain-aware center rig, mirrored below-side orbit                    |
| Deterministic Specs | `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`               | Public contract, source order, idle/query boundary, large-offset perspective/orthographic gestures and Home |
| Real Context        | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js` | Non-flat terrain above/below pivot and zero terrain-runtime mutation                                        |
| Durable docs        | ADR-0004/0024/0025, Architecture, DevelopmentGuide and PlanarWorld guides                  | A2 contract and explicit A3 collision boundary                                                              |

## Findings

| ID      | Severity | Status | Finding                                         | Closure evidence                                                     |
| ------- | -------- | ------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| A2-R001 | high     | closed | Held drag did not retain one terrain snapshot.  | Stable drag snapshot and query-count fixtures passed.                |
| A2-R002 | high     | closed | Camera-local and center terrain were conflated. | Independent relationship and target fixtures passed.                 |
| A2-R003 | medium   | closed | The example did not expose underground mode.    | Selector, deterministic view and project-owner visual retest passed. |

### A2-R003 execution disposition

The existing page now directly reads/writes `viewer.planarCameraController.navigationMode`, displays the active
profile, and provides a deterministic Underground view that switches mode before placing a mirrored below/up mountain
pose. Mountain view, Lighting and Home remain; Home preserves mode, and the page explains default surface recovery and
the A3 crossing boundary. Scoped ESLint/Prettier, gallery discovery (307 examples) and the no-embedding Sandcastle build
all exited 0. Architecture focused re-review and project-owner retest of the same page are requested.

## Validation reviewed

- Controller focused after fixes: 40/40, Exit 0; A2 direct unique cases=6.
- Terrain-navigation Widget: 1/1 real Context, Exit 0; existing case expanded above/below.
- Existing navigation depth: 4/4, Exit 0; World: 20/20, Exit 0.
- `npm run build`, `build-ts`, `build-docs` and `tsc`: Exit 0. `build-ts` emitted existing repository-wide
  TSD-JSDoc warnings.
- Scoped lint/format/docs/diff and official upstream audit: final results recorded in the phase plan.
- Architecture independently reran the corrected controller suite: 40/40, Exit 0, including both focused fixtures.
- Architecture independently reran the terrain-navigation real-Context suite: 1/1, Exit 0.
- Architecture independently reran the official upstream audit and `git diff --check`: both Exit 0; the latter emitted
  line-ending notices only.
- Execution focused fix validation: terrain-navigation Widget 1/1 and `npm run build` Exit 0; scoped static/docs/audit
  evidence is recorded in the phase plan.
- A2-R003 Sandcastle-only fix: scoped ESLint/Prettier Exit 0;
  `npm run build-gallery-no-embedding` Exit 0 (307 examples); `npm run build-sandcastle -- --no-embeddings` Exit 0 with
  non-blocking chunk/plugin timing warnings.

## Ownership audit

- Upstream-owned product files: `0`.
- A2 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.

## Accepted risks

- Resident height and terrain cover are last-successful local snapshots and may change at the next gesture.
- A2 deliberately does not provide collision, clearance, crossing, free-look or programmatic per-frame correction.
- The project owner passed the updated Sandcastle surface/underground, pan, rotate and wheel retest on `2026-08-11`.
- Manual attempt on `2026-08-11` failed because the example remained in default surface mode; this is tracked as
  A2-R003 rather than a controller regression.

## Conclusion

Architecture/code review approved with A2-R001/R002/R003 closed. Product behavior, drag snapshots and relationship
separation remain intact; the SceneGIS-owned example makes the underground profile directly testable, and the project
owner passed that visual retest on `2026-08-11`. A2 is approved for its independent local checkpoint; A3 has not
started.
