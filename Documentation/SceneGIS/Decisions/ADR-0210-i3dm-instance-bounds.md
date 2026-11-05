# ADR-0210：i3dm 实例范围与节点变换顺序

- Status: accepted; implemented and verified
- Date: 2026-11-05
- Owner: 本任务
- Plan: [i3dm bounds](../../../AgentDocs/model-instancing/plans/2026-11-05-i3dm-bounds.md)
- SGP: SGP-0075
- Related: ADR-0161；ADR-0175 不支持 legacy i3dm，边界保持

## Context and decision

原生 legacy i3dm 在 GPU 上按 `tile * RTC * instance * axis * node * vertex` 求位置。
CPU 的 primitive min/max 把实例平移加在 node 之前，再以完整 command.modelMatrix 变换，
使 GLB node scale / rotation 错误作用于整批分布。View 的可见性及 near/far 分配因此可能漏绘。

在 SceneGIS-owned helper 中独立维护 legacy instance 范围，不修改 Shader、View 或关闭剔除。
I3dmLoader 在创建原生 GPU 属性前，以同一 Float32 TRS 聚合 3×4 affine 系数区间。
摘要为 24 个 Float64（192 bytes），同一 i3dm 多节点共享；原始 TRS 仍按原生命周期释放。
节点八角点先应用当前 axis/node，再应用实例区间，得到保守的 tile-local AABB。
draw 球只应用外层 tile / components.transform；不逆算 node，支持非均匀和零缩放。

SGP-0075 在 `I3dmLoader.js` 捕获/传递摘要，在 `ModelDrawCommands.js` 与
`ModelDrawCommand.js` 修正初始和更新后的共享绘制球，在 `ModelSceneGraph.js` 修正
模型总范围的 legacy contribution。普通 glTF / EXT_mesh_gpu_instancing 不使用该摘要。
SCENE3D 外的原生投影路径保持；当前产品仍只支持既有 WebGL2 / SCENE3D 入口。

## Alternatives and costs

只扩大半径或关闭 culling 会掩盖错误变换并影响资源选择；把 node scale 改成 1 会改变几何。
将实例范围逆变换到 node 空间无法覆盖零缩放，也容易再次缩放误差，因此不采用。
逐实例保留矩阵并在每次更新重算会产生 O(instances) 内存和热路径成本。

系数区间不保存实例相关性，允许更保守的球；加载 O(instances)，后续每 primitive 固定八角点工作，
没有新 GPU 资源、绘制 pass、Worker 或公共 API。动态变换沿用原生 dirty/update 时序。
一般外层 shear 的 sphere transform 和普通模型动画总范围限制不由本修复扩宽。

## Verification and upgrade

检查真实生成 i3dm / GLB 的像素、拾取、镜头变化和矩阵更新，以及数学包含性、RTC、
父子节点、实例旋转/缩放、普通 EXT 路径与销毁。原生 I3dmLoader、ModelDrawCommand、
ModelMatrixUpdateStage、ModelSceneGraph 和 instancing Specs 定向回归。
升级时复核 legacy Shader 顺序、Loader TRS 生命周期、instances copy、ModelDrawCommand 的
共享球更新及模型总包围体的 axis / components 顺序。上游实现等价修复后移除 SGP-0075。

4 个真实 WebGL / 数学回归、85 个相关原生测试、开发构建、类型检查与补丁审计通过。
原生 Fog 断言及 instancing 2D 初始化存在与本补丁无关的基线失败，已在修改前源码复现；
验证明细及性能记录见 [review](../../../AgentDocs/model-instancing/reviews/2026-11-05-i3dm-bounds.md)。
