# ADR-0072：矢量透明度与独立球面颜色合成

- Status: accepted，G2 qualification pending
- Date: 2026-09-14
- SGP: `SGP-0012`
- Related: [ADR-0070](ADR-0070-globe-vector-ground-rendering.md)

## Context and source facts

Cesium 1.144 的 GlobeTranslucencyState 对 TERRAIN_CLASSIFICATION 使用 first-depth peel。
Classification 颜色随后由 Globe translucent shader 合成并一起乘 Globe alpha。
这不符合独立矢量层：Globe alpha 为零时，矢量仍应按自身 alpha 可见。
原有 Layer 显式拒绝透明 Globe；加载、解析和真实地形 anchors 不依赖地表颜色。

## Decision

Layer 新增有限 `[0,1]` 的 `opacity` constructor option/property，默认 1。
它乘 background/fill/line/circle/text/icon 每次绘制的 alpha，保持 style 顺序与 premultiplied blending。
不将整幅地图预合成；重叠要素的结果不同于 group opacity。零透明跳过颜色与 pick 提交，保留 resident 数据。
修改不触发 Worker、geometry、atlas、VA 或 shader 重建，调用 Scene.requestRender。

Globe 地形和影像保留原生 API：Globe.translucency 控制地表颜色，ImageryLayer.alpha 控制影像在地表颜色中的贡献。
几何深度保持有效。默认不透明 Globe 路径不变。

SGP-0012 在 GlobeTranslucencyState 增加显式 private owner slot，由 Globe Layer 成对登记/注销。
仅在透明 Globe 且该 frustum 存在注册命令时，矢量跳过原生 classification 颜色合成。
继续借用 native packed first-surface depth；先执行该 frustum 的 Globe translucent/pick commands，再直接绘制矢量。
已执行 Globe commands 从后续 TRANSLUCENT 列表移出，普通对象保持原生后续 opaque/OIT 或 sorted-alpha 路径。
Globe 背面颜色先于正面；矢量只按当前可见表面深度绘制。所有 framebuffer/uniform 临时状态成对恢复。

首轮资格限地表上方观察和当前可见面的地图。背面瓦片、地下观察及穿越透明地表的对象排序另设阶段；
不能把此前 opaque 地表深度遮挡契约自动推广为任意透明体排序保证。
Planar 使用同一矢量 opacity，但整个 Planar World 的透明不在此 ADR 中改变；既有 imagery alpha 保持。

## Alternatives

- 仅移除 guard 会将地图 alpha 与 Globe alpha 相乘，不能满足独立控制。
- 修改 Globe shader 的 classification 合成会改变原生 ground primitives，且仍需地图颜色 RTT。
- 增加新 Pass 会扩大 Renderer/frustum/GLSL 升级面；不采用。
- 将矢量放到所有对象之后会错误覆盖前景物体；采用 surface 阶段直接合成。

## Ownership, delivery and upgrade

注册集合只保存 owner references，无 context/GPU ownership；最后 Layer 释放后清空 slot。
借用 Scene-owned GlobeTranslucencyFramebuffer，不创建或销毁 native depth/color textures。
新 helper 位于 SceneGIS/Scene/_private，Shader 仍按现有 GLSL glob 生成；公共 opacity 由原 buildTs 生成类型。
上游修改仅 GlobeTranslucencyState.js，必须用 SGP-0012 paired markers；升级复核 native derived command type、first peel、
per-frustum command indices、pick 和 OIT 时序。上游提供等价 direct surface overlay hook 时退役此补丁。

## Verification

G2 Specs 验证独立颜色/alpha、foreground object、原生 pick、零透明、identity/lifecycle 和不透明回归。
本地真实地形/标注页面 E2E 与有界 warm timing 用于视觉、资源及性能证据；不把 timing 作为跨机器 gate。
完整构建、类型、实际发布入口与 patch audit 必须覆盖新 API/Shader/seam。
