# 球面与平面上下分屏

- Type: standalone plan
- Status: completed; accepted by owner on 2026-10-28
- Author roles: Architecture / Execution
- Date: 2026-10-28
- Architecture review: confirmed
- Parent: [Planar World](../README.md)；维护既有分屏能力
- ADR: [ADR-0193](../../../Documentation/SceneGIS/Decisions/ADR-0193-top-bottom-split.md)
- SGP: SGP-0071
- Open discussion: None
- Review: [技术自审](../reviews/2026-10-28-top-bottom-split.md)；旧影像分屏人工验收状态保持

## 源码事实与范围

负责人要求上下对比且不限于影像。原生 SplitDirection 被影像、Model/3D Tiles、PointPrimitive、
Billboard、PointCloud Splitter 及原生 Gaussian shader 共用；均按屏幕 X 比较。Planar 已复用
同一枚举与 Scene.splitPosition。Label 本身没有 splitDirection，不为缺少该属性的对象另加 API。

新增 TOP=-2、BOTTOM=2；LEFT/NONE/RIGHT 数值不变。scene.splitPosition 共用，左右为从左到右，
上下为从上到下，范围 [0,1]、默认 0。UniformState 每帧计算 (1-position)*drawingBufferHeight。
共享私有 GLSL builtin 返回侧别可见性，保留原生交界相等时双方可见及 shadow-map bypass。
影像只屏蔽 sample alpha，其余现有消费者保留 discard 位置，不增加资源或绘制通道。

## 接入与步骤

1. ADR/Architecture 批准唯一 SceneGIS-owned builtin 文件；使用既有 glslToJavaScript 自动
   生成 CzmBuiltins 和相邻 JS，无自定义 loader、源字符串替换或手写生成物。
2. SGP-0071 覆盖枚举、Scene/FrameState 文档、UniformState/AutomaticUniforms 和原有各裁剪调用。
3. Planar 校验接受五方向，保持 normal-render 快照、请求/纹理/command 所有权。
4. 双世界示例展示左右/上下与非影像对象；测试真实像素、深度/拾取、DPR/resize、warm 资源及销毁。
5. 运行定向 GPU Specs、浏览器 E2E、完整 build/release/type checks 及 SGP 审计，回写结果。

## 验收与边界

所有已有分屏路径使用同一判定；无 split 的默认画面不变，改变方向不触发额外纹理或 pass。
沿用原生 Model 在 splitDirection 改变时的 command 重建行为，不宣称所有消费者零重编译。
保持原生请求、渲染、拾取和阴影策略；不增加任意形状、多条分界线、独立相机或 SDK 功能。
本次直接在 scenegis/develop 实现；2026-10-28 负责人确认结果并要求本地提交，未要求推送。

## 实际结果

实现与技术验收完成：6 项 splitter GPU、8 项图层、54 项 Surface/Shader、6 项浏览器回归通过；
完整 build/build-release/types/tsc 通过。发现并修复 varying 精确等号导致 Planar 点图元误判，
详见 review TB-01。更广 Planar 检查的唯一旧裁剪失败已在 HEAD 原实现复现。
新增示例 Test/分屏对比.html；没有改 SDK。2026-10-28 负责人确认结果并要求提交，TB-05 已关闭。
