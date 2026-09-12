# Review: V2 平面批量渲染候选

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created / Updated: `2026-09-13`
- Review target: `feature/vector-tiles`，V1 checkpoint 及 V2 plan checkpoint 后的工作区实现
- Related plan: [V2](../plans/2026-09-13-v2-planar-batch-and-ground.md)
- ADR: [ADR-0059](../../../Documentation/SceneGIS/Decisions/ADR-0059-planar-vector-tile-batch-renderer.md)
- SGP: None（本阶段没有 upstream-owned 修改；V1 的 SGP-0011 保持原记录）

## Scope and summary

独立前端接入 SceneGISPlanarWorld；新增公开 layer 和冻结 layer metadata 访问器，
Core 几何准备、tile cover、普通同步 Primitive batch、固定 fill/line/circle Shader。
正常帧拥有请求、上传、淘汰和错误通知；pick/depth 重放；Scene collection 拥有图层生命周期。
本地 Test 页面加载真实 PBF；没有实验性 Cesium vector 依赖或地图颜色 RTT。

## Findings

| ID     | Severity   | Status   | Owner role                | Finding / evidence                                                                  | Disposition / follow-up                                                          |
| ------ | ---------- | -------- | ------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| V2-R01 | high       | fixed    | architecture/execution    | 共享 ground stencil 合批时，第二要素丢失，颜色与 pick 都错误                        | 保留反例；选择 depth-reconstruction 凸体候选，生产资格转 V4                      |
| V2-R02 | high       | fixed    | execution                 | Appearance.getRenderState 重设 straight-alpha blending，0.5 红色输出 64 而非 128    | 在显式 queue hook 固定 premultiplied 状态；同 batch/跨 tile 像素与 pick 回归通过 |
| V2-R03 | high       | fixed    | execution                 | 完整 Mercator 范围画面为空，但小范围与 pick 可通过；local space 做差丢失射线方向    | 先在 eye space 求方向再变换；新增完整 Mercator 真画面回归；E2E 增加颜色像素检查  |
| V2-R04 | medium     | fixed    | execution                 | 重复点构成的合法退化 line part 返回 undefined，导致整块 tile 失败                   | 已复现 GeometryInstance error；跳过无可绘制几何，multipart 身份回归通过          |
| V2-R05 | gate       | approved | architecture / 项目负责人 | 用户可见质量须由项目负责人确认                                                      | 项目负责人于 2026-09-13 明确“验收通过，继续”；V2 视觉 gate 关闭                  |
| V2-R06 | limitation | deferred | architecture/execution    | cap/join/dash/AA 质量、LOD replacement、byte budgets、Worker 和密集性能尚无产品资格 | V3 入口明确重新审计；不冒称完整 Mapbox 兼容                                      |
| V2-R07 | limitation | deferred | architecture/execution    | ground 候选只证明凸矩形、部分重叠和倾斜地形                                         | V4 验证凹面/孔洞/线/地形 envelope/LOD；V2 公共 renderer 拒绝 terrainProvider     |

## Validation reviewed

- Chrome Headless 152 / Windows：`SceneGISVectorTile` focused Specs **59/59**。
  包含 V1 35、Core geometry 2、cover 2、实际 layer 10 和渲染后端实验 10。
- Chromium 151.0.7922.34 / Windows，本地页面 E2E **1/1**：
  禁止公网访问；真实 MVT → style → renderer；颜色像素、feature pick、requestRenderMode、
  倾斜、显隐、销毁并重建通过，无 pageerror。
- 实际截图已检查俯视和倾斜：河道、水域孔洞、建筑、road casing 与 POI 可见。
  Agent 检查不能代替项目负责人最终视觉 gate。
- 完整 root 构建、engine 构建、build-ts/tsc、build-release 通过。
  类型生成仍有既有 TSD-JSDoc warnings，新 layer/getLayerDefinition 的生成声明与 strict 消费通过。
- 独立 engine tarball 安装：5 个公共入口、2 个固定生成 Shader、320-feature PBF 解码、
  strict NodeNext TS；minified release Node CJS API smoke 通过。
  Browser ESM 不能直接作为此包的 Node CJS 文件加载；smoke 使用现有发布 Node 入口。
- GPU 生命周期：warm frame 保持 VA/Shader/Primitive 身份；pick/depth 不增加请求与上传；
  淘汰/移除销毁 VA 和 Primitive，World 保持 live；取消后 stale completion 不恢复 GPU。
- ESLint、修改范围 Prettier、全 AgentDocs Markdownlint、111 个相对文档链接与 diff whitespace 通过。
  上游 auditor 通过：当前交付 upstream-owned entries 为 0，generated status 为 0。

## Performance evidence and limits

设备 CPU：Intel Core i5-12490F；Windows，Chromium 151.0.7922.34，
1280×800 drawing buffer、DPR=1、开发 ESM、本地确定性 320-feature 数据。
初次从图层创建到当前 cover ready 约 **175.8 ms**，不含 runtime/style 下载。
中央街区 z=2 的 4 个可见 tile，5 个 resident tile，**25 commands**。
60 warm frames 的 preRender→postRender CPU 提交时间 **median 0.8 ms / P95 1.3 ms**；
warm uploads 不增加，geometry/pick 资源稳定。

这是无历史 renderer 可对比时建立的 V2 baseline，不含 GPU 完成/浏览器合成，
不代表真实密集 MVT、生产贴地或帧率承诺。首图与 warm 观察来自同一页。
V3 再建立真实负载、byte accounting 和必要线程预算，当前不增加代理性能矩阵。

## Gate and handoff

项目负责人于 2026-09-13 确认实际 Test 页面验收通过，V2 implementation / review / visual gate 全部关闭。
Architecture Agent 将本阶段实现、Specs、ADR 与记录形成独立本地 checkpoint，再建立 V3 plan。
没有新增 upstream-owned files 或 SGP；不 push、不 merge。
