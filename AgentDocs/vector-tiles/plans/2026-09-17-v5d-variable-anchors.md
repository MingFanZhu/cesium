# V5D：标注自动换位置

- Type: phase plan
- Status: completed（技术资格；四项最终人工视觉 gate pending）
- Updated: 2026-09-17
- Owner / architecture review: 当前 Agent，自审方案 approved
- Parent: [四类样式增强](2026-09-17-style-enhancements-extension.md)
- Predecessor: V3D3 `d3a89475f3`
- ADR: [0077](../../../Documentation/SceneGIS/Decisions/ADR-0077-variable-symbol-anchors.md)
- SGP: None planned

## 源码事实与设计

现有 Worker shapes 使用 24 px 字号缓存 normalized 排版，主线程按 CSS size 缩放；
placement 使用 collision proxies 后才投影字形，并按软预算发布整批结果。扩展这些边界：

1. 接入 point symbol 的 text-variable-anchor 与 text-radial-offset。保持 Style 原生验证及已支持表达式边界。
2. Worker 一次准备去重后的至多九个 anchor 排版，保留 auto justification；主线程只缩放和试放。
3. 优先尝试上次成功 anchor，再依照声明顺序。候选碰撞检查不写入网格，仅最终选中的结果提交。
   优先无碰撞位置，再执行显式 allow-overlap；text-optional 的 icon-only 作为最后选择。
4. 文字 radial/variable offset 参照 MapLibre anchor 方向和 baseline correction；普通非 fit icon 保持自身 anchor。
5. 候选独立保存选择，避免 pending placement 修改当前已发布的 shape；复用现有地形、Globe 投影和 pick。

## 影响路径与验证

Style 属性白名单；SymbolLayout、WorkerTasks、SymbolShaping、Symbols；不修改 Shader 或上游文件。
Specs 验证 offset/justify、真实 Worker 候选、双世界 collision/pick、相机运动的稳定位置与 warm resources。
两个中文样式增强页补充重叠 POI，本地 E2E 验证自动避让。
engine/root build、相关 Specs/E2E、release/实际包 Worker 验证；更新文档、自审及独立 checkpoint 后进入 V5E。

## 边界

不加入 text-variable-anchor-offset、沿线自动换位、垂直文字或多语言复杂 shaping。
候选数增加会增加首次 Worker 排版量和碰撞试放；沿用缓存上限与 placement 软预算，不承诺固定 FPS。

## 结果

222 项 vector Specs、2 项双世界增强页 E2E、engine/root/release 构建和 installed engine/ESM/IIFE
真实 Worker 候选验证全部通过。截图已自查，非负责人视觉验收。无上游改动；见
[技术自审](../reviews/2026-09-17-v5d-variable-anchor-review.md)。独立提交后进入 V5E。
