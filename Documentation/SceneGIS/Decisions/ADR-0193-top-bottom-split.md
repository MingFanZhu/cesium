# ADR-0193：原生上下分屏与共享判定

- Status: accepted
- Date: 2026-10-28
- Owner: Architecture / execution（本任务）
- Plan: [上下分屏](../../../AgentDocs/planar-world/plans/2026-10-28-top-bottom-split.md)
- SGP: SGP-0071

## 事实与决定

Cesium 1.144 的 SplitDirection 只有 LEFT=-1/NONE=0/RIGHT=1，多个消费者分别直接比较
gl_FragCoord.x 与 czm_splitPosition。UniformState 按 drawingBufferWidth 将 Scene 的单个
normalized splitPosition 转换成像素。Planar 影像沿用同一契约。

增加原生 SplitDirection.TOP=-2/BOTTOM=2，不创建第二套枚举。已有左右数值/默认值保持。
Scene.splitPosition 在上下模式按屏幕顶部 0、底部 1 解释；CPU 每帧产生从 drawing buffer
底部计量的 (1-position)*height，发布私有 automatic uniform czm_sceneGISSplitPositionY。
不借用 CSS 尺寸或当前 pick viewport 换算，不改变原生 X uniform。

批准一个精确的 SceneGIS-owned builtin 路径：
`packages/engine/Source/Shaders/Builtin/Functions/SceneGISSplitVisible.glsl`。
函数 czm_SceneGISSplitVisible 是私有 fragment helper，统一五方向判定。复用 scripts/build.js
既有 Builtin/Functions 扫描、czm_+basename 生成规则及 ShaderSource 依赖解析；相邻 JS 和
CzmBuiltins.js 仍为忽略的生成物。不扩展为任意 builtin 路径所有权。

方向既可能来自 uniform，也可能来自浮点 varying。真实 Planar PointPrimitive GPU 回归表明，
对插值后的 TOP/BOTTOM 使用精确等号会错落入左右分支，造成上半部显示 B、拾取错误。
helper 使用 -1.5/+1.5 分隔枚举区间，避免栅格化插值的舍入影响；公共枚举值仍是整数。

球面/平面影像调用 helper 后只清零该 sample alpha，保留地表和深度。Model、原生 Gaussian、
Billboard、PointPrimitive、Splitter 包装的内容在原位置 discard；已有 SHADOW_MAP 例外保持。
只扩展已有 splitDirection 的消费者，不给 Label 或任意 Primitive 猜测新增属性。每个对象仍
只有一个方向，全 Scene 只有一个归一化位置，不支持独立双轴位置或任意区域。

## 替代方案

影像专用枚举无法满足负责人扩大后的范围；修改原枚举却只更新影像会使其他对象误按左右裁剪。
逐消费者复制上下数学增加升级分歧；给每个 JS shader assembler 注入库会扩大上游文件集合。
共享 builtin 使用已确认的构建入口，无需 loader、运行时注册或多个 Viewer。

## 资源、发布与升级

只增加一个 CPU 标量和一个按需 shader uniform；不增加 texture、framebuffer、pass、request 或
时域状态。沿用各消费者已有的 shader/command 失效机制。requestRenderMode 下调用方在修改
位置后显式 requestRender。两世界使用绘制缓冲区尺寸，resize 和 resolutionScale 自动更新。

SGP-0071 仅覆盖原生枚举、Scene/FrameState 文档、scalar uniform 传递及裁剪调用替换。
升级核对全部 split consumers、新 builtin 生成/依赖解析、阴影排除、Globe APPLY_SPLIT、
normal/depth 快照、原生命令失效语义。GPU specs、双世界浏览器示例、dev/release 构建和类型
检查证明导出和真实画面；不编辑或提交生成文件。
