# Review: 视频投射准备方案

- Type: architecture self-review
- Status: approved for preparation only
- Reviewer role: current task；无独立 Agent
- Created / Updated: 2026-10-21
- Target: 源码调查与 extension plan，不是实现 code review
- Plan: [extension](../plans/2026-10-21-extension.md)

## Findings and follow-up

- High / accepted for P1 / architecture：观察通道与 Viewshed 状态耦合。
  先提炼内部 state，迁移 Planar / S3M 消费端，要求既有行为和独立实例回归。
- High / accepted for P2 / execution：video uniform 不等于完整动态纹理。
  自有 helper 需验证新帧上传、seek、尺寸 / 源变化、回调取消和借用所有权。
- Medium / accepted for P2 / architecture：不能把视频当线性 albedo 重复编码。
  首版选择显示合成，以中灰和彩色校准验证 HDR/LDR，不借用栅格影像解码入口。
- Medium / accepted for qualification / architecture：透明前景、有限深度图与倾斜摄影噪点
  限制质量；不把 opaque 主深度方案宣称为透明介质投射支持。

## Evidence and conclusion

已核对 Scene hook、Viewshed API / coordinator / depth / GLSL、Planar / S3M observer 选取，
以及 PostProcessStage dirty texture、Material video update、Texture 上传源码。
图谱缺少最新 Viewshed 符号，因此相关路径回退到当前源码读取。
本轮没有运行时代码变更或视频功能测试；计划具备 P1 启动依据。
实现前须登记 ADR、复核 SGP-0065，之后完成 build / types / GPU / 浏览器验收。
无上游文件修改、无新增 SGP；本地可复现媒体是自动测试前提，不依赖公网或自动播放许可。

准备文档的 Prettier 与 Markdownlint 通过，全量 AgentDocs Markdownlint 通过；
全量 Prettier 仍有 521 个历史文件告警，未批量修改其他扩展。视频实现尚未开始，
本目录暂未提交；此前影像示例与颜色修复已分别提交，提交钩子的 lint / tsc 通过。
