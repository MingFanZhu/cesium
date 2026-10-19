# ADR-0168：平面静态实例合批

- Status: accepted
- Date: 2026-10-19
- Decision owner: 当前任务（项目负责人要求补齐 SDK 静态业务图形合批）
- Plan: [Planar batching](../../../AgentDocs/planar-batching/plans/2026-10-19-planar-batching.md)
- SGP: None；不修改 upstream-owned files。

## 源码事实与决定

ADR-0018 的单实例限制是 C6 交付范围，不能满足本次明确的大量静态图形需求。
Cesium PrimitivePipeline 在 scene3DOnly 下不会投影到球面，支持多实例 DOUBLE 坐标变换、合并和
high/low encoding。完整世界坐标的 DOUBLE CPU 中间值不会造成 Float32 顶点精度损失。

扩展 SceneGISPlanarPrimitive.geometryInstances 构造选项，接收原生 GeometryInstance 形状的
实例描述数组（geometry、id、attributes、modelMatrix），继续限定已审计的 SceneGIS geometry。
不另建公共 Batch/Layer/实例类，也不公开私有 vector tile batch 或复制原生 renderer。
单 geometry 入口保持兼容；两种输入互斥。

## 坐标、属性与生命周期

- 实例世界坐标为 `translation(geometry.origin) * instance.modelMatrix * localVertex`。
  批次 modelMatrix 在上述世界坐标外层应用。单 geometry 的原有 origin-local modelMatrix 语义不变。
- 在创建内部 Primitive 前复用 GeometryPipeline.transformToWorldCoordinates 完成 CPU 变换，
  内部实例矩阵均为 identity；随后由原生 Primitive 完成真正的 combine/encode/BatchTable/picking。
- 兼容实例共享一个 Appearance。新增普通线 PolylineColorAppearance，允许独立 color；
  PolylineMaterialAppearance 继续只支持共享 Color material。非线延续已有 flat/open/closed 配对。
- 每个实例必须有唯一非空 id 和一致 attributes schema；避免原生 attribute 交集导致某个对象属性静默丢失。
- 输入实例列表、attributes、矩阵为构造快照。静态拓扑/实例矩阵变更通过新批次替换；颜色、显隐等已提供
  attributes 通过 getGeometryInstanceAttributes(id) 更新，不重建几何。
- pick 返回 wrapper 与原始业务 id；getBoundingSphere(result, id) 可查询单实例，省略 id 查询整批。
- normal-render candidate/current、单 Context、失败回滚、exactly-once destroy 沿用现有协议。
- 几何、Appearance、Material 和 id 仍由调用方拥有。

## 性能和范围

一个兼容批次对应一个原生 Primitive，draw/VA 数由原生索引拆分、透明 pass 等决定，不承诺恒为一个。
同步初次构建、整批剔除与拓扑重建成本仍存在；SDK 应按空间区域和 Appearance 分批。
不把原有逐 Entity 的动态适配路径宣称为自动合批，也不改球面 Primitive 行为。
Ground 的 stencil/segment/envelope 协议需要单独审计，B1 不扩大其支持面。

## 升级检查

复核 GeometryPipeline 的 position/prevPosition/nextPosition、normal 变换，PrimitivePipeline 的
scene3DOnly/combine/high-low 路径，BatchTable 的实例 attributes、ID 和 Primitive 生命周期。
用不同 origin 的大坐标像素/pick 测试及对象数与命令/VA 数对照证明其仍在真实合批。
