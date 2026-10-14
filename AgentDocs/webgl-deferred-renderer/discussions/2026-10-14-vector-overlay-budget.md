# 矢量地图有序覆盖的材质预算

- Type: discussion；Status: resolved；Date: 2026-10-14。
- Author: Architecture / execution 当前任务。
- Parent: [P4e](../plans/2026-10-14-p4e-vector-tiles.md)。
- Review: WDR-P4E-02；相关 ADR-0071 / 0072 / 0161。

## Facts and required behavior

现有 classification RGBA16F 保存最终预乘颜色；fill / line / background 与 unlit circle / symbol 按层序直接混合。若把已混合的颜色再统一受光，文字和圆点也会被照明；若只修改主 G-buffer albedo，半透明地图下的 Globe 海洋 / Planar Material 会丢失自己的受光响应。这两种都不符合已有契约。

同一 World 当前像素上的地图 fill / line 共享地表位置、几何法线与光源，Lambert / physical direct + sky 对 albedo 线性。可以分别累计 lit albedo 和 unlit color，同时保留统一覆盖率，延后一次计算地图的光照。不增加地图几何重放，也不改变 source、瓦片、feature 或地图颜色图集。

## Proposed encoding and schedule

- 既有 classification 目标累计 unlit RGB 和所有覆盖 alpha；新增一张 RGBA16F 累计 lit albedo RGB。两者在同一 classification 提交中使用相同预乘 alpha 混合。
- lit 地图片段向两个目标分别写 `(0, alpha)` 与 `(albedo * alpha, alpha)`；unlit 片段分别写 `(color * alpha, alpha)` 与 `(0, alpha)`。因此后来的任意图层都会正确衰减较早的 lit / unlit 贡献。
- 原表面光照按总覆盖率衰减并加入 unlit 颜色；随后一个全屏地图光照提交从真实地表 G-buffer / 线性深度恢复位置与几何法线，将 lit albedo 的受光贡献相加。间接光权重也按此分离；制图标记不产生 PBR 响应。
- 新可见表面必须清除旧地图材质。MRT 有容量时随原几何提交清零新增目标；容量满时，在下一段 classification 前用现有 classification 清零标记执行一次全屏清理，避免增加普通几何提交。末尾新遮挡表面由同一清零标记排除旧材质。
- 不提高既有设备门槛。扩展材质附件分配纳入实际占用；容量满走上述显式屏幕清理，不能静默保留前向不透明光照。

## Cost ceiling to approve

| Item              | Increment                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Material texture  | 仅可见受光地图需要一张 RGBA16F：8 bytes / pixel，1280 × 800 为 **7.8125 MiB**；多视锥复用同一张。没有此类地图时释放。 |
| Map geometry      | **0** 次额外提交；一次地图提交同时更新两个颜色累积。                                                                  |
| Opaque geometry   | **0** 次额外提交。                                                                                                    |
| Screen lighting   | 每帧 **1** 次；已启用共享效果且布局需要拆分时最多 **2** 次。                                                          |
| Capacity fallback | 仅 MRT 容量满时，每个可见分类连续段最多 **1** 次屏幕清理；当前 Scene 两类分类阶段，每视锥最多 **2** 次。              |

这是一张全屏延迟材质附件，不是逐瓦片地图颜色 RTT；源几何与采样仍直接提交。虽然成本小于 P4d 扩展材质预算，它不属于此前获批的 glTF 附件用途，必须单独确认。

## Separate transparent-surface work

透明 Globe 已有 native first-surface depth peel，继续专用透明受光合成，不需要上述不透明材质附件来承载它。

透明 Planar 的实际 Specs 已复现 opacity 0.5 / 0 时地图颜色和拾取消失。其表面不再写 opaque depth；恢复独立地图语义需要另行明确深度取得、透明合成和标记顺序。**本讨论不授权任何透明 Planar 深度纹理或地形重放预算**；先按实际调用链形成单独方案，不能将此问题掩盖为透明度绑定或功能删除。

## Decision

2026-10-14 负责人选择“接受该按需预算”，批准上述不透明地图附件、屏幕光照及容量清理成本。透明 Planar 的独立深度预算仍未批准，需要继续依据实际调用链单独提出。
