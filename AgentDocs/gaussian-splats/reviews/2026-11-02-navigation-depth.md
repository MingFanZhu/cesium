# Review：分段高斯的导航深度

## Metadata

- Type: architecture / code review
- Status: completed
- Owner / reviewer: 本任务（未启用独立 Agent）
- Date: 2026-11-02
- Target: [standalone plan](../plans/2026-11-02-navigation-depth.md)
- ADR: ADR-0188、ADR-0208；不改变既有决策
- SGP / upstream-owned files: 无

## Findings and disposition

- G16 / medium / fixed：迁移示例及 SDK 接入说明遗漏 Scene 级透明深度拾取配置。
  旧 1.141 `Test/SegmentedGSP.html:81` 显式设置 `pickTranslucentDepth=true`。
  当前 loader/controller 仍保留 pick-only 命令重放，原生 DerivedCommand 会临时写深度，
  因此没有缺失需要重新移植的 GPU 深度实现。默认 false 的纯高斯像素返回 undefined，
  true 时双世界均取得有限三维位置，已实际复现。
- 修复只在两个 owned 示例显式启用配置，并补充 GaussianSplats / VideoProjection 指南。
  不将视频 observer 深度当成主相机深度，不自动改写 Scene 默认，不修改透明混合或 SDK。

## Verification

- `SceneGISGaussianSegmentedRendering`：3 项严格 ChromeHeadless / WebGL Specs 通过。
  双世界覆盖默认 false / 显式 true、位置误差小于 2 米、两种公开拾取入口、前景实体深度、
  隐藏失效、useDepthPicking=false、正常颜色与 depthMask 不变；保留真实 Worker 与销毁用例。
  拾取期间 loader.update / 选级零调用，排序 dispatch 不增加，当前 command 与 atlas 容量不变。
- `scenegis-gaussian-video-projection` 的两个双世界实际浏览器用例通过：示例默认已开启，
  投射开启和关闭返回相同位置，合成墙面位置误差小于 0.5 米；真实鼠标滚轮触发普通相机
  的位置拾取并移动相机，现有投影、遮挡、暂停及销毁断言仍通过。
- 无运行时或 Shader 改动，因此不重复全量发行与类型生成；测试入口按正常流程重建了 dev bundle。
  变更 JavaScript 的 ESLint、Markdown lint、显式 Prettier 与 diff whitespace 检查通过。

## Limits and handoff

SDK 在初始化 Scene 时显式启用 `pickTranslucentDepth`，若自行关闭 `useDepthPicking` 须同时恢复。
这是 Scene 级透明拾取策略，也影响其他透明对象；有按需 depth-only 重放与同步像素读回成本。
位置代表当前 LOD billboard / alpha discard 的导航近似，不是实体碰撞或视频的最大密度遮挡点。
不提高高斯点 ID 拾取、全局碰撞或工程几何查询的承诺。无未解决实现 finding。
