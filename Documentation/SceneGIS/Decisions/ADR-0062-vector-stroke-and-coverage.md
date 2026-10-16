# ADR-0062：矢量 Stroke 与边缘覆盖

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V3B1](../../../AgentDocs/vector-tiles/plans/2026-09-13-v3b1-vector-style-primitives.md)
- Related: [ADR-0058](ADR-0058-vector-tile-frontend-contract.md)、[ADR-0061](ADR-0061-owned-vector-tile-primitives.md)
- SGP: None

V3B0 `d2667e6ad4` 已完成自有 GPU ownership，但 stroke 仍借用 Cesium 线数学，
前端可接受的 cap/join/dash/gap/offset/blur 尚被 renderer 拒绝。用户要求继续实现 MapLibre
style 所需图元。本决定冻结当前基础矢量 profile，不扩展为完整 Style v8 SDK。

## Decision

自有 stroke 由 Core 数值网格、Renderer 资源、Scene 比例/层序三部分组成。
不再调用 PolylineGeometry 或 PolylineCommon；不修改 Cesium native Primitive/Shader。
参考 MapLibre 5.24.0 的连续 strip、join/cap 分类与 coverage 思路，使用自己的非压缩属性协议；
不复制其图元 runtime 或引入额外 WebGL context。

| 类型       | 本阶段语义                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------- |
| line       | butt/square/round cap，miter/bevel/round join 与 limits；color/opacity/width/gap/offset/blur/dash |
| fill       | holes/multipolygon、color/opacity、显式 outline 与可关闭的边界 AA                                 |
| circle     | 屏幕圆形 radius/stroke/color/opacity，blur 与 DPR 感知 AA                                         |
| background | color/opacity 保持                                                                                |

Line width/gap/offset 按参考平面 CSS pixel 换算为米，挤出后参与正常投影，
倾斜时随地图透视变化；这替代 V2 的屏幕法线挤出行为。
参考比例复用 style zoom 的 canonical root width/512 约定，normal frame 统一更新；
large-origin positions 仍为 double→high/low 与 double modelMatrix。
Circle 保持屏幕尺寸，不把其 screen alignment 暗改为 map alignment。

### 2026-10-16：近处线宽上限

负责人确认低俯角下抑制近处的额外放大，保留贴地及远处透视收缩。
在解析 coverage 中，width / gap / blur 乘以 `min(1, eyeDepth / referenceDepth)`；
正交投影为 1。Ground 使用实际地表深度，flat 使用参考平面交点深度。
这修订上述无限制近大远小的行为，不改变 style zoom、source LOD 或线的真实中心位置。
原网格仍保守包围收缩后的覆盖；无需重建网格、增加顶点属性或纹理。
Offset 与 dash / pattern 的纵向累计 station 保持地图空间语义，防止随视点移动时相位游动；
图案的横向坐标随新宽度归一化，cap 和 gap 共享同一解析边界。
这是一种制图宽度，不声称从像素规则推导出了道路的真实米宽。计划与证据见
[低俯角修复](../../../AgentDocs/vector-tiles/plans/2026-10-16-low-angle-rendering.md)。

