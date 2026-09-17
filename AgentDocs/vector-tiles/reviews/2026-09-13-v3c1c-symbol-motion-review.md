# Review: V3C1C 标注交互更新

## Metadata

- Status: `completed`，技术自审与负责人视觉/交互验收通过
- Reviewer role: `architecture`；当前 Agent 自审，不是独立评审
- Created / Updated: `2026-09-13`
- Target: `feature/vector-tiles`，V3C1B checkpoint `065c345efd` 后的工作区
- Plan: [V3C1C](../plans/2026-09-13-v3c1c-symbol-motion.md)
- ADR: [ADR-0068](../../../Documentation/SceneGIS/Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md)
- SGP: None

## Scope and source ownership

按负责人要求完成前三项：持久候选/可暂停 placement、独立碰撞代理、静态和动态顶点流。
`_SceneGISVectorSymbols` 负责失效和布局调度，`_SceneGISVectorSymbolProjection` 分离真实几何与
collision，新增 `_SceneGISVectorSymbolBatches` 负责批次发布和 dirty ranges，Renderer resources
拥有两个 buffers。Shaping 返回 atlas generation 依赖，Shader 接收单独 visibility 分量。
正式契约同步到 Architecture、VectorTileSymbols 与 ADR-0065/0067 的后继修订说明。

本阶段所有修改均为 SceneGIS-owned files；upstream-owned files 为无，SGP 为无。
不增加 public API、Worker entry、Cesium pass 或深度接缝；生成的 Shader JS/Build 未手工修改或提交。

## Findings and disposition

