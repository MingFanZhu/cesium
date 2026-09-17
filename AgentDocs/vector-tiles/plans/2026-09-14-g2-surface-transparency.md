# G2：独立矢量透明与球面透明地表

- Type: `phase plan`
- Status: `completed`
- Owner: 当前 Agent，architecture/execution 自审
- Architecture review: `confirmed`
- Updated: `2026-09-14`
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Predecessor: E1 checkpoint `3d9dcfe7a3`
- ADR: [ADR-0072](../../../Documentation/SceneGIS/Decisions/ADR-0072-vector-surface-transparency.md)
- SGP: `SGP-0012`

## Scope and facts

负责人确认矢量作为独立层，允许矢量与地形影像分别透明；明确首轮只支持当前可见地表，背面与地下后续扩展。
当前 Globe constructor/update 显式拒绝 translucency；原生透明 classification 先进入纹理，随后与 Globe 颜色一起乘 alpha。
因此只删除检查不能提供独立透明。MVT、Worker、SSE 与 resident terrain mesh 无需改变。

## Implementation

1. 双世界 Layer 增加 `opacity`（默认 1，有限 0..1），乘各 draw 的样式 alpha。
   这是逐要素 opacity multiplier，不是整幅地图先合成再淡出的 group opacity；零透明不绘制或拾取，保留数据缓存。
2. GlobeTranslucencyState 增加显式、按 Layer 注册释放的 private surface owner slot。
   不透明 Globe 保留原路径。透明 Globe 从 native first-depth peel 借用 depth，注册矢量跳过 native classification color target。
3. 透明地球颜色在 surface 阶段直接合成，然后矢量直接画入 scene target；普通三维对象仍在后续 opaque/translucent 阶段。
   原生 Globe commands 从该 frustum 的后续 translucent 列表移出，避免重复绘制/OIT 混合地图层序。
   不新增 Pass、地图颜色 RTT、Worker 或 GPU 资源。保留原生地形/影像透明 API。
4. 只对存在可见 vector commands 的 frustum 接入。多图层保持原 style/primitive 顺序，普通 classification 不改变颜色归属。
   背面/地下内容相互穿透和跨透明地表的三维对象排序不在本阶段资格内；地表上方物体遮挡必须验证。
5. 球面测试页增加矢量、地表与测试影像三个透明度控件；平面页复用矢量透明度。
   Planar imagery alpha 保持原能力，Planar 整个 World 透明仍是独立 surface renderer 后继工作，不擅自改变其 opaque contract。

## Validation and exit

- WebGL pixels 覆盖不透明/半透明/全透明 Globe 与独立 vector alpha、native imagery alpha、前景普通对象。
- 原生 derived pick、透明切换、缓存/VA/program identity、多 Layer 注销与销毁；默认 Globe/Planar 回归。
- 真实地形、文字与页面控件的有界 E2E，记录 warm frame 性能和错误。
- 完整 build/types 与相关 release 入口；SGP 审计与修改范围 lint。
- 技术自审和负责人视觉 gate 后独立 checkpoint；保留历史性能风险。

## Current handoff

实现与技术自审通过，见 [G2 review](../reviews/2026-09-14-g2-surface-transparency-review.md)。
181 项 vector Specs、20 项 native transparency Specs、7 项页面 E2E、完整 build/types/tsc/release 与
installed-engine/release ESM/IIFE 透明颜色、pick 和资源验证通过；补强后的两项固定覆盖 identity Spec 也已通过。
新增三个球面控件与共享矢量 opacity，正常根服务器 8080 已恢复；实际浏览器本地真实地形透明和混合效果已检查。
唯一 upstream-owned 文件为 GlobeTranslucencyState.js / SGP-0012，生成文件未进入 delivery。
负责人要求平面也支持透明，按推进授权关闭 G2 gate，形成独立 checkpoint 后进入后继阶段；明确保留 G2-R06/R07 的边界。
