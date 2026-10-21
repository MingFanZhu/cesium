# Extension Plan: 双世界视频投射

## Metadata

- Plan type: extension
- Status: active
- Owner role: architecture
- Architecture review: confirmed；用户已同意实施
- Architecture reviewer: current task self-review
- Created / Updated: 2026-10-21
- Discussion: [观察通道复用](../discussions/2026-10-21-observer-reuse.md)
- Review: [准备评审](../reviews/2026-10-21-preparation.md)
- Related ADR: ADR-0177、ADR-0176、ADR-0161、ADR-0030
- SGP: 共享 Scene 接点复用 SGP-0065

## Objective and stable boundaries

视频像素按独立投射相机映射到真实场景表面，只有投射相机可见的部分接收视频。
Globe 使用 ECEF，Planar 使用当前 World 米制 XYZ，严格绑定 Scene / World。

- 复用独立观察视角的选级、请求、保护和原生深度派生，不能只取主相机可见瓦片。
- 提炼内部 observer state / coordinator 与 GLSL 判定，Viewshed 和视频是两个公共消费者；
  不复制整套遍历，也不继承公开 Viewshed 强行替换 Shader。
- 每实例独立深度图与媒体纹理，复用 geometry / decoded content；不占用太阳阴影图。
  多视频与可视域共存；同位姿捕获去重留待有明确性能需求时再设计。
- 视频帧和遮挡覆盖分别就绪；缺任一项时保留原画面，空深度不表示可见。
- 保留原生 animation、instancing、MASK discard、clipping、CustomShader / flatten。
  深度精度沿用 Viewshed，不通过扩大 bias 或增加倾角阈值消除错误。
- 首版建议为显示阶段 SDR 视频融合，提供 opacity，不再次参与曝光、环境光照或 gamma 编码。
  黑色是有效视频内容，不默认抠像；保留目标 alpha。
- 显式 sources 是遮挡集合，接收面来自主画面不透明深度。透明前景的合成顺序在 P2 明确并
  测试，不能把 opaque 深度方案宣称为玻璃 / 水面投射或透射支持。

## Source facts

`Scene.js::executeCommandsInViewport` 已通过 SGP-0065 在主几何准备前 prepare、主几何后
且后处理前 capture。`_SceneGISViewsheds.js` 仍耦合 stage._viewshed 与 Viewshed registry；
Planar Surface 和 S3M 也读取其 FrameState 列表，共享化须一起核对。

`_SceneGISViewshedDepth.capture(camera, commands, width, height)` 支持矩形目标，
但 observer 选级当前发布 scalar resolution，不应只把纹理改成矩形就声称 SSE 已同步。
Viewshed GLSL 已有主深度重建、TAA jitter 消除、observer UV、范围裁剪、log-depth 解码、
receiver-plane texel-center 比较；可提取共享 GLSL，避免两套精度修正。

原生 PostProcessStage 将 video uniform 作为 dirty image 创建 Texture，没有持续帧上传循环。
Material 有视频 copyFrom，但每次 update 都上传。应复用底层 Texture / copyFrom，
在 SceneGIS-owned helper 管理新帧和生命周期，不复制上游 WebGL 实现。
Shader 继续使用 ADR-0030 的 `Source/Shaders/SceneGIS/**` 生成链。

## First-version API proposal

候选 `SceneGISVideoProjection` 继承 PostProcessStage，由 collection 管理销毁。
参数建议包括 scene、world、video、position / direction / up、视角 / near / distance、
depth resolution / bias、sources、terrain、opacity、enabled、showFrustum。
具体签名和状态名称在进入实现阶段时依据当前源码冻结。

首版接收调用方拥有的 HTMLVideoElement。播放、暂停、seek、URL / srcObject、音频、
解码器和自动播放交给调用方；销毁投射只释放自己的 GPU 资源、回调与事件，
不暂停借用 video 或停止 MediaStream tracks。源更换、seek 和尺寸变化使旧帧失效。

默认保持画幅宽高比；FOV 描述投射几何，媒体画幅匹配与 UV 翻转独立处理。
用带方向标记和网格的校准视频测试，不凭目测猜 flipY。
深度分辨率、投射视锥比例和视频原始像素尺寸分别定义，避免相互混用。

## Phase roadmap

| Phase | Objective                            | Entry gate                          | Exit gate                                                                       | Status      |
| ----- | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| P1    | 提炼共享观察通道，保持 Viewshed 行为 | ADR / SGP、源码与 phase plan 已核对 | 深度、offscreen selection、严格绑定、shadow / 多实例隔离回归通过并提交          | completed   |
| P2    | 视频资源、公开 API、遮挡投射         | P1 已提交；当前 phase plan 已建立   | 新帧 / 暂停 / seek / 换源 / 比例 / 颜色 / 销毁测试，build / types，通过后提交   | not started |
| P3    | 双世界示例、集成与开销验收           | P2 已提交；资格 plan 已建立         | 地形 / Model / 3D Tiles / S3M、共存、有限性能证据与本地视频示例，提交后视觉验收 | not started |

每阶段完成代码、Specs、ADR / SGP 与 review 后形成独立本地提交，再进入下一阶段。
当前阶段：[P1](2026-10-21-p1-observer.md)。后续阶段尚未激活。

## Media update and bounded cost

视频新帧通知只标记 dirty 并 requestRender，渲染时上传最新可用帧，不在回调内发 GL 操作。
显示帧率更高时不得重复上传相同视频帧。暂停视频可停止上传，但动态遮挡 / 相机 / LOD
仍需更新深度；初版沿用每个实际渲染帧捕获，在完整失效协议前不添加猜测式静态缓存。

新帧通知可使用 [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)。
该回调针对新呈现帧，并不保证与视频严格同步；P2 明确最低浏览器能力，不提前写多层兼容 fallback。
测量上传次数 / 字节、depth draw、CPU 提交与可用 GPU timer，记录 720p / 1080p、单 / 多实例样本。

## Non-goals and risks

首版不实现物理投影灯、间接照明、视频参与曝光、内参 / 镜头畸变标定、全向投射、
媒体协议播放器或 SDK 集成。跨域视频需具备 WebGL 可用权限，错误由状态 / errorEvent
报告，不隐式重试或换源。有限分辨率、薄遮挡物与倾斜摄影噪点是明确精度边界。
多实例遵守 postProcessStages 顺序，不能承诺无限路数或无成本捕获。

## Overall acceptance

双世界位置与画幅正确，障碍后方 / 视锥外 / 无表面处不投射；主相机独立；
与阴影和可视域并存；未齐数据不漏投；视频与遮挡各自更新；HDR/LDR 颜色策略明确；
停用 / 销毁释放自身资源，借用媒体不受影响。最后由负责人视觉验收，SDK 集成另行安排。