| ID        | Severity    | Status   | Owner                  | Evidence / disposition                                                                                                                                                                                                                     |
| --------- | ----------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V3C1C-R01 | performance | fixed    | execution              | 相机移动曾完整重建候选与 identity。现在按 entry/symbol layout 缓存；不可变相机 cohort 按约 2 ms 软预算推进，连续运动不取消。强制一正常帧一步的 Spec 证明连续运动期间收敛、候选复用，pick 不推进 pending job。                              |
| V3C1C-R02 | performance | fixed    | execution              | Placement 曾逐字投影所有角点。现在 point 整组 box，line 分段保守包络；碰撞预检通过后才计算弯曲字形与 max-angle。12 字直线只需一个代理，Spec 验证包络覆盖实际字形；optional/overlap 与沿线回归通过。                                        |
| V3C1C-R03 | performance | fixed    | execution              | 每帧曾重写完整 interleaved buffer。现在固定 UV/paint/pick 与动态 position/offset/size/visibility 分流；Spec 直接监听 buffer 上传，证明纯平移均无上传、反向旋转只有 dynamic 上传，保持当前 pick。                                           |
| V3C1C-R04 | high        | fixed    | execution              | 首轮新 snapshot 用对象展开复制 extent，丢失 getter bounds，原 symbol Specs 复现无文字。改为逐项复制 min/max，保留原 north-to-south ownership；最终 146 项 vector Specs 通过。                                                              |
| V3C1C-R05 | high        | fixed    | execution              | Pending 布局需处理 cover/资源失效与销毁。当前帧排除已失去 owner 的候选，shape 复用核对 atlas generations；hide/remove 取消 iterator 并释放两类 buffers/picks，迟到任务不能发布。连续运动/hide/show Spec、原资源 eviction 与重建 E2E 通过。 |
| V3C1C-R06 | medium      | fixed    | execution              | 失败 generator 不得在后续帧被当作正常空结果发布。全局 placement 失败关闭 iterator 并记录失败签名，沿现有 errorEvent 报错；超出 glyph range 配额的 Spec 证明同一视图只报一次且无重复步骤/请求。                                             |
| V3C1C-R07 | quality     | accepted | architecture           | 保守包络会额外避让，浅角静止同视图 201→189 个标注。普通运动提交后最多复用 100 ms 才启动下一轮；完成时间还包括 cohort 计算，单步骤及发布不可抢占。当前真实字形/字号/方向/可见性逐帧更新，碰撞可能短期滞后；负责人视觉 gate 包含该取舍。     |
| V3C1C-R08 | performance | deferred | architecture/execution | 浅角仍约 1500 条地图/标注命令，GPU、层序/深度、总驻留字节上限尚未资格确认。本阶段未修改地图选取或底图批次；继承 [总体风险](../plans/2026-09-12-vector-tiles-extension.md#global-risks-and-dependencies)，后续先 profiling 再确定范围。     |
| V3C1C-R09 | gate        | accepted | project owner          | 负责人于 2026-09-13 明确确认验收通过，关闭本阶段视觉/交互 gate；实现与记录形成独立本地 checkpoint，不激活下一阶段。                                                                                                                        |

## Validation

- Engine/root dev build 与完整 `build-release` 通过；无 public API/类型变更，不重复上阶段 declaration 全量资格。
- 最终 146 项 vector Specs 通过。除上述新增行为，还覆盖原 MVT、Worker、样式、覆盖、远景与资源链路。
- 8 项相关 E2E 通过：point/line/公开地图、中文/Latin、倾斜/180°/缩放、实际 alpha pick、DPR、
  重建、Bright/Liberty、失败保留、浅角远景与俯视拉远保持，以及本地地形/影像对照。
- [包验证](../../../Test/vector-tiles/verify-worker-package.mjs) 通过 installed engine tarball、release ESM、
  release IIFE 三个真实浏览器入口。除既有 Worker transfer/typed geometry 验证，新增本地字形
  Shader 实际红色像素、feature pick、独立双 buffer、平移不重复上传和 scene destroy 后双 buffer 释放。
- 本地 point/line 倾斜截图及在线最终原相机画面已查看，未见文字方向、路牌、弯曲或拾取回归。
  截图与自动化不能替代负责人对密度和交互质量的最终判断。
- 修改范围 ESLint/Prettier、全部 AgentDocs Markdownlint 与 diff/upstream/generated audit 通过。
  全部 AgentDocs Prettier 仍报告 233 份既有文件格式问题；本阶段改动文件单独检查通过，未扩大格式化范围。
  审计确认本阶段 upstream-owned changes 与 generated changes 均为 0。

## Motion evidence

同机 Windows 应用内浏览器、canvas 1432×1150 CSS、devicePixelRatio 约 0.8，在线 Berlin Bright。
低角度 camera position 约 (1491475.7423, 6886513.5626, 2158.4347)，direction 约
(0.013385, 0.976122, -0.216810)，zoom 13.7273140626。原视角 position 约
(1493859.1307, 6889645.9297, 4928.0338)，direction 约 (-0.373969, 0.677148, -0.633733)，zoom 14.0837313641。
相同 frustum，60 帧 X 方向 ±300 米正弦 pan，然后 60 帧围绕视轴地面交点 ±0.14 rad rotate。
前后均开启 Profiler、先预热相同轨迹，不同时运行其他构建/测试；统计 preRender → postRender CPU 提交。

| Metric                         | V3C1B 本轮基线 | V3C1C 最终代码 |
| ------------------------------ | -------------- | -------------- |
| 低角度 pan median / P95        | 23.0 / 24.6 ms | 12.9 / 15.9 ms |
| 低角度 rotate median / P95     | 23.5 / 30.6 ms | 13.3 / 17.7 ms |
| 原视角 pan median / P95        | 11.7 / 12.9 ms | 7.6 / 10.5 ms  |
| 原视角 rotate median / P95     | 11.9 / 13.4 ms | 8.0 / 10.7 ms  |
| 低角度两段合计 GC self samples | 66.2 ms        | 26.8 ms        |

低角度两端 render cover 均为 55 tiles，pan 1553 commands，rotate 约 1571；原视角轨迹末端
均为 16 tiles / 657 commands。原视角恢复后为 17 tiles / 690 commands。没有通过缩小地图范围取得收益。
刷新使 resident cache 从基线 128 变为低角度 71 / 原视角 73，测量不是进程/缓存状态完全相同的实验；
预热后 cover 一致，低角度最终测量 rotate 仍有两个 Worker 任务完成，原视角两端也有少量后台任务。
CPU 指标不包含全部浏览器/native/GPU 时间，GC 统计范围的实际时长也不同，不宣称稳定 60 FPS。

保守代理使低角度静止文字 201→189（约 6%）；候选仍约 1265。运动中的放置数还受布局快照时点影响，
不能按每帧数量断言语义相同。最终原视角 760 candidates / 145 placed，pending 与 failures 均为 0。
原始 profile 和截图只留本机临时/忽略产物，不提交 AgentDocs。

## Handoff

V3C1B 独立 checkpoint 为 `065c345efd`。V3C1C 已完成授权实现、技术验证与负责人验收；
负责人于 2026-09-13 明确表示验收通过，R09 已关闭，R07 取舍随本次画面验收接受。
R08 的其他性能边界保持未解决，不扩大本次实现。阶段代码与记录形成独立本地 checkpoint，
下一阶段未激活；地形共存问题按已有 V2 实验和 V4 生产边界解释，不宣称当前公开地图已贴地。
