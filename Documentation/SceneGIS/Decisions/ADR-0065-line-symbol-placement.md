# ADR-0065：独立沿线与特殊标注

## Status and context

- Status: `accepted`
- Date: `2026-09-13`
- Plan: [V5B](../../../AgentDocs/vector-tiles/plans/2026-09-13-v5b-line-symbols.md)
- Related: [ADR-0063](ADR-0063-point-symbol-renderer.md)、[ADR-0064](ADR-0064-vector-perspective-lod.md)
- SGP: None；不修改 upstream-owned files

负责人授权在独立点标注基础上继续特殊标注。实际 Bright/Liberty 需要沿线道路/水系名称、
随地图定向的单行箭头、保持朝向屏幕的道路编号牌。

## Decision

2026-09-13 交互修正：renderer 在 paint/layout 求值前检查 filter；public evaluateLayer 保持原契约。
可见要素的 integer layout、路径/anchors、编码位置与内容 key 按当前 render tile 缓存，
相机移动只重新投影/避让，fractional size/paint 仍按当前 zoom 求值。Viewport 外 anchors 不触发额外求值。
Cache 只借用该驻留期内不变的 decoded tile data，data identity/integer zoom 改变时失效，
离开 render cover、hide/clear/destroy 时移除；不持有 glyph/sprite 资源，也不延后交互排布。
投影每次 placement 只读取一次 Camera getters；保留原始 eye-relative double 和 map/viewport 几何。

负责人随后要求浅俯角远景注记不显示：透视 projection 中，anchor eye depth 超过视轴地面
交点距离的四倍时排除整个 symbol candidate。相当于当地投影比例低于 style 参考比例的 1/4，
相差两个 zoom levels；避免遥远城市和路牌仍按屏幕字号挤在地平线上。
规则位于 glyph/sprite 请求、shaping、collision 和 pick IDs 分配之前，共用于点、沿线、路牌和箭头。
普通 near/far 与 viewport 判定仍成立，完整 glyph 不按该距离截断；地图几何与 mixed SSE cover 不变。
正交投影不随距离缩小，所以不应用此额外剔除；俯视 Z=0 平面的 eye depth 一致，也不会触发。
该阈值是当前平面可读性策略，不是 MapLibre style 属性或 Globe horizon 规则；暂不增加公开配置和淡入淡出。

复用 V5A 资源、metrics、collision 和 GPU ownership；增加私有、无平台依赖的折线布局。
`line` 对 tile 内路径按间距取 anchors，`line-center` 取完整 part 中点；
`point` + LineString 使用首顶点，遵循参考 `symbol_layout.ts`。
MVT 数值解析不变，世界路径使用显式 tile matrix，style zoom 与 source LOD 独立。

每个 glyph 按 advance 中心在曲线上寻找位置和切线。文字完整长度必须容纳于路径，
相邻字符跨越的转角超过 text-max-angle 时整体不放置，不能用旋转整行代替曲线排版。
keep-upright 依据当前投影的阅读方向选择正反路径；有向箭头独立计算，默认不翻转。

rotation auto 在 point 时为 viewport，沿线时为 map；pitch auto 跟随 rotation。
map pitch 使用实际世界 quad corners，viewport pitch 使用 CSS quad offsets；
两者均投影同一组最终顶点形成 collision，并复用现有 DrawCommand 自动派生 pick。
CPU 使用 eye-relative doubles 与当前 frustum projection，按 eye depth 做 near/far 判定；
不使用 `SceneTransforms.worldToWindowCoordinates` 的负 clip-Z 提前排除，因为有效近半视锥的 clip Z 也为负。
不得将 map pitch 简化成始终面向屏幕的文字，也不增加 Cesium Label/Billboard 依赖。
glyph SDF 和普通 sprite atlas 是标注资源，不是地图颜色 RTT。

anchor 只属于实际 render-cover 的半开区域；完整 glyph 可以越过瓦片边界。
取样间距依 source canonical level 和 overzoom，整数 zoom 内保持世界 anchor 稳定；
同内容的沿线候选还受屏幕重复距离约束，避免邻 tile 与 resident LOD 重复名称。
不同文字或不同样式不按 MVT ID 强行合并，不推断未加载道路的连接或全局里程。
因此不承诺 MapLibre 原始相位或无动画的 LOD 切换逐像素一致。

camera/zoom/cover 变化只在 normal update 重投影、避让与发布；缓存仍有界，热帧复用。
实际 z16 透视轨道曾计算为 15.999999999999869，使 minzoom/整数 layout 退到 15；
仅对相机推导的 style zoom 在距整数小于 1e-10 时吸附，连续 zoom 与显式 Style.evaluateLayer 输入不量化。
使用原有五个公共入口；unsupported shaping、Polygon placement、variable anchor、
icon-text-fit、SDF icons 与 terrain/Globe 保持显式后续边界。
