# Phase Plan: V3C1A 低角度远景选层

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Owner / reviewer: 当前 architecture/execution Agent，自审
- Created / Updated: `2026-09-13`
- Entry checkpoint: `bb007b3518`，V5B 与提交 hook 已完成
- Architecture review: `approved`，负责人批准远景处理并明确俯视拉远不受影响
- Discussion: [远景选层](../discussions/2026-09-13-planar-distant-tile-loading.md)
- ADR: [ADR-0066](../../../Documentation/SceneGIS/Decisions/ADR-0066-planar-tilted-tile-distance.md)
- SGP: None

## Current source facts

共享 planar quadtree 已有三维 closed tile bounds / SSE，surface 在 selection 后才准备 terrain
与 imagery。MVT cover 复用 SSE，但自行维护 64 leaves 预算和 resident cover；MVT updateSources
已经取消不再 desired 的请求。Terrain 只为 desired 与祖先发 direct 请求，额外兄弟准备 fallback。
V5B 远景 symbol filter 不减少地图选取；公开页已恢复原生持续渲染与 FPS。

## Contract and implementation

1. 增加可写 `SceneGISPlanarWorld.maximumTiltedTileDistance`，默认 Infinity，接受正有限米数或
   Infinity。Setter 只更新配置，不分配资源、不修改 Camera、不发请求。
   首轮通过 World 属性启用，不增加 Viewer raw config / constructor 转发或上游 typedef 修改。
2. 只在 perspective 且视轴与水平面夹角绝对值小于 20° 时生效。
   10° 以下使用配置距离；10°–20° 按 direction.z 的 smoothstep 权重逐渐放宽有效距离，
   到 20° 完全回到原 SSE。Orthographic、俯视、高空俯视、Infinity 配置保持原选择结果。
3. 距离是相机到 tile 三维闭包围盒的最近距离；超过有效距离时停止细分、保留 tile。
   相交边界和高程包围盒保持保守。共享 private helper 每轮选取计算一次有效距离，
   不使用视轴地面交点、缩放、相机运动检测、Camera far 或新增计时器。
4. Surface 与 MVT 的选择器共同使用该规则；各自的父子覆盖、fallback、缓存及 source
   minimumLevel 约束保持。MVT 不请求 source 未声明的低层级；minimumLevel cover 超预算仍显式失败。
   地形依赖瓦片可以越过细节距离，不能为了裁切删除父子替换所需兄弟。
5. 公开页显式设置 100000 米；选择器 Specs 和实际页面确认近处原 SSE / 远处粗覆盖。
   不增加 UI 调参面板，不开启通用 Worker / 字节预算阶段，也不提前允许 MVT terrain 共存。

## Validation and exit

- World 属性的默认、合法切换、失败原子性；相关完整 build / declarations / tsc。
- 选择器验证低角度减少 refinement、边界和高程保守性、水平视轴有限；俯视不同距离与
  orthographic 的 keys 精确等同未启用策略，DPR 不改变选择结果。
- Scene 验证 terrain / imagery 只请求新的 desired 及必要依赖；粗 cover 不出现父子重叠，
  深度/pick 重放与销毁保持。复用既有协议 Specs，不改未证实有错的任务调度器。
- 公开页本地 E2E 覆盖低角度前后选取、近处覆盖与俯视拉远不变；实际 Berlin 5° 同视角
  比较 MVT / surface 选取、请求和固定移动轨迹的 CPU，记录局限，不把 FPS 当唯一依据。
- 更新正式指南、ADR、review 与 handoff；通过技术自审后交付负责人视觉验收。
  阶段独立 checkpoint 后再进入 V3C1B 密集数据预算/必要线程。

## Execution and current gate

World 属性、共享 angle / closed-bounds 判定与两条选取链均已实现。公开页采用 100000 米，
完全本地的 `Test/vector-tiles/distance.html` 演示地形/影像 2000 米与俯视/浅角切换。
197 项相关 Specs、131 项既有 vector 回归及 5 项页面 E2E 已覆盖通过；完整 build / buildTs / tsc 通过。
三项既有 lighting 断言按已有 advanced-lighting key 修正，产品 Shader 未变。
证据与局限见 [review](../reviews/2026-09-13-v3c1a-tilted-distance-review.md)。
技术自审通过。负责人随后明确要求推进异步 Worker，按推进授权关闭阶段 gate；近景密集性能继续由 V3C1B 处理，先建立本阶段独立 checkpoint。
