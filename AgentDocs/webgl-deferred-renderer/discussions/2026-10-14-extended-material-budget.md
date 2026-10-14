# Discussion: Existing material capacity in P4d

## Metadata

- Type: discussion
- Status: resolved / owner approved budget and overflow submissions
- Author role: architecture
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- Review: [entry audit](../reviews/2026-10-14-p4d-entry-audit.md)
- ADR / SGP: ADR-0161, ADR-0156 / SGP-0045, SGP-0046

## Contract and source facts

负责人要求保留既有 glTF clearcoat、anisotropy、specular，以及 Model 裁剪、轮廓和
点云样式，P4d 完成前不得以拒绝这些能力关闭阶段。现有 API 与专用通道保持。

原生 czm_modelMaterial 在现有字段之外还需要 specularWeight (1)、clearcoatFactor /
clearcoatRoughness / clearcoatNormal (5)、anisotropicT / anisotropicB /
anisotropyStrength (7)，合计 13 个 scalar。anisotropicB 原生使用几何法线构造，不能
简单从可能已 normal-map 的 material.normalEC 与 tangent 重建；CustomShader 也能
改写这些字段。直接保存完整字段可保留当前 half-float 精度，不引入额外方向量化。

当前四个 RGBA16F 主材质目标可按需增加 feature style、Globe ocean、classification
和多视锥 RG32F，组合已达八个 color attachments。屏幕输出另有 clearcoat SSR 7、
AO 1、SSIL 2 的十附件组合；即使材质存储解决，该组合仍需拆分屏幕输出。

## Proposed bounded implementation

默认仍为现有四个材质目标。仅在可见不透明 Model 使用扩展时分配额外 RGBA16F
材质字段，按本帧字段并集紧凑排列；没有扩展时释放。轮廓覆盖率优先使用既有
feature-style alpha，否则并入扩展字段，不能改为对最终颜色直接执行前向 BRDF。

| Visible extension fields | Scalars | Additional RGBA16F | Bytes/pixel | 1280×800 MiB |
| ------------------------ | ------: | -----------------: | ----------: | -----------: |
| specular                 |       1 |                  1 |           8 |       7.8125 |
| clearcoat                |       5 |                  2 |          16 |       15.625 |
| anisotropy               |       7 |                  2 |          16 |       15.625 |
| clearcoat + anisotropy   |      12 |                  3 |          24 |      23.4375 |
| all three                |      13 |                  4 |          32 |        31.25 |

单独的 primitive outline 覆盖率最多需要一个 scalar，已有 style target 时不新增。
与三个扩展合用仍不超过四张额外材质目标。半透明 inverse classification 的独立
材质集须按需拥有同样的扩展字段，最坏额外再增加 32 bytes/pixel；不会按每个
frustum 复制整组材质，已有分段 color/depth 缓存契约保留。

附件容纳时在主几何提交内同时写入。超出当前设备附件数时，扩展字段用一次
明确的 material-only 提交：复用同一原生命令的覆盖率、顶点/CustomShader 与
共享深度，depth EQUAL、depthMask false，仅写扩展字段，不再计算 BRDF，也不
绘制第二份完整不透明颜色。新增提交仅针对需扩展字段的命令，计数独立暴露给
内部诊断。多视锥在当前段深度仍有效时完成附加写入；inverse 材质遵守同一所有权。

clearcoat SSR + AO + SSIL 的屏幕输出按设备附件数拆成两个 screen-lighting 提交，
共用材质和深度，不重放几何，不增加既有效果输出纹理。此组合会增加一次 BRDF
屏幕计算；单一组输出仍一次。设备/API 门槛保持已批准范围，不要求超过八附件。

## Tradeoffs and validation before acceptance

该方案明确增加扩展场景的带宽、显存及容量溢出时的材质提交，不能声称只清理即
普遍提速。它不重建完整不透明前向管线。另一方案是重设计压缩/整数材质协议及
按家族 framebuffer 视图，减少容量溢出的几何提交；代价是更多上游 Renderer 接缝、
格式/混合/清除/diagnostic 迁移与量化验证，当前未选择或实现。

预算获批后，先实现字段采集/恢复与资源所有权，再补原生 BRDF、材质纹理和
CustomShader GPU 比较基准；覆盖组合、MASK、分类、inverse、多视锥、样式与共享
效果。性能以同内容开关扩展/附件合并与拆分的真实 GPU 样本和提交数报告。
压缩布局不是未经授权的静默降质选项。当前已依决定实现按需目标，技术与视觉 gate 另行记录。

## Owner decision

2026-10-14 负责人接受上述按需显存、容量超限时附加材质提交和屏幕输出拆分。
本决定允许实现该方案，不代表实现、技术 review 或负责人视觉验收已经通过。

## Point material coordinates

原生 HDR 对照复现：大点精灵的 positionEC 在整个点内取顶点中心，逐像素反投影会
改变高光。受光 POINTS 按需记录片元到点中心的像素偏移 x/y（两个 scalar），z 仍用共享深度。
偏移有界于点精灵尺寸，避免远距离 eye-space 坐标溢出 RGBA16F；光照按偏移重建中心位置。
没有受光点时不分配这些字段；三个扩展、点坐标和 outline 合计 16 scalar，仍不超过
已批准的四张 RGBA16F。独立受光点使用一张，已有空位时紧凑并入同一附件。
颜色样式的共享效果校正另复用既有 MRT 颜色快照，仅增加相应受光点组的屏幕提交，
不增加纹理。默认色、原生受光对照、AO 顺序、样式/拾取和生命周期有 GPU 证据。
