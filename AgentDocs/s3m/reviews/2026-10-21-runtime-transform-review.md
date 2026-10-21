# Runtime transform review

## Metadata

- Type: review
- Status: completed；自动验证与源码自检完成，负责人已确认提交
- Author / owner role: architecture and execution self-review；非独立 Agent review
- Date: 2026-10-21
- Target: [Runtime transform](../plans/2026-10-21-runtime-transform.md)
- ADR: [0174 amendment](../../../Documentation/SceneGIS/Decisions/ADR-0174-s3m-model-loading.md)
- Upstream-owned files / SGP: None

## Findings and disposition

| ID  | Severity | Finding                                                     | Disposition / evidence                                                                                                  |
| --- | -------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| T-1 | high     | 只改 Model 矩阵会使 root/page culling、LOD range 留在旧位置 | fixed；保留 local sphere / range，正常帧选取前统一更新；三个 range 模式、主视角与 observer Specs 通过                   |
| T-2 | high     | 原生异步 Model 完成时可能带回旧矩阵                         | fixed；发布 pending 时重新放置；跨两次变换的迟到 Model Spec 通过                                                        |
| T-3 | medium   | 叶页占位 bounds 不能作为精确内容位置                        | fixed；ready leaf 使用新矩阵下的原生 Model bounds；实例化双世界变换与拾取通过                                           |
| T-4 | medium   | 球面用户可能把属性当作 SCP ENU 之外的附加矩阵               | documented；完整 local-to-World 语义、保留初始矩阵组合的示例与 SDK 指引已补齐                                           |
| T-5 | low      | 每次编辑需要遍历驻留内容                                    | accepted；变更成本为缓存 tiles/pages 的线性遍历，未变帧仅矩阵比较；没有解码、GPU 重建或缓存清空，未测整城市持续动画吞吐 |

## Validation

- `npm run test -- --includeName SceneGISS3MLayer --browsers ChromeHeadless --webglValidation`：13/13。
  覆盖赋值 clone、live getter、立即定位 bounds、隐藏状态、非法矩阵、三种 range、
  迟到 Model、恢复矩阵、observer 选取以及 pick-only 沿用上一正常帧。
- `npx playwright test -c Test/S3M/playwright.config.mjs`：4/4。
  本地 CBD 和 comModel × globe/planar；组合平移、绕 Z 旋转、1.2 倍缩放，
  同步相机保持同一观测区域，真实像素命中原对象 ID，所有缓存 Model 身份保留、
  请求/缓存/GPU 字节数不变；原位修改恢复成功。继续验证环境热帧、回粗和销毁。
  运行截图位于 `Build/Specs/e2e/s3m/`，已人工检查代表性画面；不提交生成产物。
- `npm run build`、`npm run build-ts`、`npm run tsc`：通过。
  公开声明包含可写 `modelMatrix: Matrix4`，保留项目既有 JSDoc 警告。
- Scoped ESLint、变更文件 Prettier、AgentDocs markdownlint：通过。
  全目录 AgentDocs Prettier 仍有 522 个既有文件告警，本次变更文件无告警。

## Remaining scope and handoff

本次没有修改 Shader、Worker、格式解析、World 绑定或实例内部矩阵。
既有 S3M 1.0 资格与 S2-4 / S2-5 / S2-6 / S2-7 限制继续有效；未重新验证在线
倾斜摄影或扩展新版格式。变换不能替代坐标投影，也不支持把同一 Layer 迁往另一个 World。
负责人可在原 S3M 示例的“运行时 modelMatrix”面板检查 XYZ、旋转、缩放和定位。
后续视觉反馈由当前 execution 角色处理；本轮没有已知未解决的实现 finding。
负责人于 2026-10-21 确认提交；本轮 S3M 修改随本记录形成独立本地提交，
未推送或合并；之前验收的 viewshed 辅助线已独立提交。
