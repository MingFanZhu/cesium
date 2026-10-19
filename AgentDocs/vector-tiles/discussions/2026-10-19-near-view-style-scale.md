# 近地浅俯角的文字放大与填充边缘尺度

- Type: discussion / source and browser diagnosis
- Status: resolved; Jacobian method supersedes the first depth-ratio proposal
- Created / updated: 2026-10-19
- Owner: 当前 Agent，Architecture / implementation self-review
- Baseline: `scenegis/develop@729dc4bbd0`
- Related: ADR-0062、ADR-0064、ADR-0065、ADR-0070
- Previous maintenance: [地平线参考尺度](../plans/2026-10-16-horizon-style-scale.md)

## 问题与实测

负责人报告当前球面公开地图字体变大、面模糊，稍微向下倾斜后恢复，并要求核实是否存在
低俯角补偿阈值及 source LOD 与 Cesium 的关系。以下先保留实现前的诊断事实，最终方法见文末。

在同一相机位置，仅修改朝向进行有界对照，随后恢复原始 Cartesian position / direction / up。
相机高于椭球约 63.63 m，原视角俯角约 1.09035°；数据为 OpenFreeMap / Bright。

| 测量项                           | 原视角    | 向下 5°   |
| -------------------------------- | --------- | --------- |
| 全局 referenceDepth              | 3391.13 m | 730.55 m  |
| Style zoom                       | 13.57502  | 15.78957  |
| Mercator metersPerPixel          | 6.41380   | 1.38188   |
| 可见 source tiles                | 26        | 26        |
| 近处 Spree 的 text-size          | 14 CSS px | 14 CSS px |
| 近处 Spree 的 anchor eye depth   | 162.88 m  | 200.42 m  |
| 补偿及透视共同产生的标量尺寸倍率 | 10.91     | 2.32      |

原视角实际 render cover 为 level 10–14 的 mixed leaves。上述倍率是深度尺度关系，实际字形
屏幕宽高还受沿线路径、方向、地面倾斜和透视投影影响，不是字形所有边长的精确比例。
公开数据仍有 pending requests，本轮不据此宣称完整加载资格或性能结论。

## 源码事实

1. `_SceneGISVectorGlobeCover.select` 使用原生 `TileBoundingRegion.distanceToCamera`、
   frustum 像素尺度、horizon culling 与误差阈值 2，结合独立 source 层级和硬瓦片预算。
   Cesium `QuadtreePrimitive.screenSpaceError` 同样以 geometric error / distance / frustum
   尺度计算 SSE；两者拥有不同误差定义、预算和遍历，不是共用原生地形叶集合。
2. 同文件 `computeZoom` 独立使用视轴椭球参考点，生成一个全局 fractional style zoom。
   地平线修复只改未命中时的参考点；当前异常视角仍命中椭球，使用原有交点路径。
   这两条路径在切线处连续，并无该处的额外俯角开关。
3. `_SceneGISVectorSymbolProjection.perspectiveScale` 使用
   `clamp(0.5 + 0.5 * anchorDepth / referenceDepth, 0, 4)`。
   这是 ADR-0065 已记录的旧 map-pitch text/icon 补偿，早于 2026-10-16 的修复。
   在未触及 clamp 的正深度范围内，与透视相乘后，标量屏幕尺寸仍为
   `0.5 + 0.5 * referenceDepth / anchorDepth`。近处放大没有上限；地面倍率的上限 4
   不能限制近处屏幕放大。Viewport 对齐文字走另一条 CSS offset 路径。
4. `SceneGISVectorTileFlatFS.glsl` 的 line coverage 已用
   `min(1, lineDepth / referenceDepth)` 抑制近处放大；该修复未覆盖 symbol。
5. `SceneGISVectorGroundCommon.glsl` 的 fill fringe 仍用
   `extra.xy * metersPerPixel / pixelRatio` 扩张，片元直接使用 `v_fringe` 作为覆盖。
   近处会放大全局参考位置的一像素地面过渡带。这解释了边缘变软的机制；整片地表的灰暗、
   空气透视与细节缺失不能仅凭此诊断一并归因，必要时另做同视角隔离。
