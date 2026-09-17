# Review: V3C1A 低角度远景选层

## Metadata

- Status: `completed`，技术自审通过，负责人明确授权推进 Worker 阶段
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审，不是独立评审
- Created / Updated: `2026-09-13`
- Target: `feature/vector-tiles`，V5B checkpoint `bb007b3518` 后的独立工作区
- Plan: [V3C1A](../plans/2026-09-13-v3c1a-tilted-distance.md)
- ADR: [ADR-0066](../../../Documentation/SceneGIS/Decisions/ADR-0066-planar-tilted-tile-distance.md)
- SGP: None

## Findings and disposition

| ID        | Severity    | Status   | Owner                  | Evidence / disposition                                                                                                                                                                         |
| --------- | ----------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3C1A-R01 | high        | fixed    | execution              | V5B-R13 的远景工作量问题已在 shared selection 中处理；World 属性同时进入 surface 和 MVT，在 desired / request / mesh 前停止远景细分。柏林同视角 MVT 64→47，surface 219→105，完整覆盖回归通过。 |
| V3C1A-R02 | high        | fixed    | execution              | 负责人要求俯视拉远保持：angle gate 只启用低于 20° 的透视；Specs 比较不同高度及正交 keys，公开 E2E 比较 5 千米、500 千米、5000 千米俯视的 surface / MVT keys，均精确一致。                      |
| V3C1A-R03 | medium      | fixed    | execution              | 使用 closed 三维包围体与严格大于距离判定，边界及非零高程回归通过；地形实际请求、影像准备、完整 ready cover、像素、depth replay 和 provider 非所有权/销毁通过。                                 |
| V3C1A-R04 | medium      | accepted | architecture           | 正距离配置默认 Infinity；公开页 100000 米，本地示例 2000 米。小配置可能使浅角只显示粗层；未增加自动距离策略，正交/俯视和其他调用方保持。                                                       |
| V3C1A-R05 | performance | deferred | architecture/execution | 减少远景加载不等于近景密集渲染达标；MVT commands 和 symbol candidates 不必按 tile 数同比减少。近景预算与必要线程继续由总体计划 V3C1B 推进。                                                    |
| V3C1A-R06 | gate        | accepted | project owner          | 公开地图与完全本地地形/影像对照已交付，技术自审通过，负责人明确授权推进 Worker，按推进授权关闭 gate 并形成独立 checkpoint。                                                                    |

## Validation

- 197 项相关 engine Specs 通过，覆盖 Planar Quadtree / World / Surface / Terrain / Imagery、
  相关真实 Widget 集成和 VectorTileCover。既有 131 项 vector 回归通过，新 cover Spec 随该 197 项通过。
  新增 7 项 Specs 包含属性失败原子性、angle / distance / 高程 / DPR、俯视一致与实际 terrain/imagery 请求减少。
- 公开页原有 3 项 E2E 与新增俯视拉远比较共 4 项通过；本地 terrain/imagery 比较新增 1 项通过。
  同时检查原生 FPS、样式切换/失败保留、pick/recreate、5° 近景覆盖和 0.5° 相机未被限制。
- 新增测试初次使用的范围大于 fixture 本来就停止细分的距离，未形成区分；已调整测试尺度，
  未为测试修改产品阈值。浅角 depth 使用实际像素中心坐标；三项既有 lighting 测试的缓存 key
  缺少已存在的 advanced-lighting `/0` 后缀，依据 HEAD 源码修正四条断言，未改 Shader。
  最初不带斜杠的 grep 被 karma-jasmine 作为普通字符串，0 项结果不计入资格；后续显式 regex 执行。
- Engine 和完整 root build、buildTs、tsc 通过，engine / root declarations 均包含
  `maximumTiltedTileDistance: number`。类型生成仍有既有 TSD-JSDoc 告警。
  没有新的 Shader、Worker、asset delivery 或 upstream seam，不重复其 release / installed-package 资格。

## Actual browser evidence

Windows / Chromium 实际应用浏览器，Berlin Bright、1308×900 CSS、DPR 1、5°、
zoom 12.049935656442358，保持相机位置、heading、frustum 与 style zoom：

| Metric                              | 原选层    | 100000 米限制 |
| ----------------------------------- | --------- | ------------- |
| MVT visible / rendered              | 64 / 64   | 47 / 47       |
| Surface selected / rendered         | 219 / 219 | 105 / 105     |
| Surface visited / load dependencies | 473 / 473 | 241 / 241     |
| MVT drawCommands                    | 1216      | 1185          |
| Symbol candidates / placed          | 333 / 87  | 477 / 96      |

公开数据选层改变也会改变来源 geometry / symbol 集合，不能把瓦片减少解释成标注候选同比减少。
画面已检查，近景地图与地平线粗覆盖保留，无 tile / symbol failures，静止 pending 收敛到 0。
新页面从相同初始俯视进入浅角，开启限制累计 51 次 MVT 请求；此前未限制的独立页为 68 次。
在同页切回原选层累计 86 次，再走限制后的移动为 90 次；不能把这两个累计值当成两个冷启动请求数。

横向 200 米正弦往返、60 次 camera 更新、61 个提交采样，原选层 CPU median/P95 为
19.8/39.7 ms，启用后为 21.8/30.1 ms。这段实际移动包含不同的选层/加载集合，后者新请求 4 块，
并非纯稳态 CPU 对比；median 未改善，不据此宣称普遍提帧。主要确定性收益是选取、依赖与请求减少。

## Delivery

- [公开地图](../../../Test/vector-tiles/planar-map.html) 已启用 100000 米限制。
- [本地地形/影像](../../../Test/vector-tiles/planar-distance.html) 可切换限制、5°、0.5° 和俯视拉远。
- 本轮 upstream-owned files：无；SGP：无新增；生成文件不提交。
- V5B checkpoint 为 `bb007b3518`；V3C1A 按推进授权关闭，checkpoint 后再激活 V3C1B。
