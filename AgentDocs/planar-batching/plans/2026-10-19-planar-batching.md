# 平面静态业务图形批量渲染

- Plan type: `extension`
- Status: `completed`
- Owner role: architecture
- Created / Updated: `2026-10-19`
- Base checkpoint: `f12f0d800e`
- Related ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- SGP: None

## 目标与边界

为 SDK 提供可直接复用的平面静态实例合批路径，按兼容 Appearance 组织多个业务对象，共享原生
Primitive、VA 和 DrawCommand，同时保持独立 ID、颜色、显隐、实例变换与资源生命周期。
球面继续使用 Cesium 原生 GeometryInstance/Primitive；不复制 renderer，不修改 Entity 自动更新策略。

## 阶段

| Phase | 状态      | 目标与 gate                                                                                                                          |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| B1    | completed | 普通 SceneGISPlanarPrimitive 实例数组、精度、像素/pick、attributes、warm resources、构建/types 与 review 已完成；形成独立提交        |
| B2    | completed | [贴地线面合批](2026-10-19-b2-ground-instances.md) 实现、生命周期、像素/pick、资源对照、SDK 交付与 review 已完成                      |
| B3    | completed | [贴地线 draw call 合批](2026-10-19-b3-ground-line-draws.md)；每 VA 一条命令，独立属性/拾取、坡面/低视角、交付与 review 完成          |
| B4    | completed | [贴地面 draw call 合批](2026-10-19-b4-ground-area-draws.md)；空间分组共享 stencil/fill，独立属性/拾取、透明/孔洞、交付与 review 完成 |

## 整体验收与风险

B4 已完成：[贴地面 draw call 合批](2026-10-19-b4-ground-area-draws.md)，在保留独立颜色、显隐、拾取及重叠顺序的前提下减少 area 命令。

B3 已完成：[贴地线 draw call 合批](2026-10-19-b3-ground-line-draws.md)。对照原生
GroundPolylinePrimitive 补齐 fragment footprint 判定，使 ground line 命令按 VA 而非实例数增长；B1/B2 checkpoint 保留。

- 不再要求每个普通静态业务对象对应一个 Primitive；保留原有单 geometry API。
- 合批对象维持独立业务 ID；颜色/显隐修改不重建几何。
- 大坐标使用 DOUBLE 和原生 high/low 编码；不进入 Globe 的 2D 投影或 IDL 路径。
- 验证初次、warm、局部 attributes、pick、bounds、销毁与失败原子性。
- 性能以对象数、命令数、VA 数及同机 timing 为证据，不承诺跨设备容量或 FPS。
- 大批次仍同步构建；调用方应按空间与 Appearance 分批，避免单批覆盖全世界。
