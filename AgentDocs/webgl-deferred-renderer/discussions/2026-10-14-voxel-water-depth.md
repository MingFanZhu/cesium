# Voxel / water composition and final depth

## Metadata

- Type: discussion
- Status: resolved / owner scene contract and budget accepted
- Author role: architecture
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Review: [P4d review](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR / SGP: ADR-0161 / SGP-0046

## Reproduced boundary

Voxel 原生 pass 使用 premultiplied alpha、depthMask=false 和 closest-frustum 提交。
接到延迟光照之后，体积与普通不透明物的前 / 内 / 后关系已经通过 GPU；但在水面
之前合成时，后方水面覆盖前方体积。新增像素回归复现：显示 / 隐藏前方体积时，
水面像素完全相同。不是材质或相机误差，也不能以其他 17 项通过覆盖此失败。

水面只保存物理不透明折射输入。标注已获准不进入该输入；该决定不能自动扩大为
体素语义。把体积颜色刷新到折射输入也无法区分位于水前 / 水后的体积部分。

## Proposed contract and concrete implementation

建议 Voxel 按专用透明内容合成：水面之后执行原 ray-march，使用完整最终表面深度
截断视线。水面之前的体积可见，水面之后的体积被遮挡；不参与水下折射。沿用原
depthTest 开关，false 仍不截断。不新增体积重放、OIT 累积目标或材质光照分支。

原生体积只在最近所属视锥提交，水面可能在多个段；因此需要完整线性深度，而非
只读最后一个段的硬件深度。沿用现有 WaterFrame final-depth / TAA 深度协议：
TAA 活跃时借用其 R32F；高级环境已分配 water final-depth 时共用；仅在可见水面
与 Voxel 同时存在、又无上述目标时，按需分配同一个 R32F water final-depth。

| Condition                                       | Extra texture              | Extra initialization                     |
| ----------------------------------------------- | -------------------------- | ---------------------------------------- |
| TAA or existing water final-depth available     | 0                          | 0                                        |
| Visible water + volume, no existing final-depth | R32F, 4 bytes/pixel        | one fullscreen physical-depth copy/frame |
| Either family disappears                        | release conditional target | 0                                        |

1280×800 的新增上限为 3.90625 MiB；水面原提交同时写入深度 MRT，额外几何提交
为 0。resize / 切换 TAA / 隐藏体积或水面须释放或转借。单视锥也可能需要该目标。
已有批准覆盖多视锥高级环境水深及标注；没有明确批准本新激活条件，故先确认。

## Alternative

如需看见水下体积，应另设计水前 / 水后体积积分与折射输入，不能把部分已合成
颜色当作完整支持。需要重新确认语义、ray-march 成本及资源；本次不先行实现。

## Gate

批准后移动专用调用并扩展已有 final-depth 条件，验证水面前 / 内 / 后、TAA 复用、
single / multi-frustum、按需释放以及原生深度测试开关，再完成浏览器视觉验收。
已按获批契约完成实现；水面前 / 内 / 后像素及资源生命周期回归通过，44 项联合 GPU
与原生通道 E2E 通过。负责人本增量视觉待完成；P4d 不提交。

2026-10-14 负责人接受建议语义与按需 R32F 预算。按上述条件实施并验证，不再重复申请；技术 gate 已通过，视觉 gate 待完成。
