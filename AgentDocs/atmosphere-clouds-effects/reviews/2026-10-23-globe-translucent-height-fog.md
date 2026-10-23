# 球面透明地表高度雾截断技术自审

- Type: review
- Status: code / automated verification passed；负责人视觉验收待定
- Owner / reviewer: 当前任务 execution / architecture self-review，非独立 Agent review
- Created / Updated: 2026-10-23
- Plan: [透明地表高度雾截断](../plans/2026-10-23-globe-translucent-height-fog.md)
- ADR: ADR-0045（既有地面截断契约）
- Upstream-owned files / SGP: 无

## Finding 与处置

- P1，fixed，负责人 execution：`sceneGISHeightFogGlobeSegment` 仅在地面交点大于
  起雾距离时截断。这使近地向下射线穿过球体内部积分，透明地表后的 clear-depth 或
  深处接收者暴露弧形异常。现所有向前地面交点均裁剪结束距离，空区间直接返回原色。
- 修复不更改真实天空、空气透视、Planar、雾默认值或 Globe translucency API；
  无新增 pass、资源、分配或密度采样。无效射线直接退出，可避免后续 16 次雾密度采样。
- 7 条 GPU 射线使用完整产品高度雾 Shader，恒定密度的有效光程通过独立
  Beer-Lambert 参考值核对。覆盖 clear depth、深处 / 近处接收者、边界相等、
  地表相机、地面前有效段及向天有限段，旧实现可复现 4 条失败。

## 验证证据

以下 focused 命令均使用 `--webglValidation --failTaskOnError --browsers ChromeHeadless`：

- `npm run test -- --includeName "clips Globe height fog at ground"`：开发 1/1；
  追加 `--release`：release 1/1；包含 7 条 GPU 射线。
- `npm run test -- --includeName "renders the full clear-depth Globe fog medium"`：1/1，
  既有完整雾介质 / 方向性太阳回归通过。
- `npm run test -- --includeName "updates all height-fog controls as warm uniforms only"`：1/1。
- 测试执行的开发构建与 `npm run build-release` 均通过。
- `Test/透明地表大气.html`：与 SDK 相同的相机高度约 130.7 米、pitch=-0.55、
  地表正反面 alpha=0.4、起雾距离 250 米；高度雾、物理天空、空气透视均开启。
  等待实际 tilesLoaded / effects.ready 后，弧形亮带消失，地下管廊可见。
- 关闭再开启高度雾、起雾距离 250→64→250 后，9 项环境 GPU 资源保持同一实例，
  shader cache 无增长（18→16，闲置程序回收），WebGL error=0；销毁 Viewer 后
  9 项资源全部释放。预览页已重新加载，SDK 页已恢复原例。
- 图像保存在忽略目录 `Build/Specs/globe-translucent-fog/sdk-before.png` 与 `after.png`。
  前者为 SDK 旧引擎页面，后者为当前引擎本地网格页，影像底色不同，不用作逐像素差分。
- scoped ESLint / Prettier、AgentDocs Markdownlint、`git diff --check` 通过；
  全 AgentDocs Prettier 仍有 563 个历史文件告警（含旧索引），新 plan / review 通过。

## 剩余事项

代码自审无阻塞项。负责人最终视觉判断待定；SDK 仍锁定旧引擎 `b7ab45e`，本次未改其
分发文件或版本锁定，直接刷新 SDK 示例不会取得此修复。当前引擎人工入口可独立验收。
此前环境观感、strict-WebGL fixture、bloom 等未决问题保留，不在本项关闭。
2026-10-23 负责人授权先形成本地提交；不将提交授权视作额外的视觉验收结论。
