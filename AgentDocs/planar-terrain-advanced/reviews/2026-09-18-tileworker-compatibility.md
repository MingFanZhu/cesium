# TileWorker 地形产物兼容性核验

- Type: producer compatibility review
- Status: completed audit；TW-R001/R002/R003 fixed and jointly verified
- Author / consumer owner: 当前 SceneGIS Agent
- Producer owner: SceneGISDataTool 的 TileWorker 维护任务
- Created / Updated: 2026-09-18
- Target: SceneGISDataTool 的 `SceneGISNative/Tools/TileWorker`
- Verified producer implementation: `77e2acfb524de2d723ab3a915a4cf7e339f2c3ba`
- Consumer: SceneGIS / Cesium 1.144，当前平面元数据接入
- Parent: [standalone plan](../plans/2026-09-18-terrain-layer-metadata.md)
- Decision: [ADR-0080](../../../Documentation/SceneGIS/Decisions/ADR-0080-planar-terrain-layer-metadata.md)
- Upstream-owned files / SGP: None

## 核验结论

双方已确认 [当前地形契约](../discussions/2026-09-18-terrain-layer-contract.md)：
version、tiles、minzoom/maxzoom、extensions 与 available 沿用 Cesium 的结构和含义，available 固定 TMS。
平面坐标、rootRange、grid、structure、heightRange 与 encodingRange 放在 scenegis 命名空间。

私有格式标识为 `scenegis-planar-heightmap-rgb24-v2` 和 `scenegis-planar-quantized-mesh-v2`。
RGB24 PNG 不是球面的 heightmap-1.0 Uint16 payload，私有 mesh 也没有有效地心 header 语义，
因此保持明确的私有 format。它们由 SceneGIS 平面 provider 消费，不能直接交给 Globe 的 CesiumTerrainProvider。

生产端 posts、RGB24 大端通道、mesh delta/zigzag、高水位索引和四边索引与消费端约定一致。
私有 mesh 的 center / sphere / horizon 为零，消费端从平面 extent 重建几何与包围体。
公开 mesh 即使 projection 为 EPSG:3857，v 仍按纬度插值，不能解释为平面投影 Y。

## 联合验证证据

消费端原样接收 `terrain-v2-consumer-20260918` 的 5 份数据集、16 片及 5 个 layer.json，
21 个文件逐字节核对通过。来源、CLI 身份和生成命令见
[样本说明](../../../Test/Planar/data/terrain-layer/README.md)。两个真实 Chromium E2E 通过：

- 完整 private RGB24/mesh 无手填 bounds 完成 metadata、请求、Worker、渲染、独立采样、resident height、ray pick、
  12 warm frames 稳定计数和 detach/reattach/destroy。双格式样点差不超过 0.21 米，截图和 console 检查通过。
- 北侧 private mesh 与原生 Cesium EPSG:3857 / EPSG:4326 mesh 均返回北侧可用、南侧不可用，
  请求 TMS `/1/1/{x}.terrain`（地理列 x=2），解码/插值成功且无 HTTP 失败。

provider 当前 11 项 Specs 通过，包括原生 Cesium 对照与未知格式校验。
当前格式范围清理后，消费端两个 E2E 再次通过；生产端清理提交为
`606bc911a5a96da5aa6cc41b0ec830fcd4594dbe`，其定向 Go 测试通过，编码和样本字节未改变。
未改的 URL providers / World 保留 18 + 25 项回归通过证据。
生产端报告 Windows 38 项 Native、Go 单元、真实 Native 18 组合和 Tool Server 6 组合通过。
生成时 112 个 Native 源摘要与上述实现提交一致。Linux 6 项定向验证由生产端报告通过，
固定工具链/SDK 的 WSL 验证不等同最低目标机认证。

## TW-R001：available 与 Cesium 的行号约定

- Priority: P1
- Status: fixed
- Owner: TileWorker 维护任务；消费端联合验证
- Risk: 非对称覆盖的 available 若直接使用内部向下行号，Cesium 会将北侧解释为南侧。
- Evidence: CesiumTerrainProvider 对 available 始终执行 TMS 到 canonical XYZ 的行号转换，独立于 URL scheme。
- Resolution: `src/prepared_source.cpp` 与 `src/terrain_tiling.cpp` 的公共/私有输出统一 TMS；
  内部 matrix rowDirection 保持，仅在输出边界映射。
- Verification: private、4326、3857 北侧产物的 availability 和真实请求均正确；两个 URL scheme 的 Cesium 对照 Specs 通过。

## TW-R002：私有 mesh 的全局高度范围

- Priority: P2
- Status: fixed
- Owner: TileWorker 维护任务；消费端联合验证
- Risk: 下载前的平面裁剪需要覆盖所有层级地表的全局保守范围，逐片 extrema 不足以代表数据集。
- Resolution: 正式准备扫描完整有效源，纳入 NoData 零值和误差外扩，发布 source-scan-conservative heightRange。
- Verification: 实际 mesh 无 bounds override 加载、采样、拾取与裁剪通过；QM 头边界包含在发布范围内。

## TW-R003：高度数据范围与 RGB24 编码容量

- Priority: P2
- Status: fixed
- Owner: TileWorker 维护任务；消费端联合验证
- Risk: 编码容量作为地形范围会让垂直裁剪界过宽。
- Resolution: heightRange 表示保守地表范围，encodingRange 独立表示编码容量。
- Verification: 实际 RGB24 样本范围约为 [-16.726,0.101] 米，直接加载 metadata 完成 E2E。
  本项未量化大数据集性能成本。

## 依据与限制

- [Cesium 官方 quantized-mesh 二进制说明](https://github.com/CesiumGS/quantized-mesh)
- [官方 layer.json 说明](https://github.com/CesiumGS/quantized-mesh/blob/main/SPECIFICATION.md)
- [官方 layer.json schema](https://github.com/CesiumGS/quantized-mesh/blob/main/schema/layer.schema.json)
- 当前 CesiumTerrainProvider 的 available 转换是消费端直接证据。

本次不覆盖部署服务器的 CORS、Content-Encoding、Range、缓存策略，也不代表 TileWorker 全格式、
所有公网 Globe 数据、极区、无效 DEM、极值量化或大规模 LOD 的标准认证。三个 finding 在上述验证范围内关闭。
