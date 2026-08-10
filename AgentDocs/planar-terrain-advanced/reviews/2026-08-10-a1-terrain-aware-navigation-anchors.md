# Review: A1 平面地形感知导航锚点

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-10`
- Updated: `2026-08-10`
- Review target: `feature/planar-terrain-advanced` working-tree diff relative to `1d93c1686b`
- Related plan:
  [A1 phase plan](../plans/2026-08-10-phase-a1-terrain-aware-navigation-anchors.md)
- Related decision:
  [ADR-0024](../../../Documentation/SceneGIS/Decisions/ADR-0024-planar-terrain-aware-navigation-anchors.md)

## Scope

- Review the private rendered-depth → terrain → Z=0 resolver and finite anchor-height plane math.
- Review pan/rotate/wheel snapshot, allocation and existing Z=0 rig compatibility.
- Review deterministic controller evidence and the local real-Context terrain navigation closure.
- Confirm product ownership remains one SceneGIS-owned controller file with no public/build/upstream seam.

## Summary

Architecture/code review approves the implementation. Pan and rotate capture a full Cartesian3 anchor once per drag;
wheel resolves each event into a reusable controller-owned anchor. Valid depth avoids terrain traversal, while depth
miss falls back to actual-cover terrain and then bounded reference plane. Home, target clamp, `_syncRig`, public World
picks and terrain runtime are unchanged.

## Review targets

| Area                | Paths                                                                                      | Expected behavior                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Product             | `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarCameraController.js`                  | Shared resolver; nonzero anchor-height pan/zoom; full 3D rotate pivot; no hot-path allocation |
| Deterministic Specs | `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarCameraControllerSpec.js`               | Source priority, lifecycle, projections, large offset and negative height                     |
| Real Context        | `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarTerrainNavigationCesiumWidgetSpec.js` | Rendered terrain pivot, public Z=0 compatibility and zero terrain mutation                    |
| Durable docs        | ADR-0004/0010/0024, Architecture, DevelopmentGuide, PlanarWorld guides                     | A1 successor boundary and upgrade checks                                                      |

## Findings

| ID   | Severity | Status | Owner role   | Location      | Finding                      | Disposition / evidence              | Follow-up                                                         |
| ---- | -------- | ------ | ------------ | ------------- | ---------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| None | note     | closed | architecture | Review target | No blocking finding.         | Matches ADR-0024 and focused Specs. | Manual Sandcastle retest remains open.                            |

## Validation reviewed

- Controller focused: 34/34, Exit 0.
- A1 terrain-navigation Widget: 1/1 real Context, Exit 0.
- World terrain query regression: 20/20, Exit 0.
- Existing navigation depth regression: 4/4, Exit 0.
- `npm run build`: Exit 0.
- Scoped ESLint/Prettier, Markdown checks, `git diff --check` and official upstream audit: final matrix recorded in
  the phase plan.
- Focused aggregate 59 cases; A1 direct unique 5 cases.
- Architecture independently reran the controller suite (`34/34`) and the real-Context terrain-navigation Widget
  suite (`1/1`); both passed. The official upstream audit also passed with current-delivery upstream-owned files=`0`
  and generated status=`0`.

## Ownership audit

- Upstream-owned product files: `0`.
- A1 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.

## Accepted risks

- Rendered depth and terrain cover are snapshots from the latest successful normal render.
- Transparent visual anchors follow Scene's existing `pickTranslucentDepth` policy.
- Collision, clearance, underground navigation and automatic camera recovery remain outside A1.
- The project owner passed the existing Sandcastle middle/pan/wheel manual retest on `2026-08-10`.

## Conclusion

Architecture/code review approved with no blocking finding. The implementation keeps one shared private
depth → terrain → Z=0 resolver, preserves public Z=0 picking and the existing rig boundary, and provides direct
evidence that nonzero pan/rotate/zoom anchors distinguish the previous Z=0 behavior. The project owner subsequently
passed the existing Sandcastle middle/pan/wheel manual retest. A1 is approved for its independent local checkpoint;
A2 has not started.