6. Style minzoom/maxzoom 和表达式继续消费全局 style zoom。例如示例的 building minzoom=14，
   本次转动相机跨过该门槛，即使 source cover 数量相同也会改变建筑显隐。这是样式阈值，
   不是 source LOD 细分阈值。

## 建议与待决语义

保留已验证的三维 SSE source 选择、地平线连续参考和原子注记交接。需要分别确定
map-pitched 字体的近景屏幕尺寸契约，以及按实际屏幕投影计算 fill 边缘覆盖。
不宜把当前 loaded tile 的整数 level 当成字号，也不宜再用俯角阈值切换整层比例。

建议近处文字采用逐锚点投影尺度抑制额外放大，保留贴地朝向、沿线路径、远景收缩、
碰撞和 pick 一致性；fill AA 应采用局部屏幕导数或等价的实际像素覆盖，避免把全局像素带
直接当成处处一像素。具体实现和参考算法在进入修复前细化，涉及现有长期语义时修订 ADR。

下一步由当前 Agent 根据负责人对近景文字尺寸的反馈细化有界修复计划；验证应包括本视角、
连续倾角、近/中/远锚点、fill 边缘、碰撞/拾取与静态资源复用。D2 动态规则视觉 gate 保持独立。
本轮无 upstream-owned file、SGP 或生成文件修改；没有运行产品回归或声称问题已修复。

## 方法复审：先定义尺寸，再选择计算方式

负责人要求重新审查方法本身，并明确“近处抑制异常放大，远处继续透视缩小”。
上述诊断保留为历史证据；此前直接沿用旧远景 blend 的实现不视为已批准方法。

三个量有不同职责：source SSE 决定数据精度；global style zoom 求值样式；局部投影决定
一个样式像素在当前地表位置如何落到屏幕。不能用一个全局 referenceDepth 代替第三项。
旧 MapLibre `0.5 + 0.5 * ratio` 是特定符号尺寸策略，不是透视投影定律。
给它增加 `min(ratio, ...)` 只能消除视轴附近的深度放大，不能限制离轴方向的伸长。

直接调用当前 `Projection.shape` 的反例：5° 俯角、120° FOV、anchor eye depth 12 m、
referenceDepth 80 m、旋转 56° 的标称 8 px quad。锚点从视轴 x=0 移到可见 x=18 m，
同一条投影边从 5.90 px 变为 14.09 px；深度完全相同。这不是 SSE 或字号表达式变化。

尺寸候选：

- 固定地面米制：自然透视，但不满足近景字号限制。
- 完整逆投影以固定宽高：会抵消地面倾斜压缩，趋近地平线时需要极长地面字形，且不符合远景缩小要求。
- 保留参考地面比例，并用锚点处地表→CSS 屏幕的二维 Jacobian 最大伸长限制它：
  `mpp = min(referenceMpp, 1 / sigmaMax(J))`。只统一缩小地图平面字形，不反向拉伸被压缩的方向；
  referenceMpp 在远处自然产生透视缩小，不再保留经验性的远景 0.5 blend。

选择第三项。用当前投影矩阵对局部地表基向量求导，必须包含透视除法的 off-axis 项、
CSS viewport 和地表局部度量；glyph advance、geometry、collision 使用同一比例。
这约束锚点处的局部尺度，不声称有限尺寸字形跨越明显深度/地形变化时每条边严格等于标称值。

Fill AA 则应按轮廓到像素的距离定义：地面 fringe 的插值距离 `d` 除以屏幕梯度长度，
是局部到边界的屏幕法向距离。现有 fringe 可以作为保守绘制包络，实际覆盖收紧后不再
把参考位置的一像素当成处处一像素。它有投影依据，可保留；远处包络不足一像素仍是明确边界。
改为屏幕空间外扩整个 ground prism 需要新的地形轮廓/邻接协议，不是当前直接贴地管线的等价小改。
复审中发现的 discard 导数条件和零距离插值是该方法正确实现的必要条件。

已按[修订计划](../plans/2026-10-19-near-view-style-scale.md)替换字号方案；反例中同一条边
恢复为 7.74 px，53 项 Symbols Specs 通过。当前结论与处置见
[方法与实现复审](../reviews/2026-10-19-near-view-style-scale.md)。
不以先前通过数量替代方法验收，也不扩大为其他样式/渲染器重构。
