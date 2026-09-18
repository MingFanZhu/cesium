# TileWorker 与 SceneGIS 地形描述契约对齐

- Type: cross-repository protocol discussion
- Status: resolved；双方契约已确认，真实产物联合验收通过
- Author / consumer owner: 当前 SceneGIS Agent
- Producer owner: SceneGISDataTool 的 TileWorker 维护任务
- Created / Updated: 2026-09-18
- Parent: [地形元数据接入](../plans/2026-09-18-terrain-layer-metadata.md)
- Related review: [TileWorker 兼容性清单](../reviews/2026-09-18-tileworker-compatibility.md)
- Decision: [ADR-0080](../../../Documentation/SceneGIS/Decisions/ADR-0080-planar-terrain-layer-metadata.md)
- Upstream-owned files / SGP: None

## 负责人约束

允许平面及自定义坐标系必需的私有字段，其他字段尽量保持 Cesium 原有定义。
实现、测试和文档只描述当前支持的格式。消费端与生产端各自维护自己的仓库。

## 已确认契约

生产端在 SceneGISDataTool 的
`Doc/Plans/P002-自治工具服务与平台解耦/S003-TileWorker首包/43-地形layer协议对齐.md`
记录完整方案，消费端审阅并明确确认。

- 私有 format/profile 仅支持 `scenegis-planar-heightmap-rgb24-v2` 和
  `scenegis-planar-quantized-mesh-v2`。未知格式统一拒绝；version 保持数据集版本含义。
- 所有 available 始终按 TMS 解释，独立于 tile URL scheme。
  TileWorker 公共/私有地形输出的 URL 与物理目录也统一 TMS；内部 matrix、Native tile 请求和
  tileCoverage 保留 rowDirection，在地址边界转换。ResultManifest 的 row/col 保留内部含义，path 表示实际文件。
- 消费端支持 Cesium 1.144 的 tms / slippyMap URL，不接受 xyz 顶层别名。
- coordinateSpace/rootRange、grid、structure、heightRange 等平面特需内容集中在 scenegis。
  公开层的标准 format/projection/角度 bounds 保持原含义；私有层不伪装为 Globe 标准 payload。
- 所有正式准备的地形层发布 `scenegis.heightRange`，source 为 `source-scan-conservative`，minimum/maximum
  覆盖所有层级成功解码的地表与 QM 头边界；这不是全部生成 LOD 的精确测量极值。
- 生产端完整扫描 band1，复用实际 NoData/mask/finite 规则，总纳入零，外扩重采样舍入与编码误差；
  QM 再向外取整为 Float32。显式准备扫描一次并缓存，describe 不扫描；IO 错误和取消保持失败。
- Heightmap 编码容量放在 `scenegis.encodingRange`，structure 保持实际解码参数。
  数据 heightRange 不包含消费端裙边；当前 planar Worker 把裙边夹到 providerMinimumHeight，
  并回传实际 skirtMinimumHeight。调用方可显式覆盖 bounds。

## 联合验证与交接

原生 CesiumTerrainProvider 对照 Specs 验证 tms / slippyMap URL 下的相同 TMS availability。
两个真实 Chromium E2E 包含完整 private 双格式、private 北侧及原生 Cesium 4326/3857 北侧加载，
TW-R001/R002/R003 已按联合证据关闭。来源与结果见
[兼容性清单](../reviews/2026-09-18-tileworker-compatibility.md)。

生产端产物对应提交 `77e2acfb524de2d723ab3a915a4cf7e339f2c3ba`，生成时 112 个 Native 源摘要与实现一致，
CLI 和交付瓦片字节保持。生产端报告 Windows 38 项 Native、Linux 6 项定向验证及 Go 单元/真实 18/领域 6 组合通过；
Linux 是固定 GCC 10.2.1 / SDK 的 WSL 开发验证，不等同最低目标机认证。

双方已完成当前格式范围收口。生产端提交 `606bc911a5a96da5aa6cc41b0ec830fcd4594dbe`，
确认仅保留当前格式枚举与通用未知格式拒绝；文档、Schema 描述及负例同步完成，Go 定向测试通过。
协议、编码和样本字节未改变，消费端 11 项 provider Specs 与 2 项 Chromium E2E 再次通过。
active standalone plan 的地形接入仍待负责人视觉验收。
