# ADR-0095：退化模型 UV 的法线计算

- Status: `approved`; Date: `2026-09-21`
- Owner: current architecture/execution task
- Patch: `SGP-0023`
- Plan: [Bistro follow-up](../../../AgentDocs/rendering-quality/plans/2026-09-21-r15-bistro-scene.md)

## 事实与决定

Bistro 栏杆的 `MASTER_Grain_Metal` mesh 有 1,248 个 UV 零面积三角形，未提供
TANGENT。Cesium `MaterialStageFS.computeTangent` 在导数 UV determinant 为零时
仍执行除法，产生非有限法线和白斑。关闭后处理不能消除；仅使用几何法线可消除。

在原生材质函数加入局部数值修正：determinant 发生零值或浮点相消时返回零切线
sentinel，由基础层、clearcoat 和 anisotropy 的现有调用点消费。基础/clearcoat
保留 geometryNormal；anisotropy 保留有限正交基并跳过无定义的法线扰动。
门限相对于 determinant 两项的绝对值之和，避免把小尺度合法 UV 误判为退化。
提供了 TANGENT 的路径以及合法、镜像 UV 的原始算法保持。

此修正是已有算法中的小型边界处理，直接保持在一个 upstream shader 的最小
marked hunks 中。另造 SceneGIS 材质计算、复制完整 shader 或通过 CustomShader
统一替换法线都会扩大修改面或损失正常细节，因此不采用。不修写用户 UV，不关闭
整材质法线，不创建额外通道、资源、uniform、注册协议或公共 API。

## 验证与升级

沿用 ADR-0030 的 GLSL-to-JS 及 dev/release 构建；生成 JS 不提交。真实 GPU Specs
覆盖 constant/collinear UV、正常/镜像/微小 UV、显式切线及三个原生调用点。使用
用户视角核对实际栏杆，并记录同场景 frame/command 开销。资源所有权不变。
每次升级复核原生 tangent 和 normal 函数；上游具备等价处理后移除 SGP-0023。
