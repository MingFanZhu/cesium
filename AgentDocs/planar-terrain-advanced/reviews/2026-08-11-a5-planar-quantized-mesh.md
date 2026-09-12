# Review: A5 平面 Quantized-mesh Terrain

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: Architecture Agent
- Created: `2026-08-11`
- Updated: `2026-08-11`
- Review target: `feature/planar-terrain-advanced` complete working-tree diff relative to
  `bf339ee853c9ad0eb484c34b09771e56d426707f`
- Related plan:
  [A5 phase plan](../plans/2026-08-11-phase-a5-planar-quantized-mesh.md)
- Related decision:
  [ADR-0028](../../../Documentation/SceneGIS/Decisions/ADR-0028-planar-quantized-mesh-terrain.md)

## Scope

- Review the two public Core contracts, quantized binary/data ownership, URL/Request/provider behavior and public exports.
- Review the three additional task kinds in the single existing terrain Worker and the main-thread validation boundary.
- Review irregular mesh/query metadata, true-triangle child clipping, async fallback states and shared task/promotion budgets.
- Review per-tile CPU/GPU index ownership, Heightmap compatibility, resident query/sampler and real Context closure.
- Review build/release/types/docs/installed-package delivery, private boundary and zero-upstream audit.

## Implementation summary

A5 adds coordinate-agnostic quantized-mesh TerrainData and URL provider contracts. The existing terrain Worker now safely
decodes binary tiles, creates irregular surface/skirt meshes plus a bounded query grid, and clips true parent triangles
into independent direct-child fallback data. The existing terrain runtime dispatches by data capability while retaining
Heightmap synchronous upsample/shared topology, the shared two-start/two-promotion budgets, four-child coverage,
generation isolation and exact depth command replay. Quantized indices are tile-owned and balanced across rollback,
replacement, eviction, provider lifecycle and destroy.

## Review targets

| Area                 | Paths                                                                 | Expected behavior                                                                                             |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Public data/provider | two new `Source/SceneGIS/Core/SceneGISPlanar*QuantizedMesh*.js` files | atomic ownership/preflight, true triangles, canonical URL provider, exact public metadata                     |
| Worker protocol      | existing private terrain Worker tasks/scheduler                       | safe 16/32-bit decode, extension skip, irregular mesh/query grid, direct-child clip, transfer ownership       |
| Runtime/query        | private terrain mesh/runtime/query                                    | capability dispatch, shared budgets, stale isolation, per-tile index balance, bounded actual-triangle queries |
| Specs                | focused Core/Renderer/Scene/Widget Specs                              | direct/fallback/mixed format, TaskProcessor, real Context imagery/depth/query/pick/warm/destroy               |
| Delivery/docs        | package smoke, ADR/durable docs, AgentDocs                            | inventory 26/2/28, public visible/private hidden, zero upstream/SGP/generated                                 |

## Validation evidence

- Focused aggregate 60/60 across nine suites; A5 direct unique new cases=22. Heightmap regressions separately pass
  TerrainData 10/10 and URL provider 13/13.
- Actual `TaskProcessor("SceneGISPlanarTerrainWorker")` executes local small quantized input with transferable ownership;
  Worker suite 7/7. The repository 32-bit fixture reaches that branch and is rejected for its real degenerate triangle;
  a valid deterministic Uint32 mesh proves the success branch.
- Real Context terrain Widget 2/2: public URL provider, actual Worker, EPSG:3857 quantized terrain with imagery,
  resident query/terrain pick/depth, single command, exact warm/replay identities and balanced owned indices/resources.
- `npm run build`, `build-release`, `build-ts`, `build-docs`, and `tsc`: Exit 0. Build-ts emitted only existing
  repository TSD-JSDoc warnings.
- Installed-package smoke: Exit 0; engine/widgets/root public inventory 26/2/28, ESM/CJS/tar/broken-entry and
  declarations/API/private boundaries passed.
- Scoped ESLint/Prettier, affected Markdown checks, `git diff --check`, and official upstream audit: Exit 0.

## Ownership audit

- Upstream-owned product/test/build files: `0`.
- A5 SGP: `0`.
- `.scenegis/upstream-patches.json`, SGP-0001 and SGP-0002: unchanged.
- New `SCENEGIS_PATCH` markers: `0`.
- Generated files in status: `0`.
- Public root JS/types/API contain both new types; private Worker task and TerrainData clone/mesh seams have zero
  declaration/API hits.

## Findings

| ID      | Severity | Status | Owner role | Summary                                      |
| ------- | -------- | ------ | ---------- | -------------------------------------------- |
| A5-R001 | high     | fixed  | execution  | Canonicalize unordered edge lists for skirts |
| A5-R002 | medium   | fixed  | execution  | Close the GPU allocation rollback boundary   |
| A5-R003 | low      | fixed  | execution  | Preserve public `DeveloperError` preflight   |

### A5-R001：无序 edge list 生成错误 skirt

- Location：`Core/_private/_SceneGISPlanarTerrainWorkerTasks.js`的`createQuantizedMesh` / `appendQuantizedSkirt`。
- Finding：Public data和binary decode正确地允许edge index无序，但mesh task直接按输入顺序连接相邻skirt
  vertex。仓库自带`QuantizedMesh/tile.terrain`的west/east edge实际均非单调；当前输出因此形成回折、重叠且
  交替winding的skirt，而不是沿四条tile边界的稳定closed skirt。
