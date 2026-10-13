# Phase Plan: P3a 256 灯分块调度

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Phase: `P3a`
- Owner role: `architecture / execution`
- Architecture review: confirmed，负责人已选择 A：256 灯与共享接收表
- Created / Updated: `2026-10-13`
- Entry checkpoint: P2 `b1c3a8a494`，技术与负责人视觉 gate 已通过
- Related discussion: [多光源调度](../discussions/2026-10-13-many-light-scheduling.md)
- Related review: [P3a](../reviews/2026-10-13-p3a-tiled-lighting-qualification.md)
- ADR / SGP: ADR-0157 / SGP-0047，修订 ADR-0090；依赖 ADR-0156

## Objective and source facts

负责人要求延迟多光源采用适合多灯的调度，不能把旧前向的逐灯循环当成已完成优化。
保持现有灯光描述、有限距离衰减、PBR 响应及与环境光/自发光的分工，但替换数据存储、
筛选与像素遍历。性能以相同光源、材质、遮挡语义和后处理对照，不能只报告算法名称。

进入本阶段的源码事实（P2）：

- `SceneGISLightCollection.MAXIMUM_LIGHTS`、`add` 和公开文档共同限定 16 个 descriptor，
  包括隐藏灯。原容量不是由延迟管线自动放开的。
- `_SceneGISLocalLights.prepare` 在 JS 双精度转换位置/方向，上传固定 16 个灯的 uniform
  arrays；GLSL PBR / Phong / Lambert 每像素遍历全局灯表，再判断 range / cone。
- P2 在 Model 屏幕光照中复用该 helper，因此只减少材质 overdraw，没有像素级光源剔除。
  已验收街区默认无局部灯；P2 的 16.0 → 15.3 ms 不构成多灯收益证据。
- 普通不透明 Primitive / 地表和透明仍由原材质通道求光照。只扩延迟 Model 容量会让
  同一盏灯在不同接收者上出现不一致；必须同时明确这些配套接收者的数据来源。
- 局部灯不投射阴影；灯表优化不能同时声称新增遮挡、GI 或体积散射。

## Proposed direction and decision boundary

优先评估 CPU 构建保守屏幕 tile 光源列表、GPU 只遍历所属 tile 的候选灯；复用原生相机、
投影和灯描述。无需 GPU 深度读回，也不先引入 GPU compute 等 WebGL 不提供的调度设施。
进入最终实现前确认相交近平面、镜头位于灯范围内、正交与透视的保守投影算法及 API 容量。

灯参数拟迁为集中 GPU 数据表，tile 使用 offset/count + 连续索引。每片元仍保留原 range /
cone 精确判断，允许保守多选，禁止漏灯或静默截断。高重叠应完整计算，不通过淘汰灯制造收益。
基础直接灯与方向阴影/IBL 的能量契约不变；透明与普通接收者拟共享候选表。

负责人已批准 A。保留灯光 API，将容量提升到 256，普通和透明接收者使用同一数据。
本阶段为 P3a；AO/SSR/SSIL 去重归 P3b，待独立 checkpoint 后按事实细化。

## Implementation and ownership

- 一张宽 256 的 RGBA32UI 数据纹理，参数占前四行（16 KiB），按 float bits 保存。
  后续行保存 tile offset/count 和每 texel 四个 uint 索引；继续 JS 双精度坐标变换。
- 约 32 像素 tile。索引保持原灯顺序，
  按实际候选数扩容；无每 tile 截断。包含全部灯的 tile 直接使用等价全局序列，免索引读取。基于视口归一化坐标，也供 SSR 与探针捕获使用。
- 保守投影 range 球的包围盒，先裁到近平面再投影八角点，兼容正交和透视。
  覆盖相机在球内、近平面相交；额外一个实际像素覆盖现有 TAA 小于半像素的抖动。
  GPU 原 range / spot cone 判断不变，不读取深度、不改变能量或遮挡语义。
- 数据纹理由集合拥有，空/隐藏时释放，resize 更新 grid 并按需扩容，销毁随 Scene。
  复用原生 Texture / Sampler / ShaderCache；派生程序只按源 Shader 身份查询一次。
- Scene 显式传递 shadow-cast 调用类型，避免进入局部颜色灯派生，SGP-0047 仅此接点。
- 独立街道页面提供私有逐灯参考开关，使用相同 GPU 数据，用于人工/自动等价与成本对照。
  不形成公开长期算法选择 API，不改原 PBR 页面。

## Impact paths and exit gate

修改 owned LightCollection、LocalLights helper、局部光 GLSL，增加 owned tile helper；
上游仅 Scene.js 的 caster 调度。新增/更新 GPU Specs、独立街道组装与 E2E，
同步 Architecture、ADR、SGP 和本扩展记录。
首轮在当前 WebGL2 管线验证，不承诺 WebGL1 新数据协议兼容。
实现、自动化、资源/成本证据及负责人街道视觉验收通过后，形成 P3a 独立提交。

## Bounded investigation and validation

1. 测量现有算法 0 / 16 灯、局部覆盖 / 大范围重叠的街区屏幕光照与整帧成本，记录限制。
2. 确认参数纹理、索引纹理、生命周期和所有接收者的显式接点，提出容量/预算方案。
3. 负责人确认重大边界后，将本 phase 拆为可独立提交的当前子阶段，形成 ADR，再实现。
4. 多灯实现验证以同一 GPU 参数表的逐灯参考与 tile 路径逐像素对照；检查漏灯、边界、
   世界大坐标、镜头移动、近裁面、透明/OIT、空集合和变更释放。
5. 街区相同 AA/效果下验证 0 / 少量 / 大量分散 / 大量重叠；报告 CPU 筛选、数据上传、
   GPU 光照及整帧时间，保留无收益或退化结果。检查投影后再选 tile 尺寸，不先承诺提速倍数。

## Current handoff

负责人批准 A 后，P3a 实现与 34 项相关 GPU / 1 项街道 E2E 通过。
三纹理方案因真实 sampler 超限改为单表；完全重叠 tile 免冗余索引读取。
性能、边界与修复证据见 P3a review。完整交付检查通过。负责人于 2026-10-13 接受视觉结果，批准形成独立提交并继续；P3b 未激活。
本轮 Markdownlint 全目录通过；Prettier 全目录报告 416 个既有问题（415 个其他扩展文件，
加本扩展未修改的 P0 discussion）。本轮改动文档已格式化；不顺带修改历史文件。
