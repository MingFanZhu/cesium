# V3C1D 南京旋转标注性能自审

- Type: `review`
- Status: `technical review passed — owner gate confirmed by progression`
- Author/Owner: 当前 Agent，architecture/execution 自审，非独立评审
- Updated: `2026-09-14`
- Target: [V3C1D](../plans/2026-09-14-v3c1d-symbol-orbit.md)，基于 V4B checkpoint `723a2feed9`
- Decision: [ADR-0068](../../../Documentation/SceneGIS/Decisions/ADR-0068-symbol-placement-and-dynamic-buffers.md)
- Upstream-owned changes: None；SGP: None

## Findings and disposition

| ID        | Severity | Finding / evidence                                                                                       | Status / owner / follow-up                                                                                                                          |
| --------- | -------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3C1D-R01 | High     | 候选缓存只保护 render cover，resident tile 暂时移出视野即丢失候选，旋转往返重复准备。                    | fixed；当前 Agent；以 resident entries 清理；实际相机离开/返回保留 index，真实 eviction 释放的 Specs 通过                                           |
| V3C1D-R02 | High     | placement 遍历大量屏外 anchors，使旧布局持续滞后；新视区 POI 等待下一次完整提交，最大观测延迟约 920 ms。 | fixed；当前 Agent；预算内构建空间索引，实际地表位置 AABB 保守预筛，原排序/碰撞/精确可见性保持；4096 anchors 的独立可见计数与页面回归通过            |
| V3C1D-R03 | Medium   | 页面逐帧读取 statistics，glyphCpuBytes 遍历所有 glyph bitmaps 求和；与旋转无关的额外工作挤占主线程。     | fixed；当前 Agent；immutable glyph result 加载时计数，查询只汇总 pages；字节数与无重复扫描 Specs 通过                                               |
| V3C1D-R04 | Medium   | shaping.pending / flush 逐帧分配数组并扫描整个 ready cache，即使没有排版请求。                           | fixed；当前 Agent；waiting Map 与 pending Set 分离，保留有界 LRU、generation/identity 检查和 128 项 Worker batch；就绪不扫描与异步/资源页面回归通过 |
| V3C1D-R05 | Medium   | 新地图瓦片的 GPU 创建/上传和约 1800 draw calls 仍有成本，运动 P95 未达到 16.7 ms。                       | open；当前 Agent；由 [总体计划 M1](../plans/2026-09-12-vector-tiles-extension.md) 与 V4B-R06 承接，不扩大本阶段为全场景 60 FPS                      |
| V3C1D-R06 | Gate     | 负责人确认南京原视角连续水平旋转的 POI 持续性和流畅度。                                                  | pending；项目负责人；页面已恢复，验收后由当前 Agent 建立独立 checkpoint，不提前进入下一阶段                                                         |

## Cause and implementation boundary

复现时 glyph requests 为 0，atlas revision 未变，shaping revision 只变一次；没有主线程重新解析字体的证据。
MVT、字形解析及排版仍走既有 Worker。初始 CPU profile 将热点指向候选遍历、重复准备和无任务时的缓存扫描。
标注减少主要由旧 placement 不能及时覆盖新视区造成；owner 失效只占部分，不能只靠延长旧 owner 显示解决。

索引按投影坐标交替中分，每叶最多 32 个 anchors；保留原候选对象，并按实际贴地/ECEF 位置构建 bounds。
构建节点通过现有 generator 参与 2 ms 软预算；原生排序本身不是可抢占操作，不保证任意大单 tile 的硬实时上限。
terrain snapshot 或 symbols 替换时失效，resident entry 释放/图层清理时释放缓存；无新增 GPU 资源。
实际相机裁剪平面与已有 maximumAnchorDepth 只做保守预筛，之后仍做原 viewport、地平线、归属和碰撞判断。
没有扩大缓存预算、降低字体质量、限制相机角度、修改 Worker 协议或 Shader。

