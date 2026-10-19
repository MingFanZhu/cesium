# B1 原生实例合批

- Plan type: `phase`
- Status: `completed`
- Owner role: execution / architecture
- Architecture review: 当前任务基于源码确认设计
- Created / Updated: `2026-10-19`
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Related ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- Related discussion / review: None / [B1 review](../reviews/2026-10-19-b1-native-instances.md)
- SGP: None

## 源码事实与设计

现有公开 wrapper 只有 geometry/id/attributes；geometry descriptor 的 materialization 是 private。
因此 SDK 没有完整公开合批入口。新增 geometryInstances 构造选项，采用原生实例形状的普通对象数组，
不新增实例类。每项包含 planar geometry、id、可选 attributes 和局部 modelMatrix。
支持同类线/面以及 Appearance 兼容的混合封闭体；不同实例 attributes schema 必须相同。

GeometryPipeline.transformToWorldCoordinates 将实例局部 DOUBLE 坐标与几何 origin 变换合成，
然后现有 PrimitivePipeline 合并、编码，所有内部 GeometryInstance 的 modelMatrix 为 identity。
批次 modelMatrix 为世界变换，避免原生相同实例矩阵折叠与 setter 冲突；原有单 geometry 矩阵语义不变。
新增 PolylineColorAppearance 配对以支持线的独立颜色，继续支持共享 Color material。

## 执行与验证

1. 构造期 CPU preflight、snapshot、唯一 ID、Appearance/schema 校验；禁止混用单实例 options。
2. 原生 Primitive 一次接收完整数组；getGeometryInstanceAttributes(id) 及 bounds 查询。
3. 固定数组拓扑；增删/改变 geometry 或实例变换需重建批次。属性、整体矩阵、show 保持 warm 资源。
4. 原有单实例 Specs 回归；新增真实 Context 的多 ID pick、不同 origin/局部矩阵、颜色/显隐、polyline、混合体、失败回滚、批量资源和销毁证据。
5. build、build-release、build-ts、tsc、相关 release Specs；更新 Guide、Architecture、ADR 和 review。
6. B1 完成并形成独立本地提交后才能进入 B2。

## 实际偏差与结果

已实现构造期静态数组、实例属性与 bounds 查询、独立线颜色、原生中间几何释放和保留单实例兼容入口。
开发与 release Primitive Specs 各 16/16；DataSources 回归 101 项通过，剩余旧装配问题修复后定向 2/2 通过。
build/build-release/build-ts/tsc 通过；实际浏览器 1024 个面验证为一个 native Primitive/VA/color command，
独立显隐与大坐标画面正常。新增本地人工示例便于 SDK 复现与比较（原计划只写 Guide，属交付增强）。
标准 build-docs 有两处未改动的上游注释警告，非 pedantic 同配置生成通过。完整证据与自审见 review。
