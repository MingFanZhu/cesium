# ADR-0178：平面面材质与 Fabric 复用

- Status: accepted（实施中，资格按阶段记录）
- Date: 2026-10-21
- Owner: 当前任务，项目负责人批准普通面、贴地面和 Entity 材质接入
- Plan: [Planar materials](../../../AgentDocs/planar-materials/README.md)
- SGP: None；预计只修改自有实现。

## Context and decision

ADR-0018 / ADR-0023 的 Color-only 是初期限制，原生 Primitive / Material 可复用。
普通面接纳 MaterialAppearance BASIC/TEXTURED/ALL，复用同步 Primitive 的更新、
透明通道、BatchTable、拾取、阴影及既有 deferred 捕获，不复制 renderer。
Fabric source/uniform 遵循原生 czm_materialInput；Model CustomShader 属于不同接口。

按 vertexFormat 生成属性，颜色路径保持成本。Box/Cylinder/Ellipsoid 使用原生 UV；
Polygon/Wall/PolylineVolume 使用三角面主法线轴归一投影，硬边分离，保留已有法线。
这种自动 box projection 允许主轴交界纹理接缝，不承诺沿路线连续展开。
Polygon stRotation（弧度，默认 0）围绕 UV 中心旋转；CPU DOUBLE 重基后计算。
材质分支不保留零面积三角形，其对几何覆盖和 bounds 无贡献。

每批共享一个 Appearance / Material，不同图片或 uniforms 按兼容材质分批。
独立显隐、id、pick 保持；PerInstanceColorAppearance 独立颜色语义保持。
MaterialAppearance 不隐式把可选 color 属性作为乘色。
原始几何、Appearance、Material 仍由调用方拥有，Primitive 不销毁借用 Material。
Entity adapter 自建 Material 则由 adapter 释放，避免图片纹理泄漏。

贴地面继续深度/stencil 后端，在实际地表位置计算材质坐标，保留地形深度。
同材质也不证明重叠片元颜色相同；材质批次按空间安全组保留覆盖顺序，
不复用 Color-only 同色不透明重叠合并例外。地表输入/光照在 M2 资格后补充。

## Alternatives and validation

拒绝只移除校验：Polygon 缺 UV，地面包围体 UV 不是地表坐标。
拒绝将逐业务对象 Primitive 作为材质必需路径；保留静态实例合批。
本轮不解除线材质限制，不承诺任意 Appearance 外层自定义 Shader。

升级复核 geometry vertexFormat、Material texture lifecycle、Primitive 透明/pick、
deferred native appearance 标记。验证像素、孔洞/重叠、拾取、动态更新、
销毁、VA/draw 预算和完整构建类型；球面行为不变。

## M1 implementation findings

原生 MaterialAppearance 的 translucent=true 默认状态会在材质转不透明时保留 blending，
与当前 deferred opaque contract 冲突。包装层创建 native MaterialAppearance 内部副本，
以 disabled blending 为 base，继续由原生 getRenderState 按 Material.isTranslucent 选择。
每帧仅同步当前已发布 appearance.material 引用；uniform / texture 仍由原生更新，
不修改调用方 appearance，不重建 VA，不增加上游补丁。

Polygon 材质几何单独校正 outer/hole 侧面绕序，配合有符号主轴 UV 保持外法线和 TBN。
颜色几何保持原样；native solids 的 UV 不经过自有投影 helper。

## M2 Ground integration

Ground 接纳 MaterialAppearance 的 Material/flat/faceForward，使用自有 volume Shader；外层自定义 Shader 不接入。
UV 从表面深度与每对象 XY extent 重建，再应用 stRotation；normal/TBN 从表面导数重建。
材质透明不影响 stencil 建立与清除，禁止 discard；pick 保持原生 GroundPrimitive 的足迹语义。
材质范围禁止同色重叠合并，空间无冲突范围仍可共用命令；动态材质与 provider envelope 不重建 VA。
