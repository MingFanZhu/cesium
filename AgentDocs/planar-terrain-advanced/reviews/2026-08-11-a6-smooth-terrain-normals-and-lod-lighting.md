# Review: A6 平面地形平滑法线与 LOD 光照连续性

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: Architecture Agent
- Created: `2026-08-11`
- Updated: `2026-08-11`
- Review target: `feature/planar-terrain-advanced` complete working-tree diff relative to
  `bb880b0496e5f9ac71572c723fbfb06cf466e6db`
- Related plan:
  [A6 phase plan](../plans/2026-08-11-phase-a6-smooth-terrain-normals-and-lod-lighting.md)
- Related decision:
  [ADR-0029](../../../Documentation/SceneGIS/Decisions/ADR-0029-planar-smooth-terrain-normals-and-lod-lighting.md)

## Scope

- Review Heightmap and Quantized task-local area-weighted normal generation, oct encoding, skirt copying and
  transferable ownership in the existing terrain Worker protocol.
- Review strict main-thread normal result validation and the atomic two-vertex-buffer/index/VA lifecycle.
- Review unlit/geometric/smooth shader variants, cache identity, imagery ordering, below-surface face-forward and
  exact depth replay.
- Review deterministic CPU continuity evidence, representative tile/LOD boundaries and real Context resource closure.
- Review durable documentation, zero-upstream/zero-SGP ownership and the unchanged generated/public surface.

## Implementation summary

A6 extends the existing Heightmap and Quantized mesh tasks with bounded numeric area-weighted accumulation over the
true surface topology. Each final vertex receives a transferable two-byte oct normal; skirt duplicates copy their
surface-edge normal and skirt triangles do not influence the surface. Main-thread validation rejects malformed normal
streams before GPU mutation. Non-flat content owns a second static vertex buffer in the same atomic candidate boundary
as positions, indices and the VA.

The private Surface shader builder now distinguishes `unlit`, `geometric` and `smooth` modes. Smooth terrain decodes
the oct stream and transforms it with `czm_normal`; flat/no-provider/FLAT fallback retains derivative normals. The
existing command is updated in place and its cache key includes layer count, lighting and normal mode. No public API,
Worker entry, command, pass, Shader asset or build seam was added.

## Review targets

| Area           | Paths                                                | Expected behavior                                                                |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Worker tasks   | `Core/_private/_SceneGISPlanarTerrainWorkerTasks.js` | real topology accumulation, exact oct bytes, skirt copy, transferable ownership  |
| Mesh/runtime   | private terrain mesh finalizer and runtime           | strict preflight, two buffers, atomic rollback, exact release                    |
| Surface        | private Surface shader/builder                       | three modes, complete key, single command, imagery/depth behavior unchanged      |
| Specs          | six focused SceneGIS suites                          | both topologies, continuity, malformed data, rollback, real Context warm/destroy |
| Docs/ownership | SceneGIS durable docs and A6 AgentDocs               | current contract, representative guarantee, zero upstream/SGP/generated          |

## Validation evidence

- Six focused suites pass `65/65` unique cases: Worker `8/8`, mesh `6/6`, terrain runtime `15/15`, Shader `4/4`,
  Surface `30/30`, terrain Widget `2/2`. The Surface include command reports aggregate `34/34` because it also matches
  the four Shader cases. A6 adds two new direct cases and extends existing cases with the remaining assertions.
- Worker evidence covers Heightmap and Quantized exact `Uint8Array` length/transfer, surface-only accumulation, skirt
  copy and unchanged owned input. The curved fixture independently interpolates decoded candidate normals at matching
  representative points on both sides of a shared edge and proves their angular difference is smaller than the two
  face normals. The synthetic Quantized slope decodes to a finite unit normal with positive world Z and dot `>0.998`
  against its analytically expected direction; resolved representative adjacent-tile and parent/four-child world normal
  dot products exceed `0.999`.
