# Review: T4 平面地形查询、拾取与独立采样

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-07`
- Updated: `2026-08-07`
- Review target: `feature/planar-terrain` complete working-tree diff relative to
  `8c72ac3ef76071da24fad820bf3b75cb4899127b`
- Related plan:
  [T4 terrain query/picking phase plan](../plans/2026-08-07-phase-t4-terrain-query-and-picking.md)
- Related ADR:
  [ADR-0010](../../../Documentation/SceneGIS/Decisions/ADR-0010-planar-terrain-query-picking-and-sampling.md)
- SGP: None；T4 upstream-owned files=`0`

## Review scope

- Public `SceneGISPlanarTerrainSampler` namespace与 World resident/ray/window terrain APIs。
- Private Float32 surface triangle height/ray query、skirt exclusion、FLAT occlusion和 stable result reuse。
- Quadtree read-only lookup与 Surface reusable actual-cover snapshot publish/invalidation lifecycle。
- Sampler provider preflight、grouping、availability/metadata、scheduler defer、failure policy和input ownership。
- Perspective/orthographic window integration、真实 WebGL terrain height/pick/depth/Z=0职责闭环。
- Root JS/types/API docs、private visibility、zero-upstream/zero-SGP与 generated delivery审计。

## Implementation summary

- Resident height按 owner rule从最深 existing canonical tile向 root查询，只消费 DIRECT/UPSAMPLED
  active Float32 mesh；FLAT/no mesh继续 ancestor，全程不创建/touch tile。
- Surface复用固定 snapshot array/entry，在每次 normal render开始失效、actual commands成功提交后
  发布；provider变更、hidden、zero buffer/no cover、revision mismatch和destroy均安全失效。
- Terrain ray转换到 tile-local space并保持 affine `t`，先做 closed local AABB broad phase，再只扫描
  `surfaceIndexCount`；支持双面、非单位 ray、`t=0`、nearest与FLAT遮挡，排除skirt。
- Sampler在任何 request前原子验证，按 unique tile建立独立 terrain Request，metadata最多一次，
  scheduler defer使用private macrotask delay；runtime failure按flag局部容错或整体reject，不raise event、
  不修改输入、不访问World cache。

## Validation evidence

完整命令、计数和 warnings见 T4 phase plan “Execution results”。关键结果：

- Sampler `7/7`；private query `7/7`；World `18/18`；Quadtree `14/14`；Surface aggregate
  `26/26`；terrain Widget `1/1`；navigation Widget `4/4`。
- 真实 Context tile-interior point中 resident height、window terrain pick与无遮挡
  `scene.pickPosition`在既有depth tolerance内一致；同ray `world.pick`仍为Z=0，query前后 terrain
  counters不变。
- `npm run build`、`build-ts`、`build-docs`、`tsc`和scoped static/docs checks均Exit 0；build-ts只产生
  仓库既有TSD-JSDoc warnings。

## Ownership audit

- Upstream-owned files: `0`。
- T4 SGP: `0`；patch manifest、SGP-0001与SGP-0002 unchanged。
- New `SCENEGIS_PATCH` markers: `0`。
- Shader/Worker/build seam: `0`。
- Generated delivery status: `0`。
- Public root/types/API包含 sampler与三个World methods；private query declarations/API HTML命中`0`。

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Required disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4-R001 | high     | fixed  | Private point query先按理想 double grid计算唯一 `row/column`，再用已经 Float32量化的 vertex X/Y测试该 cell；二者的内部 grid line并不总重合。Reviewer以普通 `4×4` mesh复现：`x=42.66666666666666, y=13.123` 位于连续 surface内，但 `getHeight` 返回 `undefined`；`6×6`、`7×7`、`10×10` 也有同类漏查。Ray broad phase同时使用 decoded `mesh.minimumHeight/maximumHeight`，而不是 `referenceHeight + Float32 position.z` 的真实 surface extrema；Float64 `[0.1, 0.2, 0.1, 0.2]` mesh的 west edge实际为 `0.09999999925494196 < 0.1`，沿该高度进入的水平 ray会在 triangle test前被错误裁掉。这两处都违反“resident/ray query以实际 Float32 surface mesh为事实源”。现有所谓 non-unit ray Spec又使用 `new Ray(..., direction)`，但 Cesium `Ray` constructor会 normalize direction，因此并未锁定 public contract。 | Point query必须依据实际 Float32 XY coverage选择 cell，或在固定 O(1)邻域内查找实际包含点的 surface triangles；不得回退 TerrainData double interpolation。Ray broad volume必须对实际 Float32 surface extrema保守且继续排除 skirt。增加一个非 `2^n+1` regular grid内部线 regression，以及上述 Float64量化/水平 side-ray regression；后者直接传入 direction magnitude非 1 的 structural ray，证明 non-normalized、double-sided、surface-only semantics。无需扩大成尺寸/数值矩阵。 |
| T4-R002 | high     | fixed  | `invalidateTerrainQuerySnapshot` 只把 count设为 0，没有清除 reusable entries中的 `tile`、`content` 和独立 `mesh` strong references。Provider replacement/detach、hidden/no-cover或 render cover由多 tile缩小时，即使 Terrain runtime已经 destroy content并把 `content.mesh` 清空，`snapshot[i].mesh` 仍会让旧 Float32 positions/indices和 tile/content对象保留到 future equal-size cover或 World destroy。大 mesh/多 tile下这绕过 T3 cache/provider lifecycle，snapshot实际成为 CPU resource retention owner。                                                                                                                                                                                                                                                                                            | 失效时在不丢弃 reusable entry object identity、不产生 steady-frame allocation的前提下清除上一个有效范围的所有 strong fields；cover shrink后的 tail也必须为空。Specs应保留 warm snapshot array/entry identity证据，并证明 provider replacement/detach及 multi-tile→smaller/no-cover后旧 mesh/tile/content不可再由 snapshot entry到达。                                                                                                                                         |
| T4-R003 | medium   | fixed  | `sampleGroup` 对同一 tile逐位置直接写共享 `results`。如果前一个 interpolation finite、后一个返回 non-finite或 throw，默认 failure catch只吞掉异常，已经写入的前一个 height不会回滚；Reviewer复现结果为 `[7, undefined]`。ADR-0010要求 runtime tile failure令该 tile的所有对应结果为 `undefined`，不能返回部分成功。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 对每个 group先完成全部 interpolation validation再原子提交，或在 tolerated failure时清除该 group所有 indices。补一个同 tile两位置“先成功、后失败”fixture：默认结果两项都为 `undefined`，其他 tile仍成功；`rejectOnTileFail=true`继续整体 reject，inputs unchanged。                                                                                                                                                                                                            |
| T4-R004 | medium   | fixed  | Scheduler defer loop使用 `setTimeout(resolve, 0)`；provider持续返回 `undefined` 时，每个 unique tile都会以 event-loop允许的最高频率重复调用 provider。Reviewer在 30 ms内已观察同一 tile被调用 4次。现有 Spec只证明第二次最终成功，无法证明其名称所称的“without busy polling”。这不满足已批准的“private delayed retry、不得 busy-poll”，多 tile受限时还会成倍放大。                                                                                                                                                                                                                                                                                                                                                                                                                                        | 使用非零 fixed delay或有界 backoff；具体数值仍保持 private，可参考 Cesium `sampleTerrain` 的 100 ms drain delay。用 fake clock或等价确定性 Spec证明 delay窗口前不会再次调用，窗口后才重试；不需要永久 pending或真实等待矩阵。                                                                                                                                                                                                                                                 |

### Execution focused-fix evidence

- `T4-R001`：`_SceneGISPlanarTerrainQuery.getHeight` 在理想 cell周围固定 `3×3` 邻域测试实际
  Float32 triangles；ray slab从 `surfaceVertexCount` 范围计算实际 Float32 Z extrema，不含 skirt。
  Query Specs新增普通 `4×4` 内部 grid line与 Float64 `[0.1, 0.2, 0.1, 0.2]` 西缘 structural
  direction magnitude `2` 双向水平 ray；focused query `7/7` Exit 0。
- `T4-R002`：`invalidateTerrainQuerySnapshot` 清除上一有效范围内每个 reusable entry的
  tile/content/mesh/source/revision/key strong fields后再清 count。Surface Specs锁定 replacement/detach、
  multi-entry shrink/no-cover清理以及 array/entry identity复用；Surface aggregate `26/26`、World
  `18/18` Exit 0。
- `T4-R003`：`sampleGroup` 先把一个 tile全部 finite heights写入临时数组，完整验证后才提交共享
  results。Sampler Spec锁定同 tile先成功后 NaN时该组全 undefined、另一 tile成功、reject模式整体
  DeveloperError且 inputs unchanged；sampler `7/7` Exit 0。
- `T4-R004`：scheduler defer改为 private fixed `100 ms` delay。Jasmine fake clock锁定 `99 ms` 内不
  重试、到 `100 ms` 后才发生第二次请求；sampler `7/7` Exit 0。
- Focused rerun还包括 `npm run build`、changed-scope ESLint/Prettier、planar-terrain Markdownlint、
  `git diff --check` 与 upstream audit，全部 Exit 0。按评审指定最小矩阵未重复 WebGL/navigation、
  Quadtree、build-ts/build-docs/tsc；保留首轮既有通过证据。

Reviewer 独立复核了完整产品 diff和相关 Specs，并运行：

- `SceneGIS/Core/SceneGISPlanarTerrainSampler`：`6/6`，Exit 0；
- `SceneGIS/Scene/_SceneGISPlanarTerrainQuery`：`5/5`，Exit 0。

上述现有 suites通过，但没有覆盖四项 finding。Reviewer另以只读 Node fixture复现：普通非
`2^n+1` mesh内部 grid line漏高程、Float32 Z extrema误裁、同 tile interpolation部分写入，以及
zero-delay持续重试。Working-tree范围仍全部位于已批准的 SceneGIS-owned product/Spec/docs路径，
upstream-owned files=`0`、T4 SGP=`0`；本轮未发现需要新 ADR、SGP或范围扩张的问题。

Architecture focused re-review进一步核对了四项修复的产品实现与新增回归，并独立运行：

- `SceneGIS/Scene/_SceneGISPlanarTerrainQuery`：`7/7`，Exit 0；
- `SceneGIS/Core/SceneGISPlanarTerrainSampler`：`7/7`，Exit 0；
- `SceneGIS/Scene/SceneGISPlanarSurface`：aggregate `26/26`，Exit 0。

复核确认：`3×3` 搜索仍只测试实际 Float32 surface triangles且为固定 O(1)邻域；ray Z slab只扫描
`surfaceVertexCount`；snapshot失效会清除上一有效范围的全部 strong fields并保留 container/entry
identity；sampler按 tile原子提交；100 ms delay保持 private且没有同步或 microtask polling。
`T4-R001`～`T4-R004` 均由 Architecture reviewer确认为 `fixed`，没有 unresolved finding。

## Remaining risks

- Snapshot只代表最近成功normal render；无prior render或失效边界返回`undefined`。
- Resident Float32 mesh与provider TerrainData interpolation拓扑一致但不保证bit-identical。
- Ray query在candidate tile内线性扫描surface triangles；T4不增加BVH/DDA/Worker。
- Sampler无cancel/timeout/most-detailed；provider持续scheduler defer时Promise可以pending。

## Review result

Public contract、snapshot publish/invalidation、zero-mutation query、sampler failure policy、WebGL职责
闭环、生成可见性与ownership audit均通过。T4可以关闭并形成独立本地提交检查点；T5仍需在该
checkpoint之后单独讨论、规划和批准。

## Conclusion

Architecture/code review结论为 `approved`。Public API分层、World/Quadtree只读 seam、
four-frustum window path、terrain/depth/Z=0职责和 zero-upstream边界成立；`T4-R001`～`T4-R004`
均已按要求修复并由 Architecture reviewer确认。首轮完整验证与 focused re-review共同构成阶段证据，
没有必要重复 Globe、Viewer、full repo或其他未受影响矩阵。T4无 unresolved finding，可以提交；本
review不授权提前实现T5。