## Bounded performance evidence

本节为追加道路文字尺寸修正前的调度优化对照；最终代码的低视角尺寸与运行证据见后文补充。

同机实际 in-app browser，公开 Bright、Globe ellipsoid、关闭高级环境、暂停时钟；pitch -11.37°、zoom 17.292。
[相机与采样参数](../../../Test/vector-tiles/nanjing-symbol-performance-camera.json) 固定 1432×1150 CSS/drawing buffer。
围绕屏幕中心 ray 与椭球交点，以当地法线为旋转轴，角度 `1.5 * sin(2 * PI * frame / 360)`；
相机位置相对中心、direction/up 施加同一个旋转，360 个运动帧后恢复原相机，再记录 120 个静止帧。
前后先预热；以下采样关闭 CPU profiler，无并行 GPU 测试。逐帧只读轻量计数，避免完整 statistics getter 污染对照。

| Metric                              | Before         | After          |
| ----------------------------------- | -------------- | -------------- |
| 运动帧间隔 P50 / P95                | 24.9 / 60.4 ms | 21.6 / 36.9 ms |
| 运动 CPU submission P50 / P95       | 19.3 / 29.2 ms | 18.1 / 28.2 ms |
| 最大观测 pending cohort age         | 920.4 ms       | 346.3 ms       |
| 候选重建次数增量                    | 148038         | 63799          |
| placement commits / steps           | 22 / 686687    | 41 / 192630    |
| Worker 完成任务 / tile uploads      | 103 / 97       | 108 / 100      |
| 运动最低 placed / 最大失效 owner 数 | 90 / 36        | 145 / 14       |
| 静止帧间隔 P50 / P95                | 16.7 / 19.1 ms | 16.6 / 20.7 ms |
| 静止 CPU submission P50 / P95       | 13.2 / 17.3 ms | 12.5 / 15.0 ms |
| 静止阶段候选重建次数增量            | 12838          | 0              |

运动帧间隔 P95 降低约 39%，最长观测布局延迟缩短约 62%；恢复原视角均为 306 placed / 1179 candidates、
49 rendered tiles、1828 commands，无待处理任务和资源错误。计数用于定位和回归，不替代负责人视觉判断。
CPU submission 为 preRender→postRender，可能含 driver 等待，不是 GPU timer；原始 profile 仅用于热点定位。
公开服务及历史缓存不是严格相同的离线状态：基线保留 163 glyph ranges，重载后约 150；tile budget 均为 128，
Worker/上传工作量接近。不能将该有限对照解释为所有机器/角度的固定提升，也不能把全部长帧归因于标注。

## Verification and handoff

- 修改后重新构建 engine Specs bundle，最终 28 项 symbol Specs 通过；同阶段完整 vector 回归中另外 147 项通过。
  新增缓存用例初次相机高度 80 未达到 SSE 细分阈值，按实际近景 fixture 改为 10 后通过；产品路径未为测试改动。
- 4 项相关 E2E 通过：Globe 本地/地形/整球/释放，Planar 曲线名称/箭头/路牌旋转，中英文点标注/拾取/倾斜/缩放，双 DPR。
  使用确定性本地数据，合计约 49.2 s；覆盖共享投影、实际 glyph/icon DrawCommand 与资源生命周期。
- Engine/root build、修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、diff whitespace 与上游路径审计通过。
  全 AgentDocs Prettier 仍有 233 个既有文件告警，不格式化无关文件；无生成文件提交。
- 本阶段只修改自有 JS 缓存/调度、Specs、Test 相机参数与文档；无新增公共 API、Worker 协议、Shader、构建入口。
  不重复完整 release/安装包矩阵。原始 profile/逐帧结果在忽略的 Build/Specs，不进入 AgentDocs。

技术自审通过；当前页面已刷新为最终代码并恢复南京原视角，等待 R06 视觉与交互验收。
V4B-R06 与本 review R05 的其他 GPU/driver/新瓦片成本继续保留 open，不能以本次优化将其关闭。

