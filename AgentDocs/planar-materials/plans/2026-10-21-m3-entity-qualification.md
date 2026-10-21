# M3 Entity 与验收

- Plan type: `phase`
- Status: `completed`
- Parent plan: [扩展计划](2026-10-21-planar-materials.md)
- Owner role: architecture / execution（当前任务）
- Architecture review: `confirmed`
- Created / Updated: `2026-10-21`
- ADR: [ADR-0178](../../../Documentation/SceneGIS/Decisions/ADR-0178-planar-materials.md)
- SGP: None。

## Source facts and design

M1 `4264d02bd0`、M2 `b875cb79a9` 已独立提交。
四个平面面/实体 Visualizer（Polygon、Area、Solid、Route）当前只读 ColorMaterialProperty。
各自保有候选 owner、几何 signature 与更新路径。Primitive 借用材质；Entity adapter 必须拥有生成的材质。

增加共享私有 MaterialProperty 桥，复用原生 getType/getValue、Material.fromType 和 uniform 更新。
Color 保留原路径；非 Color 类型写入 signature，同类型动态属性仅更新 material.uniforms，
类型切换沿用候选替换协议，并在 Primitive 销毁后释放旧材质。
PrimitiveOwner 追踪其 adapter 创建的 Material；候选创建异常也清理，避免半构建泄漏。
Polygon/Ellipse/Rectangle 接入 finite stRotation；显式 textureCoordinates 暂不支持。
线与轮廓维持原 Color 契约，其他场景类型不变。

## Validation

定向 Specs 验证四个 Visualizer 的 Image/Checkerboard、动态 MaterialProperty、类型切换、
uniform 不重建、移除/失败资源清理、World 绑定与既有 Color 回归。
补充本地综合材质示例，显示普通、贴地、孔洞、透明重叠、批量及 Entity 材质，支持低倾角。
运行完整 build/build-ts/tsc、相关 lint/docs 检查，更新开发与架构边界，审查后独立提交。
项目负责人视觉验收保留明确状态。

## Results

M3 专项 5/5、相关四类 Visualizer 26/26；build/build-ts/tsc 和 lint 通过。
[自审](../reviews/2026-10-21-m3-entity-qualification.md) technical passed。页面交互验证已完成，项目负责人视觉验收待确认。
