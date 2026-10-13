# Discussion: GIS 样式覆盖与附件预算

## Metadata

- Status: resolved，负责人选择 A
- Owner role: architecture，当前任务
- Created / Updated: 2026-10-13
- Parent: [总体计划](../plans/2026-10-13-webgl-deferred-renderer-extension.md)
- Proposed phase: [P4a draft](../plans/2026-10-13-p4a-model-and-tile-styling.md)
- Entry checkpoint: P3b `84aafea838`

## Source and reproduced evidence

P3b 已获负责人验收并形成独立本地提交，正常提交钩子通过。
本轮重新索引源码，审计 GBuffer.validate、Deferred 的材质/光照 Shader、
ModelFS、MaterialStageFS、CPUStylingStageFS、ModelColorStageFS、原生 Model3DTileContent。

- 当前 GBuffer 显式拒绝 HAS_MODEL_COLOR / HAS_SELECTED_FEATURE_ID。因此并非只缺少复杂效果，
  普通模型颜色 API 和带要素元数据的 Tiles 也不能通过实验入口。
- Edge 155 / ANGLE D3D11 / RTX 3060 Ti 实测：原生
  Specs/Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json 有 10 个要素，
  无自定义 style、单视锥，普通路径加载成功；开启实验时报
  “G-buffer prototype does not encode HAS_SELECTED_FEATURE_ID.”。
- 单独加载原生 Box 并设置 Model.color=RED，普通路径可渲染；实验入口报
  “G-buffer prototype does not encode HAS_MODEL_COLOR.”。
- 本机 MAX_DRAW_BUFFERS / MAX_COLOR_ATTACHMENTS 均为 8；当前实验基础门槛为 4。
- Model3DTileContent 转发原生 style / colorBlend / feature label / matrix 等到 Model，
  无需重新实现 b3dm/i3dm loader、FeatureTable 或同步拾取。
- MaterialStageFS 先在 baseColor 应用 feature blend，再求值材质；CPUStylingStageFS
  在 lighting 后应用 feature multiplier、透明 pass 过滤和 alpha；ModelColorStageFS
  再执行模型级颜色混合。因此不能只把最终颜色视为 albedo 或只取消校验。
- 四张 RGBA16F 的 16 个分量已有 diffuse/occlusion、normal/roughness、F0/group、
  emission/shadow 含义。逐像素 feature multiplier 没有独立的存储位置。

其他缺口仍保留：clearcoat/anisotropy/specular 扩展、outline/clipping edge/silhouette、
点云样式、分类、多视锥及地表特殊分支。本阶段不把所有缺口混成一次原生管线重写。

## Concrete alternatives

A（建议）：首先补齐 Model 与原生网格 Tiles 的颜色/show/透明分工，复用原生 stages、
style evaluator、FeatureTable 和拾取。普通 Model.color 使用已有模型分组 uniforms；
带 selected feature ID 的不透明内容按需增加一张 RGBA16F，记录光照后的 feature multiplier。
当前普通材质四附件布局和精度不变。此类内容需要至少 5 个可渲染附件；不足明确报错。
1280×800 时新增 7.8125 MiB，1920×1080 时 15.8203125 MiB，另有对应带宽与 sampler 成本。
这是材质 pass 的附件，不与后续响应 MRT 的附件数相加；SSR+AO+SSIL 的既有上限仍有效。
实际 GPU 成本须实现后同条件测量，不能按存储量推断帧率。

B：先重新设计四附件编码，为 feature multiplier 腾出空间。需要压缩/重新分配法线、
阴影或其他通道，重新资格验证精度与解码成本。保持四 MRT 门槛，但会改动已有普通材质
布局，扩大已验收街道的回归面；不能承诺仍逐像素等价。

不建议把 styled Model 静默作为普通 passthrough：现有 passthrough 只有颜色与 AO 响应，
不能完整保留 Model 的 SSR/SSIL 响应。完整混合路由也需要新的深度和合成顺序。

## Decision boundary

这是附件数量、设备兼容面和显存预算的长期选择。根据负责人“重大选择先询问”的要求，
在获得选择前只记录源码事实、实测错误与 draft，不实施新增附件或压缩编码。
选定后形成 ADR / 必要 SGP，再激活 P4a。不会改变现有业务 API 或自动关闭效果。

## Resolution

负责人选择 A，并在确认原生 HIGHLIGHT 位于光照后、REPLACE/MIX 位于材质阶段后，
重申保留原方案。Model.color 复用原生光照后混合；第五附件仅传递要素颜色乘数，
不存 feature ID，不接管 pick，不新增全屏 pass。采用独立 manager 保留四张基础纹理；
实际 GPU 成本以实现后的同条件测量为准，不能预先断言很小。
决定提升为 [ADR-0159](../../../Documentation/SceneGIS/Decisions/ADR-0159-deferred-feature-styling.md) / SGP-0048。
