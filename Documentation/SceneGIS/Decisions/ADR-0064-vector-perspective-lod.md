# ADR-0064：矢量地图透视比例与平面 SSE 选层

## 状态与证据

- Status：`accepted`
- Date：`2026-09-13`
- Owner：当前 Architecture/Execution Agent，自审
- Plan：[V5A 浅俯角修正](../../../AgentDocs/vector-tiles/plans/2026-09-13-v5a-point-symbols.md)
- Related：[ADR-0003](ADR-0003-planar-surface-runtime-and-lod.md)、[ADR-0059](ADR-0059-planar-vector-tile-batch-renderer.md)、[ADR-0060](ADR-0060-vector-tile-resident-render-cover.md)、[ADR-0063](ADR-0063-point-symbol-renderer.md)
- SGP：None；仅 SceneGIS-owned files

负责人在公开地图复现 5° 俯角黑带：页面使用宽约 21 km 的正交相机，camera Z 约 503 m，
Z=0 地面在视口两端的 eye depth 约 -116 km 与 127 km，超出固定 (1,100000]。
这首先是页面投影配置问题，不能绕开相机 near/far 或涂背景色修补。
负责人明确选择类似 MapLibre 的透视投影，并要求选层遵循既有平面影像/地形方式。

透视实测还证明统一 desired level 会因远方视域而把近景降为全球级数据。
相机正下方的 style scale 参考点也不适用：固定 orbit range 倾斜时，其 eye depth 按
sin(pitch)² 缩短，而中心地面目标的距离保持不变。

## 决定

Style zoom 与 source LOD 继续分离。Style zoom 在 camera direction 与 Z=0 的前向交点采样
CSS meters-per-pixel；相机无前向交点时不发布地图。它是视轴参考比例，不把透视投影的各向
异性误写为整个地面的恒定分辨率。公开 Test 页使用垂直 FOV `2*atan(1/3)` 的透视相机，
由目标 zoom 与视口高度推导 orbit range；切换 pitch 保持中心比例。Layer 不修改 Camera。

共享 `_SceneGISPlanarQuadtree.computeScreenSpaceError(frameState, tile, geometricError)`：

- 从既有 imagery/terrain 方法提取私有纯计算入口，原 quadtree 仍维护自身计数和状态。
- 透视继续使用 camera 到闭合 XYZ tile bounds 的最近距离、frustum SSE denominator、
  drawing-buffer height 与 pixelRatio；正交继续使用 effective frustum height。
- 原影像/地形误差、阈值、遍历、ancestor 请求、发布和缓存均不改变。
- MVT Z=0 tile 使用相同零厚度 OBB 视锥裁剪和共享 SSE；nominal error 为 tile width / 512，
  阈值为 2 CSS pixels，等于阈值保留当前 tile。512 是矢量 source 采样策略，独立于 MVT extent。

MVT desired set 改为互不包含的 quadtree leaves，正交/透视均按 SSE 判断细分。
从可见 minimumLevel 开始，按 SSE 大小处理，同值保留 level/北到南/西到东的确定顺序；只有整个可见子集合
能装入 maximumVisibleTiles 才替换父 tile，预算不足保留父 tile并继续处理其他可容纳的细分。
不再逐级降低整个视图的 level。minimumLevel 本身超预算继续明确报错。
source.maximumLevel 仍限制数据请求深度，预算优先于 SSE 精度目标。

独立 MVT scheduler、tile cache、upload budget 与按需取消保留；不借用 World 的 live tile cache，
不让 MVT 的内容就绪状态阻塞地形。使用 ADR-0060 原有逐区域 resident cover 与半开裁剪，
mixed desired leaves 不引入父子重复 alpha；pick 中地址始终是实际数据 tile。
公开 Test 页显式使用 64 desired / 128 cached，产品默认预算保持原值。

Point placement 仅接纳有效 near/far 内、投影 anchor 位于视口内的候选，然后请求 glyph、
检查 shaping 和参与 collision。粗粒度远景 tile 内的不可见名称不能抢占候选/字体预算或产生
无关 shaping 错误。完整 glyph 仍可跨 tile 与屏幕边界；视口外 anchor 的局部文字入屏、
variable anchors、沿线 placement 和平滑进出场属于后续标注资格，不宣称当前已支持。

## 验证与边界

以用户报告的中心、heading、5° 俯角和约 12.05 style zoom 建立确定性 E2E，检查实际前景
pixels、近远 levels、硬预算与无错误；真实公开数据再核对街道、标注和地平线。
Specs 覆盖固定 orbit range 的 style zoom、浅角 alpha/pick、不重叠 mixed leaves、
与平面 quadtree 在相同误差下的叶集合一致、DPR 和原地形 quadtree 回归。

SSE 共享不增加公共 API、Shader、Worker、构建或上游补丁。Dense performance/字节预算与 Worker
仍属于 V3C1；mixed LOD 数据本身的几何简化差异、dash 相位及地平线附近标注拥挤不在本修正中
宣称消除。实际画面仍需负责人视觉 gate。
