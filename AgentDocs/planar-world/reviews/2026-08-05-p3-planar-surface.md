# Review: P3 Planar Surface Runtime

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-05`
- Updated: `2026-08-05`
- Review target: working-tree implementation diff from
  `031159f825add33115980ada4ebfc6b8d3945ecd` on `feature/planar-world`
- Related plan:
  [P3 planar surface plan](../plans/2026-08-05-phase-3-planar-surface.md)
- Related ADR:
  [ADR-0003](../../../Documentation/SceneGIS/Decisions/ADR-0003-planar-surface-runtime-and-lod.md)

## Scope

Review the new public `SceneGISPlanarWorld`, its three SceneGIS-owned private runtime roles,
the Scene/Widget integration Specs, and the P3 documentation evidence. Confirm that the diff
implements only ADR-0003 and does not enter camera, picking, imagery, async loading or P4.

Product source and Specs under review:

- `packages/engine/Source/SceneGIS/Scene/SceneGISPlanarWorld.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSurface.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISPlanarWorldSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarSurfaceSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarQuadtreeSpec.js`
- `packages/engine/Specs/SceneGIS/Scene/_private/SceneGISPlanarTileSpec.js`
- `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarWorldCesiumWidgetSpec.js`

## Summary

The implementation provides a SCENE3D-only, synchronously ready planar surface with a single
implicit quadtree, perspective and orthographic SSE, deterministic protected-tile LRU, shared
unit-quad GPU resources, per-tile model matrices, and exactly-once destruction. It preserves the
P1 primary-world construction seam without modifying upstream files.

Expected review behavior includes:

- constructor/API validation, immutable coordinate-system ownership, mutable color clone
  semantics and lifecycle conformance;
- visibility-before-SSE selection, zero-thickness OBB, exact closed-rectangle camera distance,
  maximum-level and Float32 scale guards;
- ideal/renderable separation, stable tile keys and deterministic cache trimming;
- lazy single-Context GPU ownership, warm-frame reuse, duplicate-render suppression and
  exactly-once release;
- exact default/changed/large-offset pixel evidence and non-Globe Widget construction;
- public root/types/docs visibility for `SceneGISPlanarWorld` while private roles remain absent
  from declarations and API HTML.

## Findings

| ID      | Severity | Status  | Owner role  | Location                                             | Finding                                                                                                                                             | Disposition / evidence                                                                                                                                                                                                                                                                                                   | Follow-up |
| ------- | -------- | ------- | ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| P3-R001 | `high`   | `fixed` | `execution` | `_SceneGISPlanarQuadtree.js`; Quadtree/Surface Specs | `getOrthographicHeight` first read `frustum.offCenterFrustum`, so real `PerspectiveFrustum` used the orthographic formula.                          | Frustum classification now handles real `PerspectiveFrustum`, `PerspectiveOffCenterFrustum`, `OrthographicFrustum` and `OrthographicOffCenterFrustum` before structural fallbacks. Real perspective Z=`100000000` selects root while Z=`64` selects Level 1; Quadtree 11/11, Surface 13/13 and WebGL 34/34.              | Closed    |
| P3-R002 | `medium` | `fixed` | `execution` | `_SceneGISPlanarSurface.js`; Surface Specs           | Bound worlds allowed different Contexts through zero-buffer/culled early returns and could mutate selection before rejection.                       | Shared `validateContext` now runs first in both `beginFrame` and `render`; zero-buffer, offscreen and visible different-Context paths throw without changing frame/selection state. Unbound zero-buffer/culled frames remain lazy. Surface 13/13 and WebGL 34/34.                                                        | Closed    |
| P3-R003 | `medium` | `fixed` | `execution` | Quadtree/Surface Specs; P3 phase plan                | Frustum-plane equality, outside-extent background and eviction/shared-resource behavior lacked direct evidence; private Spec paths were wildcarded. | Added a real `CullingVolume` touching-plane regression, exact 3x1 black/red/black pixel evidence, and a five-eviction fixture retaining the same VA/shader with zero shared destroys. Listed all three Spec filenames and documented constructor-symbol basename convention. Quadtree 11/11, Surface 13/13, WebGL 34/34. | Closed    |

## Validation reviewed

- Dedicated Specs: Tile 3/3, Quadtree 11/11, Surface 13/13, World 7/7 and Widget 1/1.
- WebGL validation aggregate: 34/34.
- P1/default regressions: SceneGIS Widget integration 16/16, CesiumWidget 75/75, Globe 119/119
  and Scene 177/177.
- `build`, `build-release`, `build-ts`, `build-docs` and `tsc`: Exit 0.
- Scoped ESLint, source/spec Prettier, SceneGIS Markdown Prettier, Markdownlint and
  `git diff --check`: Exit 0.
- `SceneGISPlanarWorld` is present in root JS/types/API docs; the three private modules are absent
  from declarations and public HTML. Generated outputs are absent from git status.
- Full pixel, selection, cache, warm-frame and destruction fixtures are recorded in the related
  phase plan.
- Real-frustum regressions cover all four Cesium perspective/orthographic frustum types. The
  standard perspective near/far fixture now changes from Level 0 to Level 1 as distance decreases.
- Bound Context A rejects zero-buffer, fully culled and visible Context B before mutable state;
  unbound empty frames remain unbound.
- A real culling plane touching the root is not `OUTSIDE`; the 3x1 pixel fixture is exactly
  black/red/black; five tile evictions leave shared VA/Buffer/Shader destruction counters at zero.
- Architecture re-review independently reproduced the real `PerspectiveFrustum` distance case:
  Z=`100000000` selects one Level 0 tile and Z=`64` selects four Level 1 tiles.
- Architecture re-review independently ran the SceneGIS planar WebGL aggregate (34/34), scoped
  ESLint/Prettier, SceneGIS documentation formatting/linting and ownership/diff audits; all
  completed with Exit 0.

An initial attempt to run three gulp test commands concurrently hit Windows `EPERM` while the
processes competed to clean `Build/CesiumUnminified`. All affected commands were rerun serially
and passed; this is recorded as runner evidence, not as a product finding.

## Ownership audit

- Implementation diff base: `031159f825add33115980ada4ebfc6b8d3945ecd`.
- Upstream-owned files: `0`.
- P3 SGP entries: `0`.
- `.scenegis/upstream-patches.json`: unchanged.
- `SCENEGIS_PATCH` markers added by P3: `0`.
- Generated/build files in final status: `0`.
- Commit/push performed by Execution Agent: no/no.

## Accepted risks

Architecture accepts the documented Cesium private renderer API upgrade sensitivity for this
SceneGIS-owned runtime. Camera/picking and async imagery/loading remain explicit P4/P5 deferrals,
not incomplete P3 behavior. No finding is waived or left unresolved.

## Conclusion

Architecture/code re-review approves P3. P3-R001 through P3-R003 are reviewer-confirmed `fixed`;
there are no unresolved findings. P3 may be committed locally as its own phase checkpoint. This
approval does not authorize a push or any P4 implementation.

## Post-approval correction discovered by P4

P3 review 继续为 `approved`，既有 findings 与结论不改写。P4 depth-picking 验收发现
Surface 需要复用最近正常 render commands 到 pick+depth pass；Architecture Agent 已将
该 SceneGIS-owned correction 授权纳入 P4。第二次裁决进一步采用 selection OBB 与
DrawCommand BoundingSphere 的双包围体职责，避免 zero-thickness plane 精确落在 near
plane 而写入 raw depth `0`。最终 Tile 4/4、Surface 18/18、P3 planar WebGL aggregate
62/62；三个独立真实 Widget fixtures 分别覆盖默认 depth、首次 translucent-depth replay
和 non-log linear depth，均得到 `0 < rawDepth < 1` 且与 mathematical pick 在 `1e-4`
内一致。P3 状态与原 findings/approval 均不变；完整源码事实、实现路径、验证矩阵和
ownership audit 见 P4 plan/review。
