# Review: V3B1 基础矢量样式图元

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created / Updated: `2026-09-13`
- Review target: `feature/vector-tiles`，V3B0 checkpoint `d2667e6ad4` 后的 V3B1 工作区
- Related plan: [V3B1](../plans/2026-09-13-v3b1-vector-style-primitives.md)
- ADR: [ADR-0062](../../../Documentation/SceneGIS/Decisions/ADR-0062-vector-stroke-and-coverage.md)
- SGP: None（本阶段无 upstream-owned 修改）

## Scope and conclusion

自有 stroke 完全替换 PolylineGeometry/PolylineCommon 桥接，支持三种 cap/join、
limits、gap/offset/blur 和按 feature 变化的 dash。连续 strip 保留共批次与逐要素 identity，
GPU 数值 Texture 保存 dash intervals；没有地图颜色 RTT 或额外图形 context。
Fill 增加孔洞与外边界 fringe、AA 关闭分支；circle 增加 blur 与 DPR 感知 coverage。
颜色与拾取使用同一 geometry/clip/discard，继续复用 Cesium 原生 pick 派生。

技术实现、自审与项目负责人视觉验收已完成。负责人于 2026-09-13 明确确认样式图集通过，
V3B1-R08 关闭；当前 Agent 确认阶段 gate，代码与阶段记录形成独立本地提交。

## Findings

| ID       | Severity   | Status   | Owner role             | Finding / evidence                                                                                                        | Disposition / follow-up                                                                                                               |
| -------- | ---------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| V3B1-R01 | high       | fixed    | architecture/execution | 正交相机 Z=1000、near=1、far=2000 时，fill-antialias=false 的 0.5 alpha 也变成 0.75；根因是 Cesium opaque frustum overlap | canonical (near, far] fragment partition 与 clip-space Z clamp；真实边界/跨视锥 alpha、pick、Z=200 前景回归通过                       |
| V3B1-R02 | medium     | fixed    | architecture/execution | Camera.getPixelSize 已含 scene.pixelRatio，原 computeZoom 再乘 DPR；旧 stub 掩盖了重复换算                                | 按 Camera 源码修正 CSS 比例和 stub；真实 DPR=2 的 line width、zoom 与 warm resources 回归通过                                         |
| V3B1-R03 | medium     | fixed    | execution              | 端帽延伸误参与整段 dash 距离插值，图集出现拐角圆点缺口                                                                    | 增加 body station，分开 cap envelope 与 dash progress；真实转折圆点中心四象限覆盖回归和更新图集 E2E 通过                              |
| V3B1-R04 | medium     | fixed    | architecture/execution | 若所有 fill core 后统一画 fringe，后一要素会被前一要素 fringe 覆盖                                                        | 同一 batch 内按 feature 交错 core/fringe，像素与 pick 顺序回归通过                                                                    |
| V3B1-R05 | medium     | fixed    | execution              | Dash Texture 增加候选失败与销毁责任                                                                                       | 与 buffers/pick IDs 共 owner，compile failure、warm replay、正常销毁测试验证 Texture exactly once release                             |
| V3B1-R06 | limitation | accepted | architecture           | Dash 拐角仍受 stroke 插值影响，跨 part/tile 相位不保证一致；没有 floorwidth/crossfade 或几何 union                        | [ADR-0062](../../../Documentation/SceneGIS/Decisions/ADR-0062-vector-stroke-and-coverage.md) 与公开支持矩阵明确限制；图集展示实际效果 |
| V3B1-R07 | limitation | deferred | architecture/execution | 小图集不能证明复杂 dash 的片元查询成本、密集网格字节预算或 Worker 资格                                                    | 保留 [roadmap](../plans/2026-09-12-vector-tiles-extension.md) 的 V3C，进入时依据真实负载细化                                          |
| V3B1-R08 | gate       | resolved | project owner          | 新 cap/join/dash/AA/blur 改变可见画风，历史城市验收不足以覆盖新增样式                                                     | 项目负责人于 2026-09-13 确认 Test 样式图集通过；当前 Agent 关闭阶段并形成独立提交                                                     |

V3B0-R04 的临时线数学桥接已解决；既有 SGP 与 Cesium native primitive 均未修改。

## Validation reviewed

- Chrome Headless 152 / Windows：focused Specs **87/87**；既有 71 项保留，
  新增 3 项 stroke、3 项 dash data、9 项真实 Scene 样式与 1 项资源测试。
  覆盖 duplicate/reversal/closed mesh、miter limit、odd/zero dash、透明 join、
  cap/pick、gap/offset、blur、fill hole/AA/order、多视锥、DPR、warm 与失败回滚。
- Chromium 151 / Windows：页面 E2E **3 项通过**，城市/延迟替换与图集分次运行；
  最新 dash 修正后重新通过图集俯视、倾斜、pick、command 数与重建测试。
  图集共 12 案例、17 要素、12 draw commands，关闭 MSAA/FXAA；截图已自审。
  旧城市 E2E 的颜色/拾取/过渡断言没有放宽。
- 项目负责人已确认新增图集画面通过，记录在 V3B1-R08；不扩大为后续性能/地形/标注验收。
- Engine/root build、build-ts、tsc 和 build-release 通过；类型生成保留既有 TSD-JSDoc warnings。
  独立 engine tarball 安装后验证五个公开入口、四份固定 Shader、320-feature 城市与
  17-feature 样式 MVT 解码、strict NodeNext TypeScript 和 minified release CJS。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、76 个相对链接和 diff whitespace 通过。
  全 AgentDocs Prettier 仍报告 233 份未修改的既有文档格式问题；本轮九份文档单独检查通过，
  不顺带格式化无关文档。上游审计通过：current delivery upstream-owned entries **0**，
  generated status **0**；没有新 SGP。

真实 Context Spec 初次执行暴露 engine Build/Specs 快照需要先 engine build；
验证记录只采用明确完成该构建后的 87 项结果，不采用旧快照的通过数量。

## Performance evidence and limits

Intel Core i5-12490F / Windows / Chromium 151.0.7922.34，1280×800、DPR=1，
同一开发 ESM、本地 320-feature 城市。中央街区 60 warm frames 的 CPU 提交
median **0.9 ms**、P95 **1.4 ms**；4 desired / 5 resident / 25 draw commands、5 uploads。
V3B0 为 median 0.7 ms、P95 1.3 ms；firstReady 本轮约 **569 ms**，此前约 231 ms。
首次准备时间上升，短样本不足以定位到某一算法或宣称稳定性能；V3C 需据真实负载分析。
测量不含 GPU 完成与浏览器合成；warm 不重复上传、资源身份与销毁另由 Specs 验证。

## Gate and handoff

当前修改全部位于 SceneGIS-owned 区域，无新增 upstream-owned file、SGP 或公共导出。
[样式图集](../../../Test/vector-tiles/styles.html) 的负责人验收已通过；
当前 Agent 完成本阶段独立 checkpoint，后续按 roadmap 细化 V3C。
Symbol、sprite/pattern、extrusion、heatmap、生产 terrain 与 Globe 继续保留各自实现边界。
