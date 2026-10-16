# Globe 地平线样式比例自审

- Type: review
- Status: approved; owner visual gate passed
- Created / updated: 2026-10-16
- Owner: 当前 Agent，Architecture / implementation self-review，非独立评审
- Target: [standalone plan](../plans/2026-10-16-horizon-style-scale.md)
- Baseline: `d255b6b74e`
- Related: ADR-0070、ADR-0062；SGP 增量：无

## Finding 与处置

- P1 / fixed：中心射线未命中椭球时，原 ECEF 最近点退到 near。当前用户视角仍有 23 块
  已加载可见瓦片，但参考距离 0.1 m、zoom 29.1013491488，118 个样式层全部隐藏。
  修复保留原命中路径，在未命中时取 scaled-space 前向最近点并投影到椭球面；使用实际
  地表距离及纬度统一计算 zoom 和 line referenceDepth。切线两支在同一地表点衔接。
  没有 clamp zoom、改变样式 min/max zoom、时间平滑或跳过遮挡。

## 验证

- 新增 5 项 Specs：near=0.1/1/10 不影响朝天参考尺度；赤道、中纬度、高纬度分别跨
  实际椭球切线与当地水平线的连续性；中心朝天时下方 fill/line 的 WebGL 绘制、拾取及
  显式 minzoom/maxzoom 隐藏。切线边界用独立射线求交定位，比较两侧实际结果。
- 首轮 WebGL fixture 的横向地面线在掠视下窄于像素采样，改为沿视线方向的地面线，
  保持真实颜色/拾取断言；产品线宽算法未改。相关 Globe / Symbols / dynamic rules
  最终 90 项通过，包括正常绕目标缩放稳定、mixed SSE cover、近处线宽上限与远处透视、
  terrain / Model / 3D Tiles 遮挡、同地图层序、原子交接、即时隐藏与资源释放。
  日志：忽略的 `Build/vector-horizon-regression.log`。
- `npm run build`、scoped ESLint / Prettier 通过。私有比例计算未改变类型、Shader、Worker
  或构建入口，不扩大到完整发布/安装包矩阵。文档按 scoped Prettier / Markdownlint 检查。
- 原公开页恢复相同位置、方向、up 和 near：参考距离 23.5028448768 m，zoom
  21.2246575756；可见瓦片仍为 23，最终 1001 drawCommands，19 placedSymbols；
  failedTiles、symbolFailures、pendingRequests 均为 0。
- 241 帧记录包括固定位置跨地平线与恢复后的 warm 帧，整层 drawCommands=0 的帧数为 0。
  后 80 帧 CPU 中位数 9.1 ms、P95 11.7 ms；非严格前后性能对照，不宣称性能提升。
  数值记录：忽略的 `Build/vector-horizon-motion.json`；截图：`Build/vector-horizon-review.png`。

## 所有权、成本与剩余边界

实现只新增两个固定 scratch 向量及常数次椭球几何运算；不新增逐帧瓦片扫描、请求、
纹理、buffer 或资源所有者。Source SSE 选择函数未修改，existing lifecycle Specs 通过。
Upstream-owned files：无；SGP：无新增或修改。未修改 SDK、生成文件或 WebGPU stash。

这仍是 Globe 椭球参考比例，保持已有真实地形 draping/occlusion；未改为异步 terrain
LOD 驱动的样式缩放，也不承诺地下或椭球中心视角。样式自带的显隐阈值继续生效。
无未解决技术 finding；2026-10-16 负责人确认视觉 gate 通过，本次不替代 D2 的独立视觉 gate。
形成独立本地 checkpoint，不推送；随后高级环境灰蒙感单独诊断，不混入本次修复。
