# 局部影像技术自审

- Type: architecture / code review
- Status: approved；负责人于 2026-10-15 确认视觉验收通过
- Author / owner: 当前 Agent / Architecture + Execution；非独立 Agent 评审
- Created / Updated: 2026-10-15
- Review target: [standalone plan](../plans/2026-10-15-sparse-imagery.md)
- Discussion: [确认契约](../discussions/2026-10-15-sparse-imagery-confirmed-contract.md)
- ADR: [ADR-0162](../../../Documentation/SceneGIS/Decisions/ADR-0162-planar-sparse-imagery.md)
- Upstream-owned files / SGP: 0 / None；与 upstream-base 的路径集合对比确认

## 结论与实现边界

实现保留 canonical scheme identity、全球 XYZ 和实际 render tile 输入。低于 minimumLevel
及 coverage 外不创建 imagery dependency；子层只采样合法祖先。Provider、TMS metadata、
WMTS labels、404 UNAVAILABLE 与单图 binding 一致，没有反向采样、LOD 强制细化或额外 draw。
coverage 只增加每层一个 vec4 uniform；没有新增 texture/sampler、framebuffer 或 shader key。

内置瓦片 Provider 的 fetchImage 显式 preferBlob，以现有 XHR 通道保留 HTTP status。
只有明确 statusCode=404 才判定缺图；generic rejection 不推断状态。元数据 404 仍拒绝初始化。
缺图记录依附既有 entries / reference / generation，销毁与 source reload 不保留全局负缓存。

## Findings 与处置

| ID     | Severity          | Owner        | Evidence / disposition                                                                                                                                           | Status / follow-up                                                                                       |
| ------ | ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| SI-R01 | P2                | Execution    | 初稿 getter 会生成必填 coverageExtent；改用 optional JSDoc，生成 readonly coverageExtent?，Omit 该字段的旧 structural provider 仍可赋给接口，TypeScript 编译通过 | fixed；无需新增生成器或上游补丁                                                                          |
| SI-R02 | Visual gate       | 项目负责人   | 新增 GPU 像素断言与 dev/release 本地 E2E 通过；截图已检查 coverage 边缘与右上缺图                                                                                | accepted；2026-10-15 负责人确认 [局部影像](../../../Test/Planar/局部影像.html) 视觉验收通过，gate 已关闭 |
| SI-R03 | Existing baseline | Architecture | 3 个既有 Specs 失败与旧协议 E2E 颜色断言失败均使用改动前源码复现，详见下文                                                                                       | accepted for this increment；不混入本增量修复，保留风险记录                                              |

## 验证证据

- Chrome Headless 155 / Windows：平面回归 344 项，341 通过；其中新增 coverage GPU 用例验证
  矩形内绿色、矩形外保留红色地表、低层级零请求、缩远不复用细图、normal/depth command 一致。
- 后续补充状态测试后，imagery manager / structural provider / layer / collection 定向 38 项通过。
  验证 404 不报告普通错误、不循环请求，pending bootstrap 正确计入 loading，父缺图不传染子图，
  release / reload 清除缺图记录且 decoded image exactly-once close。
- SingleTile 4 项、TMS 6 项、WMS 4 项通过。包括 metadata 非零起点、全球 href/Y 地址、
  coverage 冲突、metadata 404、完整 canonical WMS BBOX，以及 SingleTile 全世界契约。
  URL / WMTS / binding 的新测试已包含在上述平面回归中。
- 新 `scenegis-planar-sparse-imagery.spec.js`：dev / release 共 2 项通过。
  真实本地 HTTP 404、requestRenderMode、近远景切换、全缺图、show/hide、destroy 均覆盖。
  960×540 Chromium；同视图请求唯一，已结算后重复 normal render 的请求及资源 counters 不变，
  command 数等于实际 tile 数，createdTextures 与 destroyedTextures 相等。
- 完整 build、buildRelease、buildTs、tsc 通过；通过直接调用仓库 gulpfile 导出的同名任务执行。
  类型生成保留已有 TSD-JSDoc 警告，无本次新增 API 错误。optional structural compatibility 单独编译通过。
- 改动 JS / HTML ESLint、改动 JS / HTML 与本次 AgentDocs / 新 ADR 的 Prettier、git diff --check 通过。
  全 AgentDocs markdownlint 通过；全目录 Prettier 有 449 个既有未改文件不符合格式，未扩大修改范围。
- 自动生成 barrel、types、Shader JS 与 Build 输出仅用于验证，未手改或纳入交付。

## 已复现的基线失败

改动前源码使用同一浏览器重新验证：

1. PlanarClipping 的 coplanar skirt 测试有 169 个差异像素，颜色断言也失败。
2. PlanarPrimitive 的 render/lifetime 测试被已有 deferred layout 拒绝非 depth-writing opaque command。
3. PlanarSurface 的 shallow-view 测试得到 [112, 1, 2, 255]，旧断言期望纯红。
4. 旧 `scenegis-planar-imagery-protocols.spec.js` 的 XYZ 首像素红色分量与旧断言相差 57；
   当前 dev/release 均失败，改动前 dev 同样相差 57。

以上未在本次修改测试期望或渲染实现。它们属于仍需后续处理的既有验证风险，不能声称全套回归通过。

## 剩余事项

产品代码、自动化验证与负责人视觉验收均已完成，SI-R02 已关闭，standalone plan completed。
负责人已授权本增量提交到 scenegis/develop；SI-R03 的既有基线风险继续保留。
自定义 Provider 若不提供明确 HTTP status，缺图无法由引擎推断；继续按普通错误处理。
SDK 配置与引擎版本接入由 SDK 任务承接，本次不修改 SDK engine lock。
