# 样式增强页选取范围修正

- Type: phase plan
- Status: completed（技术修复与 2026-09-18 负责人验收均通过）
- Updated: 2026-09-17
- Owner / architecture review: 当前 Agent，自审方案 approved
- Parent: [四类样式增强](2026-09-17-style-enhancements-extension.md)
- Predecessor: V5E `e19c707543`
- ADR: [0070](../../../Documentation/SceneGIS/Decisions/ADR-0070-globe-vector-ground-rendering.md)
- SGP: None

## 已复现事实与修正

球面增强页在 1061×852 视口初始倾斜视角报 minimumLevel cover 超过 maximumVisibleTiles，
Viewer 停止渲染。默认 EllipsoidTerrainProvider 的原生 mesh 裙边使选取高度变成 [-1001, 1]，
而矢量在该 provider 下已有明确的零高程契约。示例又把合成 fixture 固定在第 15 级，无法降级。

1. 对已知零高程 provider 返回既有一米余量 [-1, 1]，不扫描原生 mesh 裙边；真实地形保持原有范围计算。
2. 合成 fixture 声明支持 0–15 级，让双世界示例在拉远时按现有预算选层；不增大 tile budget 或限制相机。
3. 增加默认 provider 裙边回归；双世界 E2E 覆盖实际窄视口、原生地形就绪、拉远与渲染循环存活。

## 验证与退出条件

先确认新增产品回归失败，再运行 Globe Specs、root build、双世界增强页 E2E。
刷新负责人当前页面确认错误消失、画面与交互恢复；记录自审和独立修复提交，四项人工视觉 gate 继续保留。
只改 SceneGIS-owned helper、Specs、Test 和文档，无公共 API、Shader、Worker 或构建协议变更。

## 结果

新增回归在原实现稳定失败，修复后全部 20 项 Globe Specs 通过；root build 和两项双世界 E2E 通过。
当前浏览器同一 1061×852 初始视角已恢复：地形/矢量均就绪，8 块可见、8 块已绘制、0 块失败，
选择高度 [-1, 1]，原生渲染循环继续运行。自查画面包含纹理、楼栋与三种可伸缩 POI 牌面。
见[修复评审](../reviews/2026-09-17-enhancement-cover-fix-review.md)，无实现偏差及上游修改。
