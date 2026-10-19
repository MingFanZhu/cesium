# B3 贴地线 draw call 合批

- Plan type: phase
- Status: completed
- Owner role: execution / architecture
- Created / Updated: 2026-10-19
- Architecture review: confirmed，基于原生 GroundPolylinePrimitive / PolylineShadowVolume 源码
- Parent plan: [批量渲染计划](2026-10-19-planar-batching.md)
- Base checkpoint: `caa02fbfd2`
- ADR: [ADR-0168](../../../Documentation/SceneGIS/Decisions/ADR-0168-planar-static-batching.md)
- Discussion / review: None / [B3 review](../reviews/2026-10-19-b3-ground-line-draws.md)
- SGP: None，预期不修改上游

## 重新评估

用户明确要求进一步降低 ground line draw call。B2 复用的是 ClassificationPrimitive 的 stencil 范围隔离，
并非原生 GroundPolylinePrimitive 的完整合批方法。原生 createCommands 按 `_va.length` 建立命令，
PolylineShadowVolumeFS 采样 `czm_globeDepthTexture`，重建 eye-space 地表位置并执行 width/start/end-plane 裁剪。
颜色和 pick color 随 batchId，因此交叉和不同颜色本身不要求逐实例绘制。
Scene 已在 GLOBE 后、TERRAIN_CLASSIFICATION 前复制深度；须用真实 planar/deferred 和 pick 测试确认有效。

## 实施边界

1. 替换唯一的 ground line Shader specialization，保持 area stencil 路径；不增加可选 backend、pitch 阈值或 fallback。
2. CPU 仅由 source XY 生成稳定 segment forward、起止切面法线、端点/侧边标记、width。
   DOUBLE 做点差，再存 FLOAT 方向/offset；原生 high/low 编码 position，共用现有 Z envelope。
3. VS 保守扩张 inside-out segment volume；FS 读取当前地表深度，按屏幕宽度和起止切面 discard。
   同一 VA 一条 terrain color 命令；pick 用相同片元裁剪和原生 per-instance pick varying。
   不写 surface depth，不再写 classification stencil。Line 不需要 pickOffsets，允许原生索引拆分。
4. Depth texture 为明确能力要求，缺失时 mutation 前拒绝；原生 globe-depth copy 生命周期复用，不新增纹理/回放。
5. 保留 ID、show/color/width、provider envelope、candidate/current、warm identity 和销毁。

## 验证 gate

- 原生源码按 VA 发命令的确证；1024 line 的实际 queue count 从 2048 降到 VA 数。
- 同一批次的不同宽度/颜色、交叉/透明、端点/折线连接、hidden 与 independent pick；大坐标和倾斜相机。
- 平面 surface depth 的 normal/pick/linear/log 消费；缺少 depth texture 明确拒绝。
- 原有 Ground/Entity 集成回归、provider replacement 和 warm resources；不改变 area commands。
- dev/release Shader build、真实浏览器画面与同机 CPU 对照、生成模块交付。
- 文档明确 B2 保留命令的结论被 B3 line 路径替代；完成 review 后独立本地提交。

## 执行记录

已实现稳定切面/端点属性、地表片元裁剪与单 VA 命令；没有上游修改和额外深度资源。
Ground 开发/release 各 23/23、DataSources 102/102；浏览器 1024-line batch 为一条颜色命令、无 stencil，
独立拾取与显隐正确。Build/release/types/tsc、实际 engine tarball 与 review 完成；源码对照、性能和剩余边界见 review。
