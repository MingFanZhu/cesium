# V5E review：图标适配文字与四项交付

- Type: review
- Status: approved（技术自审；负责人最终视觉 gate pending）
- Date: 2026-09-17
- Target: V5E 工作树，相对 V5D checkpoint `1bf28c4b1f`
- Author / owner: 当前 Agent，architecture/execution 自审，非独立评审
- Plan: [V5E](../plans/2026-09-17-v5e-icon-text-fit.md)、[四项计划](../plans/2026-09-17-style-enhancements-extension.md)
- ADR: [0078](../../../Documentation/SceneGIS/Decisions/ADR-0078-icon-text-fit.md)
- Upstream-owned files / SGP: 无

## Findings

| ID      | 等级 | 结论与证据                                                                                                                    | 状态     |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| V5E-R01 | P1   | 以逻辑排版框而非 SDF ink box 适配；四模式、padding、offset、pixelRatio、独立 size 与最小尺寸 Specs 通过。                     | fixed    |
| V5E-R02 | P1   | variable anchor 必须同时选择匹配牌面，试放不修改发布形状。双世界 Worker/WebGL/pick 和三 POI 不同宽度 E2E 通过。               | fixed    |
| V5E-R03 | P1   | content/stretch 元数据在 Worker 验证并切片，主线程只解析缓存系数；缩放不增加 Worker tasks/字库请求，不替换 GPU buffers。      | fixed    |
| V5E-R04 | P2   | 全图边框纳入保守碰撞，透明圆角仍不拾取。真实像素与 pick 测试、资源销毁检查通过。                                              | fixed    |
| V5E-R05 | P2   | 多段 stretch 增加 quad 数；示例每块 9 quads，核心覆盖 15 quads，沿用 bounded shape cache 和预算布局，不承诺所有设备固定 FPS。 | accepted |
| V5E-R06 | P2   | SDF icon、sprite textFitWidth/Height、rich text、复杂 shaping 不在授权四项范围；运行时不静默忽略显式比例规则。                | accepted |

## 验证

- 完整 227 项 vector Specs 通过；本阶段新增 5 项，另扩展既有 Globe 锚点测试覆盖 fit。
- 两个中文样式增强页 E2E 通过：纹理、状态交互、三个可变 anchor、不同宽度九分片牌面与 atlas 复用。
- engine/root/release build 通过。installed engine、release ESM、release IIFE 均真实执行 Worker：
  fitted icon 9 quads、候选配对、像素 `[252,249,237,255]`、pick styleLayer=fit、资源释放全部通过。
- 双世界截图已自查；这不是负责人视觉验收。ESLint 已通过，提交 hook 检查结果由本提交记录。
- 修改路径与官方基线交集为空；未修改 upstream-owned files，无 SGP。

## 四项最终状态与剩余边界

V3D2 `81340f7bef`、V3D3 `d3a89475f3`、V5D `1bf28c4b1f`、V5E 本次提交分别形成独立 checkpoint。
前两阶段的 pattern 跨 zoom 渐变/道路相位、状态几何批次重建成本继续保留，不以本阶段通过关闭这些限制。
四项兼容矩阵见 [VectorTiles](../../../Documentation/SceneGIS/VectorTiles.md)；
完整文字/图标语义见 [VectorTileSymbols](../../../Documentation/SceneGIS/VectorTileSymbols.md)。

负责人下一步在 [平面](../../../Test/vector-tiles/平面样式增强.html) 和
[球面](../../../Test/vector-tiles/球面样式增强.html) 检查纹理、点击选中、相机运动、POI 避让与牌面。
两页保持默认 lil-gui，无高级环境。确认后只需回填本轮人工 gate；不自动合并、推送或开启其他样式阶段。
