# Vector Tiles 大阶段收口评审

- Type: milestone review
- Status / decision: approved
- Date: 2026-09-17
- Reviewer: 当前 Agent，architecture/execution 自审，并非独立 Agent 评审
- Owner acceptance: 项目负责人明确验收通过并要求收口当前矢量瓦片加载大阶段
- Target: [总体计划](../plans/2026-09-12-vector-tiles-extension.md)及 [V3D1](../plans/2026-09-17-v3d1-fill-extrusion.md)
- Last phase review: [V3D1 建筑与贴地性能](2026-09-17-v3d1-fill-extrusion-review.md)
- ADR: [ADR-0074](../../../Documentation/SceneGIS/Decisions/ADR-0074-vector-fill-extrusion.md)；其余阶段决策见扩展索引
- Current upstream changes / SGP: None；历史集成见下文

## 结论与交付范围

V3D1-R06 的贴地交互人工 gate 关闭，当前大阶段 completed，无 active phase 或待验收 gate。
收口不新增 runtime 功能，不合并、不推送；最后阶段代码、Specs、ADR 与本记录形成同一本地 checkpoint，
提交号由 Git 历史定位。此前各阶段独立提交保留，最近前置 checkpoint 为 E2 `cae5a711bf`。

冻结范围以 [VectorTiles](../../../Documentation/SceneGIS/VectorTiles.md) 的显式支持矩阵为准：

- 独立 MVT 解码与样式前端，完全不依赖 Cesium 实验性 MVT；tile-local 坐标中立，单 `1×1` root，EPSG:3857 数据验收。
- 自有 fill/line/circle/symbol/fill-extrusion 批次，Worker 数据准备、按需瓦片调度与覆盖替换、原生拾取和销毁。
- 平面及 Globe 各自通过直接贴地、高程 anchor、可见性和资源资格；地图颜色不先合成纹理。
- 点标注、图标、沿线文字与路牌；低角度远景选层、相机运动期间的布局与资源复用。
- 当前可见地表上的矢量、地表及影像独立透明度；高级环境共享照明接入保留。
- 建筑米制高度/底高、孔洞屋顶、侧墙、透明和地形 anchor；Globe 建筑求交及位置编码已迁入现有 Worker。
- 两个中文上手示例、默认 lil-gui 透明度面板；测试页分平面/球面，示例不包含高级环境控制。

原 V3D/V4/V5C 未完成范围为 deferred，原 V6 单独收口步骤由累计阶段资格和本评审 superseded。
已接受的阶段子集不等于实现完整 MapLibre SDK、全部 style 属性或任意曲面文字系统。

## 最小充分验证

| 资格              | 结果与适用范围                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 最终 vector Specs | ChromeHeadless 下 198 项全部通过，覆盖真实 Worker、双世界高度、绘制、拾取和资源生命周期。                                                                     |
| 页面自动化        | V3D1 的 3 项中文示例与 3 项原测试页 E2E 通过；贴地性能修正后单独通过 1 项离线 Globe E2E。不是最后一次全页面矩阵重跑。                                         |
| 构建与类型        | 最终 build/buildRelease 通过；V3D1 的 buildTs/tsc 已通过，后续修正无新增公共 API。                                                                            |
| 实际交付          | installed engine、release ESM、release IIFE 三入口通过；新 extrusion-terrain task 在三入口均完成实际 Worker 高程验证，并保留原绘制/透明/环境/释放检查。       |
| 人工 gate         | 建筑与光照能力已接受；2026-09-17 负责人进一步确认贴地性能修正验收通过并授权本次收口。                                                                         |
| 审计              | 当前改动与官方基线已有路径交集为空；无生成产物提交。改动文件格式和全 AgentDocs Markdownlint 通过；全 AgentDocs Prettier 有既有 233 文件格式告警，未扩散整理。 |

贴地性能复测使用同一北京 Bright/Esri 地形、45° 倾斜、中心距离 4616.94 m，240 帧逐帧水平旋转 0.003 rad。
两次均有 10 次地形快照变化；CPU median/P95/max 从 10.5/76.4/964.8 ms 改善为 11.0/15.6/19.5 ms。
修正后浏览器帧间隔 median/P95/max 为 16.7/27.2/50.1 ms；13 个可见建筑批次全部发布、无失败，静止约 59–60 FPS。
公网缓存并非完全一致，以上是定位并消除主线程楼栋重算长任务的证据，不是跨设备或全部相机运动 60 FPS 承诺。
详细失败复现、修正和自动化命令保留在 V3D1 review，生成日志仅位于忽略的 `Build/Specs/`。

## 延期事项与已接受边界

以下均为非阻塞后续项，未标记为已实现或已修复。负责人角色为 architecture；项目负责人再次要求扩展时，
先依照总体计划重新审计并激活相应 phase，当前不预建实现细节。

| Finding / 来源             | 严重度与状态            | 证据、理由和下一步                                                                                                         |
| -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| V3D 剩余样式               | 范围差距，deferred      | translate/anchor、map-aligned circle、pattern 等未进入本次 profile；后续按实际 style 需求激活。                            |
| G1-R09/R10、V5C            | 能力边界，deferred      | 公共字体覆盖不全、曲面字形连续变形未完成；当前标注已验收，后续单独冻结字体与曲面范围。                                     |
| G1-R16、V3C1D-R05、V4B-R06 | 性能边界，deferred      | 密集数据与近地平线 draw command/GPU 和帧时尾部仍有成本；已有代表视角验收，不承诺全场景 60 FPS，后续按实际 profile 定位。   |
| V3C1B-R07、V3C1C-R08       | 资源/性能边界，deferred | decoded cache、全驻留字节硬上限与高命令量 GPU 吞吐仍需独立资格；现有调度预算不能代替这些承诺。                             |
| V4 剩余范围、V4B-R07       | 能力边界，deferred      | V4A/G1 已完成当前地形路径；扩展地形质量、Planar native geometry-shadow 等仍需后续 gate。                                   |
| G2/G3 范围                 | 能力边界，accepted      | 透明支持当前可见地表；背面/地下、跨透明表面排序及高级环境透明深度合成未扩展资格。后续按负责人需求激活。                    |
| V3D1-R01/R02/R03           | 能力边界，accepted      | 跨瓦片建筑 anchor 可能有接缝；复杂屋顶、建筑投射阴影、完整 Model PBR、透明多层大气合成、大跨度结构和极端负载不在当前承诺。 |
| AgentDocs 全局格式         | 文档维护，deferred      | 既有 233 文件 Prettier 告警与本功能无关；本次只格式化改动文件，后续由文档维护任务处理。                                    |

历史 finding 的原始证据保留在对应 review。V3D1-R05 为 fixed，有 Worker/帧时证据；
V3D1-R06 为 closed，有负责人最终验收，两者与上述延期项区分。

## 上游与提交边界

本次 V3D1、贴地性能修正和文档收口全部位于 SceneGIS-owned 路径，没有改动 upstream-owned file 或新增 SGP。
整个大阶段历史中的最小上游集成如下；已有补丁登记与阶段提交继续有效：

| SGP      | Upstream-owned files                                     | 用途                              |
| -------- | -------------------------------------------------------- | --------------------------------- |
| SGP-0011 | `packages/engine/package.json`、`ThirdParty.extra.json`  | 独立样式前端依赖与许可登记。      |
| SGP-0012 | `packages/engine/Source/Scene/GlobeTranslucencyState.js` | 透明 Globe 下独立矢量地表层接入。 |

保持 `feature/vector-tiles`，不混入官方升级或其他扩展修改。没有后续 active phase；未来继续在同一扩展目录维护计划。
