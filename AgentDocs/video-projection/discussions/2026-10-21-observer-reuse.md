# Discussion: 视频投射与可视域共享什么

- Type: discussion
- Status: resolved as implementation proposal
- Owner role: architecture
- Created / Updated: 2026-10-21
- Plan: [extension](../plans/2026-10-21-extension.md)
- Resulting ADR: 待 P1 激活前登记
- Related SGP: SGP-0065

## Source facts and options

可视域已有 observer 深度 → 主表面重投影 → 深度比较 → 显示合成。
视频可以在可见分支按 observer UV 采样媒体，隐藏区域保留原色。
但 coordinator 依赖 `_viewshed` 私有状态，Planar / S3M 通过其 FrameState 列表选取和保护。

复制 Viewshed 会使流式选级、bias 和生命周期分叉；继承公开 Viewshed 会混入分析颜色
与状态语义。建议提炼共享内部观察通道和 GLSL 判定，由两个独立公共 stage 组合使用。
Scene hook 复用已有位置，必要 dispatch 修改登记 SGP-0065，不新增第二套几何入口。

PostProcessStage 的 image uniform 不提供完整持续视频更新。Material 每帧 copyFrom
也不是低开销媒体管理接口。复用 Texture 上传，由自有 helper 管理 dirty、尺寸与销毁。

## Recommendation and handoff

首版借用 HTMLVideoElement，提供 GIS 显示融合；播放器和物理投影光源不在范围内。
准备完成，尚无视频产品代码。P1 先证明 Viewshed 行为不变并提交，再进入视频帧管理。
公开名称与画幅参数仍是建议，以进入 P2 时的 phase plan / ADR 为准。
