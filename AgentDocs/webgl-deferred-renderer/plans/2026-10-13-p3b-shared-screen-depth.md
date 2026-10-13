# Phase Plan: P3b 共享屏幕深度

## Metadata

- Plan type: phase
- Status: completed
- Parent: [总体计划](2026-10-13-webgl-deferred-renderer-extension.md)
- Owner role: architecture / execution，当前任务
- Architecture review: confirmed，同语义内部资源复用，无新增公共选项
- Created / Updated: 2026-10-13
- Entry checkpoint: P3a `085f47e8f7`，负责人视觉验收与正常提交钩子通过
- ADR: ADR-0158，实施前记录；不新增 upstream 接点

## Source facts and scope

P3a 后重新检查原生 Scene 调度、DeferredLighting、LightingMrt、AO、SSR、SSIL 和水面。
Deferred.begin 先于三个效果的 MRT 建立；主几何之后 Deferred.light 先于效果 resolve。
AO/SSR/SSIL 已通过 LightingMrt 共享材质响应，没有三套街区重放可以删除。
但 Deferred 与当前 MRT owner 各拥有一个 R32F 线性深度，分别从同一主深度转换。
后者另有原始 depth snapshot blit，因此存在可直接消除的重复工作。
AO 使用深度的几何法线；SSR 使用已求值反射方向；SSIL 使用其自身的漫反射响应。
直接改读材质法线会改变画质语义，本阶段不混入。

## Implementation

复用当前 MRT owner（SSR、AO 或 standalone SSIL）的既有线性深度目标。
Deferred.light 在屏幕光照前从 native opaque depth 写入这个目标，各效果 resolve 直接消费它。
没有效果时 Deferred 才分配自己的线性深度；启用共享 owner 后释放原来的自有目标。
借用只发布 Texture 引用，不把 borrowed FramebufferManager 存进 owning 字段；每帧重新选择。
LightingMrt 将 color resolve 与必要的线性深度转换集中调度；共享时省略重复 depth blit/转换。
原始效果 depth snapshot 暂保留分配以复用已有多采样/重放布局，不声称该附件显存已消除。
每帧线性目标先清零，background/discard 不能遗留上一帧表面。

仅改 SceneGIS-owned renderer/helper、Specs 与独立街道诊断统计；原生 Scene 顺序不变。
不更改公共 API、MSAA 门槛、SSR历史、效果采样预算、灯光/材质/阴影和色调映射。
shader 生成、测试、release/type 链沿用既有入口，不手改生成物。

## Validation and exit

1. 用原版街道固定相机、时钟、分辨率保存 HDR 与计时基准；记录实际 pass 和资源。
2. GPU Specs 对照独立与共享深度：MASK、正交/日志透视、背景空洞、owner 切换、resize、
   disable/destroy，以及水面复用。检验当前帧值和 owned/borrowed 生命周期。
3. AO/SSR/SSIL 既有回归；街道图像等价、TAA 移动、GPU 分项/整帧和存储变化。
   不通过降低效果预算换取结果，不承诺整帧显著提速。
4. 完整 build/release/types、定向静态检查、AgentDocs 检查、自审和视觉 gate 后独立提交。

## Current handoff

P3a checkpoint 已形成。本阶段实现与 70 项 GPU Specs / 1 项 Bistro E2E 通过，HDR 与 P3a 固定基准逐像素一致。
已修复可复现的背景旧深度残留，释放重复 R32F；整帧未证明普遍提速。
详见 [P3b review](../reviews/2026-10-13-p3b-shared-depth-qualification.md)，负责人于 2026-10-13 接受视觉结果，批准形成 P3b 独立提交并继续。
