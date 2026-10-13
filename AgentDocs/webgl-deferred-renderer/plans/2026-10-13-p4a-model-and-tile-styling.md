# Phase Plan: P4a Model 与网格 Tiles 样式覆盖

## Metadata

- Plan type: phase
- Status: completed，技术与负责人视觉 gate 均通过
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Owner role: architecture / execution，当前任务
- Architecture review: confirmed，保留原生光照前/后样式分工
- Created / Updated: 2026-10-13
- Entry checkpoint: P3b `84aafea838`，技术/视觉验收与提交钩子通过
- Discussion: [源码、复现与预算](../discussions/2026-10-13-gis-style-buffer-budget.md)
- ADR / SGP: [ADR-0159](../../../Documentation/SceneGIS/Decisions/ADR-0159-deferred-feature-styling.md) / SGP-0048

## Objective and source facts

先让已有 Model.color 和带 selected feature ID 的原生网格 Tiles 进入延迟实验，
保留颜色、显示/隐藏、原生透明分流、同步要素拾取与 AO/SSR/SSIL 的能量语义。
实际原生 10 要素 b3dm fixture 在未设置 style 时已触发 HAS_SELECTED_FEATURE_ID 拒绝；
Box 的 Model.color 同样被拒绝。该缺口已复现，详见 discussion。

原生 MaterialStage 在光照前混合要素 baseColor，CPUStyling 和 ModelColor 在光照后处理；
新增适配应分别保留两部分，不能把最终颜色当作原材质。不改 loader/FeatureTable API。

## Approved implementation

采用 A：Model.color 继续使用每模型分组 uniforms，并复用原生 ModelColor 光照后计算；
feature multiplier 经显式 capture hook 写入可选第五附件，在屏幕光照后应用，同时按
相同 multiplier 更新 AO/SSR/SSIL 响应。材质 pass 保留原始 alpha/discard/show 与透明分流。
只有需要要素通道时才分配、挂载和采样，场景退出该布局时释放；检查实际附件能力。

影响路径：owned Deferred controller / capture / lighting、GBuffer 的限定 profile 校验、
必要的原生 CPUStyling capture 接点、GPU Specs 与独立场景组装。
任何原生修改先读取上游清单、登记最小 SGP，再添加成对标记；不复制原生样式实现。
诊断 G-buffer 的旧资格边界保持独立；不以解除所有 excluded 项代替逐项支持。

不采用压缩四附件或统一改为光照前着色。第五附件存逐像素样式乘数，不存 feature ID / pick ID；
不新增全屏 pass。既有单采样 + TAA/FXAA、公开 API 和 native feature picking 保持不变。
第五附件使用独立 owned manager，布局切换只重建借用深度的 FBO，四张基础纹理保留；
所有材质输出使用对应四/五附件派生变体，非要素内容写中性乘数。

## Bounded qualification

- 确定性原生 Model / b3dm / i3dm / feature-ID texture fixture：颜色混合、show、
  opaque/translucent 切换和选择 ID，按实际接入路径选择最少样本。
- 与原生同条件 HDR 对照：PBR/unlit、Model.color 与 feature style 组合；AO/SSR/SSIL
  保留响应分工。测试 LOD/卸载与分组失效，不能缓存已过期的 FeatureTable 数据。
- 无样式街道应保留四附件与现有画面；有要素内容记录附件/带宽/计时成本。
- 支持的容量检查、resize、增删/隐藏、Scene destroy、native borrowed 资源生命周期。
- 相关 Specs/E2E、完整 build/release/types、上游审计、自审和负责人可复现视觉 gate。

## Exclusions and handoff

clearcoat/anisotropy/specular 扩展、点云颜色样式、outline/silhouette/clipping edge、
分类、多视锥与地表特殊分支后续单独处理；不在这一步决定迁回主线替换。
实现与技术验证完成；技术结果、实际成本和已通过视觉 gate 已记录到本阶段 review。

## Implementation and technical handoff

实现完成：独立第五附件、原生模型颜色 stage、逐要素后光照乘数和响应缩放；
资格检查复用既有 Shader 信息缓存，避免每条命令重复扫描 Shader。
69 项相关 GPU Specs 与最终街道/要素 E2E（2 项） 通过，详见 [P4a review](../reviews/2026-10-13-p4a-native-styling-qualification.md).
最终交付检查已完成；负责人于 2026-10-13 回复“通过”，architecture 确认阶段退出条件满足。
形成独立 checkpoint 后再进入下一阶段；普通 Globe、Entity 和图元作为下一轮源码审计方向。
