# V4A：平面真实贴地与公开地形验收

- Type: `phase plan`
- Status: `completed`
- Author: 当前 Agent，架构、执行与自审
- Updated: `2026-09-14`
- Review: [V4A review](../reviews/2026-09-14-v4a-planar-terrain-review.md)
- Parent: [extension plan](2026-09-12-vector-tiles-extension.md)
- Discussion: [surface 边界](../discussions/2026-09-12-maplibre-reference-and-surface.md)
- ADR: [ADR-0069](../../../Documentation/SceneGIS/Decisions/ADR-0069-planar-vector-ground-rendering.md)
- SGP: None；仅 SceneGIS-owned 路径

## Entry and scope

V3C1C checkpoint 为 `4d213d1007`，地形复核 checkpoint 为 `1e9eb1f508`。
负责人明确要求推进真实贴地，并允许零高程与真实地形使用不同绘制路径。
因此将 V4 的第一阶段提前到 V3D 前，保留 V3D 与完整 V5C 的后续资格。

当前默认 World surface 始终存在；flat batch 使用 TERRAIN_CLASSIFICATION，但没有读取
surface depth。Layer 的 terrainProvider 拒绝必须由真实 ground 后端替代。
V2 证明共享 stencil 会丢失要素归属，而独立凸体与 depth 重建支持 alpha、pick 和斜面。

## Design and implementation

1. 保留无 provider 的 flat GPU 快速路径。provider 存在时自动使用 ground，切换清理已发布
   GPU/placement 状态，保留 source 数据缓存与 Worker。provider 到 provider 的变化仅更新
   地表包络与 anchor，不重建道路/面几何。
2. Worker 把已有 fill/line 三角化与样式 attributes 转成数值表。GPU 将每个三角形作为
   垂直凸体绘制，读取实际 surface depth，按 tile-local XY 重建 barycentric coverage；
   共享既有线型/AA/颜色逻辑，独立 pick table 保留 identity。不是地图颜色纹理。
3. 视锥 bounds 覆盖 provider 的全局 min/max；执行时根据当前 surface cover 收紧凸体，含零高程未就绪地表；front-face culling 选取
   exit face。半开三角边和 tile region 保证 alpha 单次归属。只读地表深度，不修改其 Z。
4. 圆点和标注属于 anchor 路径：读取已渲染 terrain 高度，随地表发布更新，GPU 按 anchor
   深度进行地形遮挡。map-pitched 字形角点跟随地形；完整连续曲面字形质量留给 V5C。
5. 公开页增加地形开关和山地区域，借用既有 Esri LERC provider 配置，保留原生 FPS、
   相同地图样式与源。错误显式显示，关闭恢复零高程。

## Affected paths and verification

- Core vector batch/Worker preparation；Renderer ground 数值表与 shader；Scene layer/batch/symbol。
- GLSL 沿 ADR-0030 自动生成 JS，并经现有 build/release/package 链路交付。
- `Test/vector-tiles/public.*` 只组装 API；不新增 Sandcastle。
- Specs：斜面上的 fill/孔洞/重叠 alpha/线型/pickPosition，provider/LOD/开关与释放，
  Worker transferable 字节和错误契约，terrain anchors；既有 vector 回归。
- 页面验证：本地确定性地形与公开 Esri 山地，俯视/倾斜/近地视角、拾取和原生帧率。
- 构建、类型、release 与安装包 shader/Worker 验证；仅改动范围格式检查。

## Gate and remaining risks

技术自审与负责人视觉 gate 后形成独立 checkpoint。Globe 的曲率/高程/遮挡仍属于 G1；
ground 增加凸体 GPU 工作量，须实测，不能借 flat 性能指标宣称相同性能。
地形深度精度、三角共享边、过细地形上的 map-pitched 字形和垂直侧壁为重点观察项。

## Implementation and handoff

实现与技术自审完成，156 项相关 Specs、9 项 E2E、build/types/release/实际安装包验证通过。
同一紫金山视图使用当前地表包络后帧间隔 median 33→16.7 ms；完整条件见 review。
负责人于 2026-09-14 确认平面真实贴地验收通过；技术与视觉 gate 已关闭，形成独立阶段 checkpoint 后再推进 Globe。
完整曲面字形与完全朝离 Z=0 参考面的三维 style 比例仍有明确边界，由 review R08/R09 承接。
