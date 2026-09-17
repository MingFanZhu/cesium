# V5E：图标适配文字

- Type: phase plan
- Status: completed（技术资格；四项最终人工视觉 gate pending）
- Updated: 2026-09-17
- Owner / architecture review: 当前 Agent，自审方案 approved
- Parent: [四类样式增强](2026-09-17-style-enhancements-extension.md)
- Predecessor: V5D `1bf28c4b1f`
- ADR: [0078](../../../Documentation/SceneGIS/Decisions/ADR-0078-icon-text-fit.md)
- SGP: None planned

## 源码事实与设计

现有 SymbolLayout 只有 SDF ink box；图文共用 collision 与 projection，sprite 使用一个 quad。
normalized shaping 在 Worker，主线程按字号缩放。参考 MapLibre shaping.ts / quads.ts 后实施：

1. 接入 icon-text-fit none/width/height/both 和四边 padding，添加独立于 SDF border 的文字逻辑边界。
2. Worker 验证普通 sprite 的 content/stretchX/stretchY，生成分片 UV 与伸缩系数；支持多个 stretch 区间。
   主线程按当前 text-size/icon-size 解析少量系数，复用既有缩放缓存；不逐帧重新切片或排字。
3. 内容区包住文字逻辑边界及 padding，固定区域按 sprite pixelRatio 保留；过小目标保留固定内容的最小尺寸。
   无 content/stretch 退化为整图拉伸。fit 忽略 icon-anchor，保留 icon-offset。
4. 每个 variable anchor 有匹配的 fitted icon，选择、碰撞、terrain、绘制和 pick 使用同一组合。
   普通 icon/fit none 保持原行为。沿线文字仍按现有算法弯曲，图标自身为刚性牌面。
5. 双世界示例显示三块可伸缩 POI 标签，既有四种 pattern 与状态交互继续有效；样式说明保留简洁。

## 验证与退出条件

Specs 覆盖四模式、padding、offset、pixelRatio、多个伸缩区间、无效 metadata、最小尺寸；
实际 Worker + 双世界 WebGL/pick、变量 anchor 配对、warm 缩放/运动和资源销毁。
engine/root/release build、全部 vector Specs、双世界 E2E、实际 package 消费。
更新兼容矩阵、四项汇总和技术自审，独立提交后交付最终人工视觉入口。

## 边界

普通 RGBA sprites；不支持 SDF icon、sprite textFitWidth/textFitHeight 比例约束、rich text 或复杂 shaping。
保留既有整数 layout/fractional size 和曲面 quad 的质量边界，不宣称与 MapLibre 全部像素一致。

## 结果

四种 fit、四边 padding、content/多段 stretch、与 variable anchor 配对已实现。
227 项 vector Specs、2 项双世界 E2E、engine/root/release 与实际三种包入口验证通过。
无上游修改；[技术自审](../reviews/2026-09-17-v5e-icon-fit-review.md) approved，独立提交交付四项人工入口。
