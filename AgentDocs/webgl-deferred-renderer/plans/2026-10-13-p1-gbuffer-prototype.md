# Phase Plan: P1 原生材质 G-buffer 原型

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Owner / reviewer: 当前任务，architecture / execution
- Architecture review: `confirmed`
- Created / Updated: `2026-10-13`
- Entry checkpoint: `bb9b16eba0`
- ADR: [ADR-0155](../../../Documentation/SceneGIS/Decisions/ADR-0155-webgl-gbuffer-prototype.md)
- SGP: `SGP-0045`
- Review: [P1 技术资格](../reviews/2026-10-13-p1-gbuffer-qualification.md)，技术与负责人视觉 gate 已通过

## Objective and source facts

负责人授权有限 G-buffer 原型，以既有 Bistro 为验证场景。原生 `czm_modelMaterial`
已经包含 diffuse、specular F0、normalEC、roughness、occlusion 和 emissive。
`lightingStage` 在末尾才以光照颜色覆盖 diffuse；在此之前采集可复用完整材质求值，
包括法线贴图、天气与高光过滤。不能由 metallic/baseColor 再近似重建原生 F0。

## Detailed design

- 私有、显式启用的诊断器，在 opaque 完成、水面/透明之前重放当前可见命令到独立目标。
  复用 Scene 原生命令选择回调、DrawCommand.shallowClone、ShaderCache、FramebufferManager。
- 四个 RGBA16F：diffuse/occlusion、normalEC/roughness、F0/type、emissive/coverage。
  深度沿用实际日志深度与投影。额外线性深度复用现有 AO Shader。
- 普通 opaque Model 和 MASK 为首批表面；非 Model opaque 仅记录遮挡，不伪造 PBR 材质。
  clearcoat/anisotropy/specular 扩展权重及后光照 styling 等未表示语义显式拒绝；透明不采集。
- 单视锥 HDR / SCENE3D 原型；MSAA 跟随主场景，分别验证 1×/4×，不自动改变 AA。
  复用/提取现有 MRT 逐附件 resolve；解析后的混合材质不作为正确延迟边缘照明声明。
- 不接管当前光照；重放成本单独报告。独立页面复用原 Bistro 装载、Clock、环境与面板，
  附加数据可视化和统计。不开新公开渲染模式 API。

## Affected paths and steps

1. 登记 ADR/SGP；Scene 只增加诊断重放入口、命令拦截和释放；LightingStageFS 增加材质采集缝隙。
2. Owned JS/GLSL 实现资源、采集、显示；原 MRT helper 只提取共用 resolve。
3. GPU Specs 验证已知材质值、MASK/遮挡、MSAA 附件、深度、状态恢复、resize/销毁和拒绝边界。
4. 独立 Bistro 页面验证原资产、日夜、相机、显示切换及开关前后主画面；记录成本和显存。
5. 完整 dev/release 构建、类型、专项测试和补丁审计；负责人视觉验收后提交阶段 checkpoint。

## Exit and risks

交付的是可观察的表面数据原型，不是已经替换主通道或取得延迟性能收益。
MSAA 材质混合、覆盖类别、最终附件压缩和正式主通道契约留待后继阶段；重大取舍先确认。
不复制/覆盖旧工作目录的构建产物或资产。共享只读本地资产可通过未跟踪目录链接复用。

## Implementation and validation handoff

实现按上述范围完成。新增私有诊断器、四材质目标/线性深度、独立街道入口；提取既有
MRT resolve。Scene 只有调度/命令选择/销毁缝隙，Model 不改 loader 或命令构造。
实测空场景会跳过原生 frustum loop，故复用 Scene preRender/postRender 事件清理残留，
这是针对已复现卸载失败的修复，不增加 settling frame 或 retry。

7 项原型 GPU、40 项消费者回归、1 项真实 Bistro E2E 通过；完整 dev/release/type build 和
tsc 通过。1× 39.1 MiB、4× 179.7 MiB 的缓冲估算及固定场景 GPU 数据见 review。
MSAA 边缘混合已有数值证据，尚未用于正式光照。原 WebGL 页面/分支未改。

收尾检查：本轮 JS ESLint、改动文档/示例 Prettier、完整 AgentDocs Markdownlint、34 个
相对链接及 diff whitespace 检查通过。AgentDocs 全量 Prettier 的 415 项历史警告未扩大；
HTML lint 的既有 processor 依赖错误经本地工具副本兼容修正后通过，详见 review；正式修复仍待维护。
root/engine npm pack dry-run 确认交付入口。

负责人于 2026-10-13 明确接受原型并批准阶段提交，关闭视觉 gate。当前架构任务确认 P1
退出条件满足，将代码、Specs、ADR/SGP 与本验收记录一并形成独立本地提交。
本记录所在的 P1 提交即退出 checkpoint；P2 尚未激活，后续另建 phase plan。
