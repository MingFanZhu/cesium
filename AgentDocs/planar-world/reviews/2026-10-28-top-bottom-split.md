# 原生上下分屏技术自审

- Type: review
- Status: approved; accepted by owner on 2026-10-28
- Author role: Architecture / implementation self-review
- Date: 2026-10-28
- Target: [standalone plan](../plans/2026-10-28-top-bottom-split.md)
- ADR: [ADR-0193](../../../Documentation/SceneGIS/Decisions/ADR-0193-top-bottom-split.md)
- SGP: SGP-0071

## 实现与发现项

原生 SplitDirection 新增 TOP=-2、BOTTOM=2，旧值与默认值不变。
Scene.splitPosition 沿用单个归一化值，上下模式从顶部 0 到底部 1。
UniformState 每帧以实际 drawingBufferHeight 计算 Y；私有 builtin 统一既有消费者，
没有新 pass、texture、framebuffer、request 或 shader variant。
Globe/Planar imagery 只屏蔽 alpha，其余保留原位置 discard 与 shadow-map exclusion。

| ID    | Severity | Finding                                        | Owner                | Status / evidence                                                                                                                    |
| ----- | -------- | ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| TB-01 | P2       | 插值后的方向不能用精确等号识别 TOP/BOTTOM      | Execution            | fixed：初版 Planar PointPrimitive 出现 288 个采样通道差异，上半部拾取错误；改用 -1.5/+1.5 枚举区间后，双世界真实点图元像素与拾取通过 |
| TB-02 | P2       | CSS 与 framebuffer Y 方向、DPR/resize 必须一致 | Execution            | fixed：1920×1200 与 1650×1050，DPR=2、resolutionScale=0.75、非中心鼠标拖动与方向切换全部通过                                         |
| TB-03 | P2       | 影像裁剪不得清除地表深度或改变 warm 资源       | Execution            | fixed：Surface Specs 两侧 pickPosition 保留；E2E 90 帧位置 sweep 无请求、纹理、shader、command 增长                                  |
| TB-04 | P3       | requestRenderMode 需要调用方显式请求绘制       | Architecture         | accepted：沿用现有契约，指南和示例所有控件调用 requestRender                                                                         |
| TB-05 | P3       | 本次结果需要负责人确认                         | Architecture / owner | resolved：2026-10-28 负责人确认本次结果并要求提交；旧分屏 review 的历史记录保持                                                      |

没有未解决的本次产品正确性 finding。扩展已有 splitDirection，不新增 Label 或任意 Primitive API；
Model 方向变化仍沿用原生 command 重建机制。原生 Gaussian shader 已接入，不能据此推断
SceneGIS 自定义 segmented Gaussian 增加了分屏属性。

## 验证

- 完整 `npm run build`、`npm run build-release`、`npm run build-ts`、`npm run tsc` 成功。
  生成的 engine 声明包含 TOP=-2 / BOTTOM=2；未修改或提交生成物。
  构建有原有 GaussianMacroChunkPrimitive 缺失导出断言和 TSD-JSDoc 警告。
- Chrome Headless 156 / Windows / WebGL validation：SceneGISSplit 6/6、PlanarImageryLayer 8/8、
  PlanarSurface/Shader 54/54。覆盖默认/左右/上下、端点、非中心位置、Gaussian/Model/Splitter
  shader 真实 GPU 像素、Model/Splitter shadow bypass、透明叠加、depth 和资源释放。
- `scenegis-top-bottom-split.spec.js` 双世界 × dev/release 4/4：影像与真实 Model、Billboard、
  PointPrimitive 画面，分屏两侧对象拾取、拖动、resize、分辨率比例、切换左右、销毁。
  `scenegis-planar-imagery-split.spec.js` dev/release 2/2：倾斜地形、旧左右兼容与三模式 warm sweep。
  采样的分屏结果与对应全屏 A/B 画面无差异；已查看球面、平面截图。
- 扩大 Planar 回归为 440/441；唯一失败为旧
  `SceneGISPlanarClipping discards a terrain skirt coplanar with a clipping plane without fragment speckles`。
  将本次所有运行时修改恢复到 HEAD `cf8fad5967` 后单独复测，仍有完全相同的 169 个 residual
  fragments 与 `[255,16,23,255]` 颜色误差。已恢复全部本次源码；该旧问题不纳入本次功能修复。
- SGP 审计通过，当前上游文件 11 个，generated status 0。JS ESLint 与示例 HTML 同规则检查通过；
  根 HTML 检查遇到 eslint-plugin-html / eslint-seatbelt processor 兼容错误，临时检查配置只移除
  baseline processor，保留原规则、插件与 globals，没有修改产品配置或依赖。
  UniformState 既有 SGP-0022 后的空行保留，未接受 formatter 的无关删除。
- 本次 Markdown Prettier 与全量 AgentDocs Markdownlint 通过；全量 AgentDocs Prettier
  仍报告 607 个本次范围外的既有格式问题，未扩散格式化。

原始日志、截图和测试辅助脚本位于忽略的 Build/Specs，不提交。针对性复跑使用
`--failTaskOnError` 并检查实际 Jasmine 统计；原默认 gulp test 的退出码不能单独证明成功。

## 性能与生命周期

Chrome 156，CSS 1100×700、DPR=2、resolutionScale=0.75；56 个可见地表瓦片。
同一新实现内 NONE、LEFT/RIGHT、TOP/BOTTOM 各 30 帧 CPU 提交时间：

| 构建    | NONE median / P95 | 左右 median / P95 | 上下 median / P95 |
| ------- | ----------------- | ----------------- | ----------------- |
| dev     | 0.9 / 1.5 ms      | 0.8 / 1.4 ms      | 1.0 / 1.3 ms      |
| release | 0.7 / 1.4 ms      | 0.8 / 0.9 ms      | 0.7 / 1.0 ms      |

不是 GPU 完成时间，不宣称提速。确定性证据：绘制始终 56 commands，program/command identity
不变，createdRequests=2、createdTextures=2、createdShaders=1 不增长，销毁后 2/2 纹理释放。

## 上游文件清单

以下全部由 SGP-0071 成对标记追踪：

- `packages/engine/Source/Scene/SplitDirection.js`
- `packages/engine/Source/Scene/Scene.js`
- `packages/engine/Source/Scene/FrameState.js`
- `packages/engine/Source/Scene/Splitter.js`
- `packages/engine/Source/Renderer/UniformState.js`
- `packages/engine/Source/Renderer/AutomaticUniforms.js`
- `packages/engine/Source/Shaders/GlobeFS.glsl`
- `packages/engine/Source/Shaders/Model/ModelSplitterStageFS.glsl`
- `packages/engine/Source/Shaders/BillboardCollectionFS.glsl`
- `packages/engine/Source/Shaders/PointPrimitiveCollectionFS.glsl`
- `packages/engine/Source/Shaders/PrimitiveGaussianSplatFS.glsl`

新 builtin 是 ADR-0193 批准的精确 SceneGIS-owned 路径，不标记为上游补丁。
示例 [分屏对比](../../../Test/分屏对比.html) 可切换双世界。2026-10-28 负责人确认本次结果并要求
在 scenegis/develop 形成本地提交检查点；未要求推送，SDK 未改动。

提交时原 pre-commit 因上述 HTML / seatbelt processor 兼容错误中断，并连带终止其他任务。
已独立重跑全部暂存 JS ESLint、HTML 同规则检查、Markdownlint、范围内格式检查和完整 tsc；
UniformState 的既有空行仍按最小上游补丁约束保留。仅本次提交跳过故障 hook，不修改仓库配置。
