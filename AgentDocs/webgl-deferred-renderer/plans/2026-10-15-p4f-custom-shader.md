# P4f：CustomShader 与透明专用通道资格

## Metadata

- Type: phase plan；Status: completed；Created / Completed: 2026-10-15。
- Parent: [extension plan](2026-10-13-webgl-deferred-renderer-extension.md)。
- Entry checkpoint: P4e `60cedcbb7b`，技术、review、负责人视觉及提交钩子通过。
- Owner / architecture / execution / self-review: 当前任务。
- Architecture review: confirmed，技术、自审与负责人视觉 gate 全部通过。
- Review: [入口审计](../reviews/2026-10-15-p4f-custom-shader.md)。
- Related ADR: 0155、0156、0159、0161；既有材质捕获 SGP-0045 / 0046。

## Scope

负责人要求继续支持 CustomShader，并明确透明物体继续走前向专用通道。本阶段以原生 `Cesium.CustomShader` 的 Model / Cesium3DTileset 接口为对象，补齐实际缺口和明确资格证据：MODIFY_MATERIAL / REPLACE_MATERIAL、PBR / UNLIT、vertexMain / varyings、uniform / TextureUniform、discard / MASK、原生透明模式、动态替换与拾取。复用既有材质附件、原生资源所有权和透明 OIT / 排序通道。

不把原生 CustomShader 与任意外层 fragment main、直接 MRT 输出或任意 framebuffer 的 DrawCommand 混称。新的底层 Shader / 光照协议、资源或提交预算如确有需求，先基于复现另行决定。本轮不改变矢量地图只贴附当前可见地表的语义；OIT 不会自动生成缺失的地下 / 背面地图覆盖。

## Source facts

1. `CustomShaderPipelineStage.process` 组装原生 vertex / fragment 回调、uniforms / varyings，并依据 translucencyMode 设置原生 alpha pass；当前没有额外的 CustomShader 拒绝条件。
2. `ModelFS` 在材质求值之后、LightingStage 之前执行 fragmentMain。SGP-0045 的延迟捕获在光照入口记录修改后的材质，后续 discard / MASK / clipping 继续执行。
3. 顶点回调仍在原生 Model VS；不透明捕获复用该 VS，屏幕光照从真实深度恢复位置。原生 pick / depth / shadow 派生仍复用材质覆盖。
4. 已有 GPU Specs 验证过固定 CustomShader 材质值、MASK 及扩展材质字段，但没有完整证明上述 API 的动态 uniform、纹理、顶点变化和强制透明组合。
5. 原生 OIT 对透明前向光照的颜色做加权混合；这不是第二套不透明主通道，也不等同于精确逐层折射或为地图恢复多个地表深度。

## Implementation and validation

1. 新增有界 GPU 契约 Specs：两种材质模式、实际纹理更新与所有权、顶点位移 / varying / discard 对颜色和拾取一致、显式透明 / 不透明模式、透明前向受光与 OIT 混合、Model / Tileset 动态替换及 feature identity。
2. 只修复测试复现的产品问题；若原生接口已经满足，不为了“适配”增加重复分支或公共开关。
3. 添加本地确定性 CustomShader 验收页及最小浏览器检查，展示材质模式、顶点变化、孔洞、透明与光照，记录几何提交和条件附件没有无依据增长。
4. 按实际改动运行必要构建 / 类型、静态检查和补丁审计；若没有产品 / 上游修改，明确记录检查边界。
5. 自审、负责人视觉验收通过后形成本阶段独立本地提交。P4e 的视觉确认不代替新增页面确认。

## Current handoff

实现与技术资格完成；没有复现需要修改产品的缺口，因此仅补 GPU Specs、验收页、浏览器检查和支持文档。七项 GPU Specs 与独立 E2E 通过，完整开发 build 通过；提交数、附件复用和生命周期证据见 review。原生 MASK 及扩展材质继续引用 P4d 已有用例，本阶段不重复扩大组合矩阵。

[接入说明](../../../Documentation/SceneGIS/CustomShaderGuide.md) 与 ADR-0161 明确材质修改在捕获之前、透明继续前向 OIT，以及当前表面地图语义与普通透明模型的区别。无运行时 / 公共类型 / 构建实现改动，不重复 release/types 全量检查；保留 P4e 的运行时资格。

2026-10-15 负责人明确确认“画面和拾取通过，提交 P4f”。WDR-P4F-03 已关闭，技术、自审及视觉 gate 全部通过；本记录与 Specs、验收页、接入说明和 ADR 共同形成 P4f 独立本地 checkpoint。没有激活下一阶段，主线合并与发布不在本轮范围。
