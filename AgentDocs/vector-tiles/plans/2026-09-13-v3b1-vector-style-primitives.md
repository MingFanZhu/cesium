# Phase Plan: V3B1 基础矢量样式图元

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V3B1`
- Owner / reviewer role: 当前 architecture/execution Agent，自审
- Architecture review: `confirmed`
- Created / Updated: `2026-09-13`
- Entry checkpoint: `d2667e6ad4`（V3B0）
- Related review: [V3B1](../reviews/2026-09-13-v3b1-style-primitives-review.md)
- ADR: [ADR-0062](../../../Documentation/SceneGIS/Decisions/ADR-0062-vector-stroke-and-coverage.md)
- SGP: None

## Objective and source facts

在 V3B0 自有 Buffer/VA/Shader/DrawCommand 上实现已有 V1 前端接受的基础矢量样式，
移除 PolylineGeometry/PolylineCommon 过渡依赖。用户已要求继续实现 MapLibre style 所需图元，
无需再次批准自有图元方向；新增画面完成后仍留负责人视觉 gate。

只读参考固定 MapLibre 5.24.0 的 LineBucket.addLine/addCurrentVertex/addHalfVertex、
LineAtlas.getDashRanges 与 line/line_sdf/circle shaders：连续 strip、miter threshold、
round coverage、沿线距离和地图平面 extrusion 各有独立职责。
不移植 MapLibre 的 WebGL runtime、packed byte 格式或 camera/projection 系统。
当前 Layer 已有 feature 属性、zoom 求值、tile/style batch、正常帧原子替换与原生 pick 派生。
固定 GLSL 沿用 ADR-0030 构建；数值纹理使用 Cesium Texture/Sampler 与 Context limits。

## Implementation

1. 自有 Core stroke mesh：去除连续重复点，保留 multipart/closed polygon identity；
   连续左右 strip、miter/bevel/round joins、butt/square/round caps、有限的反向转折处理。
   属性保存挤出方向、offset 方向、沿线距离、宽度/gap/blur、cap 与 dash metadata。
2. 自有 line vertex/fragment：地图平面 CSS-to-meter extrusion、large-origin RTE，
   coverage、gap/offset/blur 和原生派生拾取共享 discard；普通色彩继续 premultiplied alpha。
   参考比例只在 normal frame 更新，warm/pick 不重建 GPU geometry。
3. 按不同 dash 数组复用线性区间表，打包为最近采样的 float 数值 Texture；
   feature 属性索引区间，Shader 求周期距离，不因线型不同拆逐 feature command。
   表容量按 Context texture size 预检，失败参与 candidate cleanup。
4. Fill 增加边界 fringe，并支持 fill-antialias=false；explicit outline 使用自有闭合 stroke。
   Circle 支持 blur 与 DPR 感知的边缘 coverage。保留前端已支持的颜色/opacity/expression/filter。
5. 移除已实现属性的 V2-only 拒绝；style 前端仍保留未支持类型/属性的路径诊断。
   自有 profile 在 ADR/指南写明，避免把局部实现称为完整 MapLibre 兼容。
6. Test 增加本地样式图集，覆盖端点、拐角、虚线、gap、offset、blur、透明层序与 holes。
   CPU 拓扑/数值表 Specs、真实 Scene 像素/pick/资源 Specs、页面 E2E 对应实际风险。

## Validation and exit

保留 V3B0 已通过的行为测试；仅对本阶段明确改变的画风更新具体预期并解释原因。
新属性必须在关闭 MSAA/FXAA 的真实 Context 下验证关键像素和拾取。
覆盖透明 join、闭合环、急角、重复点、DPR、倾斜、共享瓦片 clip 与资源失败/销毁。
运行 build、相关 Specs/E2E、types/release/installed package 及 owned/generated 审计。
使用既有城市记录一次 warm CPU/command observation，密集性能不在此阶段提前优化。
自审和负责人新样式画面 gate 完成后，形成独立 checkpoint，再进入下一阶段。

## Limits

不包含 symbol/glyph/sprite、pattern、gradient、extrusion、heatmap、raster、
transition/cross-fade、生产 terrain 或 Globe。这些能力不因基础 stroke 完成而自动开放。
Dash 相位按每个 decoded part 的累计长度；无全路里程时不承诺跨 tile/LOD 相位一致。
不同样式的精确像素不承诺与 MapLibre 相同；circle 的 screen alignment 保持当前约定。
大 payload 和复杂数值表的 byte budget/Worker 继续属于 V3C。

## Implementation record and handoff

实现位于自有 Core stroke/dashes/geometry、Renderer batch resources、
Scene batch/cover/layer 与固定的四份 VectorTiles GLSL；没有新增公共入口或上游改动。
`Test/vector-tiles/planar-styles.html` 提供 12 类本地案例，行为回归留在 engine Specs 与页面 E2E。

源码审查和真实测试补充了计划入口时未确认的两个根因：
Cesium opaque frustum overlap 会使半透明地图重复合成；
Camera.getPixelSize 已返回 CSS 比例，旧 cover 再乘 DPR 产生重复换算。
按 ADR-0062 修正 canonical depth partition 与比例契约，保留 surface 深度和前景层序。
Dash progress 与 cap extension 分离；普通圆点转折缺口回归通过，
但仍保留 stroke 插值的拐角变形边界，不改成逐圆点图元。

87 项 Specs 与 3 项 E2E 通过，技术证据与限制见本阶段 review。
项目负责人于 2026-09-13 明确确认新增样式图集验收通过，V3B1-R08 关闭。
本次提交将代码、Specs、ADR 与阶段记录形成 V3B1 独立 checkpoint；
随后依据实测负载规划 V3C，不把本阶段样式验收视为密集性能或 terrain/symbol 资格。
