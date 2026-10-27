# B2：共享材质资源与 PBR 渲染

- Type: phase plan
- Status: completed
- Date: 2026-10-27
- Owner: 当前 Agent，architecture / implementation / self-review
- Architecture review: confirmed
- Parent: [extension](2026-10-27-building-materials-extension.md)
- Entry: B1 `43a656d184`；9 项专项与提交 hook（eslint、tsc、Markdown、format）通过
- ADR: ADR-0192；upstream-owned / SGP：预期无

## 源码事实与设计

Layer 现有资源只拥有 sprite/glyph；新增材质 owner 沿用 Resource/Request 和同一 WorkerPool，
URL 去重、有界并发，normal update 上传四张 atlas 与参数表。图片和 Worker 完成仅保存 CPU 候选；
销毁取消请求、忽略迟到结果并释放自有纹理。显式 `maximumMaterialTextureBytes` 默认 64 MiB，
失败通过 errorEvent，不静默回退材质。不存在材质选择器时不创建这些资源。

BatchResources 自动合并 attribute，追加 materialCoordinate varying 和 material sampler。
GPU 手动三线性 mip、周期寻址，颜色准确 sRGB 解码；通过 UV/eye 导数建立 TBN，保留法线 mip 长度
用于增加远景粗糙度。现有纯色/pattern 分支保持，选择为空的面仍使用旧分支。

Deferred 的 vector group 仍为 -6；style tag 原样保留。仅当命令集合包含 PBR 时添加 PBR 光照源，
避免普通 vector 引入 sampler 和 BRDF LUT。PBR 命令作为该 group 的 uniform 提供者，混合 legacy/PBR
按 normal alpha 区分。基础层不新增 framebuffer、draw group 或调度器。

BRDF 调用 `czm_pbrLighting`；通过现有 ModelEnvironmentLighting 获取太阳/天空/云影，
借用环境 skyReflections 与 Scene brdfLutGenerator，接入现有 SSR 和 AO/SSIL response。
阴影复用原生 caster/receiver 派生命令，只在直接光衰减；不让天空或自发光变黑。
保持透明建筑走已有透明/OIT、拾取走原 token；透明 SSR 不扩大现有资格。

## 实施与验证

1. 资源 owner、GPU owner、Layer readiness/销毁/诊断。
2. Extrusion 与 deferred shader，环境借用与阴影开关；保留地图排序。
3. 双世界实际 GPU Specs：材质参数/纹理/法线、光向变化、排序/拾取、透明、warm frame、失败/迟到销毁。
4. Scoped lint、相关 vector 回归、shader 编译，自审和独立 checkpoint 后进入 B3。

本阶段以确定性合成瓦片和纹理验证产品，不依赖公网；B3 示例按负责人要求直接使用公网。
局部 Model probe 捕获、玻璃透射、纹理库热替换不属于本轮公共承诺。

## 退出记录

新增 18 项 GPU 全部通过；扩展回归 203 通过 / 10 失败，B1 对照复现相同 10 项。
自审 [B2 review](../reviews/2026-10-27-b2-material-rendering.md) 完成，architecture gate passed；独立 checkpoint 后激活 B3。
