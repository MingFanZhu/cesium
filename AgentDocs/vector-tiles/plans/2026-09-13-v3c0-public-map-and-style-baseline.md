# Phase Plan: V3C0 公开地图与样式基线

## Metadata

- Plan type: `phase`
- Status: `completed`
- Parent plan: [Vector Tiles](2026-09-12-vector-tiles-extension.md)
- Phase: `V3C0`
- Owner / reviewer role: 当前 architecture/execution Agent，自审
- Architecture review: `confirmed`
- Created / Updated: `2026-09-13`
- Entry checkpoint: `e7be6ef61a`（V3B1，负责人视觉验收通过）
- Related review: [V3C0](../reviews/2026-09-13-v3c0-public-map-review.md)
- ADR: 复用 ADR-0058/0062；若发现新的 runtime 协议需求，再形成后继 ADR
- SGP: None

## Objective and current facts

项目负责人要求继续，并新增直接加载公开地图数据的 Test 页面，逐步兼容 Mapbox 默认样式。
在密集性能改造前先建立真实数据、样式差距和可重复测量基线；
原 V3C 分成 V3C0 公开数据与样式基线、V3C1 字节预算与必要线程，保留性能目标。

Mapbox 当前 SDK 默认是 Standard，使用 imports/config/slots；
本轮先以公开、可审计的经典 Streets v12 单文档作为逐步兼容目标，不承诺 Standard 支持。
官方公开仓库 `mapbox/mapbox-gl-styles` 的固定 commit
`c4b34ab336fdb70be489fa018f2fe9e6f341b4f5` 提供 134 层 Streets v12。
用现有 Style.validate 逐层检查，97 层通过；未通过为 32 symbol、2 translate shadow、
1 fill-pattern、2 map-aligned circle。JSON 按 BSD、设计按 CC BY 3.0，地图数据不随样式许可证授权。

官方 Vector Tiles API 必须 access token。负责人随后明确改用 MapLibre 参考项目的公开示例来源。
参考项目的 `test/examples/display-a-map.html` 使用 MapLibre demotiles 世界地图；
`display-buildings-in-3d.html` 和 `add-a-vector-tile-source.html` 使用 OpenFreeMap / Bright。
本页以更适合街区验收的 Bright 为默认，保留 Liberty 对照，移除 Mapbox 在线入口与凭证输入。
Streets JSON 仅保留作后续离线样式差距参考；不再以 Mapbox 数据访问作为阶段前提。
Liberty 当前 111 层中 82 层通过现有前端；Bright 119 层中 93 层通过，
显式排除 25 symbol 和 1 building-top fill-translate。
OpenFreeMap 使用 OpenMapTiles schema，不套用 Mapbox Streets 字段。
本地确定性城市页面继续保留为离线调试入口，网络失败不静默换图。

## Implementation

1. 新增 `Test/vector-tiles/planar-map.html` 与配套页面组装：3857 World、城市定位、
   在线 provider 选择、俯视/倾斜、pick、资源重建和 CPU 提交测量。
   Bright 与 Liberty 均使用免 token 的公开服务；解析公开 TileJSON 的
   tile template、min/maxzoom 和 attribution。请求有现有 tile/request/upload/cache 上限。
2. 保存固定 Streets 原始 JSON 与授权文本、来源 manifest；选用层的顺序/表达式不改写。
   对当前未支持层使用显式排除清单与原因，页面可查看；未预期的新诊断直接失败，
   不实现通用的忽略属性或静默降级。Bright 与 Liberty 各自采用独立、明确的样式清单。
3. 页面只做公开 API 组装与测试数据/样式选择，不深导入私有 engine，不放 reusable runtime。
   审计实际全图/街区行为：MVT decode、coverage、alpha、dash、pick、zoom paint 和资源，
   遇到真实缺陷先确定根因，再在 engine owned 路径修复并增加对应 Specs。
4. 固定地点、zoom、viewport、provider revision，记录首次就绪、request/decoded feature、
   commands/uploads 与 warm CPU；识别后续 V3C1 热点，不在本轮猜测 Worker 协议。

## Validation and exit

- Bright 真实在线 smoke 与可复现截图；保留 Liberty 的前期测量事实，不冒充同样式负载。
- 页面 E2E 使用本地 fixtures 拦截外部网络，验证选择、错误反馈、style 排除清单、销毁、
  连接失败保留旧图、拾取与指标；公网 smoke 单列，不作为 CI 的网络前提。
- 如改 engine 行为，先 engine build 再运行风险相关 Specs；
  API/Shader/Worker 变化再运行对应 types/release/installed package，不重复无关完整资格。
- 来源/授权、AgentDocs、格式、链接与 upstream/generated 审计；新增页面经负责人视觉 gate。
- 本阶段自审、视觉 gate 与独立 checkpoint 后，依据得到的真实负载细化 V3C1。

## Remaining boundaries

本轮不把未渲染的 symbol/pattern、translate 或 circle-pitch-alignment 算作已兼容。
后续非标注样式增量按此差距清单进入 V3D，symbol 属于 V5，不塞入性能提交；
terrain、Globe、完整 Standard、跨 tile dash phase 保留原 roadmap 边界。

## Implementation record

Test 公开页、Streets 固定参考、显式排除清单与授权文本已完成；
自有合成 public-fixture.pbf 和两项 E2E 已通过。
真实 OpenFreeMap 14/16 级与倾斜 smoke 无错误，取得 46,024-feature、6-tile 的负载基线。
未发现必须在本阶段修改 engine 的根因，保持现有 runtime 不变；
负责人改选 MapLibre 示例来源后，Bright 默认入口与 Liberty 对照已完成；
更新后的两项 E2E 通过，真实 Bright 俯视/倾斜/16 级检查无错误。
Mapbox token 入口已移除；负责人于 2026-09-13 确认公开页并转入标注架构讨论，视觉 gate 关闭。
详细证据和 V3C1 入口见本阶段 review。

## Sources

- [Mapbox default style](https://docs.mapbox.com/mapbox-gl-js/guides/styles/)
- [Mapbox Streets](https://docs.mapbox.com/map-styles/reference/streets/)
- [Vector Tiles API](https://docs.mapbox.com/api/maps/vector-tiles/)
- [TileJSON metadata](https://docs.mapbox.com/api/maps/mapbox-tiling-service/#retrieve-tilejson-metadata)
- [Streets v12 source](https://github.com/mapbox/mapbox-gl-styles/blob/c4b34ab336fdb70be489fa018f2fe9e6f341b4f5/styles/streets-v12.json)
- [Open Styles license](https://github.com/mapbox/mapbox-gl-styles/blob/c4b34ab336fdb70be489fa018f2fe9e6f341b4f5/LICENSE.md)
- [OpenFreeMap quick start](https://openfreemap.org/quick_start/)