Globe 中心视线未命中椭球时，参考距离及 style 比例按
[ADR-0070](ADR-0070-globe-vector-ground-rendering.md#2026-10-16地平线样式参考距离)
使用真实地表距离并连续衔接地平线，不以 camera near 代替参考距离；coverage 公式保持不变。

连续拓扑表达连接处，避免把普通拐角当独立 segment 重叠绘制。
Miter 超限转 bevel；round join 按角度生成扇形，极锐/反向转折保留有限网格。
Geometry 保存逐 feature paint 与 pick 属性，不按颜色或 dash 值生成独立 command。
2026-09-13 交互修正：feature-independent 的 line paint 与无显式 outline 的 fill paint 使用
Cesium VertexArray 的 constant attributes，normal update 更新相同 VA 上的数值；color 保留既有
normalized byte 精度。Source/composite paint 继续逐 feature attributes，不增加按值拆批。
圆角网格按当前外半径的二次幂上界保留不超过 0.25 CSS pixel 的 chord error；同一上界内
width/gap/offset/color/opacity 变化只更新 paint，上界、filter/layout、dash 或可绘制状态变化才重建。
失效按 style layer 隔离，不重建整 tile 的无关层；camera 表达式按实际求值结果而非 raw zoom 失效。
新 geometry 尚未按 upload budget 发布时，旧 batch 保持旧 paint，不能超过其圆角精度包络。
Scene 只在 normal render 更新 constant attributes；pick/depth 继续使用最后发布的值。
颜色与拾取共享 coverage、半开 tile clip 和 discard，继续由 Cesium 自动派生 pick command。

### Multi-frustum and DPR correction

本阶段真实正交测试复现 V2/V3B0 在重叠深度视锥重复合成地图颜色：0.5 alpha 变为 0.75。
不能简单只提交到最近视锥，否则会错误裁剪远处地图或改变前景物体/底板的层序。
继续按原 pass 参与各 frustum，vertex 只 clamp clip-space Z；
fragment 用参考平面交点的 eye depth 在 canonical (near, far] 内着色，拒绝重叠区的第二次贡献。
Near/far 从 frameState.frustumSplits 与 UniformState.currentFrustum 匹配，
不使用包含 opaqueFrustumNearOffset 重叠的 near 值。此协议由真实多视锥 alpha、pick 与前景回归覆盖。
Depth buffer 仍由 planar surface 与普通对象维护，地图 color 不写深度。

Camera.getPixelSize 已调用 frustum.getPixelDimensions 并使用 scene.pixelRatio；
computeZoom 直接消费其 CSS 比例，移除原先第二次 pixelRatio 乘法。
真实 DPR=2 的 linewidth 与 warm-resource 测试覆盖此修正，不能沿用错误的 stub 假设。

## Dash data and ownership

虚线用每个 part 的累计几何距离与线宽单位。数组各项交替为 dash/gap，
奇数长度数组的首尾 dash 在周期边界连续，保留零长 dash 以支持圆点。
总长度必须正；无 dash 属性表示实线。不得把非法周期静默转换为实线。
前端 dash zoom 与其他 paint 的既有 fractional 求值保持；本阶段没有 cross-fade。
虚线尺寸以当前 width 为单位，不实现 MapLibre floorwidth/crossfade 的逐像素过渡。

数值表保存各实线区间，按数组去重并线性打包为 nearest float Texture；
它不保存地图颜色，不是地图 rasterization，也不要求预先栅格化 dash 图像。
Shader 按 feature 的 start/count/period 求周期距离；round dash ends 使用圆形距离。
Dash progress 与 cap envelope 的几何偏移分开，端点增加未延伸的 body station，
避免把端帽延伸距离误算进整段虚线比例。拐角附近仍按 stroke 插值，
不承诺所有转折处的圆点都是独立正圆。
纹理容量按实际 texel count 与 Context limits 检查，失败通过原 candidate 事务清理。
无 dash 的 batch 不创建该 Texture。Texture 与 buffers/pick IDs 归同一 batch owner，
warm 与 pick 重放借用它们；replacement、eviction、failure、destroy 成对释放。

MVT 不提供全路累计里程，不能从 feature ID 推断它；phase 从当前 part 起点开始。
Tile buffer 保持原始位置，但不同 clipping/LOD 数据仍可能有不同相位，本阶段明确不保证消除。

## Fill and circle coverage

Fill interior 保持 earcut triangles；隐式 AA 使用 polygon/hole 边界外侧的窄 fringe，
不把 core 与同色居中 outline 双重合成。关闭 AA 时只有 interior；
显式 outline 使用自有闭合 stroke。Fringe 是 GPU 矢量几何，不依赖颜色 RTT。
同一 fill batch 按 feature 交错提交 core/fringe，保证后一要素覆盖前一要素的边缘。
不同 feature 的重叠继续 source-over，几何自相交不额外引入隐式 union。
Circle blur 为相对外半径的软边距离，device-pixel AA 保证高 DPR 下合理的边缘覆盖。

## Qualification and limits

默认画风发生变化，新增 Test 样式图集需负责人视觉确认；自动化覆盖端点/拐角/gap/dash、
透明度、holes、tilt、DPR、pick、warm 与 allocation rollback。
固定 Shader 按 ADR-0030 经 dev/release/installed package 验证；无 upstream-owned 修改。
Symbol、pattern、extrusion、heatmap 等仍需各自资源/图元设计，style frontend 继续拒绝。
数值表逐片元查询成本随 dash 复杂度增长，密集数据资格与预算在 V3C 实测处理，
不得以本阶段小图集宣称完整 MapLibre 兼容或生产 terrain/Globe 支持。
