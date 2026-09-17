# Review: V3C0 公开地图与样式基线

## Metadata

- Status: `completed`
- Reviewer role: `architecture`
- Reviewer: 当前 Agent 自审；不是独立评审
- Created / Updated: `2026-09-13`
- Review target: `feature/vector-tiles`，V3B1 checkpoint `e7be6ef61a` 后的 V3C0 工作区
- Related plan: [V3C0](../plans/2026-09-13-v3c0-public-map-and-style-baseline.md)
- ADR: 复用 ADR-0058/0062，没有新增 runtime 协议
- SGP: None

## Scope and conclusion

新增 public Test 页面直接加载线上 MVT，以公开 API 组装 3857 World、source、decoder、style 与 layer。
支持城市定位、俯视/倾斜、细节、pick、图层重建、60 帧 CPU 提交与请求/解码统计。
负责人指定使用 MapLibre 参考项目的公开示例来源；已只读复查示例，
默认采用 OpenFreeMap / Bright 93/119 层，Liberty 82/111 层作为对照。
Streets 固定 JSON 与授权文本仅保留为离线差距参考，97/134 层通过前端审计；
已移除 Mapbox 在线入口和 token 输入。
原始 layer order/filter/paint/layout 保持，暂缺能力以显式清单说明，核心 Style.validate 不放宽。

当前在线可见画面来自 OpenFreeMap；Bright 与 Liberty 共用 OpenMapTiles schema，
没有将免 token 地图描述为官方 Mapbox 数据。技术自审通过，负责人于 2026-09-13 确认公开页，
并要求转入标注架构讨论；人工 gate 关闭。

## Findings

| ID       | Severity    | Status   | Owner role             | Finding / evidence                                                                       | Disposition / follow-up                                                                                                                          |
| -------- | ----------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| V3C0-R01 | boundary    | resolved | architecture           | Mapbox 当前默认是 Standard，公开 Streets v12 为经典完整 JSON                             | 官方文档与公开源码已审计；Streets 是渐进基线，不宣称 Standard 兼容                                                                               |
| V3C0-R02 | limitation  | resolved | architecture           | 官方 Vector Tiles API 需要 token，原方案有独立认证入口                                   | 负责人明确改用 MapLibre 示例来源；默认 Bright、保留 Liberty，移除凭证输入和官方 Mapbox 在线 gate                                                 |
| V3C0-R03 | medium      | fixed    | execution              | 新连接失败不能损坏现有 layer；原有 token 路径已由 R02 移除                               | 成功解析/验证/构造候选后替换；更新后的 E2E 覆盖 Bright/Liberty 切换销毁旧层、TileJSON HTTP 503 保留旧图                                          |
| V3C0-R04 | limitation  | accepted | architecture           | Bright 暂缺 25 symbol 与 1 fill-translate；Liberty 29 层暂缺；Streets 离线审计暂缺 37 层 | [显式排除清单与授权](../../../Test/vector-tiles/reference/README.md)，不逐属性删除来伪装支持；后续样式增量独立规划                               |
| V3C0-R05 | performance | deferred | architecture/execution | 真实瓦片包含大量未渲染 POI，解码单块最长 34.5 ms；首次地图准备明显重于 warm              | [roadmap](../plans/2026-09-12-vector-tiles-extension.md) V3C1 基于此负载分别定位 decode、geometry/style、upload；不由 wall time 猜测 Worker 边界 |
| V3C0-R06 | gate        | resolved | project owner          | 负责人于 2026-09-13 确认公开页并转入标注架构讨论                                         | Bright 俯视/倾斜/细节及两项 E2E 已验证；阶段 gate 关闭并形成独立 checkpoint                                                                      |

## Validation

- 新增页面 E2E **2/2** 通过，Chromium / 1280×800，所有外网请求被拦截：
  Bright/Liberty 切换、93/82 层选择、独立 MVT decode、pick、tilt、zoom 16、warm metrics、
  layer destroy、TileJSON HTTP 503 保留原图；没有真实 CI 公网请求。
- 真实 OpenFreeMap smoke：柏林 14 级俯视、倾斜、16 级 overzoom 画面与页面无错误，
  failedTiles=0；Bright 与原 Liberty 截图已自审。
  新 Bright 详细模式为 4 visible / 9 resident / 154 draw commands。
- 未修改 engine、Shader、Worker、公开 API 或构建；沿用 V3B1 的 87 Specs、types/release/包交付资格，
  本阶段没有重复运行其完整矩阵。新行为通过上述页面 E2E 和实际公网 smoke 验证。
- 修改范围 ESLint/Prettier、全 AgentDocs Markdownlint、8 份文档的 83 个相对链接与 diff whitespace 通过。
  全 AgentDocs Prettier 的 233 份未修改既有文档格式问题保留，不扩大本阶段格式修改。
  上游审计通过：current delivery upstream-owned entries **0**，generated status **0**；无新增 SGP。

## Measured baseline

Intel Core i5-12490F / Windows / Chromium，浏览器 1280×800、地图 canvas 988×800、DPR=1，
开发 ESM，MSAA=1、FXAA off。OpenFreeMap 数据版本 `20260906_080001_pt`，
柏林中心 13.405/52.52，style zoom=14。以下为初版 Liberty 82 个选中层的历史基线：

- 6 requested / completed / visible / resident tiles；接收 **2,542,138 bytes**。
- 已解码 **46,024 features**，包括未渲染的 POI 与标注；累计 decode **135.4 ms**，最大单块 **34.5 ms**。
- 首次无失败就绪约 **5057.6 ms**；计时从 layer 创建开始，包含 tile 请求/准备/上传，排除样式目录与 bundle。
- Warm 60 frames：CPU median **1.5 ms**、P95 **2.3 ms**；**190 draw commands**、**6 uploads**。

切换为参考项目的 Bright 93 个选中层后，同一地点/viewport/数据版本另测一次：

- 6 tiles、**2,542,138 bytes / 46,024 features**，与 Liberty 的源数据相同。
- 累计 decode **105.0 ms**，最大单块 **31.3 ms**；首次就绪 **2551.0 ms**。
- Warm CPU median **1.6 ms**、P95 **2.4 ms**；**207 draw commands / 6 uploads**。
- 两次是独立线上样本，不用首次就绪差异推断优化收益；图层范围不同，分别保留记录。

此处为在线单样本，网络、缓存和首次 Shader 编译影响 wall time。
CPU submission 不含 GPU 完成或浏览器合成，不声称已满足生产密集性能。
V3C1 应首先分辨数据解码与几何/样式准备的主线程时间和实际持有字节，保留该场景作为入口。

后续样式增量由总体计划的 V3D 处理 translate/anchor、map-aligned circle 和 pattern；
V5 处理 symbol，均在进入时再冻结详细实现，不把未选层描述为当前已经支持。

## Handoff

当前只修改 SceneGIS-owned Test、E2E 与文档，upstream-owned files **0**，新增 SGP **0**。
负责人已确认 MapLibre 示例数据路线与公开页；本阶段技术和人工 gate 均已通过。
后续按 Bright/Liberty 差距增量实现样式，Streets 仅作离线参考。阶段提交前不激活 V3C1。
