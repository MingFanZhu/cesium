# 独立点深度与 EDL 提交预算

- Type: discussion；Status: resolved；Created: 2026-10-15。
- Owner / architecture: 当前任务。
- Parent: [P4g](../plans/2026-10-15-p4g-all-draw-command-producers.md)。
- Finding: [WDR-P4G-01](../reviews/2026-10-15-p4g-all-draw-command-producers.md)。

## 已确认的失败与必要数据

原生 PointCloudEyeDomeLighting 把不透明点命令改到私有双颜色 FBO，随后执行混合屏幕命令。当前延迟布局拒绝这种普通不透明命令；原生三项 GPU 测试中两个真实 render 失败，pick 一项通过。不能通过放宽 framebuffer 校验解决：原生目标储存已受光颜色和点深度，和材质 G-buffer 不同。

EDL 需要同一处理器的点深度，包括邻近像素中被其他普通物体遮住的点。主场景最近表面的深度可能属于其他物体，直接替代会改变 EDL 轮廓。因此不把主场景深度冒充点专用深度，也不关闭 EDL。

## 建议实现与上限

保留主场景点命令：不透明点一次写材质，统一延迟光照；透明点继续原生透明前向。为每个当前可见且启用 EDL 的处理器，按需生成点专用深度，再在对应延迟光照组中计算原生四邻域 EDL 因子。

- 每个处理器一张 R32F 线性深度和一张 DEPTH24_STENCIL8 深度附件，共 8 bytes/pixel；1280×800 为 7.8125 MiB。它们替代该处理器原生两张 RGBA8 加深度的 12 bytes/pixel（11.71875 MiB），不能同时保留旧颜色目标。
- 每帧每个去重后的可见不透明点 DrawCommand 增加一次无光照的点深度提交。一个命令即使跨多视锥也只提交一次；采用完整视图投影和统一深度区间，保留 TAA 抖动、裁剪、点尺寸、样式 discard 和 alpha mask。
- 无普通三角形、透明点或主场景不透明颜色重放。EDL 因子并入现有点光照组，不增加 EDL 屏幕合成；多个处理器必须各自保留 radius / strength 和点深度，不能混成全场景统一 EDL。
- 关闭 EDL、隐藏处理器、销毁或 resize 时释放 / 重建所需资源。不同 tileset / TimeDynamicPointCloud 的处理器数量仍可线性增加内存；上面的数值是每个处理器，不是全场景总量。

点深度提交会增加几何成本，虽然相对原生 EDL 减少目标内存，仍超出此前“不增加普通几何提交”的预算，须负责人决定。此讨论不批准反射探针的新预算。

## 验证与决定

批准后验证 tileset pnts 和独立 TimeDynamicPointCloud、前后遮挡、样式变更、透明切换、多个处理器、TAA / 多视锥、拾取不受影响，以及关闭 / resize / destroy。记录实际提交和字节数，最后提交新增画面供负责人验收。

当前结论：2026-10-15 负责人接受点专用深度和提交预算，实施与技术验证完成后又明确确认“点云画面与拾取通过，继续 P4g”。本增量视觉 gate 已关闭，不代表 P4g 全阶段完成，也不覆盖反射探针的新资源或提交。

六项新增真实 GPU Specs 覆盖两类点云、多个处理器、动态帧、裁剪、共享效果、TAA、多视锥、半透明与资源释放；八项生产者回归、192 项原生样式测试与浏览器控制检查通过。1280×800 页面两个处理器共 15.625 MiB、两次点深度提交；关闭或转为半透明后均归零。多视锥仍为两次点深度提交；没有增加 EDL 屏幕合成。具体实现、上游接点和历史失败见 P4g review。

## Final owner acceptance

2026-10-15 负责人确认最终画面通过并要求提交 P4g。批准预算内的技术、资源与负责人视觉 gate 均已关闭；P4g 阶段最终结论见 [review](../reviews/2026-10-15-p4g-all-draw-command-producers.md#phase-gate)。反射探针与透明物体水面 SSR 的明确暂缓决定保留。