- Evidence：Architecture独立解码真实fixture，west/east coordinate sequence均为`ascending=false`且
  `descending=false`。Cesium 1.144的`createVerticesFromQuantizedTerrainMesh`不会信任输入顺序，而是在生成skirt
  前分别构造west S→N、south E→W、east N→S、north W→E序列。A5 upsample output已经使用这一方向，但direct
  mesh path没有。
- Required follow-up：在不修改TerrainData-owned storage的前提下，对Worker clone做四边canonical ordering后再
  生成skirt；用真实无序fixture和一个小型synthetic fixture锁定相邻edge pair、方向、无回折/重复覆盖以及既有
  surface/query结果不变。
- Execution disposition：`fixed`。`canonicalizeQuantizedEdges`只复制并排序Worker task输入，按west S→N、
  south E→W、east N→S、north W→E生成skirt，不修改TerrainData-owned edge arrays。Worker focused 7/7
  同时覆盖仓库真实无序tile、synthetic四边无序mesh、相邻source pair/严格方向、输入数组不变和既有direct-child
  upsample成功。

### A5-R002：index allocation 不在完整 GPU rollback 边界内

- Location：`Scene/_private/_SceneGISPlanarTerrain.js`的`_createContent` / `_acquireIndex`。
- Finding：`_createContent`先成功创建vertex buffer，随后在现有`try`边界之外调用`_acquireIndex`。若Quantized
  tile-owned（或首次Heightmap shared）index buffer创建抛错，已创建vertex buffer既不会destroy，也没有content
  可供后续release，违反本阶段声明的candidate rollback与exactly-once GPU ownership。
- Evidence：现有catch只覆盖`new VertexArray`；`Buffer.createIndexBuffer`异常在进入catch之前逸出。A5新增的
  tile-owned index分支扩大了这一可达失败边界，而当前Specs只验证成功后的destroy balance。
- Required follow-up：把vertex/index/VA创建纳入同一原子cleanup boundary；保留原始异常，owned/shared各自只
  释放已实际取得的资源与reference。补一个index creation failure focused fixture，证明vertex buffer、shared
  map/ref及debug计数回到baseline。
- Execution disposition：`fixed`。`_createContent`现在将vertex buffer、owned/shared index acquisition和
  `VertexArray`放入同一`try`，catch只销毁/释放已实际取得的资源并原样重抛。Terrain runtime focused 15/15；
  tile-owned index创建抛出指定`Error`时，candidate vertex exactly-once destroy，index/shared reference/map与
  对应debug counters保持baseline。

### A5-R003：非法 subdomains 泄漏 TypeError

- Location：`Core/SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.js`的`copySubdomains`。
- Finding：非string且非Array的非法`subdomains`会先执行`value?.slice()`；例如`subdomains: 5`抛出原生
  `TypeError: value?.slice is not a function`，与constructor声明的`DeveloperError` fail-fast契约不符。
- Evidence：Architecture以真实public constructor复现；同仓库已批准的Heightmap URL provider先判定
  string/Array再复制，因此不存在该异常类型泄漏。
- Required follow-up：与Heightmap provider对齐，先验证string或non-empty string array，再复制caller array；
  增加一个代表性非法值和caller-array clone断言，不扩大参数矩阵。
- Execution disposition：`fixed`。`copySubdomains`先验证string/Array形状，再复制并验证成员；provider focused
  5/5证明`subdomains: 5`稳定抛`DeveloperError`，并证明constructor持有caller array clone。

## Accepted risks

- Cesium 1.144 TaskProcessor has no per-task abort; stale work completes and is token-dropped without destroying the
  shared Worker.
- The repository 32-bit fixture contains a degenerate triangle and is therefore a negative contract fixture; valid
  Uint32 success is covered by deterministic generated data rather than a second downloaded binary.
- A5 intentionally omits layer.json, sparse availability, service extensions, public network and reprojection.
- The large-offset depth comparison uses a finite 50 m tolerance at a 45,000 km camera distance; CPU resident query and
  terrain ray pick remain exact to the actual Float32 surface.

## Conclusion

Architecture focused re-review确认A5-R001～R003均已关闭：Worker只在task clone上建立canonical edge顺序，
GPU candidate创建覆盖完整vertex/index/VA rollback边界，public Provider对非法`subdomains`稳定执行
`DeveloperError` fail-fast。修复没有改变TerrainData-owned storage、public API、Worker entry或runtime预算。

Architecture独立复跑provider `5/5`、Worker `7/7`和terrain runtime `15/15`，均Exit 0；另行复跑official
upstream audit与`git diff --check`，确认current-delivery upstream-owned files=`0`、A5 SGP=`0`、generated
status=`0`。首轮其余build/release/types/docs/package、mesh/data/upsample/query/real-Context证据继续有效。

Architecture批准A5完整实现。A5状态改为`completed`，可以形成独立中文本地checkpoint；A6只能在该checkpoint
之后依据当时源码事实建立phase plan。
