# Discussion: Planar 真正透明与专用受光通道

## Metadata

- Status: resolved; implementation, technical checks and owner visual acceptance passed
- Owner role: architecture / execution
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Related: ADR-0073、ADR-0161；复用既有透明调度，不新增预算

## Facts and owner decision

负责人在 Planar 视觉验收中指出降低 opacity 后仍遮挡后方物体。旧 ADR-0073
明确只与 surface 之前的背景混色，所有 opacity 均写地表深度；已通过的像素测试
证明的是旧契约，不能作为此次视觉验收通过的证据。

负责人确认改成真正透明，随后明确接受：不透明 Planar 继续延迟受光，半透明
Planar 使用既有 OIT 专用通道受光。无需为了透明内容建立第二套完整不透明前向
管线，也不要求另建透明 G-buffer；不采用额外缓存的透明延迟方案。

## Implementation

- opacity=1 保留 Pass.GLOBE、深度写入及延迟材质早返回。
- opacity<1 的同一 tile command 进入 Pass.TRANSLUCENT，关闭颜色绘制的深度
  写入，输出真实 alpha；既有 OIT 合成后方物体与多层山坡，OIT 关闭时沿用原生
  透明排序能力，不宣称获得精确相交透明排序。
- 保留地形/影像/Fabric、双面、基础/物理/局部受光、天气及阴影专用派生。
  不在不透明材质阶段计算这些光照。
- 移除背景快照 helper、拷贝、sampler 与延迟阶段的旧背景混色。opacity=0
  不产生颜色/遮挡；地形选取、准备和地形查询仍可用。同步场景拾取遵循透明通道，
  不再以不可见地表遮住后方对象；显式地形查询继续返回地表。
- 复用命令/VA/纹理，跨不透明边界更新 pass、render state 和派生缓存；不得留下
  旧 depth-only/OIT/shadow 派生。资源所有权保持，GPU 零新增专用附件。

## Verification and gate

GPU fixture 验证后方不透明物体、前方遮挡、两侧透明层、opacity 0/0.5/1 往返、
线性/log 与跨视锥、影像/Fabric、透明物理受光、阴影/局部灯/天气、拾取及销毁。
旧 opacity Specs 必须改为新契约；不删除与新语义仍相关的地形/资源覆盖。
真实山地验收页展示地下参照物，记录材质/透明提交和资源变化；负责人重新验收。
P4d 其余 open findings 与独立阶段提交 gate 保持未关闭。
