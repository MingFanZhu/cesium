# 分段高斯的相机导航深度接入核对

## Metadata

- Type: standalone plan
- Status: completed
- Owner: 本任务（architecture / execution / review，无独立 Agent）
- Date: 2026-11-02
- Architecture review: confirmed
- ADR: ADR-0188、ADR-0208；不改变既有渲染或公开 API
- SGP: 无；只修改 SceneGIS-owned 示例、测试与文档
- Review: [导航深度 review](../reviews/2026-11-02-navigation-depth.md)

## Source facts

旧 1.141 的 `Test/SegmentedGSP.html` 显式开启 `scene.pickTranslucentDepth`，
运行时 `_publish` 重放最近显示命令，原生 depth-only 派生临时开启深度写入。
迁移后的 renderer/controller 保留此路径；遗漏的是两个当前示例及接入说明中的配置。
双世界实测默认 false 时高斯独占像素没有位置，true 时返回位于高斯附近的位置，
无渲染异常。视频 observer 深度独立，不会自动成为显示相机的导航深度。

## Implementation and verification

1. 在分段高斯、高斯视频两个示例中显式启用原生透明深度拾取。
2. 补充 SDK 所需配置、原生相机消费路径、精度与成本说明，不自动改写 Scene 开关。
3. Jasmine 回归双世界的开关行为、高斯深度、前景实体遮挡、隐藏与资源销毁；
   检查深度重放不推进加载/排序或分配第二份 atlas，颜色命令仍不写深度。
4. 现有视频 E2E 补充默认示例配置、视频启停均可拾取、真实鼠标导航与清理验证。
5. 运行定向严格 WebGL Specs、双世界视频 E2E 及变更路径 lint/format，回写结果后提交。

## Boundaries

深度来自当前选级的高斯 billboard 与既有 alpha discard，不是网格重建或实体碰撞。
原生 `pickTranslucentDepth` 为 Scene 级开关，也影响其他透明对象；按需深度重放和
同步单像素读回有成本，不用于逐帧全场回读。默认 false 的原生行为保持。

## Result

两个示例、两份指南和回归已补齐。3 项严格 GPU Specs 及双世界真实相机 / 视频浏览器
用例通过；无 runtime、Shader、SDK 或 upstream-owned 文件改动。证据及限制见 review。
