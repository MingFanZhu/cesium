# 固定太阳白点显示校正

- Type: standalone plan
- Status: implementation verified；负责人视觉验收待定
- Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-19
- Architecture review: confirmed；负责人已授权参照 Bruneton 加入白平衡
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- ADR: [ADR-0169](../../../Documentation/SceneGIS/Decisions/ADR-0169-solar-white-balance.md)
- Review: [技术评审](../reviews/2026-10-19-solar-white-balance.md)
- Upstream: `Scene/PostProcessStageCollection.js`；复用 SGP-0044 / SGP-0046

## 事实与方案

当前南京白屋顶、太阳高度约 32.5°，关闭高度雾和空气透视仍偏粉。
实际光照白材质线性 RGB 为 `(0.709136, 0.579212, 0.529172)`，经 LDR gamma
显示约 `(218, 199, 191)`。现有 `SceneGISColorGrading` 仅支持显式 HDR 调色；
LDR 的 `_SceneGISDeferredOutput` 覆盖该 stage，仅执行 clamp/gamma。

按 Bruneton demo 的固定太阳光谱白点处理最终线性颜色。新增环境 `whiteBalance`
boolean，默认 true，可 warm 关闭；环境停用 / 释放后 display 恢复 identity。
从两世界既有 active lighting record 发布该状态，通过 collection 的现有显示槽位
统一校正 HDR/LDR。HDR 复用已有 grading hook，LDR 在同一自有 shader 加 hook，
不增加 pass / FBO / sampler。显式 HDR 色温 / 色偏在固定太阳校正之后继续作用。

白点由冻结太阳光谱积分到 linear sRGB，按 RGB 算术平均归一化；利用已有太阳
三波长转换系数重建相同积分值。它不采样当前屋顶、时刻、相机或当前天空，因此
保留日落色温变化，不承诺任何白材质在任意照明下都是等 RGB。
整幅场景统一显示校正，包括 unlit / emissive / 注记；不修改影像反照率策略。

## 实施与验证

1. 补充 ADR 与既有 SGP；增加公开开关、warm record 与共享显示校正，更新综合示例。
2. GPU 验证太阳白点归一、HDR 全 tone curves、LDR、alpha、黑色、一次校正及手动调色顺序。
3. 验证公开 defaults / type、双世界发布、开关资源复用、disable / detach 恢复。
4. dev / types / tsc、scoped lint / format 与补丁审计；仅运行相关 Specs。
5. 当前白屋顶保留相机 / 时刻 / 图层，对比关闭与开启；检查正午 / 低太阳及 Planar。
6. 测量现有 display pass 成本与资源 identity；恢复用户页面状态，记录技术评审。

## 边界

高度雾修复与本项分别形成独立本地提交，保留各自验证证据；2026-10-19 负责人明确授权提交，不发布。
不增加自动白平衡、自动曝光或当前像素颜色归一化；不改密度、光谱、LUT 和光照倍率。
负责人最终视觉验收独立记录，不由数值测试替代。