## Road-label pitch follow-up

- Finding: `V3C1D-R07 / Medium / fixed`；owner 当前 Agent。
  负责人视觉检查指出道路文字在低视角横向过大。5.05° 俯角、zoom 20.1907 的“中山南路”字号仍为 13 px，
  anchor depth 26.326 m / reference depth 95.722 m，直接地面投影放大约 3.64 倍。
  这是既有 map-pitch 缺少透视补偿，与本阶段索引/Worker 解析无关。
- 对照 MapLibre 5.24.0 `src/shaders/glsl/symbol_sdf.vertex.glsl` 和 `src/symbol/projection.ts`，
  在 map-pitched 几何和 collision 中采用 GPU 的部分透视补偿规律；沿线 advance 和 glyph quads 统一尺度，
  不移植参考的 CPU anchor / shader offset 双路径，不承诺逐像素相同。正式边界提升到
  [ADR-0065](../../../Documentation/SceneGIS/Decisions/ADR-0065-line-symbol-placement.md)。
- [固定相机](../../../Test/vector-tiles/nanjing-road-pitch-camera.json)，1432×1150 CSS/drawing buffer，Bright、
  ellipsoid、环境关闭。原 anchor 的投影包围盒 201.37×20.05→128.26×12.76 px，另两个道路名称宽度
  167.84→113.30、155.59→105.45 px；三者 anchor、文字和 13 px style size 不变，atlas 无错误。
  包围盒含 glyph SDF 边界，不等同于墨迹宽度；缩小部分透视放大，保留道路倾斜压缩。
- Engine/root 重建后的 29 项 symbol Specs 通过，新增 5° 近/中/远距离尺度、保守 collision 包络、静止
  geometry identity、正交比例及 atlas 复用验证。新增正交 fixture 初次 width 200 令 style zoom 小于 0，
  layer 正常按默认 minzoom 0 隐藏；改用 width 128 后通过，产品未增加 fallback。
  Globe 地形/整球/释放和沿线名称/箭头/路牌/拾取 E2E 共 2 项通过，42.3 s。
- 补偿后同相机 ±0.3 rad / 180 帧旋转、60 帧恢复，关闭 profiler，无并行 GPU 测试，运动帧间隔
  P50/P95 为 19.1/33.6 ms，CPU submission 16.9/29.3 ms，最大 pending cohort age 207.1 ms。
  该视角与前文 11.37° 不同；修正前短采样 24.6/42.7 ms 时有 26 次 tile uploads，修正后预热采样为 0，
  所以只记录最终运行成本，不把差值归因于字体补偿或据此宣称性能提升。
- 新增成本限于相机变化后的 map-pitched glyph geometry 更新；静止缓存、Worker、atlas 和动态 buffer
  复用仍成立。无新增公共 API、Shader、Worker 协议、upstream-owned file 或 SGP。
  技术自审通过；页面恢复低视角，R06 包含追加的文字大小视觉验收，仍 pending。

## Owner progression gate

负责人随后认可当前功能并要求转向独立、简单的球面/平面上手示例；按推进授权关闭 R06，
status `accepted`，owner 项目负责人/当前 Agent。上述 pending 为历史交付状态，本结论优先。
R05 与 V4B-R06 的重负载性能边界仍保留；本阶段先建立独立本地 checkpoint，再开展示例工作。

## 2026-09-17 收口处置

负责人验收当前大阶段后，V3C1D-R05 从 open 转为 deferred；GPU 创建/上传、高 draw-call 数与帧时尾部仍有成本，
当前验收不扩大为全场景 60 FPS。V3C1D-R06 已由后续推进确认，阶段 checkpoint 保持有效。
负责人角色为 architecture，后续有具体性能目标时重新激活；统一跟踪见
[大阶段收口评审](2026-09-17-milestone-closeout-review.md)。原始证据保留。