- Runtime evidence covers malformed result rejection, exact two-byte-per-vertex storage, two GPU vertex buffers and
  index-allocation failure rollback. Both vertex buffers and owned/shared index paths return debug/resource counts to
  baseline exactly once.
- Real Context Widget `2/2` covers Heightmap and Quantized terrain. The existing Quantized scene now switches from
  unlit to smooth lighting, produces finite changed pixels, and preserves command/VA plus warm lit-shader identity,
  terrain resource counters, imagery/depth behavior and balanced destroy.
- `npm run build` and `npm run build-release`: Exit 0.
- Scoped ESLint/Prettier, affected Markdown checks, `git diff --check` and official upstream audit: Exit 0.

## Ownership audit

- Upstream-owned product/test/build files: `0`.
- A6 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.
- Public API/export/type surface: unchanged; the existing Worker entry and all new normal state remain private.

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                               | Required disposition                                                                                                                                                                                   |
| ------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A6-R001 | medium   | fixed  | `SceneGISPlanarTerrainWorkerTasksSpec` computes `smoothEdgeJump` with `Cartesian3.dot(sharedNormal, sharedNormal)`. This compares one value with itself, so the asserted jump is approximately zero for every normalized output and does not prove that interpolation across the two adjacent triangles improves on the per-face baseline.                            | Architecture focused re-review确认：既有curved fixture已在相邻triangle内独立插值两个candidate normals，锁定finite unit、正角度及相对per-face angle的严格改善。                                         |
| A6-R002 | medium   | fixed  | Quantized normal evidence currently locks only `Uint8Array` length and skirt/source byte copying. The existing Quantized real-Context case remains unlit. An all-zero, inverted or otherwise semantically wrong Quantized surface normal stream could therefore satisfy all Quantized-specific assertions while the review claims both topology paths are smooth-lit. | Architecture focused re-review确认：synthetic Quantized slope锁定解析world normal方向；既有Quantized real-Context scene锁定smooth shader、finite changed lit pixel及command/VA/shader/resource稳定性。 |

### A6-R001 Execution disposition

`fixed`。Existing curved fixture不再比较同一normal：它在共享边同一参数位置的两个相邻triangle内部，分别以
独立barycentric weights插值decoded vertex normals，验证两个candidate都为finite unit、candidate angle为正且严格
小于两face normals的angle。Worker focused suite `8/8` Exit 0。

### A6-R002 Execution disposition

`fixed`。Existing synthetic Quantized slope在中心vertex decode normal，验证components finite、magnitude为1、world
Z `>0.9`，并与由fixture明确X/Y rise推导的expected world normal dot `>0.998`。Existing Quantized Widget scene原地
启用`DirectionalLight`与`world.enableLighting`，验证finite lit pixel与unlit pixel不同、normal mode=`smooth`、cache
key存在，并在后续warm render保持command/VA/lit shader identities、terrain debug counters与destroy balance。
Worker `8/8`、terrain Widget `2/2`均Exit 0；仅有既有Node `DEP0060` warning。

## Accepted risks

- Task-local normals guarantee shared-vertex continuity within a mesh and representative cross-tile/LOD behavior, not
  bit-identical boundary gradients for independently authored provider tiles.
- Degenerate or contribution-free legal vertices use deterministic `+Z`; arbitrary numerical stress matrices are not
  part of A6.
- The normal stream adds exactly two persistent bytes per final terrain vertex and a second vertex-buffer object.
- Final browser/GPU visual qualification, including subjective LOD transition quality, remains an A7/project-owner gate.

## Conclusion

`approved`。Architecture focused re-review确认A6-R001与A6-R002均已关闭，并独立复跑Worker `8/8`、terrain
Widget `2/2`、`git diff --check`与official upstream audit。A6可以形成独立本地checkpoint；A7仍须在该checkpoint后
依据届时源码事实单独建立phase plan。
