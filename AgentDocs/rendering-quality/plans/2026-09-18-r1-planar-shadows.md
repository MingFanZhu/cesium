# Phase Plan: R1 Planar Cascaded Shadows

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Phase: `R1`
- Owner role: `architecture / execution`
- Architecture review: `confirmed`
- Architecture reviewer: Current task, source-based self-review
- Created: `2026-09-18`
- Updated: `2026-09-18`
- Related discussions: None
- Related reviews: [R1 self-review](../reviews/2026-09-18-r1-planar-shadows.md)
- ADR: `ADR-0083`
- SGP: `SGP-0013`; update existing Widget / Viewer seams `SGP-0001/0002`

## Objective

按负责人要求实现平面几何阴影，同时考虑级联质量。保留原生 `Viewer.shadows`、
`Viewer.terrainShadows`、`scene.shadowMap`、`ShadowMode`，地表对应 `world.shadows`。

## Current source facts

- Cesium 1.144 原生默认四级 CSM，已有 atlas、PCF、caster/receiver derived command、
  resources；Scene 销毁遗漏 ShadowMap 释放，本阶段补齐所有者销毁。
- `ShadowMap.checkVisibility` 使用椭球法线；Planar 正确上方向是固定 +Z。
- 原生使用依赖可见对象的 near/far 和依赖视角的紧包围盒，无固定世界纹素网格对齐。
- `ShadowMap.createReceiveDerivedCommand` 对所有 `Pass.GLOBE` 读取 Globe tile owner；
  Planar surface 必须显式区分，不能伪造 Globe mesh。
- Widget / Viewer 构造及 frame guard 禁止阴影，Viewer terrainShadows 直接访问 globe。
- Planar terrain clipping 必须在 shadow cast pass 执行，不能仅裁掉主视图。

## Detailed design

- SceneGIS private helper 识别 live planar Camera，原生 ShadowMap 只提供窄小 dispatch。
- 平面固定相机 near / maximumDistance 分割，不受上一帧可见瓦片 bounds 驱动。
  用光方向固定的正交基、子视锥包围球、世界纹素网格 snapping 稳定四级覆盖。
- 相邻级联留末端 10% 重叠混合；限制 PCF 采样在各 atlas 区域内。按纹素尺寸和 receiver 坡度计算偏移，解决已复现的建筑条纹。
- 地表命令通过 ShadowMode 发布 cast/receive，纳入 shadow sampler 预算；复用原生
  draw-command dirty 与 shader cache。按实际 shader 提供位置/法线与裁剪。
- 模型与 Primitive 沿用原生 shadows 属性；本阶段不重构全部原生 PBR 阴影能量分配。
- Viewer / CesiumWidget terrainShadows 选项与访问器路由到实际 primary world。

## Affected paths and steps

1. 新建 owned shadow CPU / GLSL helper，登记 ADR / SGP。
2. 最小修改 ShadowMap、ShadowMapShader、Scene 销毁和 Widget / Viewer 集成缝隙。
3. 接入 World / surface 状态、clipping 和相关现有 guard Specs。
4. 增加真实 GPU Specs 和本地阴影开发示例，覆盖级联、平面大坐标和相机移动。
5. 完成构建、类型、受影响原生回归、视觉及有限性能对比，回写 review。

## Validation and completion criteria

- Perspective / orthographic、固定 +Z 日夜方向、四级 split 与矩阵有效；Globe 分支不变。
- 真实像素证明 primitive/model 投影到地表；ShadowMode 动态开关；clipped terrain 不投影。
- 相机小步平移时固定世界点 shadow UV 按整数纹素变化；旋转时 cascade 尺度保持稳定。
- 大 XY、级联过渡、偏移、软阴影、地形与地表透明显示组合经有限画面检查。
- 原生阴影资源 warm reuse / destroy；记录同设备同场景开关阴影的性能对比。
- 完整 build / release / types 与相关 Specs；负责人视觉验收后再关闭阶段并创建独立提交。

## Risks and dependencies

- 仅对已提交的可见地形瓦片投影，不引入新的离屏地形预取或第二套 LOD。
- 原生 receiver 的最终颜色乘法、有限 shadow distance、低太阳高度偏移仍有质量边界。
- 不改其他未验收的工作区修改；阶段提交必须保留此前工作的独立边界。

## Deviations and results

- 技术实现完成；不改变下一阶段范围，负责人已明确验收通过。
- 真实 GPU 检查复现并修复建筑自阴影条纹、透明背景被阴影压暗、Scene 不释放 atlas。
- 150 focused Specs（含 9 个新阴影 GPU/API 用例）在 WebGL validation 下通过；47 native ShadowMap /
  ShadowMapShader Specs 在标准模式下通过。模型 ready 为 afterRender 事件，验证在其后第一次命令提交帧读取像素。
- build、buildRelease、buildTs、root/engine tsc、相关 ESLint 通过。buildTs 输出既有 TSD-JSDoc 警告。
- 视觉检查覆盖全景、近景级联、15° 光照、glTF 与 hill 投影；有限性能记录见 review。
- 原生 WebGL1 fallback 用例在可选 WebGL validation 下于 UniformState/CubeMap 初始化报 INVALID_ENUM；
  该调用先于 shadow 更新，标准模式通过。未扩大到原生 WebGL1 Renderer 修复。
- 负责人验收通过；将阶段实现与此前集中修复基线分开提交。
