# 平面 tileset 定位与地理重投影边界

- Type: discussion / source audit
- Status: framing scope resolved; geographic reprojection deferred for owner decision
- Created / Updated: 2026-10-18
- Owner: current architecture / execution role
- Plan: [Tileset framing](../plans/2026-10-18-tileset-framing.md)
- Decision: [ADR-0006](../../../Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md)

## 本轮结论

`Viewer/CesiumWidget.zoomTo/flyTo` 接受已经处于当前 World Cartesian 坐标的原生
`Cesium3DTileset`。这个入口只负责相机取景，不转换内容、包围体或 CRS，不证明任意
地理 tileset 已适配平面渲染。异步 readiness 使用 `Cesium3DTileset.fromUrl` 的 Promise，
无需等待所有 tile content 下载。

[3D Tiles 官方规范](https://github.com/CesiumGS/3d-tiles/blob/main/specification/README.adoc#coordinate-reference-system-crs)
允许局部 Cartesian tileset；地理 `region` 使用 EPSG:4979，经纬度单位为弧度。
ECEF 到投影平面是非线性映射，通用数据不能只靠一个 4×4 矩阵转换。

## 当前源码事实

以下结论依据本仓库 Cesium 1.144 / upstream baseline
`6d5d8b1f0725b6f831b336463f4b11c98023427b`，不是外部最新版本的实现承诺。

| 环节          | 已核实行为及边界                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根/子节点矩阵 | `Cesium3DTile.updateTransform` 使用父 computedTransform × 当前 transform；根的父矩阵为 tileset.modelMatrix。子节点在 traversal 时更新，不能只改根包围球。                                                               |
| 定位包围球    | `Cesium3DTileset.boundingSphere` getter 先更新根 transform，再返回当前根包围球；本次直接复用。飞行开始时确定目标，不持续追踪后续矩阵变化。                                                                              |
| box/sphere    | 原生 affine 变换更新 center/halfAxes；sphere 半径与 geometricError 使用最大轴缩放。它们必须与内容处于同一平面坐标系。                                                                                                   |
| region        | 初始 JSON transform 不作用于地理 region；运行时 transform 改变时，`createBoxFromTransformedRegion` 把 WGS84 region 生成的 ECEF OBB 乘以 current × inverse(initial)。这不是投影坐标重建。                                |
| content       | `Model3DTileContent.update` 把 tile.computedTransform 传给 Model；glTF node/axis、b3dm/i3dm 的 RTC_CENTER、CESIUM_RTC、实例矩阵、pnts RTC 和烘焙顶点仍在内容链路内。改 root 不会消除这些坐标。                          |
| culling       | tile/content/viewerRequestVolume 均随 transform 更新；visibility 和 distanceToTile 消费这些 bounds。只转换可见顶点而保留旧 bounds 会导致裁剪、请求和距离错误。                                                          |
| LOD/SSE       | 普通 SSE 使用 geometricError、相机到 bounds 的距离和 frustum。dynamicScreenSpaceError 仍根据 region 或局部 center 长度启发式选择地理分支，会读取 positionCartographic；不能据本次取景测试宣称它适用于所有投影平面数据。 |
| 动态放置      | 更新 root 会刷新 bounds；`_modelMatrixChanged` 只比较 modelMatrix，不能据此宣称 root 连续动画和移动请求裁剪已全面验证。                                                                                                 |
| picking       | content.pick 转给 Model.pick，仍传 WGS84 用于 vertical exaggeration；深度拾取与实际渲染坐标一致并不代表所有 ray/MostDetailed/height 入口已完成平面适配。                                                                |

相关源码位于 `packages/engine/Source/Scene/Cesium3DTileset.js`、`Cesium3DTile.js`，
以及 `Scene/Model/Model3DTileContent.js`、`B3dmLoader.js`、`I3dmLoader.js`、`PntsLoader.js`。
本轮不修改这些文件，也不自动切换 tileset 的 SSE、裁剪、阴影或夸张高度参数。

## SDK 根矩阵语义

现有公开 `tileset.root.transform` 可写，足以支持 SDK 的显式根矩阵替换，无需新增引擎 API
或访问 `_root`。`tileset.modelMatrix` 是额外的外层变换，与替换 root 的结果不同。
SDK 可在加载成功后 clone 保存原始根矩阵；无配置时保留原始放置，有配置时替换公开
root.transform，reset 恢复保存的 clone。动态 set/get/reset 和 JSON 导出属于 SDK API 设计。
根替换不是任意地理数据的自动重投影；尤其不能忽略 region、子矩阵、RTC 与烘焙 ECEF。

## 后续方案（未实现）

1. 局部模型放置：SDK 显式提供平面根矩阵；内容和全部 bounds 已是自洽局部 Cartesian。
   可用本次取景能力，但仍按实际数据验证渲染、SSE 和 picking。
2. 小区域地理数据：明确锚点、范围和误差上限后做局部 affine 近似；不作为通用 EPSG:3857 支持。
3. 通用投影：优先考虑离线重建内容顶点、法线/实例、层级 bounds、geometricError 和元数据；
   运行时投影则需要独立扩展，覆盖 loader/Worker、GPU/CPU picking、LOD、裁剪和生命周期。

先由负责人选择数据范围与误差契约，再建立后续 plan；本次不顺带实现第 2/3 项。
