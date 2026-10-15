# 局部影像与最低数据层级

- Type: standalone plan
- Status: completed
- Author / owner: 当前 Agent / Architecture + Execution
- Created / Updated: 2026-10-15
- Parent plan: None；既有 extension completed
- Discussion: [已确认契约](../discussions/2026-10-15-sparse-imagery-confirmed-contract.md)
- ADR: [ADR-0162](../../../Documentation/SceneGIS/Decisions/ADR-0162-planar-sparse-imagery.md)
- Review: [技术自审](../reviews/2026-10-15-sparse-imagery.md)；负责人于 2026-10-15 确认视觉验收通过
- Upstream-owned files / SGP: 0 / None

## 目标与当前事实

负责人已批准实现：SDK 配置矩形 coverage，数据层级连续，tile HTTP 404 为缺图，
只允许子层采样父层；实际地表层级低于数据最低层时不请求、不显示该影像层。
实施前 URL Provider 与 structural 校验要求 minimumLevel=0，binding 固定 bootstrap
0/0/0，TMS metadata 强制完整世界和 canonical Level 0，运行时将所有 rejection 视为故障。
实际 render tile 经 terrain cover 解析后才进入 imagery.prepare，保留该调用次序。

## 设计与影响路径

- Provider/interface：公开只读 minimumLevel 与可选 coverageExtent，验证连续 min/max；
  URL/WMS 保留 canonical 地址与完整 BBOX；WMTS labels 只校验可请求区间且仍按全球 level 索引。
- TMS metadata：按分辨率识别起始 canonical level，验证连续层级、全球 Origin 和 CRS；
  BoundingBox 表示覆盖，SDK 可进一步缩小但不能越过 metadata 声明的数据范围。
- `_SceneGISPlanarTileImagery`：低层级/覆盖外不创建依赖；最近 READY 合法祖先优先，
  bootstrap 为对应 min 祖先；保留单 desired / fallback 引用。
- `_SceneGISPlanarImagery`：明确 statusCode=404 进入 UNAVAILABLE，不报告普通错误或重试；
  缺图记录依附已有缓存生命周期，维持取消、迟到结果与 exactly-once 释放。
- `_SceneGISPlanarSurface` / Shader：每层增加 surface UV coverage vec4，范围外该层透明；
  不新增 texture、command、shader permutation 或 geometry LOD 干预。
- Specs 覆盖 Provider、binding、runtime、GPU composition；本地 Test 页面提供视觉复现。

## 执行与验收

1. 固化 ADR 与本计划，检查 Resource.fetchImage 的 HTTP status 传递。
2. 实现 Provider、metadata、binding、runtime 与 coverage composition。
3. 添加对应 Specs：非零 min、全球 XYZ、协议参数、非齐边 coverage、404 与普通故障区别、
   fallback readiness、reload 与资源生命周期；运行已有相关回归。
4. 提供本地页面，验证单 command / sampler 数量不变及 requestRenderMode 收敛。
5. 运行完整 build、release、类型检查与改动文件 lint，记录结果和已存在的无关检查失败。
6. 技术自审并更新 handoff；负责人以复现页面确认视觉结果后关闭视觉 gate。

## 非目标与风险

不实现 overview、mosaic、反向采样、分区绘制、availableLevels、自动 coverage discovery、
新 retry、全局负缓存、强制细化或额外预算。SingleTile 保持整个世界的 Level 0 图。
明确 404 依赖 transport 可观测状态；无 status 的 rejection 仍是错误。
风险集中在 coverage UV、缺图 fallback readiness、迟到资源释放；用直接的像素和状态测试验证。

## 验证记录与交接

产品实现、完整构建/类型与定向自动化验证已完成，证据和基线失败见技术自审。
相较设计的细化：内置请求使用 preferBlob 保留 HTTP 状态；structural coverageExtent 类型保持可选。
未引入其他范围变化。工作基线为 scenegis/develop c6ac9e2080；upstream-owned files=0 / SGP=None。
2026-10-15 项目负责人确认视觉验收通过，并授权提交到 scenegis/develop。
SI-R02 已关闭，本 standalone plan completed；本增量形成独立本地提交。
工作区切换和 WebGPU 暂存不改变本计划的产品范围。
