# Review: T3 平面地形 Continuous LOD、Upsample 与 Cache

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-07`
- Updated: `2026-08-07`
- Review target: `feature/planar-terrain` complete working-tree diff relative to
  `e0959172e84d4e49c254b38fa45184027c22e39d`
- Related plan:
  [T3 terrain continuous LOD phase plan](../plans/2026-08-07-phase-t3-terrain-continuous-lod.md)
- Related ADR:
  [ADR-0009](../../../Documentation/SceneGIS/Decisions/ADR-0009-planar-terrain-continuous-lod-and-cache.md)
- SGP: None；T3 upstream-owned files=`0`

## Review scope

- Private direct-child Heightmap upsample、regular-grid skirt mesh 与 dual selection/command bounds。
- Desired/load/render quadtree 分层、四子门禁、actual render cover 与 deterministic protection/LRU。
- Direct/fallback/active terrain states、availability、request/retry/generation、promotion budget、
  source revision replacement、readiness 与 resource ownership。
- Terrain/imagery single-command composition、pick+depth exact replay、WebGL depth/pixel、warm reuse、
  flat no-provider regression 与 provider maximum-level relaxation。
- Generated/private visibility、zero-upstream/zero-SGP 和 AgentDocs/durable Architecture evidence。

## Implementation summary

- 新增纯 CPU private upsampler，保持 source dimensions、NW row-major、SW→NE triangle、
  Float64 heights、credits、`createdByUpsampling=true` 与 child mask 0。
- Mesh 改用上游 coordinate-free regular-grid-and-skirt topology；surface vertices 保持 tile-local，
  skirt 按 `max(edgeHeight - 4 * effectiveError, provider.minimumHeight)` 生成。
- Quadtree 保留 SSE desired leaves，同时维护 load/bridge/ancestor protection 和不重叠 render cover；
  四个直接 children 未齐时只提交 parent，齐备后同帧完整替换。
- Terrain runtime 分离 direct、fallback 与 active content，支持 availability metadata、
  parent child mask、provider-level terminal unavailable、逐级 upsample、每帧最多两个 promotion、
  ref-counted shared index 和 exactly-once VA/VB/request lifecycle。
- Surface 只为 actual render tiles prepare imagery；normal render cache 与 depth replay 的 command
  identity/zero-mutation contract保持。

## Validation evidence

最终 focused/build/type/docs/static command、direct/aggregate counts 和 warnings 见 T3 phase plan
“偏差与结果”。当前关键证据包括：

- Upsampler 3/3；mesh 4/4；terrain runtime 9/9；Quadtree 13/13；Surface direct 22（aggregate
  24/24，含 Shader 2）；World 16/16；terrain Widget 1/1；imagery Widget 9/9。
- Real Context 只请求 provider Level 0，四个 Level-1 render tiles 使用独立 upsample content，
  每帧 promotion delta <= 2，共享一个 skirt index buffer，并保持一个 terrain+imagery opaque
  command per tile。
- Deferred child fixture证明四子门禁先保持单 parent cover，再完整切换四 child；direct 到达后
  原子替换 upsample content、command identity不变、旧 VA exactly once destroy。
- Terrain Widget 保持 `scene.pickPosition` rendered terrain depth 与 active Heightmap interpolation
  闭环，同一 ray 的 `world.pick` 仍为 Z=0，并平衡 VA/VB/shared-index references。

## Ownership audit

- Upstream-owned files: `0`。
- T3 SGP: `0`；patch manifest、SGP-0001 与 SGP-0002 unchanged。
- New `SCENEGIS_PATCH` markers: `0`。
- Shader/Worker/build seam: `0`。
- New public declarations: `0`；private upsampler/runtime roles在正式 types/API HTML 命中 0。
- Generated delivery status: `0`。

## Findings

| ID      | Severity | Status | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Required disposition / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3-R001 | high     | fixed  | `_SceneGISPlanarTerrain.prepare` 可以把同一个已有 fallback 的 tile 同时快照进 `directQueue` 与 `refreshFallbackQueue`。当 child direct 已 `RECEIVED`、其 parent revision 同时变更且本帧 promotion budget 尚有余量时，direct loop 先把 tile 激活为 `DIRECT` 并销毁旧 fallback；随后 stale refresh loop 仍调用 `_promoteFallback`，后者没有复核 `state`/`fallbackState`，会重新激活 `UPSAMPLED`。Entry 此时仍是 `READY`，后续 `_queueFallback` 立即返回，因此已成功加载的 direct content 会被永久降级，违反 ADR-0009 与 Architecture 的 `DIRECT > UPSAMPLED > FLAT`。                                                | `_promoteDirect`/`_promoteFallback` 执行时重验资格；direct success清空 fallback content/state/source，stale refresh snapshot返回 false且不消耗 budget。Surface normal-frame regression同时设置 parent revision N+1和 child direct `RECEIVED`，确认帧后保持 DIRECT、fallback未重建、旧 VA exactly-once destroy，warm/depth source、command refs和 resource counters稳定。Surface aggregate 25/25，Exit 0。                                                                                                                 |
| T3-R002 | medium   | fixed  | Surface 已把 `desiredTiles` 传给 terrain runtime，但 `prepare` 除兼容旧数字签名外完全忽略该集合，并对全部 `loadTiles` 调用 `_advanceDirect`、参与 direct promotion 与 `tilesLoaded`。Quadtree 又会为每个 refined parent 无条件把四个 children 放入 load set，因此正常的部分视锥会请求纯粹被裁掉 sibling 的 direct terrain；这些不可见请求还可能消耗 promotion budget并阻塞 current-view `tilesLoaded`。这与 ADR-0009 的“bridge sibling 预备 fallback，但不请求纯粹不可见 direct data”和“视图外 request 不参与 current-view readiness”不一致，也没有实现 phase plan 已批准的 visible/coarse direct prioritization。 | Invisible-direct分离保持；所有无 active content的 queued fallback（含 culled bridge）合并进 blocking queue并先于 non-blocking direct/refresh promotion。Readiness同时检查此类 coverage work，已有 active fallback的 off-view refresh及 cached/in-flight off-view direct仍不阻塞。部分视锥 fixture逐帧确认 parent仍提交且 bridge queued时 `tilesLoaded=false`，四子 active后同帧退出 parent才 settled；移动视图后才请求 bridge direct且无 hole/重叠。Surface aggregate 25/25、build与 scoped static/docs checks均 Exit 0。 |

Reviewer 独立复核了 runtime、quadtree、Surface 和相关 Specs，并重跑：

- `SceneGIS/Scene/SceneGISPlanarTerrain`：9/9，Exit 0；
- `SceneGIS/Scene/SceneGISPlanarSurface` aggregate：24/24，Exit 0。

Architecture first focused re-review 确认 T3-R001 `fixed`，并确认 T3-R002 的
invisible-direct/request 分离成立。Second focused re-review 进一步确认所有无 active content 的
queued fallback 已进入 blocking queue，优先于 non-blocking direct/refresh；readiness 只额外等待
coverage-blocking fallback，不重新纳入 off-view direct 或 active fallback refresh。部分视锥 fixture
逐帧锁定 parent cover/`tilesLoaded=false` 到完整四子 cover/settled 的转换。Reviewer 独立复跑
Terrain 10/10 与 Surface aggregate 25/25，第二轮再次复跑 Surface aggregate 25/25，均 Exit 0。

## Remaining risks

- 固定两次 main-thread promotion 不能限制单个异常大 Heightmap 的峰值；Worker 留到 T6 profiling。
- Public cache 仍是 tile-count policy，不是 generic terrain byte budget。
- Skirt 在地下/极低侧视角可能可见；T3 不增加 camera restriction 或 material workaround。
- Coverage replacement 不做 geomorph，direct/fallback height变化仍可能产生可见 pop。

## Conclusion

Architecture second focused re-review 确认 T3-R001/T3-R002 均已修复，review 状态为
`approved`。T3 的 continuous cover、direct/fallback priority、availability、upsample/skirt、
current-view readiness、imagery/depth replay、cache/lifecycle 与 zero-upstream/zero-SGP 边界满足阶段
门禁。T3 可以标记 `completed` 并形成独立本地提交；提交后停下与项目负责人讨论 T4，不在本阶段
进入 T4。
